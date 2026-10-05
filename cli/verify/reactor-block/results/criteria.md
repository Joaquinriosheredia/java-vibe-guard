# Criteria — reactor-block (PREREGISTRATION.md)

Medians over repetitions unless "every repetition". Thresholds copied verbatim from the pre-registration. Probes: the pre-registered keep-alive probes (deciding).

## Runs

- 90 runs; status OK: 90; not OK: none.
- App needed SIGKILL: A3-l10-r1, A3-l50-r1, A3-l400-r1, A3-l10-r2, A3-l50-r2, A3-l400-r2, A3-l10-r3, A3-l50-r3, A3-l400-r3, A3-l10-r4, A3-l50-r4, A3-l400-r4, A3-l10-r5, A3-l50-r5, A3-l400-r5.
- App not answering /ping after the run: A3-l10-r1, A3-l50-r1, A3-l400-r1, A3-l10-r2, A3-l50-r2, A3-l400-r2, A3-l10-r3, A3-l50-r3, A3-l400-r3, A3-l10-r4, A3-l50-r4, A3-l400-r4, A3-l10-r5, A3-l50-r5, A3-l400-r5.
- Stack check (deviation 1), runs served by the wrong server: none.

## (0) Precondition

- **(0)** ✅ met — CLI flags A1, A2, A3, A4 and C, and nothing else (not B, probes, downstream). flagged files: VariantA1Controller.java, VariantA2Controller.java, VariantA3Controller.java, VariantA4Controller.java, VariantCController.java

## A1: P = loop, call = BLOCKING_GET, Q = /ping

- **(a) A1 λ=50** ❌ not met — ≥ 90 % of loop samples are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.0 %', '0.0 %', '0.0 %']
- **(a) A1 λ=400** ❌ not met — ≥ 90 % of loop samples are BLOCKING_GET. median 0.2 %; per rep ['0.0 %', '0.2 %', '0.4 %', '0.0 %', '0.2 %']
- **(b) A1 λ=50** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 1 ms, Q errors 0.0 %; B Q p99 2 ms
- **(b) A1 λ=400** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 1 ms, Q errors 0.0 %; B Q p99 1 ms
- **(d1) A1 λ=10** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 97.0 %
- **(d2) A1 λ=10** ✅ met — < 5 % of loop samples are BLOCKING_GET. median 0.0 %
- **(d3) A1 λ=10** ✅ met — Q p99 ≤ 50 ms. median 3 ms
- **(d1) A1 λ=50** ✅ met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A1 λ=50** ✅ met — < 5 % of loop samples are BLOCKING_GET. median 0.0 %
- **(d3) A1 λ=50** ✅ met — Q p99 ≤ 50 ms. median 2 ms
- **(d1) A1 λ=400** ✅ met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A1 λ=400** ✅ met — < 5 % of loop samples are BLOCKING_GET. median 0.2 %
- **(d3) A1 λ=400** ✅ met — Q p99 ≤ 50 ms. median 1 ms

## A2: P = parallel, call = BLOCKING_GET, Q = /ping-parallel

- **(a) A2 λ=50** ❌ not met — ≥ 90 % of parallel samples are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.0 %', '0.0 %', '0.0 %']
- **(a) A2 λ=400** ❌ not met — ≥ 90 % of parallel samples are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.9 %', '0.0 %', '0.0 %']
- **(b) A2 λ=50** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 1 ms, Q errors 0.0 %; B Q p99 2 ms
- **(b) A2 λ=400** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 1 ms, Q errors 0.0 %; B Q p99 1 ms
- **(d1) A2 λ=10** ✅ met — ≥ 99 % HTTP 500 and ISE naming a parallel thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A2 λ=10** ✅ met — < 5 % of parallel samples are BLOCKING_GET. median 0.0 %
- **(d3) A2 λ=10** ✅ met — Q p99 ≤ 50 ms. median 3 ms
- **(d1) A2 λ=50** ✅ met — ≥ 99 % HTTP 500 and ISE naming a parallel thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A2 λ=50** ✅ met — < 5 % of parallel samples are BLOCKING_GET. median 0.0 %
- **(d3) A2 λ=50** ✅ met — Q p99 ≤ 50 ms. median 2 ms
- **(d1) A2 λ=400** ✅ met — ≥ 99 % HTTP 500 and ISE naming a parallel thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A2 λ=400** ✅ met — < 5 % of parallel samples are BLOCKING_GET. median 0.0 %
- **(d3) A2 λ=400** ✅ met — Q p99 ≤ 50 ms. median 1 ms

