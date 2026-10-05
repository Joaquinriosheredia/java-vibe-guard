# Criteria — async-returns-pending-future (B0) (PREREGISTRATION.md)

Medians over 5 repetitions unless "every repetition". All times System.nanoTime() in one JVM.

## Runs

- 125 runs; OK 125; not OK: none.
- Clock preflight (informational): clock_preflight seconds=60 steps=1 wall_minus_monotonic_ms=-539.

## (0) Precondition (informational)

- CLI 2.2.0 `--rule blocking` on PendingTasks.java: no finding.
- CLI 2.2.0 `--rule reactor-block` on PendingTasks.java: no finding.

## (a) Saturation, P

- **(a) P λ=60** ✅ met — in-flight = 8 in ≥ 90 % of samples; queue slope 16–24/s; queue wait ≥ 80 % of latency; median execution 180–220 ms. in-flight=8 100.0 %, slope 20.05/s, queue wait 98.0 %, execution p50 200 ms
- **(a) P λ=120** ✅ met — in-flight = 8 in ≥ 90 % of samples; queue slope 64–96/s; queue wait ≥ 80 % of latency; median execution 180–220 ms. in-flight=8 100.0 %, slope 80.08/s, queue wait 99.1 %, execution p50 200 ms

## (b) Threads in the interceptor's get(), P

- **(b) P λ=60** ✅ met — ≥ 90 % of executor-thread samples INTERCEPTOR_GET. median 100.0 %
- **(b) P λ=120** ✅ met — ≥ 90 % of executor-thread samples INTERCEPTOR_GET. median 100.0 %

## (c) Controls do not queue

- **(c) K λ=60** ✅ met — median queue ≤ 8; p99 ≤ 300 ms; < 5 % INTERCEPTOR_GET; P p50 ≥ 5× K p50; P and K p50 ranges do not overlap. K queue 0.00, K p99 201 ms, K get 0.0 %, P p50 10227 ms vs K p50 200 ms, P range 10215 ms–10252 ms, K range 200 ms–200 ms
- **(c) N λ=60** ✅ met — p99 ≤ 300 ms; completions/s = λ ± 10 %; 0 tasks on the @Async executor (every repetition). p99 200 ms, completions/s 59.80, executor tasks per rep [0, 0, 0, 0, 0]
- **(c) K λ=120** ✅ met — median queue ≤ 8; p99 ≤ 300 ms; < 5 % INTERCEPTOR_GET; P p50 ≥ 5× K p50; P and K p50 ranges do not overlap. K queue 0.00, K p99 200 ms, K get 0.0 %, P p50 23472 ms vs K p50 200 ms, P range 23417 ms–23481 ms, K range 200 ms–200 ms
- **(c) N λ=120** ✅ met — p99 ≤ 300 ms; completions/s = λ ± 10 %; 0 tasks on the @Async executor (every repetition). p99 200 ms, completions/s 119.63, executor tasks per rep [0, 0, 0, 0, 0]

## (d) Dose–response

- **(d) P λ=20** ✅ met — queue slope within ±2 tasks/s. slope -0.00/s
- **(d) P λ=36** ✅ met — queue slope within ±2 tasks/s. slope -0.00/s
- **(d) P λ=60** ✅ met — completions/s within 34–46. 39.73/s
- **(d) P λ=120** ✅ met — completions/s within 34–46. 39.73/s
- **(d) P16 λ=120** ✅ met — completions/s within 68–92. 79.47/s
- **(d) P16 λ=60** ✅ met — queue slope within ±2 tasks/s. slope 0.00/s

## (e) No other bottleneck

- **(e) P λ=60** ✅ met — mean process CPU < 50 % and GC < 1 %. CPU 0.1 %, GC 0.0 %
- **(e) P λ=120** ✅ met — mean process CPU < 50 % and GC < 1 %. CPU 0.1 %, GC 0.0 %
- **(e) K λ=120** ✅ met — completions/s = λ ± 10 % (108–132). 119.60/s

## (f) Virtual threads (scope of severity only)

- **(f) V λ=120** ✅ met — queue slope within ±2 tasks/s and p99 ≤ 400 ms. slope -0.00/s, p99 200 ms

## (g) HN — PN: saturation or starvation deadlock

Per run, last 10 s of the window: deadlock = 0 outer completions, ≥ 90 % of executor samples INTERCEPTOR_GET labelled OUTER, inner tasks pending ≥ 1 in every sample.

- PN λ=10: deadlocked reps 0/5; per rep (completions last 10 s / OUTER get share / min inner pending / last completion at / unfinished after drain): 99 / 27.5 % / 0 / 29.9 s / 0; 99 / 26.9 % / 0 / 29.9 s / 0; 99 / 26.2 % / 0 / 29.9 s / 0; 99 / 31.9 % / 0 / 29.9 s / 0; 99 / 34.4 % / 0 / 29.9 s / 0; completions/s median 9.97
- PN λ=20: deadlocked reps 5/5; per rep (completions last 10 s / OUTER get share / min inner pending / last completion at / unfinished after drain): 0 / 100.0 % / 8 / 16.2 s / 284; 0 / 100.0 % / 8 / 13.9 s / 331; 0 / 100.0 % / 8 / 9.1 s / 427; 0 / 100.0 % / 8 / 18.0 s / 249; 0 / 100.0 % / 8 / 17.3 s / 263; completions/s median 10.67
- PN λ=36: deadlocked reps 5/5; per rep (completions last 10 s / OUTER get share / min inner pending / last completion at / unfinished after drain): 0 / 100.0 % / 8 / 0.0 s / 1080; 0 / 100.0 % / 8 / 0.0 s / 1080; 0 / 100.0 % / 8 / 0.0 s / 1080; 0 / 100.0 % / 8 / 0.0 s / 1080; 0 / 100.0 % / 8 / 0.0 s / 1080; completions/s median 0.00
- PN λ=60: deadlocked reps 5/5; per rep (completions last 10 s / OUTER get share / min inner pending / last completion at / unfinished after drain): 0 / 100.0 % / 8 / 0.0 s / 1800; 0 / 100.0 % / 8 / 0.0 s / 1800; 0 / 100.0 % / 8 / 0.0 s / 1800; 0 / 100.0 % / 8 / 0.0 s / 1800; 0 / 100.0 % / 8 / 0.0 s / 1800; completions/s median 0.00
- PN λ=120: deadlocked reps 5/5; per rep (completions last 10 s / OUTER get share / min inner pending / last completion at / unfinished after drain): 0 / 100.0 % / 8 / 0.0 s / 3600; 0 / 100.0 % / 8 / 0.0 s / 3600; 0 / 100.0 % / 8 / 0.0 s / 3600; 0 / 100.0 % / 8 / 0.0 s / 3600; 0 / 100.0 % / 8 / 0.0 s / 3600; completions/s median 0.00
- **(g) HN deadlock** ✅ met — every repetition at λ = 60 and 120 is a deadlock. 
- **(g) HN below threshold** ✅ met — at λ = 10 no repetition is a deadlock and completions/s = 10 ± 10 %. completions/s 9.97

## Verdicts

- **H (pending future holds the @Async thread):** CONFIRMED.
- **(f) virtual threads:** met — a future rule would follow blocking’s WARNING criterion with virtual threads.
- **HN (nested form):** CONFIRMED (starvation deadlock). Independent of H.
- **Next step:** propose the precision-first detection design (shapes reported / not reported, fixtures) to Joaquín.
