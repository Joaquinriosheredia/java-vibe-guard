#!/usr/bin/env python3
"""Evaluates results/raw/ against the criteria frozen in PREREGISTRATION.md.

Writes results/criteria.md (each criterion met / not met with its figures, the verdicts
for H and HN) and results/summary.md (per variant and rate: median [min-max]). Thresholds
are copied verbatim from the pre-registration; do not edit them here. Committed with the
harness, before any run; later changes go to DEVIATIONS.md. Every time in the raw data is
System.nanoTime() of a single JVM (clock rule).

Usage: python3 evaluate.py [raw_dir] [out_dir]
"""
import gzip
import json
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "results", "raw")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "results")
RATES = [20, 36, 60, 120]
PN_RATES = [10, 20, 36, 60, 120]
VARIANTS = ["P", "K", "N", "V", "P16", "PN"]
LAST_MS = 10_000  # (g): the last 10 s of the window


def opener(p):
    return gzip.open(p, "rt") if p.endswith(".gz") else open(p)


def slope(rows):
    """Least-squares slope (tasks/s) of the queue size (column 1) over the window."""
    if len(rows) < 2:
        return 0.0
    xs = [r[0] / 1000.0 for r in rows]
    ys = [r[1] for r in rows]
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else 0.0


def metrics(d):
    rows = d["samples"]["rows"]   # tMs, queue, inFlight, active, poolQueue, finished, innerPending, executorTasks
    st = d["stacks"]["rows"]      # tMs, executorThreads, interceptorGet, outer, inner
    pool = d["corePoolSize"] or 0
    win_ms = d["windowSeconds"] * 1000
    cpu = [c for c in d["processCpuLoad"] if c is not None and c >= 0]
    threads = sum(r[1] for r in st)
    m = {
        "inflight_eq_pool": sum(1 for r in rows if r[2] == pool) / len(rows) if pool and rows else None,
        "queue_slope": slope(rows),
        "queue_median": statistics.median(r[1] for r in rows) if rows else None,
        "queue_wait_share": d["queueWaitMs"]["mean"] / d["latencyMs"]["mean"] if d["latencyMs"]["mean"] else None,
        "exec_p50": d["executionMs"]["p50"],
        "lat_p50": d["latencyMs"]["p50"],
        "lat_p99": d["latencyMs"]["p99"],
        "completions_per_s": (rows[-1][5] - rows[0][5]) / d["windowSeconds"] if len(rows) > 1 else 0.0,
        "interceptor_get_share": sum(r[2] for r in st) / threads if threads else None,
        "executor_tasks": rows[-1][7] if rows else None,
        "cpu_mean": statistics.fmean(cpu) if cpu else None,
        "gc_share": d["gcMsInWindow"] / win_ms,
        "unfinished": d["unfinished"],
        "drained": d["drained"],
    }
    # (g): the last 10 s of the window.
    last = [r for r in rows if r[0] >= win_ms - LAST_MS]
    last_st = [r for r in st if r[0] >= win_ms - LAST_MS]
    last_threads = sum(r[1] for r in last_st)
    m["last_completions"] = last[-1][5] - last[0][5] if len(last) > 1 else 0
    m["last_outer_get_share"] = sum(r[3] for r in last_st) / last_threads if last_threads else None
    m["last_inner_pending_min"] = min(r[6] for r in last) if last else None
    m["deadlock"] = (m["last_completions"] == 0 and m["last_outer_get_share"] is not None
                     and m["last_outer_get_share"] >= 0.90 and m["last_inner_pending_min"] is not None
                     and m["last_inner_pending_min"] >= 1)
    fin = [r for r in rows]
    last_change = 0
    for a, b in zip(fin, fin[1:]):
        if b[5] > a[5]:
            last_change = b[0]
    m["last_completion_ms"] = last_change
    return m


def load():
    runs = [json.loads(l) for l in open(os.path.join(RAW, "runs.jsonl")) if l.strip()]
    reps = int(re.search(r"reps=(\d+)", open(os.path.join(RAW, "env.txt")).read()).group(1))
    cells = {}
    for r in runs:
        cells.setdefault((r["variant"], int(r["rate"])), []).append(r)
        if r["status"] == "OK":
            p = os.path.join(RAW, f"{r['id']}.json.gz")
            r["m"] = metrics(json.load(opener(p if os.path.exists(p) else p[:-3])))
    return runs, cells, reps


