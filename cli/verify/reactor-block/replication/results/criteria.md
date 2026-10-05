# Criteria — reactor-block replication (replication/PREREGISTRATION.md)

Medians over repetitions unless "every run". Clock rule: each criterion on one process's clock (generator window by target time; app window [F + 10 s, F + 70 s) on its nanoTime; downstream whole run).

## Runs

- 45 runs; OK: 45; not OK: none.
- Runs not served by Netty: none. Runs without an app first-main arrival (F): none.
- Clock preflight (informational): clock_preflight seconds=60 steps=2 wall_minus_monotonic_ms=-2267.

## (0) Precondition

- **(0)** ✅ met — CLI reports reactor-block on A1 and A3, nothing in B. flagged files: VariantA1Controller.java, VariantA2Controller.java, VariantA3Controller.java, VariantCController.java

## A1 — H2 (fails fast with IllegalStateException), every λ

- **d1 A1 λ=10** ✅ met — ≥ 99 % of window main requests are HTTP 500 classified ISE_LOOP (generator only). median 100.0 %; per rep ['100.0 %', '100.0 %', '100.0 %', '100.0 %', '100.0 %']
- **d2 A1 λ=10** ✅ met — < 5 % of event-loop samples in the app window are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.2 %', '0.0 %', '0.0 %']
- **d3 A1 λ=10** ✅ met — keep-alive /ping p99 ≤ 50 ms. median 2 ms (fresh /ping p99, reported: 4 ms)
- **d1 A1 λ=50** ✅ met — ≥ 99 % of window main requests are HTTP 500 classified ISE_LOOP (generator only). median 100.0 %; per rep ['100.0 %', '100.0 %', '100.0 %', '100.0 %', '100.0 %']
- **d2 A1 λ=50** ✅ met — < 5 % of event-loop samples in the app window are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.0 %', '0.0 %', '0.0 %']
- **d3 A1 λ=50** ✅ met — keep-alive /ping p99 ≤ 50 ms. median 2 ms (fresh /ping p99, reported: 3 ms)
- **d1 A1 λ=400** ✅ met — ≥ 99 % of window main requests are HTTP 500 classified ISE_LOOP (generator only). median 100.0 %; per rep ['100.0 %', '100.0 %', '100.0 %', '100.0 %', '100.0 %']
- **d2 A1 λ=400** ✅ met — < 5 % of event-loop samples in the app window are BLOCKING_GET. median 0.0 %; per rep ['0.0 %', '0.0 %', '0.2 %', '0.6 %', '0.0 %']
- **d3 A1 λ=400** ✅ met — keep-alive /ping p99 ≤ 50 ms. median 1 ms (fresh /ping p99, reported: 2 ms)

## A3 — H3 (request deadlock without total retention; fresh-connection probe decides)

- **H3a** ✅ met — every run, every λ: 0 main OK over the whole run and ≥ 99 % TIMEOUT or CONNECT_TIMEOUT (generator). A3-l10-r1: OK 0, timeouts 100.0 %; A3-l10-r2: OK 0, timeouts 100.0 %; A3-l10-r3: OK 0, timeouts 100.0 %; A3-l10-r4: OK 0, timeouts 100.0 %; A3-l10-r5: OK 0, timeouts 100.0 %; A3-l50-r1: OK 0, timeouts 100.0 %; A3-l50-r2: OK 0, timeouts 100.0 %; A3-l50-r3: OK 0, timeouts 100.0 %; A3-l50-r4: OK 0, timeouts 100.0 %; A3-l50-r5: OK 0, timeouts 100.0 %; A3-l400-r1: OK 0, timeouts 100.0 %; A3-l400-r2: OK 0, timeouts 100.0 %; A3-l400-r3: OK 0, timeouts 100.0 %; A3-l400-r4: OK 0, timeouts 100.0 %; A3-l400-r5: OK 0, timeouts 100.0 %
- **H3b** ✅ met — every run: the downstream receives 0 /slow requests over the whole run (downstream). A3-l10-r1: 0; A3-l10-r2: 0; A3-l10-r3: 0; A3-l10-r4: 0; A3-l10-r5: 0; A3-l50-r1: 0; A3-l50-r2: 0; A3-l50-r3: 0; A3-l50-r4: 0; A3-l50-r5: 0; A3-l400-r1: 0; A3-l400-r2: 0; A3-l400-r3: 0; A3-l400-r4: 0; A3-l400-r5: 0
- **H3c** ✅ met — ≥ 3 of the 15 runs with ≤ 3 of 4 loops in FUTURE_GET in every app-window sample, both fresh probes ≥ 99 % OK and p99 ≤ 50 ms, and 0 main OK. qualifying runs: 3 (A3-l10-r2, A3-l10-r3, A3-l10-r4)

