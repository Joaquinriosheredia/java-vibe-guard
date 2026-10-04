#!/usr/bin/env python3
"""Evaluates results/raw/ against the criteria frozen in PREREGISTRATION.md.

Writes results/summary.md (per cell: median and min-max over repetitions) and
results/criteria.md (each criterion met / not met with the figures used, the H1 / H2
verdict per variant, A3's deadlock / stall class, A4's saturation block S, and which
outcome rules apply). Thresholds are copied verbatim from PREREGISTRATION.md; do not
edit them here. Committed before the first of the 90 runs; any later change is listed in
DEVIATIONS.md.

Changes after that commit (DEVIATIONS.md): the stack check per run (deviation 1) and a
second, non-deciding evaluation of every probe criterion with the fresh-connection probes
(deviation 2). The pre-registered keep-alive probes still decide. After the results:
(d1) re-read without cross-process clock alignment (deviation 4), reported, NOT deciding.

Usage: python3 evaluate.py [raw_dir] [out_dir]
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
VARIANTS = ["A1", "A2", "A3", "A4", "B", "C"]
LAMBDAS = [10, 50, 400]

POOL_RE = {
    "loop": re.compile(r"reactor-http-.*"),
    "parallel": re.compile(r"parallel-\d+"),
    "boundedElastic": re.compile(r"boundedElastic-\d+"),
    "tomcat": re.compile(r"http-nio-\d+-exec-\d+"),
}
ISE_THREAD = re.compile(r"not supported in thread (\S+)")
CLASSES = ["BLOCKING_GET", "FUTURE_GET", "IDLE", "OTHER"]

# H1 / H2 per variant: P(V), call(V), Q(V) (PREREGISTRATION.md, Competing hypotheses).
HYP = {
    "A1": {"pool": "loop", "call": "BLOCKING_GET", "probe": "ping"},
    "A2": {"pool": "parallel", "call": "BLOCKING_GET", "probe": "ping_parallel"},
    "A3": {"pool": "loop", "call": "FUTURE_GET", "probe": "ping"},
}
TIMEOUTS = ("TIMEOUT", "CONNECT_TIMEOUT")


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
    gen = json.load(opener(find(rid, "gen.json")))
    ws = gen["t0"] + gen["warmup_s"] * 1000
    we = ws + gen["window_s"] * 1000
    win_s = gen["window_s"]
    inw = lambda t: ws <= t < we
    reqs = gen["requests"]
    m = {"unfinished": gen.get("unfinished", 0)}

    main = [r for r in reqs if r[0] == "m" and inw(r[1])]
    n = len(main)
    m["n_main"] = n
    out = lambda name: sum(1 for r in main if r[4] == name)
    m["ok_share"] = share(out("OK"), n)
    m["http500_share"] = share(out("HTTP_500"), n)
    m["timeout_share"] = share(sum(1 for r in main if r[4] in TIMEOUTS), n)
    m["ok_in_window"] = out("OK")
    m["main_p99_ms"] = pct([r[3] - r[2] for r in main], 0.99)
    m["ok_per_s"] = sum(1 for r in reqs if r[0] == "m" and r[4] == "OK" and inw(r[3])) / win_s
    for kind, name in (("p", "ping"), ("q", "ping_parallel"), ("P", "ping_fresh"), ("Q", "ping_parallel_fresh")):
        pr = [r for r in reqs if r[0] == kind and inw(r[1])]
        lat = [r[3] - r[2] for r in pr]
        m[f"{name}_p50_ms"] = pct(lat, 0.50)
        m[f"{name}_p99_ms"] = pct(lat, 0.99)
        m[f"{name}_err_share"] = share(sum(1 for r in pr if r[4] != "OK"), len(pr))
    allw = [r for r in reqs if inw(r[1])]
    m["late_share"] = share(sum(1 for r in allw if r[2] - r[1] > 100), len(allw))

    samples, exceptions, meta = [], [], {}
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
            elif e["type"] == "exception":
                exceptions.append(e)
            else:
                meta = e
    sw = [s for s in samples if ws <= s["t"] <= we]
    for pool in POOL_RE:
        counts = {c: sum(s["pools"].get(pool, {}).get(c, 0) for s in sw) for c in CLASSES}
        total = sum(counts.values())
        m[f"{pool}_samples"] = total
        for c in CLASSES:
            m[f"{pool}_{c}"] = counts[c]
            m[f"{pool}_{c}_share"] = share(counts[c], total)

    # Deviation 1: which server actually served (a reactive run on Tomcat is invalid).
    m["stack"] = "tomcat" if m["tomcat_samples"] > 0 else "netty" if m["loop_samples"] > 0 else "unknown"

    cpus = meta.get("cpus") or os.cpu_count()
    if len(sw) >= 2:
        a, b = sw[0], sw[-1]
        dt_ms = b["t"] - a["t"]
        m["proc_cpu_share"] = (b["procCpuNs"] - a["procCpuNs"]) / (dt_ms * 1e6 * cpus)
        m["gc_share"] = (b["gcMs"] - a["gcMs"]) / dt_ms
        loops = [(b["loopCpuNs"][t] - a["loopCpuNs"][t]) / (dt_ms * 1e6)
                 for t in b["loopCpuNs"] if t in a["loopCpuNs"] and a["loopCpuNs"][t] >= 0 and b["loopCpuNs"][t] >= 0]
        m["loop_cpu_max"] = max(loops) if loops else 0.0
    else:
        m["proc_cpu_share"] = m["gc_share"] = m["loop_cpu_max"] = None

    for pool in ("loop", "parallel"):
        k = 0
        for e in exceptions:
            if inw(e["t"]) and e["cls"] == "java.lang.IllegalStateException":
                t = ISE_THREAD.search(e["msg"] or "")
                if t and POOL_RE[pool].fullmatch(t.group(1).rstrip(".,")):
                    k += 1
        m[f"ise_{pool}_ratio"] = share(k, n)
    m["exceptions_in_window"] = sum(1 for e in exceptions if inw(e["t"]))

    # Deviation 4 (after the results): the app's wall clock and the generator's monotonic
    # clock diverge on this host, so (d1) is also read over the whole run, which needs no
    # alignment: ISEs naming a pool thread / all main requests, and the 500 share of all.
    allmain = [r for r in reqs if r[0] == "m"]
    m["http500_run_share"] = share(sum(1 for r in allmain if r[4] == "HTTP_500"), len(allmain))
    for pool in ("loop", "parallel"):
        k = 0
        for e in exceptions:
            t = ISE_THREAD.search(e["msg"] or "") if e["cls"] == "java.lang.IllegalStateException" else None
            if t and POOL_RE[pool].fullmatch(t.group(1).rstrip(".,")):
                k += 1
        m[f"ise_{pool}_run_ratio"] = share(k, len(allmain))
    ex_t = sorted(e["t"] for e in exceptions)
    sends = sorted(r[2] for r in allmain)
    # Wall-clock span of the app's exceptions minus monotonic span of the sends (ms); only
    # meaningful when every main request raised one (A1, A2).
    m["clock_divergence_ms"] = (ex_t[-1] - ex_t[0]) - (sends[-1] - sends[0]) if len(ex_t) == len(allmain) and ex_t else None

    ds_path = find(rid, "downstream.json")
    ds = []
    if ds_path:
        try:
            ds = json.load(opener(ds_path))
        except (json.JSONDecodeError, OSError):
            ds = []
    dsw = [c - a for a, c in ds if inw(a)]
    m["ds_n"] = len(dsw)
    m["ds_per_s"] = len(dsw) / win_s
    m["ds_p99_ms"] = pct(dsw, 0.99)
    return m


def load():
    runs = [json.loads(l) for l in open(os.path.join(RAW, "runs.jsonl")) if l.strip()]
    env = dict(l.rstrip("\n").split("=", 1) for l in open(os.path.join(RAW, "env.txt")) if "=" in l)
    reps = int(re.search(r"reps=(\d+)", open(os.path.join(RAW, "env.txt")).read()).group(1))
    cells = {}
    for r in runs:
        key = (r["variant"], int(r["lambda"]))
        cells.setdefault(key, []).append(r)
        if r["status"] == "OK":
            r["m"] = run_metrics(r)
    return runs, cells, reps, env


def med(cells, v, l, key):
    vals = [r["m"][key] for r in cells.get((v, l), []) if r["status"] == "OK" and r["m"][key] is not None]
    return statistics.median(vals) if vals else None


def every(cells, v, l, key):
    return [r["m"][key] if r["status"] == "OK" else r["status"] for r in sorted(cells.get((v, l), []), key=lambda r: r["rep"])]


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


def probe_key(key, fresh):
    """Deviation 2: the same criterion read on the fresh-connection probes."""
    if not fresh:
        return key
    for name in ("ping_parallel_", "ping_"):
        if key.startswith(name):
            return name.rstrip("_") + "_fresh_" + key[len(name):]
    return key


def criteria(runs, cells, reps, fresh):
    evaluable = lambda v, l: sum(1 for r in cells.get((v, l), []) if r["status"] == "OK") >= reps
    lines, results = [], {}

    def check(cid, text, ok, figures):
        results[cid] = bool(ok)
        lines.append(f"- **{cid}** {'✅ met' if ok else '❌ not met'} — {text}. {figures}")
        return bool(ok)

    def M(v, l, key):  # median, None when the cell is not evaluable
        key = probe_key(key, fresh)
        return med(cells, v, l, key) if evaluable(v, l) else None

    ge = lambda x, t: x is not None and x >= t
    le = lambda x, t: x is not None and x <= t
    lt = lambda x, t: x is not None and x < t

    if fresh:
        lines.append("# Deviation 2 — every criterion re-read on the fresh-connection probes (reported, NOT deciding)\n")
        lines.append("Same thresholds; only the probe changes: a new HttpClient, hence a new TCP connection, per probe request. "
                     "Added after smoke run 2 (DEVIATIONS.md, 2). The pre-registered keep-alive evaluation above decides.\n")
    else:
        lines.append("# Criteria — reactor-block (PREREGISTRATION.md)\n")
        lines.append("Medians over repetitions unless \"every repetition\". Thresholds copied verbatim from the pre-registration. "
                     "Probes: the pre-registered keep-alive probes (deciding).\n")
    lines.append("## Runs\n")
    bad = [r for r in runs if r["status"] != "OK"]
    lines.append(f"- {len(runs)} runs; status OK: {len(runs) - len(bad)}; not OK: "
                 + (", ".join(f"{r['id']} {r['status']}" for r in bad) or "none") + ".")
    for v in VARIANTS:
        for l in LAMBDAS:
            if (v, l) in cells and not evaluable(v, l):
                lines.append(f"- ⚠ cell {v} λ={l}: fewer than {reps} OK runs → not evaluable; its criteria count as not met.")
    killed = [r["id"] for r in runs if r.get("app_exit") == "kill"]
    unresp = [r["id"] for r in runs if r.get("app_responsive_after") == "no"]
    lines.append(f"- App needed SIGKILL: {', '.join(killed) or 'none'}.")
    lines.append(f"- App not answering /ping after the run: {', '.join(unresp) or 'none'}.")
    wrong = [r["id"] for r in runs if r["status"] == "OK" and r["m"]["stack"] != ("tomcat" if r["variant"] == "C" else "netty")]
    lines.append(f"- Stack check (deviation 1), runs served by the wrong server: {', '.join(wrong) or 'none'}.\n")

    # (0) precondition
    lines.append("## (0) Precondition\n")
    pre = json.load(open(os.path.join(RAW, "precondition.json")))
    hits = sorted({i["location"].rsplit("/", 1)[-1].split(":")[0] for i in pre["issues"] if i["ruleId"] == "reactor-block"})
    want = {"VariantA1Controller.java", "VariantA2Controller.java", "VariantA3Controller.java", "VariantA4Controller.java", "VariantCController.java"}
    check("(0)", "CLI flags A1, A2, A3, A4 and C, and nothing else (not B, probes, downstream)",
          set(hits) == want, f"flagged files: {', '.join(hits) or 'none'}")

    # (a), (b), (d) per variant, for the H1 / H2 verdicts
    for v, h in HYP.items():
        pool, call, probe = h["pool"], h["call"], h["probe"]
        lines.append(f"\n## {v}: P = {pool}, call = {call}, Q = /{probe.replace('_', '-')}\n")
        for l in (50, 400):
            s = M(v, l, f"{pool}_{call}_share")
            check(f"(a) {v} λ={l}", f"≥ 90 % of {pool} samples are {call}", ge(s, 0.90),
                  f"median {fmt(s, '%')}; per rep {[fmt(x, '%') if not isinstance(x, str) else x for x in every(cells, v, l, f'{pool}_{call}_share')]}")
        for l in (50, 400):
            p50, err, bp99 = M(v, l, f"{probe}_p50_ms"), M(v, l, f"{probe}_err_share"), M("B", l, f"{probe}_p99_ms")
            check(f"(b) {v} λ={l}", f"Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ",
                  (ge(p50, 1000) or ge(err, 0.10)) and le(bp99, 50),
                  f"Q p50 {fmt(p50, 'ms')}, Q errors {fmt(err, '%')}; B Q p99 {fmt(bp99, 'ms')}")
        for l in LAMBDAS:
            s500, ise = M(v, l, "http500_share"), M(v, l, f"ise_{pool}_ratio")
            check(f"(d1) {v} λ={l}", f"≥ 99 % HTTP 500 and ISE naming a {pool} thread ≥ 99 % of main requests",
                  ge(s500, 0.99) and ge(ise, 0.99), f"500 {fmt(s500, '%')}, ISE/requests {fmt(ise, '%')}")
            s = M(v, l, f"{pool}_{call}_share")
            check(f"(d2) {v} λ={l}", f"< 5 % of {pool} samples are {call}", lt(s, 0.05), f"median {fmt(s, '%')}")
            q99 = M(v, l, f"{probe}_p99_ms")
            check(f"(d3) {v} λ={l}", "Q p99 ≤ 50 ms", le(q99, 50), f"median {fmt(q99, 'ms')}")

    # (c) A3 capacity / deadlock
    lines.append("\n## (c) A3 capacity or deadlock\n")
    for l in (50, 400):
        ok_s = M("A3", l, "ok_per_s")
        check(f"(c) A3 λ={l}", "main OK responses ≤ 23/s", le(ok_s, 23), f"median {fmt(ok_s)}/s")
    a3_runs = [r for l in (50, 400) for r in cells.get(("A3", l), [])]
    deadlock = all(evaluable("A3", l) for l in (50, 400)) and all(
        r["status"] == "OK" and r["m"]["ok_in_window"] == 0 and r["m"]["timeout_share"] >= 0.90 for r in a3_runs)
    stall = (not deadlock) and results.get("(c) A3 λ=50") and results.get("(c) A3 λ=400") and all(
        r["status"] == "OK" and r["m"]["ok_in_window"] > 0 for r in a3_runs)
    a3_class = "deadlock" if deadlock else "stall without deadlock" if stall else "neither (mixed or not met)"
    lines.append(f"- **A3 class:** {a3_class}. Per rep, OK in window / timeout share: "
                 + "; ".join(f"λ={l}: " + ", ".join(
                     f"{x['m']['ok_in_window']}/{fmt(x['m']['timeout_share'], '%')}" if x["status"] == "OK" else x["status"]
                     for x in sorted(cells.get(('A3', l), []), key=lambda r: r['rep'])) for l in LAMBDAS))

    # (e) controls
    lines.append("\n## (e) Controls\n")
    for l in LAMBDAS:
        ok, p99, rate = M("B", l, "ok_share"), M("B", l, "main_p99_ms"), M("B", l, "ok_per_s")
        pp, qq = M("B", l, "ping_p99_ms"), M("B", l, "ping_parallel_p99_ms")
        check(f"(e) B λ={l}", "≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both probes p99 ≤ 50 ms",
              ge(ok, 0.99) and le(p99, 400) and rate is not None and abs(rate - l) <= 0.10 * l and le(pp, 50) and le(qq, 50),
              f"OK {fmt(ok, '%')}, p99 {fmt(p99, 'ms')}, OK/s {fmt(rate)}, probes p99 {fmt(pp, 'ms')} / {fmt(qq, 'ms')}")
    for l in LAMBDAS:
        pp, qq = M("A4", l, "ping_p99_ms"), M("A4", l, "ping_parallel_p99_ms")
        lb, pb = M("A4", l, "loop_BLOCKING_GET_share"), M("A4", l, "parallel_BLOCKING_GET_share")
        ok = M("A4", l, "ok_share")
        need_ok = l in (10, 50)
        check(f"(e) A4 Reactor λ={l}", "both probes p99 ≤ 50 ms; < 5 % of event-loop and parallel samples BLOCKING_GET"
              + ("; ≥ 99 % OK" if need_ok else ""),
              le(pp, 50) and le(qq, 50) and lt(lb, 0.05) and lt(pb, 0.05) and (ge(ok, 0.99) if need_ok else True),
              f"probes p99 {fmt(pp, 'ms')} / {fmt(qq, 'ms')}, loop BG {fmt(lb, '%')}, parallel BG {fmt(pb, '%')}, OK {fmt(ok, '%')}")
    for l in LAMBDAS:
        bad_samples = None
        if evaluable("C", l):
            bad_samples = med(cells, "C", l, "loop_BLOCKING_GET") + med(cells, "C", l, "loop_FUTURE_GET") \
                + med(cells, "C", l, "parallel_BLOCKING_GET") + med(cells, "C", l, "parallel_FUTURE_GET")
        pp, qq, ok = M("C", l, "ping_p99_ms"), M("C", l, "ping_parallel_p99_ms"), M("C", l, "ok_share")
        check(f"(e) C λ={l}", "0 Reactor-thread samples in BLOCKING_GET / FUTURE_GET, both probes p99 ≤ 50 ms, ≥ 99 % OK",
              bad_samples == 0 and le(pp, 50) and le(qq, 50) and ge(ok, 0.99),
              f"Reactor-thread blocked samples {fmt(bad_samples)}, probes p99 {fmt(pp, 'ms')} / {fmt(qq, 'ms')}, OK {fmt(ok, '%')}, "
              f"tomcat BG {fmt(M('C', l, 'tomcat_BLOCKING_GET_share'), '%')}")

    # (S) A4 saturation, separate
    lines.append("\n## (S) A4 saturation of boundedElastic (separate from the Reactor criterion)\n")
    s1 = M("A4", 400, "boundedElastic_BLOCKING_GET_share")
    check("S1 A4 λ=400", "≥ 90 % of boundedElastic samples BLOCKING_GET", ge(s1, 0.90), f"median {fmt(s1, '%')}")
    s2 = M("A4", 400, "ok_per_s")
    check("S2 A4 λ=400", "main OK ≤ 230/s (capacity 40 / 0.2 s = 200/s + 15 %)", le(s2, 230), f"median {fmt(s2)}/s")
    for l in LAMBDAS:
        lines.append(f"- A4 λ={l}: OK {fmt(M('A4', l, 'ok_share'), '%')}, OK/s {fmt(M('A4', l, 'ok_per_s'))}, "
                     f"timeouts {fmt(M('A4', l, 'timeout_share'), '%')}, boundedElastic BLOCKING_GET {fmt(M('A4', l, 'boundedElastic_BLOCKING_GET_share'), '%')}")

    # (f) no other cause
    lines.append("\n## (f) No other cause\n")
    for v in VARIANTS:
        for l in LAMBDAS:
            if (v, l) not in cells:
                continue
            cpu, gc, late, lc = M(v, l, "proc_cpu_share"), M(v, l, "gc_share"), M(v, l, "late_share"), M(v, l, "loop_cpu_max")
            dsn = M(v, l, "ds_n")
            ds99 = M(v, l, "ds_p99_ms")
            vac = evaluable(v, l) and dsn == 0
            check(f"(f1) {v} λ={l}", "app CPU < 50 % and GC < 1 %", lt(cpu, 0.50) and lt(gc, 0.01), f"CPU {fmt(cpu, '%')}, GC {fmt(gc, '%')}")
            check(f"(f2) {v} λ={l}", "downstream p99 ≤ 250 ms", vac or le(ds99, 250),
                  f"p99 {fmt(ds99, 'ms')}, downstream requests in window {fmt(dsn)}" + (" (vacuous: none received)" if vac else ""))
            check(f"(f3) {v} λ={l}", "≤ 1 % of requests sent > 100 ms late", le(late, 0.01), f"{fmt(late, '%')}")
            check(f"(f4) {v} λ={l}", "every event loop < 50 % of one CPU", lt(lc, 0.50), f"max {fmt(lc, '%')}")

    # Verdicts
    allmet = lambda prefix: all(ok for k, ok in results.items() if k.startswith(prefix))
    f_ok = all(ok for k, ok in results.items() if k.startswith("(f"))
    f_ok_for = lambda v: all(ok for k, ok in results.items() if k.startswith("(f") and f" {v} " in k)
    b_ok = allmet("(e) B")
    lines.append("\n## Verdicts\n")
    verdicts = {}
    for v, h in HYP.items():
        h1 = all(results[f"(a) {v} λ={l}"] and results[f"(b) {v} λ={l}"] for l in (50, 400))
        h2 = all(results[f"(d1) {v} λ={l}"] and results[f"(d2) {v} λ={l}"] and results[f"(d3) {v} λ={l}"] for l in LAMBDAS)
        if h1 and h2:
            verdict = "BOTH MET — evaluator bug (H1 needs ≥ 90 %, H2 < 5 %)"
        elif h1:
            verdict = "H1 confirmed (holds the thread / stalls the scheduler)"
        elif h2:
            verdict = "H2 confirmed (fails fast with IllegalStateException)"
        else:
            pool, call, probe = h["pool"], h["call"], h["probe"]
            s5 = [M(v, l, f"{pool}_{call}_share") for l in (50, 400)]
            e500 = [M(v, l, "http500_share") for l in LAMBDAS]
            q99 = [M(v, l, f"{probe}_p99_ms") for l in LAMBDAS]
            if all(ge(x, 0.99) for x in e500) and (any(not le(x, 50) for x in q99) or any(not lt(M(v, l, f"{pool}_{call}_share"), 0.05) for l in LAMBDAS)):
                label = "fails, but not fast"
            elif any(x is not None and 0.05 <= x < 0.90 for x in s5):
                label = "partial retention"
            elif all(ge(x, 0.90) for x in s5):
                label = "slow, not stalled"
            else:
                label = "other"
            verdict = f"fits neither — {label}"
        verdicts[v] = verdict
        lines.append(f"- **{v}:** {verdict}. Predicted: {'H1' if v == 'A3' else 'H2'}.")
    lines.append(f"- **A3 class (c):** {a3_class}.")
    a4_pred = allmet("(e) A4") and f_ok_for("A4")
    c_pred = allmet("(e) C") and f_ok_for("C")
    lines.append(f"- **A4 Reactor criterion** (e): {'met' if allmet('(e) A4') else 'not met'}; "
                 f"saturation S1 {'met' if results['S1 A4 λ=400'] else 'not met'}, S2 {'met' if results['S2 A4 λ=400'] else 'not met'}.")
    lines.append(f"- **C** (e): {'met' if allmet('(e) C') else 'not met'}.")

    lines.append("\n## Outcome rules (PREREGISTRATION.md, Outcome → consequences)\n")
    base = results["(0)"] and b_ok
    for v in ("A1", "A2"):
        if verdicts[v].startswith("H2"):
            lines.append(f"- 1. H2 for {v}: correction of the mechanism text for that context "
                         f"{'APPLIES' if base and f_ok_for(v) and f_ok_for('B') else 'does NOT apply ((0), (e)-B or (f) not met)'}.")
        elif verdicts[v].startswith("H1"):
            lines.append(f"- 4. H1 for {v}: measured evidence for .block() in that context "
                         f"{'APPLIES' if base and f_ok_for(v) and f_ok_for('B') else 'does NOT apply ((0), (e)-B or (f) not met)'}.")
        else:
            lines.append(f"- 5. {v}: {verdicts[v]} → stays documented mechanism; results published.")
    a3_ok = verdicts["A3"].startswith("H1") and results["(c) A3 λ=50"] and results["(c) A3 λ=400"]
    lines.append(f"- 2. A3 measured evidence for .toFuture().get() ({a3_class}): "
                 f"{'APPLIES' if a3_ok and base and f_ok_for('A3') and f_ok_for('B') else 'does NOT apply'}.")
    lines.append(f"- 3. Precision proposal (A4 boundedElastic, C MVC-only): "
                 f"{'APPLIES' if results['(0)'] and a4_pred and c_pred else 'does NOT apply'}"
                 f" (A4 Reactor criterion and its (f) {'met' if a4_pred else 'not met'}; C and its (f) {'met' if c_pred else 'not met'}).")
    lines.append(f"- (f) met for every cell: {'yes' if f_ok else 'no'}.")

    return lines


def clock_section(runs, cells, reps):
    """Deviation 4: (d1) over the whole run, reported, NOT deciding."""
    lines = ["# Deviation 4 — (d1) over the whole run, without cross-process clock alignment (reported, NOT deciding)\n",
             "Added after the results (DEVIATIONS.md, 4). Same thresholds (≥ 99 %); the count covers every main request of the run "
             "(warm-up and window) instead of the window, so the app's wall clock and the generator's monotonic clock need not agree. "
             "The pre-registered (d1) above decides.\n"]
    for v, h in HYP.items():
        pool = h["pool"]
        oks = []
        for l in LAMBDAS:
            rs = [r for r in cells.get((v, l), []) if r["status"] == "OK"]
            s500 = statistics.median([r["m"]["http500_run_share"] for r in rs]) if len(rs) >= reps else None
            ise = statistics.median([r["m"][f"ise_{pool}_run_ratio"] for r in rs]) if len(rs) >= reps else None
            ok = s500 is not None and ise is not None and s500 >= 0.99 and ise >= 0.99
            oks.append(ok)
            per = ", ".join(f"{r['m'][f'ise_{pool}_run_ratio'] * 100:.1f} %" for r in sorted(rs, key=lambda r: r["rep"]))
            div = ", ".join(fmt(r["m"]["clock_divergence_ms"]) for r in sorted(rs, key=lambda r: r["rep"]))
            lines.append(f"- **(d1-run) {v} λ={l}** {'✅ met' if ok else '❌ not met'} — 500 {fmt(s500, '%')}, ISE naming a {pool} thread / main requests "
                         f"{fmt(ise, '%')} (per rep {per}). Clock divergence per rep (ms, wall − monotonic span): {div}")
        lines.append(f"- {v}: with (d1-run) in place of (d1), (d1) would be {'met' if all(oks) else 'not met'} at every λ.")
    return lines


def main():
    runs, cells, reps, env = load()
    lines = (criteria(runs, cells, reps, fresh=False) + ["", "---", ""] + criteria(runs, cells, reps, fresh=True)
             + ["", "---", ""] + clock_section(runs, cells, reps))
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "criteria.md"), "w").write("\n".join(lines) + "\n")

    # Summary
    cols = [
        ("ok_share", "%", "OK"), ("http500_share", "%", "500"), ("timeout_share", "%", "timeouts"), ("ok_per_s", "", "OK/s"),
        ("main_p99_ms", "ms", "main p99"), ("ping_p50_ms", "ms", "/ping p50"), ("ping_p99_ms", "ms", "/ping p99"),
        ("ping_err_share", "%", "/ping err"), ("ping_parallel_p99_ms", "ms", "/ping-parallel p99"),
        ("ping_parallel_err_share", "%", "/ping-parallel err"),
        ("ping_fresh_p50_ms", "ms", "/ping fresh p50"), ("ping_fresh_p99_ms", "ms", "/ping fresh p99"), ("ping_fresh_err_share", "%", "/ping fresh err"),
        ("ping_parallel_fresh_p99_ms", "ms", "/ping-parallel fresh p99"), ("ping_parallel_fresh_err_share", "%", "/ping-parallel fresh err"),
        ("loop_BLOCKING_GET_share", "%", "loop BG"), ("loop_FUTURE_GET_share", "%", "loop FG"), ("loop_IDLE_share", "%", "loop idle"),
        ("parallel_BLOCKING_GET_share", "%", "parallel BG"), ("boundedElastic_BLOCKING_GET_share", "%", "bElastic BG"),
        ("tomcat_BLOCKING_GET_share", "%", "tomcat BG"),
        ("ise_loop_ratio", "%", "ISE loop/req"), ("ise_parallel_ratio", "%", "ISE parallel/req"),
        ("ds_per_s", "", "downstream req/s"), ("ds_p99_ms", "ms", "downstream p99"),
        ("proc_cpu_share", "%", "app CPU"), ("loop_cpu_max", "%", "max loop CPU"), ("gc_share", "%", "GC"), ("late_share", "%", "late >100 ms"),
    ]
    out = ["# Summary — reactor-block\n",
           "Median [min–max] over the OK repetitions of each cell. Window: 60 s after a 10 s warm-up, by target time "
           "(OK/s by end time). Not quotable as absolute latencies (controlled simulation, PREREGISTRATION.md).\n",
           "## Environment\n", "```", open(os.path.join(RAW, "env.txt")).read().strip(), "```\n"]
    for l in LAMBDAS:
        present = [v for v in VARIANTS if (v, l) in cells]
        if not present:
            continue
        out.append(f"## λ = {l} requests/s\n")
        out.append("| metric | " + " | ".join(present) + " |")
        out.append("|---|" + "---|" * len(present))
        out.append("| OK runs | " + " | ".join(f"{sum(1 for r in cells[(v, l)] if r['status'] == 'OK')}/{len(cells[(v, l)])}" for v in present) + " |")
        for key, unit, label in cols:
            row = []
            for v in present:
                vals = [r["m"][key] for r in cells[(v, l)] if r["status"] == "OK" and r["m"][key] is not None]
                if not vals:
                    row.append("n/a")
                    continue
                row.append(f"{fmt(statistics.median(vals), unit)} [{fmt(min(vals), unit)}–{fmt(max(vals), unit)}]")
            out.append(f"| {label} | " + " | ".join(row) + " |")
        out.append("")
    out.append("## Runs\n")
    out.append("| run | status | stack | app answering after | app stop | downstream stop |")
    out.append("|---|---|---|---|---|---|")
    for r in runs:
        stack = r["m"]["stack"] if r["status"] == "OK" else "n/a"
        out.append(f"| {r['id']} | {r['status']} | {stack} | {r.get('app_responsive_after')} | {r.get('app_exit')} | {r.get('downstream_exit')} |")
    open(os.path.join(OUT, "summary.md"), "w").write("\n".join(out) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