## A3: P = loop, call = FUTURE_GET, Q = /ping

- **(a) A3 λ=50** ❌ not met — ≥ 90 % of loop samples are FUTURE_GET. median 75.0 %; per rep ['75.0 %', '100.0 %', '75.0 %', '100.0 %', '75.0 %']
- **(a) A3 λ=400** ✅ met — ≥ 90 % of loop samples are FUTURE_GET. median 100.0 %; per rep ['100.0 %', '100.0 %', '100.0 %', '100.0 %', '100.0 %']
- **(b) A3 λ=50** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 2 ms, Q errors 0.0 %; B Q p99 2 ms
- **(b) A3 λ=400** ✅ met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 10000 ms, Q errors 100.0 %; B Q p99 1 ms
- **(d1) A3 λ=10** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 0.0 %, ISE/requests 0.0 %
- **(d2) A3 λ=10** ❌ not met — < 5 % of loop samples are FUTURE_GET. median 50.0 %
- **(d3) A3 λ=10** ✅ met — Q p99 ≤ 50 ms. median 3 ms
- **(d1) A3 λ=50** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 0.0 %, ISE/requests 0.0 %
- **(d2) A3 λ=50** ❌ not met — < 5 % of loop samples are FUTURE_GET. median 75.0 %
- **(d3) A3 λ=50** ✅ met — Q p99 ≤ 50 ms. median 5 ms
- **(d1) A3 λ=400** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 0.0 %, ISE/requests 0.0 %
- **(d2) A3 λ=400** ❌ not met — < 5 % of loop samples are FUTURE_GET. median 100.0 %
- **(d3) A3 λ=400** ❌ not met — Q p99 ≤ 50 ms. median 11799 ms

## (c) A3 capacity or deadlock

- **(c) A3 λ=50** ✅ met — main OK responses ≤ 23/s. median 0.00/s
- **(c) A3 λ=400** ✅ met — main OK responses ≤ 23/s. median 0.00/s
- **A3 class:** deadlock. Per rep, OK in window / timeout share: λ=10: 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %; λ=50: 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %; λ=400: 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %

## (e) Controls

- **(e) B λ=10** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both probes p99 ≤ 50 ms. OK 100.0 %, p99 210 ms, OK/s 10.00, probes p99 2 ms / 2 ms
- **(e) B λ=50** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both probes p99 ≤ 50 ms. OK 100.0 %, p99 206 ms, OK/s 50.00, probes p99 2 ms / 2 ms
- **(e) B λ=400** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both probes p99 ≤ 50 ms. OK 100.0 %, p99 203 ms, OK/s 400.00, probes p99 1 ms / 1 ms
- **(e) A4 Reactor λ=10** ✅ met — both probes p99 ≤ 50 ms; < 5 % of event-loop and parallel samples BLOCKING_GET; ≥ 99 % OK. probes p99 2 ms / 2 ms, loop BG 0.0 %, parallel BG 0.0 %, OK 100.0 %
- **(e) A4 Reactor λ=50** ✅ met — both probes p99 ≤ 50 ms; < 5 % of event-loop and parallel samples BLOCKING_GET; ≥ 99 % OK. probes p99 2 ms / 2 ms, loop BG 0.0 %, parallel BG 0.0 %, OK 100.0 %
- **(e) A4 Reactor λ=400** ✅ met — both probes p99 ≤ 50 ms; < 5 % of event-loop and parallel samples BLOCKING_GET. probes p99 1 ms / 1 ms, loop BG 0.0 %, parallel BG 0.0 %, OK 5.8 %
- **(e) C λ=10** ✅ met — 0 Reactor-thread samples in BLOCKING_GET / FUTURE_GET, both probes p99 ≤ 50 ms, ≥ 99 % OK. Reactor-thread blocked samples 0, probes p99 3 ms / 3 ms, OK 100.0 %, tomcat BG 19.8 %
- **(e) C λ=50** ✅ met — 0 Reactor-thread samples in BLOCKING_GET / FUTURE_GET, both probes p99 ≤ 50 ms, ≥ 99 % OK. Reactor-thread blocked samples 0, probes p99 2 ms / 3 ms, OK 100.0 %, tomcat BG 40.6 %
- **(e) C λ=400** ✅ met — 0 Reactor-thread samples in BLOCKING_GET / FUTURE_GET, both probes p99 ≤ 50 ms, ≥ 99 % OK. Reactor-thread blocked samples 0, probes p99 1 ms / 1 ms, OK 100.0 %, tomcat BG 39.5 %

