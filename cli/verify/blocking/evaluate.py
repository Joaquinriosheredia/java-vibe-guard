#!/usr/bin/env python3
"""Evaluates results/raw/*.json against the criteria frozen in PREREGISTRATION.md.

Writes results/summary.md (per variant and rate: median and min-max over repetitions)
and results/criteria.md (each criterion: met / not met, with the figures used).
Thresholds are copied verbatim from PREREGISTRATION.md; do not edit them here.
"""
import glob
import json
import os
import statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "results", "raw")
K = 40.0  # theoretical capacity of A: 8 threads / 0.2 s


def slope(rows):
    """Least-squares slope (tasks/s) of the queue size over the window."""
    xs = [r[0] / 1000.0 for r in rows]
    ys = [r[1] for r in rows]
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else 0.0


def metrics(d):
    rows = d["samples"]["rows"]
    pool = d["corePoolSize"] or 0
    st = d["stackSamples"]
    cpu = [c for c in d["processCpuLoad"] if c is not None and c >= 0]
    return {
        "inflight_eq_pool": sum(1 for r in rows if r[2] == pool) / len(rows) if pool else None,
        "queue_slope": slope(rows),
        "queue_median": statistics.median(r[1] for r in rows),
        "queue_wait_share": d["queueWaitMs"]["mean"] / d["latencyMs"]["mean"] if d["latencyMs"]["mean"] else 0.0,
        "exec_p50": d["executionMs"]["p50"],
        "lat_p50": d["latencyMs"]["p50"],
        "lat_p95": d["latencyMs"]["p95"],
        "lat_p99": d["latencyMs"]["p99"],
        "stack_in_join": st["inJoin"] / st["executorThreadSamples"] if st["executorThreadSamples"] else None,
        "stack_in_interceptor_get": st.get("inInterceptorFutureGet", 0) / st["executorThreadSamples"]
        if st["executorThreadSamples"] else None,
        "completions_per_s": d["completedDuringWindow"] / d["windowSeconds"],
        "cpu_mean": statistics.fmean(cpu) if cpu else None,
        "gc_share": d["gcMsInWindow"] / (d["windowSeconds"] * 1000.0),
    }


def load():
    runs = defaultdict(list)
    for f in sorted(glob.glob(os.path.join(RAW, "*.json"))):
        d = json.load(open(f))
        runs[(d["variant"], int(d["rate"]))].append(metrics(d))
    return runs


def agg(runs, key, metric):
    vals = [m[metric] for m in runs.get(key, []) if m[metric] is not None]
    if not vals:
        return None
    return {"median": statistics.median(vals), "min": min(vals), "max": max(vals), "n": len(vals)}


def fmt(a, digits=1, pct=False):
    if a is None:
        return "—"
    f = (lambda v: f"{v * 100:.{digits}f} %") if pct else (lambda v: f"{v:.{digits}f}")
    return f"{f(a['median'])} ({f(a['min'])} – {f(a['max'])})"