A3 per run (reported, not deciding): held loops min–max | keep-alive /ping OK, p99 | fresh /ping OK, p99 | fresh /ping-parallel OK, p99 | request / connect timeouts
- A3-l10-r1: 4–4 | 0.0 %, 11125 ms | 0.0 %, 11128 ms | 0.0 %, 11127 ms | 700 / 0
- A3-l10-r2: 2–2 | 100.0 %, 5 ms | 100.0 %, 9 ms | 100.0 %, 8 ms | 700 / 0
- A3-l10-r3: 2–2 | 100.0 %, 3 ms | 100.0 %, 5 ms | 100.0 %, 6 ms | 700 / 0
- A3-l10-r4: 2–2 | 100.0 %, 3 ms | 100.0 %, 8 ms | 100.0 %, 5 ms | 700 / 0
- A3-l10-r5: 4–4 | 0.0 %, 10885 ms | 0.0 %, 10887 ms | 0.0 %, 10887 ms | 700 / 0
- A3-l50-r1: 3–3 | 100.0 %, 4 ms | 0.0 %, 10698 ms | 0.0 %, 10699 ms | 3418 / 82
- A3-l50-r2: 4–4 | 0.0 %, 10689 ms | 0.0 %, 10691 ms | 0.0 %, 10691 ms | 2932 / 568
- A3-l50-r3: 3–3 | 100.0 %, 4 ms | 0.0 %, 10806 ms | 0.0 %, 10806 ms | 3418 / 82
- A3-l50-r4: 4–4 | 0.0 %, 10889 ms | 0.0 %, 10890 ms | 0.0 %, 10890 ms | 2932 / 568
- A3-l50-r5: 4–4 | 0.0 %, 10963 ms | 0.0 %, 10966 ms | 0.0 %, 10966 ms | 2932 / 568
- A3-l400-r1: 4–4 | 0.0 %, 10784 ms | 0.0 %, 10784 ms | 0.0 %, 10786 ms | 3938 / 24062
- A3-l400-r2: 4–4 | 0.0 %, 10693 ms | 0.0 %, 10695 ms | 0.0 %, 10695 ms | 3934 / 24066
- A3-l400-r3: 4–4 | 0.0 %, 10831 ms | 0.0 %, 10833 ms | 0.0 %, 10833 ms | 3934 / 24066
- A3-l400-r4: 4–4 | 0.0 %, 10932 ms | 0.0 %, 10934 ms | 0.0 %, 10934 ms | 3933 / 24067
- A3-l400-r5: 4–4 | 0.0 %, 10928 ms | 0.0 %, 10930 ms | 0.0 %, 10930 ms | 3941 / 24059

A3, first experiment's (a) and (b) on the clock rule (reported, not deciding):
- λ=50: loop FUTURE_GET share median 100.0 %; keep-alive /ping p50 10000 ms, errors 100.0 %; fresh /ping p50 10001 ms, errors 100.0 %
- λ=400: loop FUTURE_GET share median 100.0 %; keep-alive /ping p50 10000 ms, errors 100.0 %; fresh /ping p50 10001 ms, errors 100.0 %

