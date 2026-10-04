#!/usr/bin/env python3
"""Evaluates results/raw/*.json against the criteria frozen in PREREGISTRATION.md.

Writes results/summary.md (per variant: median and min-max over repetitions) and
results/criteria.md (each criterion: met / not met, with the figures used).
Thresholds are copied verbatim from PREREGISTRATION.md; do not edit them here.
Commit failures are counted at commitSync() (DEVIATIONS.md, deviation 1).
"""
import glob
import gzip
import json
import os
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "results", "raw")
VARIANTS = ["A", "B", "C", "D", "E-", "E+"]
WINDOW_S = 120.0
LOOP_STALL_S = 60.0

BROKER_TS = re.compile(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3})\] (\w+) ")
PREPARING = re.compile(r"Preparing to rebalance group bk .*\(reason: (.*)\)")
MEMBER = re.compile(r"member (bk-\d+)-[0-9a-f-]+")
LEFT = re.compile(r"clientId=(bk-\d+),.*has left group bk through explicit `LeaveGroup`(.*)")
POLL_TIMEOUT = "consumer poll timeout has expired"


def broker_ms(ts):
    return int(datetime.strptime(ts, "%Y-%m-%d %H:%M:%S,%f").replace(tzinfo=timezone.utc).timestamp() * 1000)


def parse_broker(path):
    """Rebalance starts, poll-timeout leaves and ERROR/FATAL lines from the broker's log."""
    preparing, leaves, errors = [], [], 0
    with gzip.open(path, "rt", errors="replace") as f:
        for line in f:
            m = BROKER_TS.match(line)
            if not m:
                continue
            t, level = broker_ms(m.group(1)), m.group(2)
            if level in ("ERROR", "FATAL"):
                errors += 1
            p = PREPARING.search(line)
            if p:
                reason = p.group(1)
                mm = MEMBER.search(reason)
                preparing.append((t, reason, mm.group(1) if mm else None))
                if "on LeaveGroup" in reason and POLL_TIMEOUT in reason and mm:
                    leaves.append((t, mm.group(1)))
            lm = LEFT.search(line)
            if lm and POLL_TIMEOUT in lm.group(2):
                leaves.append((t, lm.group(1)))
    return preparing, sorted(set(leaves)), errors


def classify(preparing, leaves, client_warnings):
    """LEAVE_POLL_TIMEOUT / REJOIN / HEARTBEAT_EXPIRATION / OTHER, per PREREGISTRATION.md metric 2."""
    left_by_timeout = leaves + client_warnings
    out = []
    for t, reason, client in preparing:
        if "on LeaveGroup" in reason and POLL_TIMEOUT in reason:
            kind = "LEAVE_POLL_TIMEOUT"
        elif "heartbeat expiration" in reason:
            kind = "HEARTBEAT_EXPIRATION"
        elif reason.startswith("Adding new member") and client and any(c == client and lt <= t for lt, c in left_by_timeout):
            kind = "REJOIN"
        else:
            kind = "OTHER"
        out.append((t, kind, client, reason))
    return out


def poll_gaps(polls, ws, we):
    """Max T in the window per consumer: start-to-start gaps ending in the window, plus the
    gap still open at the end of the window."""
    by_client = defaultdict(list)
    for p in polls:
        by_client[p["client"]].append(p["start"])
    best = 0
    for starts in by_client.values():
        starts.sort()
        for a, b in zip(starts, starts[1:]):
            if ws <= b <= we:
                best = max(best, b - a)
        before = [s for s in starts if s <= we]
        if before:
            best = max(best, we - before[-1])
    return best, by_client