## (S) A4 saturation of boundedElastic (separate from the Reactor criterion)

- **S1 A4 λ=400** ✅ met — ≥ 90 % of boundedElastic samples BLOCKING_GET. median 99.9 %
- **S2 A4 λ=400** ✅ met — main OK ≤ 230/s (capacity 40 / 0.2 s = 200/s + 15 %). median 54.12/s
- A4 λ=10: OK 100.0 %, OK/s 10.00, timeouts 0.0 %, boundedElastic BLOCKING_GET 48.3 %
- A4 λ=50: OK 100.0 %, OK/s 50.00, timeouts 0.0 %, boundedElastic BLOCKING_GET 43.6 %
- A4 λ=400: OK 5.8 %, OK/s 54.12, timeouts 94.2 %, boundedElastic BLOCKING_GET 99.9 %

## (f) No other cause

- **(f1) A1 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) A1 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 206 ms, downstream requests in window 582
- **(f3) A1 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A1 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.2 %
- **(f1) A1 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.1 %, GC 0.0 %
- **(f2) A1 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 203 ms, downstream requests in window 3000
- **(f3) A1 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A1 λ=50** ✅ met — every event loop < 50 % of one CPU. max 2.3 %
- **(f1) A1 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.5 %, GC 0.1 %
- **(f2) A1 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 23998
- **(f3) A1 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A1 λ=400** ✅ met — every event loop < 50 % of one CPU. max 4.6 %
- **(f1) A2 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.6 %, GC 0.0 %
- **(f2) A2 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 206 ms, downstream requests in window 600
- **(f3) A2 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A2 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.1 %
- **(f1) A2 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.1 %, GC 0.0 %
- **(f2) A2 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 203 ms, downstream requests in window 3000
- **(f3) A2 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A2 λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.4 %
- **(f1) A2 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.8 %, GC 0.1 %
- **(f2) A2 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 24000
- **(f3) A2 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A2 λ=400** ✅ met — every event loop < 50 % of one CPU. max 3.7 %
- **(f1) A3 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.3 %, GC 0.0 %
- **(f2) A3 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 n/a, downstream requests in window 0 (vacuous: none received)
- **(f3) A3 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A3 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.3 %
- **(f1) A3 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.2 %, GC 0.0 %
- **(f2) A3 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 n/a, downstream requests in window 0 (vacuous: none received)
- **(f3) A3 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A3 λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.1 %
- **(f1) A3 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.0 %, GC 0.0 %
- **(f2) A3 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 n/a, downstream requests in window 0 (vacuous: none received)
- **(f3) A3 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A3 λ=400** ✅ met — every event loop < 50 % of one CPU. max 0.0 %
- **(f1) A4 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) A4 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 208 ms, downstream requests in window 582
- **(f3) A4 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A4 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.1 %
- **(f1) A4 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.1 %, GC 0.0 %
- **(f2) A4 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 204 ms, downstream requests in window 3000
- **(f3) A4 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A4 λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.6 %
- **(f1) A4 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 2.5 %, GC 0.1 %
- **(f2) A4 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 3209
- **(f3) A4 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A4 λ=400** ✅ met — every event loop < 50 % of one CPU. max 6.4 %
- **(f1) B λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) B λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 206 ms, downstream requests in window 600
- **(f3) B λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) B λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.0 %
- **(f1) B λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.9 %, GC 0.0 %
- **(f2) B λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 204 ms, downstream requests in window 3000
- **(f3) B λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) B λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.8 %
- **(f1) B λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.3 %, GC 0.0 %
- **(f2) B λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 24000
- **(f3) B λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) B λ=400** ✅ met — every event loop < 50 % of one CPU. max 4.0 %
- **(f1) C λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) C λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 207 ms, downstream requests in window 582
- **(f3) C λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) C λ=10** ✅ met — every event loop < 50 % of one CPU. max 0.4 %
- **(f1) C λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.3 %, GC 0.0 %
- **(f2) C λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 203 ms, downstream requests in window 3000
- **(f3) C λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) C λ=50** ✅ met — every event loop < 50 % of one CPU. max 0.6 %
- **(f1) C λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.9 %, GC 0.1 %
- **(f2) C λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 201 ms, downstream requests in window 24000
- **(f3) C λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) C λ=400** ✅ met — every event loop < 50 % of one CPU. max 1.6 %

