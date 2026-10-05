#!/usr/bin/env python3
"""Evaluates the reactor-block replication (replication/PREREGISTRATION.md).

Clock rule: every deciding criterion uses one process's own clock, or counts that need no
window. Generator: window by target time on its monotonic clock. App: window
[F + 10 s, F + 70 s) on the app's nanoTime, F = its first main-request arrival.
Downstream: whole-run counts, latencies on its own clock. No timestamp of one process is
compared with another's.

Writes results/criteria.md and results/summary.md in this directory. Thresholds are copied
verbatim from the pre-registration; do not edit them here. Committed before any of the 45
runs; later changes go to DEVIATIONS.md.

Usage: python3 evaluate_replication.py [raw_dir] [out_dir]
"""
import gzip
import json
import math
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "results", "raw")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "results")
VARIANTS = ["A1", "A3", "B"]
LAMBDAS = [10, 50, 400]
CLASSES = ["BLOCKING_GET", "FUTURE_GET", "IDLE", "OTHER"]
POOLS = ["loop", "parallel", "boundedElastic", "tomcat"]
TIMEOUTS = ("TIMEOUT", "CONNECT_TIMEOUT")
PROBES = (("p", "ping"), ("q", "ping_parallel"), ("P", "ping_fresh"), ("Q", "ping_parallel_fresh"))


def opener(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path)


def find(rid, suffix):
    for p in (os.path.join(RAW, f"{rid}.{suffix}.gz"), os.path.join(RAW, f"{rid}.{suffix}")):
        if os.path.exists(p):
            return p
    return None


def pct(values, p):
    """Nearest-rank percentile; None for an empty list."""
    if not values:
        return None
    s = sorted(values)
    return s[max(0, math.ceil(p * len(s)) - 1)]


def share(n, d):
    return n / d if d else None


def run_metrics(run):
    rid = run["id"]
    m = {}

    # Generator: its own monotonic clock only.
    gen = json.load(opener(find(rid, "gen.json")))
    ws = gen["t0"] + gen["warmup_s"] * 1000
    we = ws + gen["window_s"] * 1000
    win_s = gen["window_s"]
    inw = lambda t: ws <= t < we
    reqs = gen["requests"]
    m["unfinished"] = gen.get("unfinished", 0)
    allmain = [r for r in reqs if r[0] == "m"]
    main = [r for r in allmain if inw(r[1])]
    n = len(main)
    m["n_main"] = n
    m["ok_share"] = share(sum(1 for r in main if r[4] == "OK"), n)
    m["http500_share"] = share(sum(1 for r in main if r[4] == "HTTP_500"), n)
    m["ise_loop_share"] = share(sum(1 for r in main if r[4] == "HTTP_500" and len(r) > 6 and r[6] == "ISE_LOOP"), n)
    m["timeout_share"] = share(sum(1 for r in main if r[4] in TIMEOUTS), n)
    m["main_p99_ms"] = pct([r[3] - r[2] for r in main], 0.99)
    m["ok_per_s"] = sum(1 for r in allmain if r[4] == "OK" and inw(r[3])) / win_s
    m["ok_run"] = sum(1 for r in allmain if r[4] == "OK")
    m["n_main_run"] = len(allmain)
    m["timeout_run_share"] = share(sum(1 for r in allmain if r[4] in TIMEOUTS), len(allmain))
    m["connect_timeout_run"] = sum(1 for r in allmain if r[4] == "CONNECT_TIMEOUT")
    m["request_timeout_run"] = sum(1 for r in allmain if r[4] == "TIMEOUT")
    for kind, name in PROBES:
        pr = [r for r in reqs if r[0] == kind and inw(r[1])]
        lat = [r[3] - r[2] for r in pr]
        m[f"{name}_p50_ms"] = pct(lat, 0.50)
        m[f"{name}_p99_ms"] = pct(lat, 0.99)
        m[f"{name}_ok_share"] = share(sum(1 for r in pr if r[4] == "OK"), len(pr))
        m[f"{name}_err_share"] = share(sum(1 for r in pr if r[4] != "OK"), len(pr))
    allw = [r for r in reqs if inw(r[1])]
    m["late_share"] = share(sum(1 for r in allw if r[2] - r[1] > 100), len(allw))

    # App: its own nanoTime only, window [F + warm-up, F + warm-up + window).
    samples, first, meta = [], None, {}
    with opener(find(rid, "app.jsonl")) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue  # last line of a killed app may be cut
            if e["type"] == "sample":
                samples.append(e)
            elif e["type"] == "first_main":
                first = e["nano"]
            elif e["type"] == "meta":
                meta = e
    m["app_first_main"] = first is not None
    sw = []
    if first is not None:
        a0 = first + int(gen["warmup_s"] * 1e9)
        a1 = a0 + int(gen["window_s"] * 1e9)
        sw = [s for s in samples if a0 <= s["nano"] < a1]
    m["app_samples"] = len(sw)
    for pool in POOLS:
        counts = {c: sum(s["pools"].get(pool, {}).get(c, 0) for s in sw) for c in CLASSES}
        total = sum(counts.values())
        for c in CLASSES:
            m[f"{pool}_{c}"] = counts[c]
            m[f"{pool}_{c}_share"] = share(counts[c], total)
    held = [s["pools"].get("loop", {}).get("FUTURE_GET", 0) for s in sw]
    m["held_max"] = max(held) if held else None
    m["held_min"] = min(held) if held else None
    cpus = meta.get("cpus") or os.cpu_count()
    if len(sw) >= 2:
        a, b = sw[0], sw[-1]
        dt_ns = b["nano"] - a["nano"]
        m["proc_cpu_share"] = (b["procCpuNs"] - a["procCpuNs"]) / (dt_ns * cpus)
        m["gc_share"] = (b["gcMs"] - a["gcMs"]) * 1e6 / dt_ns
        loops = [(b["loopCpuNs"][t] - a["loopCpuNs"][t]) / dt_ns
                 for t in b["loopCpuNs"] if t in a["loopCpuNs"] and a["loopCpuNs"][t] >= 0 and b["loopCpuNs"][t] >= 0]
        m["loop_cpu_max"] = max(loops) if loops else 0.0
    else:
        m["proc_cpu_share"] = m["gc_share"] = m["loop_cpu_max"] = None
    m["stack"] = "tomcat" if m["tomcat_IDLE"] + m["tomcat_OTHER"] + m["tomcat_BLOCKING_GET"] > 0 else "netty" if held or sw else "unknown"

    # Downstream: whole run, its own clock.
    ds = []
    p = find(rid, "downstream.json")
    if p:
        try:
            ds = json.load(opener(p))
        except (json.JSONDecodeError, OSError):
            ds = []
    m["ds_total"] = len(ds)
    m["ds_p99_ms"] = pct([c - a for a, c in ds], 0.99)
    return m