## (e)-B control, every λ

- **(e)-B λ=10** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both keep-alive probes p99 ≤ 50 ms. OK 100.0 %, p99 208 ms, OK/s 10.00, probes p99 2 ms / 3 ms
- **(e)-B λ=50** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both keep-alive probes p99 ≤ 50 ms. OK 100.0 %, p99 205 ms, OK/s 50.00, probes p99 2 ms / 2 ms
- **(e)-B λ=400** ✅ met — ≥ 99 % OK, p99 ≤ 400 ms, OK/s = λ ± 10 %, both keep-alive probes p99 ≤ 50 ms. OK 100.0 %, p99 202 ms, OK/s 400.00, probes p99 1 ms / 1 ms

## (f) No other cause, every variant and λ

- **f1 A1 λ=10** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 0.5 %, GC 0.0 %
- **f2 A1 λ=10** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 206 ms, requests 700
- **f3 A1 λ=10** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 A1 λ=10** ✅ met — every event loop < 50 % of one CPU (app window). max 1.2 %
- **f1 A1 λ=50** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 1.0 %, GC 0.0 %
- **f2 A1 λ=50** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 203 ms, requests 3500
- **f3 A1 λ=50** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 A1 λ=50** ✅ met — every event loop < 50 % of one CPU (app window). max 1.9 %
- **f1 A1 λ=400** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 1.4 %, GC 0.1 %
- **f2 A1 λ=400** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 201 ms, requests 28000
- **f3 A1 λ=400** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 A1 λ=400** ✅ met — every event loop < 50 % of one CPU (app window). max 4.5 %
- **f1 A3 λ=10** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 0.3 %, GC 0.0 %
- **f2 A3 λ=10** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 n/a, requests 0 (vacuous: none received)
- **f3 A3 λ=10** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 A3 λ=10** ✅ met — every event loop < 50 % of one CPU (app window). max 1.3 %
- **f1 A3 λ=50** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 0.0 %, GC 0.0 %
- **f2 A3 λ=50** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 n/a, requests 0 (vacuous: none received)
- **f3 A3 λ=50** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 A3 λ=50** ✅ met — every event loop < 50 % of one CPU (app window). max 0.0 %
- **f1 A3 λ=400** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 0.0 %, GC 0.0 %
- **f2 A3 λ=400** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 n/a, requests 0 (vacuous: none received)
- **f3 A3 λ=400** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 A3 λ=400** ✅ met — every event loop < 50 % of one CPU (app window). max 0.0 %
- **f1 B λ=10** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 0.5 %, GC 0.0 %
- **f2 B λ=10** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 207 ms, requests 700
- **f3 B λ=10** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 B λ=10** ✅ met — every event loop < 50 % of one CPU (app window). max 1.1 %
- **f1 B λ=50** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 0.9 %, GC 0.0 %
- **f2 B λ=50** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 203 ms, requests 3500
- **f3 B λ=50** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 B λ=50** ✅ met — every event loop < 50 % of one CPU (app window). max 1.8 %
- **f1 B λ=400** ✅ met — app CPU < 50 % and GC < 1 % (app window). CPU 1.3 %, GC 0.0 %
- **f2 B λ=400** ✅ met — downstream p99 ≤ 250 ms (whole run). p99 202 ms, requests 27999
- **f3 B λ=400** ✅ met — ≤ 1 % of window requests sent > 100 ms late (generator). 0.0 %
- **f4 B λ=400** ✅ met — every event loop < 50 % of one CPU (app window). max 4.1 %

## Verdicts and outcome rules

- **A1:** H2 confirmed (predicted H2).
- **A3:** H3 confirmed.
- 1. Extend the #21 correction to the event loop: APPLIES.
- 2. Measured evidence for .toFuture().get(): APPLIES.
- (0) met; (e)-B met; (f) A1 met, A3 met, B met.