## Verdicts

- **A1:** fits neither — other. Predicted: H2.
- **A2:** H2 confirmed (fails fast with IllegalStateException). Predicted: H2.
- **A3:** fits neither — partial retention. Predicted: H1.
- **A3 class (c):** deadlock.
- **A4 Reactor criterion** (e): met; saturation S1 met, S2 met.
- **C** (e): met.

## Outcome rules (PREREGISTRATION.md, Outcome → consequences)

- 5. A1: fits neither — other → stays documented mechanism; results published.
- 1. H2 for A2: correction of the mechanism text for that context APPLIES.
- 2. A3 measured evidence for .toFuture().get() (deadlock): does NOT apply.
- 3. Precision proposal (A4 boundedElastic, C MVC-only): APPLIES (A4 Reactor criterion and its (f) met; C and its (f) met).
- (f) met for every cell: yes.

---

# Deviation 2 — every criterion re-read on the fresh-connection probes (reported, NOT deciding)

Same thresholds; only the probe changes: a new HttpClient, hence a new TCP connection, per probe request. Added after smoke run 2 (DEVIATIONS.md, 2). The pre-registered keep-alive evaluation above decides.

## Runs

- 90 runs; status OK: 90; not OK: none.
- App needed SIGKILL: A3-l10-r1, A3-l50-r1, A3-l400-r1, A3-l10-r2, A3-l50-r2, A3-l400-r2, A3-l10-r3, A3-l50-r3, A3-l400-r3, A3-l10-r4, A3-l50-r4, A3-l400-r4, A3-l10-r5, A3-l50-r5, A3-l400-r5.
- App not answering /ping after the run: A3-l10-r1, A3-l50-r1, A3-l400-r1, A3-l10-r2, A3-l50-r2, A3-l400-r2, A3-l10-r3, A3-l50-r3, A3-l400-r3, A3-l10-r4, A3-l50-r4, A3-l400-r4, A3-l10-r5, A3-l50-r5, A3-l400-r5.
- Stack check (deviation 1), runs served by the wrong server: none.

## (0) Precondition

- **(0)** ✅ met — CLI flags A1, A2, A3, A4 and C, and nothing else (not B, probes, downstream). flagged files: VariantA1Controller.java, VariantA2Controller.java, VariantA3Controller.java, VariantA4Controller.java, VariantCController.java

## A1: P = loop, call = BLOCKING_GET, Q = /ping

- **(a) A1 λ=50** ❌ not met — ≥ 90 % of loop samples are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.0 %', '0.0 %', '0.0 %']
- **(a) A1 λ=400** ❌ not met — ≥ 90 % of loop samples are BLOCKING_GET. median 0.2 %; per rep ['0.0 %', '0.2 %', '0.4 %', '0.0 %', '0.2 %']
- **(b) A1 λ=50** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 2 ms, Q errors 0.0 %; B Q p99 3 ms
- **(b) A1 λ=400** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 1 ms, Q errors 0.0 %; B Q p99 2 ms
- **(d1) A1 λ=10** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 97.0 %
- **(d2) A1 λ=10** ✅ met — < 5 % of loop samples are BLOCKING_GET. median 0.0 %
- **(d3) A1 λ=10** ✅ met — Q p99 ≤ 50 ms. median 5 ms
- **(d1) A1 λ=50** ✅ met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A1 λ=50** ✅ met — < 5 % of loop samples are BLOCKING_GET. median 0.0 %
- **(d3) A1 λ=50** ✅ met — Q p99 ≤ 50 ms. median 3 ms
- **(d1) A1 λ=400** ✅ met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A1 λ=400** ✅ met — < 5 % of loop samples are BLOCKING_GET. median 0.2 %
- **(d3) A1 λ=400** ✅ met — Q p99 ≤ 50 ms. median 3 ms