def load():
    runs = [json.loads(l) for l in open(os.path.join(RAW, "runs.jsonl")) if l.strip()]
    reps = int(re.search(r"reps=(\d+)", open(os.path.join(RAW, "env.txt")).read()).group(1))
    cells = {}
    for r in runs:
        cells.setdefault((r["variant"], int(r["lambda"])), []).append(r)
        if r["status"] == "OK":
            r["m"] = run_metrics(r)
    return runs, cells, reps


def fmt(x, unit=""):
    if x is None:
        return "n/a"
    if isinstance(x, str):
        return x
    if unit == "%":
        return f"{100 * x:.1f} %"
    if unit == "ms":
        return f"{x:.0f} ms"
    return f"{x:.2f}" if isinstance(x, float) else str(x)


def main():
    runs, cells, reps = load()
    ok_runs = lambda v, l: sorted([r for r in cells.get((v, l), []) if r["status"] == "OK"], key=lambda r: r["rep"])
    evaluable = lambda v, l: len(ok_runs(v, l)) >= reps

    def M(v, l, key):
        vals = [r["m"][key] for r in ok_runs(v, l) if r["m"][key] is not None]
        return statistics.median(vals) if evaluable(v, l) and vals else None

    ge = lambda x, t: x is not None and x >= t
    le = lambda x, t: x is not None and x <= t
    lt = lambda x, t: x is not None and x < t
    lines, results = [], {}

    def check(cid, text, ok, figures):
        results[cid] = bool(ok)
        lines.append(f"- **{cid}** {'✅ met' if ok else '❌ not met'} — {text}. {figures}")

    lines.append("# Criteria — reactor-block replication (replication/PREREGISTRATION.md)\n")
    lines.append("Medians over repetitions unless \"every run\". Clock rule: each criterion on one process's clock "
                 "(generator window by target time; app window [F + 10 s, F + 70 s) on its nanoTime; downstream whole run).\n")
    lines.append("## Runs\n")
    bad = [r for r in runs if r["status"] != "OK"]
    lines.append(f"- {len(runs)} runs; OK: {len(runs) - len(bad)}; not OK: " + (", ".join(f"{r['id']} {r['status']}" for r in bad) or "none") + ".")
    for v in VARIANTS:
        for l in LAMBDAS:
            if (v, l) in cells and not evaluable(v, l):
                lines.append(f"- ⚠ cell {v} λ={l}: fewer than {reps} OK runs → not evaluable; its criteria count as not met.")
    wrong = [r["id"] for r in runs if r["status"] == "OK" and r["m"]["stack"] != "netty"]
    nofirst = [r["id"] for r in runs if r["status"] == "OK" and not r["m"]["app_first_main"]]
    lines.append(f"- Runs not served by Netty: {', '.join(wrong) or 'none'}. Runs without an app first-main arrival (F): {', '.join(nofirst) or 'none'}.")
    env = open(os.path.join(RAW, "env.txt")).read()
    pre = re.search(r"clock_preflight .*", env)
    lines.append(f"- Clock preflight (informational): {pre.group(0) if pre else 'n/a'}.\n")

    # (0)
    lines.append("## (0) Precondition\n")
    prec = json.load(open(os.path.join(RAW, "precondition.json")))
    hits = sorted({i["location"].rsplit("/", 1)[-1].split(":")[0] for i in prec["issues"] if i["ruleId"] == "reactor-block"})
    check("(0)", "CLI reports reactor-block on A1 and A3, nothing in B",
          "VariantA1Controller.java" in hits and "VariantA3Controller.java" in hits and "VariantBController.java" not in hits,
          f"flagged files: {', '.join(hits) or 'none'}")

    # A1 — H2
    lines.append("\n## A1 — H2 (fails fast with IllegalStateException), every λ\n")
    for l in LAMBDAS:
        d1 = M("A1", l, "ise_loop_share")
        check(f"d1 A1 λ={l}", "≥ 99 % of window main requests are HTTP 500 classified ISE_LOOP (generator only)", ge(d1, 0.99),
              f"median {fmt(d1, '%')}; per rep {[fmt(r['m']['ise_loop_share'], '%') for r in ok_runs('A1', l)]}")
        d2 = M("A1", l, "loop_BLOCKING_GET_share")
        check(f"d2 A1 λ={l}", "< 5 % of event-loop samples in the app window are BLOCKING_GET", lt(d2, 0.05),
              f"median {fmt(d2, '%')}; per rep {[fmt(r['m']['loop_BLOCKING_GET_share'], '%') for r in ok_runs('A1', l)]}")
        d3 = M("A1", l, "ping_p99_ms")
        check(f"d3 A1 λ={l}", "keep-alive /ping p99 ≤ 50 ms", le(d3, 50),
              f"median {fmt(d3, 'ms')} (fresh /ping p99, reported: {fmt(M('A1', l, 'ping_fresh_p99_ms'), 'ms')})")
    h2 = all(results[f"{c} A1 λ={l}"] for c in ("d1", "d2", "d3") for l in LAMBDAS)

    # A3 — H3
    lines.append("\n## A3 — H3 (request deadlock without total retention; fresh-connection probe decides)\n")
    a3 = [r for l in LAMBDAS for r in cells.get(("A3", l), [])]
    a3_eval = all(evaluable("A3", l) for l in LAMBDAS)
    h3a = a3_eval and all(r["m"]["ok_run"] == 0 and ge(r["m"]["timeout_run_share"], 0.99) for r in a3)
    check("H3a", "every run, every λ: 0 main OK over the whole run and ≥ 99 % TIMEOUT or CONNECT_TIMEOUT (generator)", h3a,
          "; ".join(f"{r['id']}: OK {r['m']['ok_run']}, timeouts {fmt(r['m']['timeout_run_share'], '%')}" if r["status"] == "OK" else f"{r['id']}: {r['status']}" for r in a3))
    h3b = a3_eval and all(r["m"]["ds_total"] == 0 for r in a3)
    check("H3b", "every run: the downstream receives 0 /slow requests over the whole run (downstream)", h3b,
          "; ".join(f"{r['id']}: {r['m']['ds_total']}" if r["status"] == "OK" else f"{r['id']}: {r['status']}" for r in a3))

    def h3c_run(r):
        mm = r["m"]
        return (mm["held_max"] is not None and mm["held_max"] <= 3
                and ge(mm["ping_fresh_ok_share"], 0.99) and le(mm["ping_fresh_p99_ms"], 50)
                and ge(mm["ping_parallel_fresh_ok_share"], 0.99) and le(mm["ping_parallel_fresh_p99_ms"], 50)
                and mm["ok_run"] == 0)
    qualifying = [r["id"] for r in a3 if r["status"] == "OK" and h3c_run(r)]
    h3c = a3_eval and len(qualifying) >= 3
    check("H3c", "≥ 3 of the 15 runs with ≤ 3 of 4 loops in FUTURE_GET in every app-window sample, both fresh probes ≥ 99 % OK "
          "and p99 ≤ 50 ms, and 0 main OK", h3c, f"qualifying runs: {len(qualifying)} ({', '.join(qualifying) or 'none'})")
    lines.append("\nA3 per run (reported, not deciding): held loops min–max | keep-alive /ping OK, p99 | fresh /ping OK, p99 | "
                 "fresh /ping-parallel OK, p99 | request / connect timeouts")
    for r in a3:
        if r["status"] != "OK":
            lines.append(f"- {r['id']}: {r['status']}")
            continue
        mm = r["m"]
        lines.append(f"- {r['id']}: {mm['held_min']}–{mm['held_max']} | {fmt(mm['ping_ok_share'], '%')}, {fmt(mm['ping_p99_ms'], 'ms')} | "
                     f"{fmt(mm['ping_fresh_ok_share'], '%')}, {fmt(mm['ping_fresh_p99_ms'], 'ms')} | "
                     f"{fmt(mm['ping_parallel_fresh_ok_share'], '%')}, {fmt(mm['ping_parallel_fresh_p99_ms'], 'ms')} | "
                     f"{mm['request_timeout_run']} / {mm['connect_timeout_run']}")
    lines.append("\nA3, first experiment's (a) and (b) on the clock rule (reported, not deciding):")
    for l in (50, 400):
        lines.append(f"- λ={l}: loop FUTURE_GET share median {fmt(M('A3', l, 'loop_FUTURE_GET_share'), '%')}; "
                     f"keep-alive /ping p50 {fmt(M('A3', l, 'ping_p50_ms'), 'ms')}, errors {fmt(M('A3', l, 'ping_err_share'), '%')}; "
                     f"fresh /ping p50 {fmt(M('A3', l, 'ping_fresh_p50_ms'), 'ms')}, errors {fmt(M('A3', l, 'ping_fresh_err_share'), '%')}")

    # (e)-B
    lines.append("\n## (e)-B control, every λ\n")
    for l in LAMBDAS:
        ok, p99, rate = M("B", l, "ok_share"), M("B", l, "main_p99_ms"), M("B", l, "ok_per_s")
        pp, qq = M("B", l, "ping_p99_ms"), M("B", l, "ping_parallel_p99_ms")
        check(f"(e)-B λ={l}", "≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both keep-alive probes p99 ≤ 50 ms",
              ge(ok, 0.99) and le(p99, 400) and rate is not None and abs(rate - l) <= 0.10 * l and le(pp, 50) and le(qq, 50),
              f"OK {fmt(ok, '%')}, p99 {fmt(p99, 'ms')}, OK/s {fmt(rate)}, probes p99 {fmt(pp, 'ms')} / {fmt(qq, 'ms')}")

    # (f)
    lines.append("\n## (f) No other cause, every variant and λ\n")
    for v in VARIANTS:
        for l in LAMBDAS:
            if (v, l) not in cells:
                continue
            cpu, gc, late, lc = M(v, l, "proc_cpu_share"), M(v, l, "gc_share"), M(v, l, "late_share"), M(v, l, "loop_cpu_max")
            dsn, ds99 = M(v, l, "ds_total"), M(v, l, "ds_p99_ms")
            vac = evaluable(v, l) and dsn == 0
            check(f"f1 {v} λ={l}", "app CPU < 50 % and GC < 1 % (app window)", lt(cpu, 0.50) and lt(gc, 0.01), f"CPU {fmt(cpu, '%')}, GC {fmt(gc, '%')}")
            check(f"f2 {v} λ={l}", "downstream p99 ≤ 250 ms (whole run)", vac or le(ds99, 250),
                  f"p99 {fmt(ds99, 'ms')}, requests {fmt(dsn)}" + (" (vacuous: none received)" if vac else ""))
            check(f"f3 {v} λ={l}", "≤ 1 % of window requests sent > 100 ms late (generator)", le(late, 0.01), fmt(late, "%"))
            check(f"f4 {v} λ={l}", "every event loop < 50 % of one CPU (app window)", lt(lc, 0.50), f"max {fmt(lc, '%')}")

    f_for = lambda v: all(ok for k, ok in results.items() if k.startswith("f") and f" {v} " in k)
    b_ok = all(results[f"(e)-B λ={l}"] for l in LAMBDAS)
    base = results["(0)"] and b_ok and f_for("B")
    lines.append("\n## Verdicts and outcome rules\n")
    lines.append(f"- **A1:** {'H2 confirmed' if h2 else 'H2 not met — fits neither'} (predicted H2).")
    if h3a and h3b and h3c:
        a3v = "H3 confirmed"
    elif h3a and h3b:
        a3v = "deadlock confirmed, but without showing it happens with free loops — fits neither"
    else:
        a3v = "fits neither"
    lines.append(f"- **A3:** {a3v}.")
    lines.append(f"- 1. Extend the #21 correction to the event loop: {'APPLIES' if h2 and base and f_for('A1') else 'does NOT apply'}.")
    lines.append(f"- 2. Measured evidence for .toFuture().get(): {'APPLIES' if a3v == 'H3 confirmed' and base and f_for('A3') else 'does NOT apply'}.")
    lines.append(f"- (0) {'met' if results['(0)'] else 'not met'}; (e)-B {'met' if b_ok else 'not met'}; "
                 f"(f) A1 {'met' if f_for('A1') else 'not met'}, A3 {'met' if f_for('A3') else 'not met'}, B {'met' if f_for('B') else 'not met'}.")

    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "criteria.md"), "w").write("\n".join(lines) + "\n")

    cols = [("ok_share", "%", "OK"), ("http500_share", "%", "500"), ("ise_loop_share", "%", "500 ISE_LOOP"),
            ("timeout_share", "%", "timeouts"), ("ok_per_s", "", "OK/s"), ("main_p99_ms", "ms", "main p99"),
            ("ping_p99_ms", "ms", "/ping p99"), ("ping_err_share", "%", "/ping err"),
            ("ping_parallel_p99_ms", "ms", "/ping-parallel p99"),
            ("ping_fresh_p99_ms", "ms", "/ping fresh p99"), ("ping_fresh_err_share", "%", "/ping fresh err"),
            ("ping_parallel_fresh_p99_ms", "ms", "/ping-parallel fresh p99"), ("ping_parallel_fresh_err_share", "%", "/ping-parallel fresh err"),
            ("loop_BLOCKING_GET_share", "%", "loop BG"), ("loop_FUTURE_GET_share", "%", "loop FG"), ("loop_IDLE_share", "%", "loop idle"),
            ("held_max", "", "loops held max"), ("ds_total", "", "downstream requests (run)"), ("ds_p99_ms", "ms", "downstream p99"),
            ("proc_cpu_share", "%", "app CPU"), ("loop_cpu_max", "%", "max loop CPU"), ("gc_share", "%", "GC"), ("late_share", "%", "late >100 ms")]
    out = ["# Summary — reactor-block replication\n",
           "Median [min–max] over the OK repetitions. Generator window by target time; app window [F + 10 s, F + 70 s) on its nanoTime; "
           "downstream over the whole run. No absolute latency is quotable (controlled simulation).\n",
           "## Environment\n", "```", env.strip(), "```\n"]
    for l in LAMBDAS:
        present = [v for v in VARIANTS if (v, l) in cells]
        if not present:
            continue
        out.append(f"## λ = {l} requests/s\n")
        out.append("| metric | " + " | ".join(present) + " |")
        out.append("|---|" + "---|" * len(present))
        out.append("| OK runs | " + " | ".join(f"{len(ok_runs(v, l))}/{len(cells[(v, l)])}" for v in present) + " |")
        for key, unit, label in cols:
            row = []
            for v in present:
                vals = [r["m"][key] for r in ok_runs(v, l) if r["m"][key] is not None]
                row.append(f"{fmt(statistics.median(vals), unit)} [{fmt(min(vals), unit)}–{fmt(max(vals), unit)}]" if vals else "n/a")
            out.append(f"| {label} | " + " | ".join(row) + " |")
        out.append("")
    out.append("## Runs\n")
    out.append("| run | status | stack | app answering after | app stop |")
    out.append("|---|---|---|---|---|")
    for r in runs:
        out.append(f"| {r['id']} | {r['status']} | {r['m']['stack'] if r['status'] == 'OK' else 'n/a'} | {r.get('app_responsive_after')} | {r.get('app_exit')} |")
    open(os.path.join(OUT, "summary.md"), "w").write("\n".join(out) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