def main():
    runs = load()
    out = []
    crit = []

    def check(cid, text, ok, figures):
        ok = bool(ok)  # missing data counts as not met
        crit.append((cid, text, ok, figures))
        return ok

    # (a) Saturation, A at 60 and 120
    a_ok = True
    for lam in (60, 120):
        k = ("A", lam)
        infl = agg(runs, k, "inflight_eq_pool")
        sl = agg(runs, k, "queue_slope")
        share = agg(runs, k, "queue_wait_share")
        ex = agg(runs, k, "exec_p50")
        lo, hi = 0.8 * (lam - K), 1.2 * (lam - K)
        a_ok &= check("a", f"A λ={lam}: in-flight = 8 in ≥ 90 % of samples", infl and infl["median"] >= 0.90, fmt(infl, pct=True))
        a_ok &= check("a", f"A λ={lam}: queue slope {lo:.0f}–{hi:.0f} tasks/s", sl and lo <= sl["median"] <= hi, fmt(sl))
        a_ok &= check("a", f"A λ={lam}: queue wait ≥ 80 % of mean latency", share and share["median"] >= 0.80, fmt(share, pct=True))
        a_ok &= check("a", f"A λ={lam}: median execution 180–220 ms", ex and 180 <= ex["median"] <= 220, fmt(ex) + " ms")

    # (b) Stacks in join()
    b_ok = True
    for lam in (60, 120):
        sj = agg(runs, ("A", lam), "stack_in_join")
        b_ok &= check("b", f"A λ={lam}: ≥ 90 % of executor-thread stack samples in CompletableFuture.join from the @Async method",
                      sj and sj["median"] >= 0.90, fmt(sj, pct=True))

    # (c) The control does not queue
    c_ok = True
    for lam in (60, 120):
        bq = agg(runs, ("B", lam), "queue_median")
        b99 = agg(runs, ("B", lam), "lat_p99")
        a50 = agg(runs, ("A", lam), "lat_p50")
        b50 = agg(runs, ("B", lam), "lat_p50")
        c_ok &= check("c", f"B λ={lam}: median queue size ≤ 8", bq and bq["median"] <= 8, fmt(bq))
        c_ok &= check("c", f"B λ={lam}: p99 latency ≤ 300 ms", b99 and b99["median"] <= 300, fmt(b99) + " ms")
        ratio = a50["median"] / b50["median"] if a50 and b50 else None
        c_ok &= check("c", f"λ={lam}: A p50 ≥ 5× B p50", ratio is not None and ratio >= 5,
                      f"A {fmt(a50)} ms / B {fmt(b50)} ms = {ratio:.1f}×" if ratio else "—")
        c_ok &= check("c", f"λ={lam}: A and B p50 ranges do not overlap", a50 and b50 and (a50["min"] > b50["max"] or b50["min"] > a50["max"]),
                      f"A {a50['min']:.1f}–{a50['max']:.1f} ms, B {b50['min']:.1f}–{b50['max']:.1f} ms" if a50 and b50 else "—")

    # (d) Dose-response
    d_ok = True
    for lam in (20, 36):
        sl = agg(runs, ("A", lam), "queue_slope")
        d_ok &= check("d", f"A λ={lam}: queue slope within ±2 tasks/s", sl and abs(sl["median"]) <= 2, fmt(sl, 2))
    for lam in (60, 120):
        cps = agg(runs, ("A", lam), "completions_per_s")
        d_ok &= check("d", f"A λ={lam}: completions/s 34–46", cps and 34 <= cps["median"] <= 46, fmt(cps))
    cps = agg(runs, ("C", 120), "completions_per_s")
    d_ok &= check("d", "C λ=120: completions/s 68–92", cps and 68 <= cps["median"] <= 92, fmt(cps))
    sl = agg(runs, ("C", 60), "queue_slope")
    d_ok &= check("d", "C λ=60: queue slope within ±2 tasks/s", sl and abs(sl["median"]) <= 2, fmt(sl, 2))

    # (e) No other bottleneck
    e_ok = True
    for lam in (60, 120):
        cpu = agg(runs, ("A", lam), "cpu_mean")
        gc = agg(runs, ("A", lam), "gc_share")
        e_ok &= check("e", f"A λ={lam}: mean process CPU < 50 %", cpu and cpu["median"] < 0.50, fmt(cpu, pct=True))
        e_ok &= check("e", f"A λ={lam}: GC < 1 % of the window", gc and gc["median"] < 0.01, fmt(gc, 2, pct=True))

    all_ok = a_ok and b_ok and c_ok and d_ok and e_ok

    # D (reported, not a criterion)
    dsl = agg(runs, ("D", 120), "queue_slope")
    d99 = agg(runs, ("D", 120), "lat_p99")
    d_not_saturating = bool(dsl and d99 and abs(dsl["median"]) <= 2 and d99["median"] <= 400)

    with open(os.path.join(HERE, "results", "criteria.md"), "w") as f:
        f.write("# blocking — results against the pre-registered criteria\n\n")
        f.write("Thresholds from [`PREREGISTRATION.md`](../PREREGISTRATION.md) (frozen). Figures: median (min – max) over repetitions. "
                "Generated by `evaluate.py` from `results/raw/`.\n\n")
        f.write("| Criterion | Check | Result | Figures |\n|---|---|---|---|\n")
        for cid, text, ok, fig in crit:
            f.write(f"| ({cid}) | {text} | {'met' if ok else '**not met**'} | {fig} |\n")
        f.write(f"\n**Outcome:** {'all criteria (a)–(e) met → measured evidence for @Async on the default platform-thread executor' if all_ok else 'at least one criterion not met → the rule stays \"documented mechanism, no benchmark of our own\"'}.\n\n")
        f.write(f"**D (virtual threads, reported, not a criterion):** queue slope at λ=120 {fmt(dsl, 2)} tasks/s, p99 {fmt(d99)} ms → "
                f"{'D does not saturate (pre-registered definition)' if d_not_saturating else 'D saturates or exceeds the pre-registered bounds'}.\n")

    cols = [("queue_slope", "Queue slope (tasks/s)", 2, False), ("queue_median", "Queue (median)", 0, False),
            ("completions_per_s", "Completions/s", 1, False), ("lat_p50", "p50 (ms)", 1, False),
            ("lat_p99", "p99 (ms)", 1, False), ("exec_p50", "Execution p50 (ms)", 1, False),
            ("queue_wait_share", "Queue wait share", 1, True), ("inflight_eq_pool", "In-flight = pool", 1, True),
            ("stack_in_join", "Stacks in join()", 1, True), ("stack_in_interceptor_get", "Stacks in interceptor get()", 1, True),
            ("cpu_mean", "Process CPU", 1, True), ("gc_share", "GC share", 2, True)]
    with open(os.path.join(HERE, "results", "summary.md"), "w") as f:
        f.write("# blocking — results by variant and rate\n\nMedian (min – max) over repetitions. Raw data: `results/raw/`.\n\n")
        f.write("```\n" + open(os.path.join(RAW, "env.txt")).read() + "```\n\n")
        for (v, lam) in sorted(runs):
            f.write(f"## {v} at {lam} tasks/s (n={len(runs[(v, lam)])})\n\n| Metric | Value |\n|---|---|\n")
            for key, label, digits, pct in cols:
                f.write(f"| {label} | {fmt(agg(runs, (v, lam), key), digits, pct)} |\n")
            f.write("\n")
    print(open(os.path.join(HERE, "results", "criteria.md")).read())


if __name__ == "__main__":
    main()