## A2: P = parallel, call = BLOCKING_GET, Q = /ping-parallel

- **(a) A2 λ=50** ❌ not met — ≥ 90 % of parallel samples are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.0 %', '0.0 %', '0.0 %']
- **(a) A2 λ=400** ❌ not met — ≥ 90 % of parallel samples are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.9 %', '0.0 %', '0.0 %']
- **(b) A2 λ=50** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 2 ms, Q errors 0.0 %; B Q p99 3 ms
- **(b) A2 λ=400** ❌ not met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 1 ms, Q errors 0.0 %; B Q p99 2 ms
- **(d1) A2 λ=10** ✅ met — ≥ 99 % HTTP 500 and ISE naming a parallel thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A2 λ=10** ✅ met — < 5 % of parallel samples are BLOCKING_GET. median 0.0 %
- **(d3) A2 λ=10** ✅ met — Q p99 ≤ 50 ms. median 4 ms
- **(d1) A2 λ=50** ✅ met — ≥ 99 % HTTP 500 and ISE naming a parallel thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A2 λ=50** ✅ met — < 5 % of parallel samples are BLOCKING_GET. median 0.0 %
- **(d3) A2 λ=50** ✅ met — Q p99 ≤ 50 ms. median 3 ms
- **(d1) A2 λ=400** ✅ met — ≥ 99 % HTTP 500 and ISE naming a parallel thread ≥ 99 % of main requests. 500 100.0 %, ISE/requests 100.0 %
- **(d2) A2 λ=400** ✅ met — < 5 % of parallel samples are BLOCKING_GET. median 0.0 %
- **(d3) A2 λ=400** ✅ met — Q p99 ≤ 50 ms. median 2 ms

## A3: P = loop, call = FUTURE_GET, Q = /ping

- **(a) A3 λ=50** ❌ not met — ≥ 90 % of loop samples are FUTURE_GET. median 75.0 %; per rep ['75.0 %', '100.0 %', '75.0 %', '100.0 %', '75.0 %']
- **(a) A3 λ=400** ✅ met — ≥ 90 % of loop samples are FUTURE_GET. median 100.0 %; per rep ['100.0 %', '100.0 %', '100.0 %', '100.0 %', '100.0 %']
- **(b) A3 λ=50** ✅ met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 10002 ms, Q errors 100.0 %; B Q p99 3 ms
- **(b) A3 λ=400** ✅ met — Q p50 ≥ 1 s or ≥ 10 % errors/timeouts, and B's Q p99 ≤ 50 ms at the same λ. Q p50 10002 ms, Q errors 100.0 %; B Q p99 2 ms
- **(d1) A3 λ=10** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 0.0 %, ISE/requests 0.0 %
- **(d2) A3 λ=10** ❌ not met — < 5 % of loop samples are FUTURE_GET. median 50.0 %
- **(d3) A3 λ=10** ✅ met — Q p99 ≤ 50 ms. median 8 ms
- **(d1) A3 λ=50** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 0.0 %, ISE/requests 0.0 %
- **(d2) A3 λ=50** ❌ not met — < 5 % of loop samples are FUTURE_GET. median 75.0 %
- **(d3) A3 λ=50** ❌ not met — Q p99 ≤ 50 ms. median 11812 ms
- **(d1) A3 λ=400** ❌ not met — ≥ 99 % HTTP 500 and ISE naming a loop thread ≥ 99 % of main requests. 500 0.0 %, ISE/requests 0.0 %
- **(d2) A3 λ=400** ❌ not met — < 5 % of loop samples are FUTURE_GET. median 100.0 %
- **(d3) A3 λ=400** ❌ not met — Q p99 ≤ 50 ms. median 11800 ms