def metrics(d, broker_log):
    ws, we = d["window_start"], d["window_end"]
    inw = lambda t: ws <= t <= we
    m_ms = d["max_poll_interval_ms"]

    max_t, starts_by_client = poll_gaps(d["polls"], ws, we)

    client_warnings = []
    for l in d["logs"]:
        if POLL_TIMEOUT in l["message"]:
            cm = re.search(r"clientId=(bk-\d+)", l["message"])
            if cm:
                client_warnings.append((l["time"], cm.group(1)))
    preparing, leaves, broker_errors = parse_broker(broker_log)
    rebalances = [r for r in classify(preparing, leaves, client_warnings) if inw(r[0])]
    kinds = Counter(r[1] for r in rebalances)

    # (b): every poll-timeout leave in the window, with how long the leaving consumer's
    # poll in progress had been open.
    leave_gaps = []
    for t, client in leaves:
        if not inw(t):
            continue
        prior = [s for s in starts_by_client.get(client, []) if s <= t]
        leave_gaps.append((t - prior[-1]) / m_ms if prior else None)

    # Deliveries and duplicates (duplicate = an id already delivered earlier in the run).
    seen, per_id = set(), Counter()
    dup_in_window = deliv_in_window = 0
    for x in sorted(d["deliveries"], key=lambda x: x["start"]):
        per_id[x["id"]] += 1
        if inw(x["start"]):
            deliv_in_window += 1
            if x["id"] in seen:
                dup_in_window += 1
        seen.add(x["id"])
    ids_in_window = {x["id"] for x in d["deliveries"] if inw(x["start"])}
    per_id_window = [per_id[i] for i in ids_in_window]

    commits = [c for c in d["commits"] if inw(c["time"])]
    commit_failed = sum(1 for c in commits if c["outcome"].endswith("CommitFailedException"))
    commit_rip = sum(1 for c in commits if c["outcome"].endswith("RebalanceInProgressException"))
    commit_ok = sum(1 for c in commits if c["outcome"] == "ok")
    log_commit_failed = sum(1 for l in d["logs"] if inw(l["time"]) and any(c.endswith("CommitFailedException") for c in l["causes"]))

    samples = [s for s in d["samples"] if inw(s["t"])]
    valid = [s for s in samples if "committed" in s]
    throughput = (valid[-1]["committed"] - valid[0]["committed"]) / WINDOW_S if valid else None
    not_stable = sum(1 for s in samples if s.get("state") != "Stable")

    # Reprocessing loop: committed sum flat for >= 60 s of the window while records are delivered.
    longest_stall = 0.0
    i = 0
    while i < len(valid):
        j = i
        while j + 1 < len(valid) and valid[j + 1]["committed"] == valid[i]["committed"]:
            j += 1
        seg_start = valid[i]["t"]
        seg_end = valid[j + 1]["t"] if j + 1 < len(valid) else we
        delivered = any(seg_start <= x["start"] <= seg_end for x in d["deliveries"])
        if delivered:
            longest_stall = max(longest_stall, (seg_end - seg_start) / 1000.0)
        i = j + 1

    cpu = [s["cpu"] for s in samples if s.get("cpu") is not None and s["cpu"] >= 0]
    tbp_max = max((v for k, v in d["client_metrics_at_end"].items() if k.endswith("time-between-poll-max") and isinstance(v, (int, float))), default=None)
    return {
        "max_t_s": max_t / 1000.0,
        "t_over_m": max_t / m_ms,
        "rebalances": len(rebalances),
        "leave": kinds["LEAVE_POLL_TIMEOUT"],
        "rejoin": kinds["REJOIN"],
        "heartbeat": kinds["HEARTBEAT_EXPIRATION"],
        "other": kinds["OTHER"],
        "chain_share": (kinds["LEAVE_POLL_TIMEOUT"] + kinds["REJOIN"]) / len(rebalances) if rebalances else None,
        "leave_gaps": leave_gaps,
        "duplicates": dup_in_window,
        "deliveries": deliv_in_window,
        "dup_share": dup_in_window / deliv_in_window if deliv_in_window else 0.0,
        "per_id_median": statistics.median(per_id_window) if per_id_window else 0,
        "per_id_max": max(per_id_window) if per_id_window else 0,
        "commit_failed": commit_failed,
        "commit_rip": commit_rip,
        "commit_ok": commit_ok,
        "log_commit_failed": log_commit_failed,
        "throughput": throughput,
        "not_stable_s": not_stable,
        "longest_stall_s": longest_stall,
        "loop": longest_stall >= LOOP_STALL_S,
        "cpu": statistics.fmean(cpu) if cpu else 0.0,
        "gc_share": d["gc_ms_in_window"] / (WINDOW_S * 1000),
        "broker_running": d["broker_running_at_end"],
        "broker_errors": broker_errors,
        "client_tbp_max_s": tbp_max / 1000.0 if tbp_max is not None else None,
        "other_reasons": [r[3] for r in rebalances if r[1] == "OTHER"],
    }