def fmt(x, unit=""):
    if x is None:
        return "n/a"
    if isinstance(x, bool):
        return "yes" if x else "no"
    if unit == "%":
        return f"{100 * x:.1f} %"
    if unit == "ms":
        return f"{x:.0f} ms"
    return f"{x:.2f}" if isinstance(x, float) else str(x)


def main():
    runs, cells, reps = load()
    ok = lambda v, l: sorted([r for r in cells.get((v, l), []) if r["status"] == "OK"], key=lambda r: r["rep"])
    evaluable = lambda v, l: len(ok(v, l)) >= reps

    def M(v, l, k):
        vals = [r["m"][k] for r in ok(v, l) if r["m"][k] is not None]
        return statistics.median(vals) if evaluable(v, l) and vals else None

    def rng(v, l, k):
        vals = [r["m"][k] for r in ok(v, l) if r["m"][k] is not None]
        return (min(vals), max(vals)) if vals else (None, None)

    within = lambda x, lo, hi: x is not None and lo <= x <= hi
    ge = lambda x, t: x is not None and x >= t
    le = lambda x, t: x is not None and x <= t
    lt = lambda x, t: x is not None and x < t
    lines, res = [], {}

    def check(cid, text, cond, figs):
        res[cid] = bool(cond)
        lines.append(f"- **{cid}** {'✅ met' if cond else '❌ not met'} — {text}. {figs}")

    lines.append("# Criteria — async-returns-pending-future (B0) (PREREGISTRATION.md)\n")
    lines.append("Medians over 5 repetitions unless \"every repetition\". All times System.nanoTime() in one JVM.\n")
    bad = [r for r in runs if r["status"] != "OK"]
    lines.append("## Runs\n")
    lines.append(f"- {len(runs)} runs; OK {len(runs) - len(bad)}; not OK: " + (", ".join(f"{r['id']} {r['status']}" for r in bad) or "none") + ".")
    for (v, l) in sorted(cells):
        if not evaluable(v, l):
            lines.append(f"- ⚠ cell {v} λ={l}: fewer than {reps} OK runs → not evaluable; its criteria count as not met.")
    env = open(os.path.join(RAW, "env.txt")).read()
    pre = re.search(r"clock_preflight .*", env)
    lines.append(f"- Clock preflight (informational): {pre.group(0) if pre else 'n/a'}.\n")

    lines.append("## (0) Precondition (informational)\n")
    for rule in ("blocking", "reactor-block"):
        p = os.path.join(RAW, f"precondition-{rule}.json")
        issues = json.load(open(p))["issues"] if os.path.exists(p) else []
        hits = [i["location"] for i in issues if "PendingTasks.java" in i["location"]]
        lines.append(f"- CLI 2.2.0 `--rule {rule}` on PendingTasks.java: {', '.join(hits) or 'no finding'}.")

    lines.append("\n## (a) Saturation, P\n")
    for l in (60, 120):
        lo, hi = 0.8 * (l - 40), 1.2 * (l - 40)
        check(f"(a) P λ={l}", f"in-flight = 8 in ≥ 90 % of samples; queue slope {lo:.0f}–{hi:.0f}/s; queue wait ≥ 80 % of latency; median execution 180–220 ms",
              ge(M("P", l, "inflight_eq_pool"), 0.90) and within(M("P", l, "queue_slope"), lo, hi)
              and ge(M("P", l, "queue_wait_share"), 0.80) and within(M("P", l, "exec_p50"), 180, 220),
              f"in-flight=8 {fmt(M('P', l, 'inflight_eq_pool'), '%')}, slope {fmt(M('P', l, 'queue_slope'))}/s, "
              f"queue wait {fmt(M('P', l, 'queue_wait_share'), '%')}, execution p50 {fmt(M('P', l, 'exec_p50'), 'ms')}")
    lines.append("\n## (b) Threads in the interceptor's get(), P\n")
    for l in (60, 120):
        check(f"(b) P λ={l}", "≥ 90 % of executor-thread samples INTERCEPTOR_GET", ge(M("P", l, "interceptor_get_share"), 0.90),
              f"median {fmt(M('P', l, 'interceptor_get_share'), '%')}")
    lines.append("\n## (c) Controls do not queue\n")
    for l in (60, 120):
        pk = M("P", l, "lat_p50"), M("K", l, "lat_p50")
        pr, kr = rng("P", l, "lat_p50"), rng("K", l, "lat_p50")
        no_overlap = pr[0] is not None and kr[1] is not None and pr[0] > kr[1]
        check(f"(c) K λ={l}", "median queue ≤ 8; p99 ≤ 300 ms; < 5 % INTERCEPTOR_GET; P p50 ≥ 5× K p50; P and K p50 ranges do not overlap",
              le(M("K", l, "queue_median"), 8) and le(M("K", l, "lat_p99"), 300) and lt(M("K", l, "interceptor_get_share"), 0.05)
              and pk[0] is not None and pk[1] and pk[0] >= 5 * pk[1] and no_overlap,
              f"K queue {fmt(M('K', l, 'queue_median'))}, K p99 {fmt(M('K', l, 'lat_p99'), 'ms')}, K get {fmt(M('K', l, 'interceptor_get_share'), '%')}, "
              f"P p50 {fmt(pk[0], 'ms')} vs K p50 {fmt(pk[1], 'ms')}, P range {fmt(pr[0], 'ms')}–{fmt(pr[1], 'ms')}, K range {fmt(kr[0], 'ms')}–{fmt(kr[1], 'ms')}")
        check(f"(c) N λ={l}", "p99 ≤ 300 ms; completions/s = λ ± 10 %; 0 tasks on the @Async executor (every repetition)",
              le(M("N", l, "lat_p99"), 300) and within(M("N", l, "completions_per_s"), 0.9 * l, 1.1 * l)
              and evaluable("N", l) and all(r["m"]["executor_tasks"] == 0 for r in ok("N", l)),
              f"p99 {fmt(M('N', l, 'lat_p99'), 'ms')}, completions/s {fmt(M('N', l, 'completions_per_s'))}, "
              f"executor tasks per rep {[r['m']['executor_tasks'] for r in ok('N', l)]}")
    lines.append("\n## (d) Dose–response\n")
    for l in (20, 36):
        check(f"(d) P λ={l}", "queue slope within ±2 tasks/s", within(M("P", l, "queue_slope"), -2, 2), f"slope {fmt(M('P', l, 'queue_slope'))}/s")
    for l in (60, 120):
        check(f"(d) P λ={l}", "completions/s within 34–46", within(M("P", l, "completions_per_s"), 34, 46), f"{fmt(M('P', l, 'completions_per_s'))}/s")
    check("(d) P16 λ=120", "completions/s within 68–92", within(M("P16", 120, "completions_per_s"), 68, 92), f"{fmt(M('P16', 120, 'completions_per_s'))}/s")
    check("(d) P16 λ=60", "queue slope within ±2 tasks/s", within(M("P16", 60, "queue_slope"), -2, 2), f"slope {fmt(M('P16', 60, 'queue_slope'))}/s")
    lines.append("\n## (e) No other bottleneck\n")
    for l in (60, 120):
        check(f"(e) P λ={l}", "mean process CPU < 50 % and GC < 1 %", lt(M("P", l, "cpu_mean"), 0.50) and lt(M("P", l, "gc_share"), 0.01),
              f"CPU {fmt(M('P', l, 'cpu_mean'), '%')}, GC {fmt(M('P', l, 'gc_share'), '%')}")
    check("(e) K λ=120", "completions/s = λ ± 10 % (108–132)", within(M("K", 120, "completions_per_s"), 108, 132), f"{fmt(M('K', 120, 'completions_per_s'))}/s")
    lines.append("\n## (f) Virtual threads (scope of severity only)\n")
    check("(f) V λ=120", "queue slope within ±2 tasks/s and p99 ≤ 400 ms", within(M("V", 120, "queue_slope"), -2, 2) and le(M("V", 120, "lat_p99"), 400),
          f"slope {fmt(M('V', 120, 'queue_slope'))}/s, p99 {fmt(M('V', 120, 'lat_p99'), 'ms')}")

    # H0: P meets K's (c) thresholds at 60 and 120.
    h0 = all(le(M("P", l, "queue_median"), 8) and le(M("P", l, "lat_p99"), 300) and lt(M("P", l, "interceptor_get_share"), 0.05) for l in (60, 120))

    lines.append("\n## (g) HN — PN: saturation or starvation deadlock\n")
    lines.append("Per run, last 10 s of the window: deadlock = 0 outer completions, ≥ 90 % of executor samples INTERCEPTOR_GET labelled OUTER, "
                 "inner tasks pending ≥ 1 in every sample.\n")
    for l in PN_RATES:
        rs = ok("PN", l)
        lines.append(f"- PN λ={l}: deadlocked reps {sum(1 for r in rs if r['m']['deadlock'])}/{len(rs)}; per rep (completions last 10 s / "
                     f"OUTER get share / min inner pending / last completion at / unfinished after drain): "
                     + "; ".join(f"{r['m']['last_completions']} / {fmt(r['m']['last_outer_get_share'], '%')} / {r['m']['last_inner_pending_min']} / "
                                 f"{r['m']['last_completion_ms'] / 1000:.1f} s / {r['m']['unfinished']}" for r in rs)
                     + f"; completions/s median {fmt(M('PN', l, 'completions_per_s'))}")
    hn_dead = all(evaluable("PN", l) and all(r["m"]["deadlock"] for r in ok("PN", l)) for l in (60, 120))
    hn_low = evaluable("PN", 10) and not any(r["m"]["deadlock"] for r in ok("PN", 10)) and within(M("PN", 10, "completions_per_s"), 9, 11)
    check("(g) HN deadlock", "every repetition at λ = 60 and 120 is a deadlock", hn_dead, "")
    check("(g) HN below threshold", "at λ = 10 no repetition is a deadlock and completions/s = 10 ± 10 %", hn_low,
          f"completions/s {fmt(M('PN', 10, 'completions_per_s'))}")
    hn_refuted = (all(evaluable("PN", l) and not any(r["m"]["deadlock"] for r in ok("PN", l)) for l in (60, 120))
                  and all(within(M("PN", l, "completions_per_s"), 17, 23) for l in (60, 120)))

    lines.append("\n## Verdicts\n")
    h = all(res[k] for k in res if k[:3] in ("(a)", "(b)", "(c)", "(d)", "(e)"))
    lines.append(f"- **H (pending future holds the @Async thread):** {'CONFIRMED' if h else 'H0 — P behaves like K (refuted)' if h0 else 'fits neither'}.")
    lines.append(f"- **(f) virtual threads:** {'met — a future rule would follow blocking’s WARNING criterion with virtual threads' if res['(f) V λ=120'] else 'not met — no virtual-thread exception'}.")
    hn = "CONFIRMED (starvation deadlock)" if hn_dead and hn_low else "refuted (saturates, no deadlock)" if hn_refuted else "fits neither"
    lines.append(f"- **HN (nested form):** {hn}. Independent of H.")
    lines.append(f"- **Next step:** {'propose the precision-first detection design (shapes reported / not reported, fixtures) to Joaquín' if h else 'no rule; publish the results'}.")

    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "criteria.md"), "w").write("\n".join(lines) + "\n")

    cols = [("completions_per_s", "", "completions/s"), ("queue_slope", "", "queue slope /s"), ("queue_median", "", "queue median"),
            ("inflight_eq_pool", "%", "in-flight = pool"), ("queue_wait_share", "%", "queue wait share"), ("exec_p50", "ms", "execution p50"),
            ("lat_p50", "ms", "latency p50"), ("lat_p99", "ms", "latency p99"), ("interceptor_get_share", "%", "INTERCEPTOR_GET"),
            ("executor_tasks", "", "executor tasks"), ("last_completions", "", "completions, last 10 s"), ("unfinished", "", "unfinished after drain"),
            ("cpu_mean", "%", "CPU"), ("gc_share", "%", "GC")]
    out = ["# Summary — async-returns-pending-future (B0)\n", "Median [min–max] over the OK repetitions. Controlled simulation: no absolute latency is quotable.\n",
           "## Environment\n", "```", env.strip(), "```\n"]
    for l in sorted({l for (_, l) in cells}):
        present = [v for v in VARIANTS if (v, l) in cells]
        out.append(f"## λ = {l} tasks/s\n")
        out.append("| metric | " + " | ".join(present) + " |")
        out.append("|---|" + "---|" * len(present))
        out.append("| OK runs | " + " | ".join(f"{len(ok(v, l))}/{len(cells[(v, l)])}" for v in present) + " |")
        for k, u, label in cols:
            row = []
            for v in present:
                vals = [r["m"][k] for r in ok(v, l) if r["m"][k] is not None]
                row.append(f"{fmt(statistics.median(vals), u)} [{fmt(min(vals), u)}–{fmt(max(vals), u)}]" if vals else "n/a")
            out.append(f"| {label} | " + " | ".join(row) + " |")
        out.append("")
    open(os.path.join(OUT, "summary.md"), "w").write("\n".join(out) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