## (c) A3 capacity or deadlock

- **(c) A3 λ=50** ✅ met — main OK responses ≤ 23/s. median 0.00/s
- **(c) A3 λ=400** ✅ met — main OK responses ≤ 23/s. median 0.00/s
- **A3 class:** deadlock. Per rep, OK in window / timeout share: λ=10: 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %; λ=50: 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %; λ=400: 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %, 0/100.0 %

## (e) Controls

- **(e) B λ=10** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both probes p99 ≤ 50 ms. OK 100.0 %, p99 210 ms, OK/s 10.00, probes p99 4 ms / 4 ms
- **(e) B λ=50** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both probes p99 ≤ 50 ms. OK 100.0 %, p99 206 ms, OK/s 50.00, probes p99 3 ms / 3 ms
- **(e) B λ=400** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both probes p99 ≤ 50 ms. OK 100.0 %, p99 203 ms, OK/s 400.00, probes p99 2 ms / 2 ms
- **(e) A4 Reactor λ=10** ✅ met — both probes p99 ≤ 50 ms; < 5 % of event-loop and parallel samples BLOCKING_GET; ≥ 99 % OK. probes p99 4 ms / 4 ms, loop BG 0.0 %, parallel BG 0.0 %, OK 100.0 %
- **(e) A4 Reactor λ=50** ✅ met — both probes p99 ≤ 50 ms; < 5 % of event-loop and parallel samples BLOCKING_GET; ≥ 99 % OK. probes p99 3 ms / 4 ms, loop BG 0.0 %, parallel BG 0.0 %, OK 100.0 %
- **(e) A4 Reactor λ=400** ✅ met — both probes p99 ≤ 50 ms; < 5 % of event-loop and parallel samples BLOCKING_GET. probes p99 2 ms / 2 ms, loop BG 0.0 %, parallel BG 0.0 %, OK 5.8 %
- **(e) C λ=10** ✅ met — 0 Reactor-thread samples in BLOCKING_GET / FUTURE_GET, both probes p99 ≤ 50 ms, ≥ 99 % OK. Reactor-thread blocked samples 0, probes p99 4 ms / 4 ms, OK 100.0 %, tomcat BG 19.8 %
- **(e) C λ=50** ✅ met — 0 Reactor-thread samples in BLOCKING_GET / FUTURE_GET, both probes p99 ≤ 50 ms, ≥ 99 % OK. Reactor-thread blocked samples 0, probes p99 3 ms / 4 ms, OK 100.0 %, tomcat BG 40.6 %
- **(e) C λ=400** ✅ met — 0 Reactor-thread samples in BLOCKING_GET / FUTURE_GET, both probes p99 ≤ 50 ms, ≥ 99 % OK. Reactor-thread blocked samples 0, probes p99 3 ms / 3 ms, OK 100.0 %, tomcat BG 39.5 %

## (S) A4 saturation of boundedElastic (separate from the Reactor criterion)

- **S1 A4 λ=400** ✅ met — ≥ 90 % of boundedElastic samples BLOCKING_GET. median 99.9 %
- **S2 A4 λ=400** ✅ met — main OK ≤ 230/s (capacity 40 / 0.2 s = 200/s + 15 %). median 54.12/s
- A4 λ=10: OK 100.0 %, OK/s 10.00, timeouts 0.0 %, boundedElastic BLOCKING_GET 48.3 %
- A4 λ=50: OK 100.0 %, OK/s 50.00, timeouts 0.0 %, boundedElastic BLOCKING_GET 43.6 %
- A4 λ=400: OK 5.8 %, OK/s 54.12, timeouts 94.2 %, boundedElastic BLOCKING_GET 99.9 %

## (f) No other cause