def load():
    runs = defaultdict(list)
    for path in sorted(glob.glob(os.path.join(RAW, "*-r*.json"))):
        d = json.load(open(path))
        runs[d["variant"]].append(metrics(d, path[:-5] + "-broker.log.gz"))
    return runs


def med(runs, v, k):
    xs = [r[k] for r in runs[v] if r[k] is not None]
    return (statistics.median(xs), min(xs), max(xs)) if xs else (None, None, None)


def fmt(a, digits=2, pct=False):
    if a[0] is None:
        return "n/a"
    f = (lambda x: f"{x * 100:.1f} %") if pct else (lambda x: f"{x:.{digits}f}")
    return f"{f(a[0])} ({f(a[1])} – {f(a[2])})"


def every(runs, v, k):
    return ", ".join(str(r[k]) if not isinstance(r[k], float) else f"{r[k]:.2f}" for r in runs[v])


def main():
    runs = load()
    env = open(os.path.join(RAW, "env.txt")).read().strip()
    rows = []

    def check(cid, text, ok, figures):
        rows.append((cid, text, ok, figures))

    pre = json.load(open(os.path.join(RAW, "precondition.json")))
    hits = [i for i in pre["issues"] if i["ruleId"] == "blocking-kafka"]
    check("(0)", "CLI reports the listener's .join() as blocking-kafka", len(hits) == 1 and hits[0]["location"].endswith("Listener.java:31"),
          "; ".join(f"{i['ruleId']} {i['location']} {i.get('severity', '')}" for i in hits) or "no finding")

    m_of = {"A": 10, "B": 10, "C": 10, "D": 30, "E-": 10, "E+": 10}
    for v in ["A", "E+"]:
        check("(a)", f"{v}: max T in the window > M ({m_of[v]} s) in every repetition",
              all(r["max_t_s"] > m_of[v] for r in runs[v]), f"max T per rep (s): {every(runs, v, 'max_t_s')}")
    for v in ["B", "C", "D", "E-"]:
        check("(a)", f"{v}: max T in the window < M ({m_of[v]} s) in every repetition",
              all(r["max_t_s"] < m_of[v] for r in runs[v]), f"max T per rep (s): {every(runs, v, 'max_t_s')}")

    share = med(runs, "A", "chain_share")
    check("(b)", "A: ≥ 90 % of the window's rebalances are LEAVE_POLL_TIMEOUT or REJOIN",
          share[0] is not None and share[0] >= 0.90,
          f"{fmt(share, pct=True)}; LEAVE {every(runs, 'A', 'leave')} / REJOIN {every(runs, 'A', 'rejoin')} / OTHER {every(runs, 'A', 'other')} per rep")
    check("(b)", "A: 0 HEARTBEAT_EXPIRATION in every repetition",
          all(r["heartbeat"] == 0 for r in runs["A"]), f"per rep: {every(runs, 'A', 'heartbeat')}")
    gaps = [g for r in runs["A"] for g in r["leave_gaps"]]
    check("(b)", "A: every LEAVE_POLL_TIMEOUT from a consumer whose poll in progress had started ≥ 0.95 × M earlier",
          bool(gaps) and all(g is not None and g >= 0.95 for g in gaps),
          f"{len(gaps)} leaves; poll open at leave / M: min {min(g for g in gaps if g is not None):.3f}, max {max(g for g in gaps if g is not None):.3f}" if gaps else "no leaves")

    rb, dup, cf = med(runs, "A", "rebalances"), med(runs, "A", "duplicates"), med(runs, "A", "commit_failed")
    check("(c)", "A: ≥ 3 rebalances in the window", rb[0] >= 3, fmt(rb, 0))
    check("(c)", "A: duplicates > 0", dup[0] > 0, fmt(dup, 0))
    check("(c)", "A: commit failures > 0 (counted at commitSync, deviation 1)", cf[0] > 0,
          f"{fmt(cf, 0)}; log-based count as pre-registered: {fmt(med(runs, 'A', 'log_commit_failed'), 0)}")

    for v in ["B", "C", "D"]:
        check("(d)", f"{v}: 0 rebalances in the window and 0 duplicates, in every repetition",
              all(r["rebalances"] == 0 and r["duplicates"] == 0 for r in runs[v]),
              f"rebalances {every(runs, v, 'rebalances')}; duplicates {every(runs, v, 'duplicates')}")

    check("(e)", "E−: 0 rebalances in the window in every repetition", all(r["rebalances"] == 0 for r in runs["E-"]),
          f"per rep: {every(runs, 'E-', 'rebalances')}")
    check("(e)", "E+: ≥ 1 rebalance in the window in every repetition", all(r["rebalances"] >= 1 for r in runs["E+"]),
          f"per rep: {every(runs, 'E+', 'rebalances')}")

    for v in VARIANTS:
        running = all(r["broker_running"] for r in runs[v])
        errs, cpu, gc = med(runs, v, "broker_errors"), med(runs, v, "cpu"), med(runs, v, "gc_share")
        check("(f)", f"{v}: broker running at the end, 0 broker ERROR/FATAL lines, CPU < 50 %, GC < 1 %",
              running and errs[0] == 0 and cpu[0] < 0.50 and gc[0] < 0.01,
              f"running {sum(r['broker_running'] for r in runs[v])}/{len(runs[v])}; ERROR/FATAL {fmt(errs, 0)}; CPU {fmt(cpu, pct=True)}; GC {fmt(gc, pct=True)}")

    ranges = {"B": (3.40, 4.60), "C": (1.13, 1.53), "D": (1.13, 1.53), "E-": (1.89, 2.56)}
    for v, (lo, hi) in ranges.items():
        tp = med(runs, v, "throughput")
        check("(g) g1", f"{v}: effective throughput {lo:.2f}–{hi:.2f} records/s", lo <= tp[0] <= hi, fmt(tp))
    a, dd = med(runs, "A", "throughput"), med(runs, "D", "throughput")
    check("(g) g2", "A ≤ 50 % of D", a[0] <= 0.5 * dd[0], f"A {fmt(a)} / D {fmt(dd)} = {a[0] / dd[0] * 100:.1f} %")
    ep, em = med(runs, "E+", "throughput"), med(runs, "E-", "throughput")
    check("(g) g2", "E+ ≤ 50 % of E−", ep[0] <= 0.5 * em[0], f"E+ {fmt(ep)} / E− {fmt(em)} = {ep[0] / em[0] * 100:.1f} %")

    loops_a = sum(r["loop"] for r in runs["A"])
    h_rows = []
    h_rows.append(("(h)", "A in a reprocessing loop in ≥ 4 of 5 repetitions", loops_a >= 4,
                   f"{loops_a}/{len(runs['A'])}; longest stall per rep (s): {every(runs, 'A', 'longest_stall_s')}"))
    h_rows.append(("(h)", "A's effective throughput ≤ 10 % of D's", a[0] <= 0.1 * dd[0], f"{a[0] / dd[0] * 100:.1f} %"))
    ctrl_loops = {v: sum(r["loop"] for r in runs[v]) for v in ["B", "C", "D", "E-"]}
    h_rows.append(("(h)", "No repetition of B, C, D or E− in a reprocessing loop", sum(ctrl_loops.values()) == 0,
                   ", ".join(f"{v} {n}" for v, n in ctrl_loops.items())))

    core = [r for r in rows]
    core_ok = all(r[2] for r in core)
    h_ok = all(r[2] for r in h_rows)

    with open(os.path.join(HERE, "results", "criteria.md"), "w") as f:
        f.write("# blocking-kafka — results against the pre-registered criteria\n\n")
        f.write("Thresholds from [`PREREGISTRATION.md`](../PREREGISTRATION.md) (frozen); departures in "
                "[`DEVIATIONS.md`](../DEVIATIONS.md). Figures: median (min – max) over 5 repetitions unless per-repetition "
                "values are listed. Generated by `evaluate.py` from `results/raw/`.\n\n")
        f.write("| Criterion | Check | Result | Figures |\n|---|---|---|---|\n")
        for cid, text, ok, figures in core + h_rows:
            f.write(f"| {cid} | {text} | {'met' if ok else '**not met**'} | {figures} |\n")
        f.write("\n**Outcome:** ")
        if core_ok:
            f.write("(0) and (a)–(g) all met → measured evidence. ")
            f.write("(h) met → the text may say A enters a reprocessing loop.\n" if h_ok else
                    "(h) not met → the text gives the measured throughput loss only, without the word \"loop\".\n")
        else:
            failed = sorted({r[0] for r in core if not r[2]})
            f.write(f"not met: {', '.join(failed)} → the rule stays \"documented mechanism\".\n")

    with open(os.path.join(HERE, "results", "summary.md"), "w") as f:
        f.write("# blocking-kafka — summary\n\n")
        f.write("Threshold under test, general form: **max.poll.records × time per record > max.poll.interval.ms** "
                "(R × b > M). With the Kafka defaults (500 records, 300 s) that is **600 ms per record**. "
                "This setup lowers M to 10 s (30 s in D) as an **accelerated version** of the same inequality; "
                "figures are given as T / M. No absolute latency is quotable.\n\n")
        f.write("Median (min – max) over repetitions; window 120 s after a 20 s warm-up.\n\n")
        f.write("| Variant | b | R | M | R × b / M | max T / M | rebalances | LEAVE / REJOIN / HB / OTHER (sum) | duplicates | "
                "commits ok / failed (sum) | group not Stable (s) | effective throughput (rec/s) | theoretical 2/b | loop reps | "
                "deliveries per id (median / max) | duplicate share | CPU | GC | client time-between-poll-max (s) |\n")
        f.write("|" + "---|" * 19 + "\n")
        spec = {"A": (1.5, 10, 10), "B": (0.5, 10, 10), "C": (1.5, 1, 10), "D": (1.5, 10, 30), "E-": (0.9, 10, 10), "E+": (1.1, 10, 10)}
        for v in VARIANTS:
            b, r_, m = spec[v]
            rs = runs[v]
            sums = lambda k: sum(r[k] for r in rs)
            f.write(f"| {v} | {b} s | {r_} | {m} s | {b * r_ / m:.2f} | {fmt(med(runs, v, 't_over_m'))} | {fmt(med(runs, v, 'rebalances'), 0)} | "
                    f"{sums('leave')} / {sums('rejoin')} / {sums('heartbeat')} / {sums('other')} | {fmt(med(runs, v, 'duplicates'), 0)} | "
                    f"{sums('commit_ok')} / {sums('commit_failed')} | {fmt(med(runs, v, 'not_stable_s'), 0)} | {fmt(med(runs, v, 'throughput'))} | "
                    f"{2 / b:.2f} | {sum(r['loop'] for r in rs)}/{len(rs)} | {fmt(med(runs, v, 'per_id_median'), 1)} / {fmt(med(runs, v, 'per_id_max'), 0)} | "
                    f"{fmt(med(runs, v, 'dup_share'), pct=True)} | {fmt(med(runs, v, 'cpu'), pct=True)} | {fmt(med(runs, v, 'gc_share'), pct=True)} | "
                    f"{fmt(med(runs, v, 'client_tbp_max_s'))} |\n")
        others = sorted({o for v in VARIANTS for r in runs[v] for o in r["other_reasons"]})
        if others:
            f.write("\nRebalance reasons classified OTHER:\n\n" + "".join(f"- `{o}`\n" for o in others))
        f.write(f"\nEnvironment:\n\n```\n{env}\n```\n")

    print(open(os.path.join(HERE, "results", "criteria.md")).read())


if __name__ == "__main__":
    main()