- **(f1) A1 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) A1 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 206 ms, downstream requests in window 582
- **(f3) A1 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A1 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.2 %
- **(f1) A1 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.1 %, GC 0.0 %
- **(f2) A1 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 203 ms, downstream requests in window 3000
- **(f3) A1 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A1 λ=50** ✅ met — every event loop < 50 % of one CPU. max 2.3 %
- **(f1) A1 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.5 %, GC 0.1 %
- **(f2) A1 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 23998
- **(f3) A1 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A1 λ=400** ✅ met — every event loop < 50 % of one CPU. max 4.6 %
- **(f1) A2 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.6 %, GC 0.0 %
- **(f2) A2 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 206 ms, downstream requests in window 600
- **(f3) A2 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A2 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.1 %
- **(f1) A2 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.1 %, GC 0.0 %
- **(f2) A2 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 203 ms, downstream requests in window 3000
- **(f3) A2 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A2 λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.4 %
- **(f1) A2 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.8 %, GC 0.1 %
- **(f2) A2 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 24000
- **(f3) A2 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A2 λ=400** ✅ met — every event loop < 50 % of one CPU. max 3.7 %
- **(f1) A3 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.3 %, GC 0.0 %
- **(f2) A3 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 n/a, downstream requests in window 0 (vacuous: none received)
- **(f3) A3 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A3 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.3 %
- **(f1) A3 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.2 %, GC 0.0 %
- **(f2) A3 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 n/a, downstream requests in window 0 (vacuous: none received)
- **(f3) A3 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A3 λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.1 %
- **(f1) A3 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.0 %, GC 0.0 %
- **(f2) A3 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 n/a, downstream requests in window 0 (vacuous: none received)
- **(f3) A3 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A3 λ=400** ✅ met — every event loop < 50 % of one CPU. max 0.0 %
- **(f1) A4 λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) A4 λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 208 ms, downstream requests in window 582
- **(f3) A4 λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A4 λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.1 %
- **(f1) A4 λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.1 %, GC 0.0 %
- **(f2) A4 λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 204 ms, downstream requests in window 3000
- **(f3) A4 λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A4 λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.6 %
- **(f1) A4 λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 2.5 %, GC 0.1 %
- **(f2) A4 λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 3209
- **(f3) A4 λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) A4 λ=400** ✅ met — every event loop < 50 % of one CPU. max 6.4 %
- **(f1) B λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) B λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 206 ms, downstream requests in window 600
- **(f3) B λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) B λ=10** ✅ met — every event loop < 50 % of one CPU. max 1.0 %
- **(f1) B λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.9 %, GC 0.0 %
- **(f2) B λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 204 ms, downstream requests in window 3000
- **(f3) B λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) B λ=50** ✅ met — every event loop < 50 % of one CPU. max 1.8 %
- **(f1) B λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.3 %, GC 0.0 %
- **(f2) B λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 202 ms, downstream requests in window 24000
- **(f3) B λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) B λ=400** ✅ met — every event loop < 50 % of one CPU. max 4.0 %
- **(f1) C λ=10** ✅ met — app CPU < 50 % and GC < 1 %. CPU 0.5 %, GC 0.0 %
- **(f2) C λ=10** ✅ met — downstream p99 ≤ 250 ms. p99 207 ms, downstream requests in window 582
- **(f3) C λ=10** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) C λ=10** ✅ met — every event loop < 50 % of one CPU. max 0.4 %
- **(f1) C λ=50** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.3 %, GC 0.0 %
- **(f2) C λ=50** ✅ met — downstream p99 ≤ 250 ms. p99 203 ms, downstream requests in window 3000
- **(f3) C λ=50** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) C λ=50** ✅ met — every event loop < 50 % of one CPU. max 0.6 %
- **(f1) C λ=400** ✅ met — app CPU < 50 % and GC < 1 %. CPU 1.9 %, GC 0.1 %
- **(f2) C λ=400** ✅ met — downstream p99 ≤ 250 ms. p99 201 ms, downstream requests in window 24000
- **(f3) C λ=400** ✅ met — ≤ 1 % of requests sent > 100 ms late. 0.0 %
- **(f4) C λ=400** ✅ met — every event loop < 50 % of one CPU. max 1.6 %

## Verdicts

- **A1:** fits neither — other. Predicted: H2.
- **A2:** H2 confirmed (fails fast with IllegalStateException). Predicted: H2.
- **A3:** fits neither — partial retention. Predicted: H1.
- **A3 class (c):** deadlock.
- **A4 Reactor criterion** (e): met; saturation S1 met, S2 met.
- **C** (e): met.

## Outcome rules (PREREGISTRATION.md, Outcome → consequences)

- 5. A1: fits neither — other → stays documented mechanism; results published.
- 1. H2 for A2: correction of the mechanism text for that context APPLIES.
- 2. A3 measured evidence for .toFuture().get() (deadlock): does NOT apply.
- 3. Precision proposal (A4 boundedElastic, C MVC-only): APPLIES (A4 Reactor criterion and its (f) met; C and its (f) met).
- (f) met for every cell: yes.

---

# Deviation 4 — (d1) over the whole run, without cross-process clock alignment (reported, NOT deciding)

Added after the results (DEVIATIONS.md, 4). Same thresholds (≥ 99 %); the count covers every main request of the run (warm-up and window) instead of the window, so the app's wall clock and the generator's monotonic clock need not agree. The pre-registered (d1) above decides.

- **(d1-run) A1 λ=10** ✅ met — 500 100.0 %, ISE naming a loop thread / main requests 100.0 % (per rep 100.0 %, 100.0 %, 100.0 %, 100.0 %, 100.0 %). Clock divergence per rep (ms, wall − monotonic span): -3583.59, -3671.44, -4317.36, -3628.05, -3625.62
- **(d1-run) A1 λ=50** ✅ met — 500 100.0 %, ISE naming a loop thread / main requests 100.0 % (per rep 100.0 %, 100.0 %, 100.0 %, 100.0 %, 100.0 %). Clock divergence per rep (ms, wall − monotonic span): -3653.97, -3729.62, -3751.53, -3630.51, -3617.23
- **(d1-run) A1 λ=400** ✅ met — 500 100.0 %, ISE naming a loop thread / main requests 100.0 % (per rep 100.0 %, 100.0 %, 100.0 %, 100.0 %, 100.0 %). Clock divergence per rep (ms, wall − monotonic span): -3942.79, -3749.20, -3757.19, -3685.06, -3659.76
- A1: with (d1-run) in place of (d1), (d1) would be met at every λ.
- **(d1-run) A2 λ=10** ✅ met — 500 100.0 %, ISE naming a parallel thread / main requests 100.0 % (per rep 100.0 %, 100.0 %, 100.0 %, 100.0 %, 100.0 %). Clock divergence per rep (ms, wall − monotonic span): -5580.57, -4451.57, -3682.11, -3701.78, -3587.72
- **(d1-run) A2 λ=50** ✅ met — 500 100.0 %, ISE naming a parallel thread / main requests 100.0 % (per rep 100.0 %, 100.0 %, 100.0 %, 100.0 %, 100.0 %). Clock divergence per rep (ms, wall − monotonic span): -3636.92, -3716.07, -3784.68, -3661.13, -3668.86
- **(d1-run) A2 λ=400** ✅ met — 500 100.0 %, ISE naming a parallel thread / main requests 100.0 % (per rep 100.0 %, 100.0 %, 100.0 %, 100.0 %, 100.0 %). Clock divergence per rep (ms, wall − monotonic span): -2742.03, -4896.35, -5584.21, -3738.49, -3725.23
- A2: with (d1-run) in place of (d1), (d1) would be met at every λ.
- **(d1-run) A3 λ=10** ❌ not met — 500 0.0 %, ISE naming a loop thread / main requests 0.0 % (per rep 0.0 %, 0.0 %, 0.0 %, 0.0 %, 0.0 %). Clock divergence per rep (ms, wall − monotonic span): n/a, n/a, n/a, n/a, n/a
- **(d1-run) A3 λ=50** ❌ not met — 500 0.0 %, ISE naming a loop thread / main requests 0.0 % (per rep 0.0 %, 0.0 %, 0.0 %, 0.0 %, 0.0 %). Clock divergence per rep (ms, wall − monotonic span): n/a, n/a, n/a, n/a, n/a
- **(d1-run) A3 λ=400** ❌ not met — 500 0.0 %, ISE naming a loop thread / main requests 0.0 % (per rep 0.0 %, 0.0 %, 0.0 %, 0.0 %, 0.0 %). Clock divergence per rep (ms, wall − monotonic span): n/a, n/a, n/a, n/a, n/a
- A3: with (d1-run) in place of (d1), (d1) would be not met at every λ.
