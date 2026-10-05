# Pre-registration — `reactor-block` replication (A1: H2 without clock alignment; A3: H3)

Committed **before** any code change for it or any run (decision of Joaquín, 2026-10-05).
After this commit, the hypotheses, thresholds and outcome rules below are frozen.
Departures go to `DEVIATIONS.md` in this directory, with the original text, the new one,
what was observed and when, and both are evaluated. This file is never edited.

## Why a replication

The first experiment (`../PREREGISTRATION.md`, results at `c934bd7`, java-vibe-guard#20)
left two variants without a verdict. **Its verdicts are not rewritten:** its A1 and A3
data stay exploratory, in #20, and none of them is used to evaluate the hypotheses below.

- **A1** (`.block()` in a WebFlux handler, on the event loop): "fits neither". H2 failed
  only on (d1) at λ = 10 (97.0 % < 99 %).
  - The cause: the count compared the app's wall clock with the generator's monotonic
    clock. This host's wall clock steps back about 1.16 s every ~32 s
    (`vibe-guard/docs/AUDITORIA-RELOJ.md`).
  - Here, **the same H2 with the same thresholds** is evaluated without aligning any two
    clocks.
- **A3** (`.toFuture().get()` in a WebFlux handler): "fits neither — partial retention".
  - In 15/15 runs no request succeeded, but only 2 or 3 of the 4 event loops were held in
    7 of the 10 runs at λ = 10 and 50.
  - **H3 is new and was born from those data**: it was formulated after seeing #20.
    Its thresholds are fixed here, before any replication run.

## Setup

Identical to the first experiment unless stated:
- same app, downstream and load generator;
- same versions: Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18 (native
  epoll), Netty 4.1.109.Final, OpenJDK 21.0.12.1, Ubuntu 24.04.4 on WSL2, 16 CPUs;
- same pools: 4 event loops, 4 `parallel` workers, WebClient pool of 500;
- same downstream L = 200 ms;
- same timing: open-model generator, 10 s client timeout, keep-alive and
  fresh-connection probes at 5/s each, 10 s warm-up + 60 s window;
- same harness timeout (150 s per run) and run statuses.

- **Variants:** A1, A3 and **B** (the no-blocking control, needed by the outcome rules).
- **Loads:** λ ∈ {10, 50, 400} requests/s.
- **Repetitions:** 5, so 3 × 3 × 5 = **45 runs**. The repetition is the outermost loop,
  then λ, then the variants in the order A1, A3, B.

**Instrument changes**, made after this commit and before any run, listed here in
advance:
1. The app's error response body carries the exception class and message (today: the
   class only), so the generator can see which thread Reactor named.
2. The generator classifies every HTTP 500 by its body:
   - `ISE_LOOP`: contains `IllegalStateException` and "not supported in thread
     reactor-http-";
   - `ISE_PARALLEL`: the same, with `parallel-`;
   - `OTHER_500`.
3. The app records the `System.nanoTime()` of its **first main-request arrival** (F), and
   every thread sample and exception carries `nanoTime` too.
4. A **clock preflight** before the batch (60 s of wall vs monotonic) is written to
   `env.txt`. It is informational and decides nothing.

## Clock rule (new)

Every deciding criterion uses **one process's monotonic clock**, or counts that need no
window. No timestamp of one process is compared with a timestamp of another.

- **Generator:** window by target time, [t₀ + 10 s, t₀ + 70 s), on its own monotonic
  clock. It supplies outcomes, latencies, response bodies, probes and lateness.
- **App:** window [F + 10 s, F + 70 s) on the app's own `nanoTime`. The generator sends
  its first main request at t₀, so both windows cover the same load period: only
  *durations* carry over between processes, and both JVMs read the same kernel monotonic
  clock rate. It supplies thread samples, CPU, GC and the event loops' CPU.
- **Downstream:** counts over the whole run, and latencies on its own clock.

## A1 — hypothesis H2 (unchanged from the first experiment)

**H2: `.block()` on the event loop fails fast with `IllegalStateException`.** Met when
**d1–d3 hold at every λ** (medians of 5 repetitions), with the same thresholds as the
first experiment's (d):
- **d1:** ≥ 99 % of the window's main requests are HTTP 500 classified `ISE_LOOP`. Counted
  on the generator only (body of each response).
- **d2:** < 5 % of the event loops' samples in the app window are `BLOCKING_GET`.
- **d3:** the keep-alive `/ping` probe has p99 ≤ 50 ms. This was H2's probe in the first
  experiment; the fresh-connection one is reported next to it.

## A3 — hypothesis H3 (new, born from #20's data)

**H3: request deadlock — 0 successful responses without total retention of the event
loops.** Each `.toFuture().get()` request waits for a response that has to be processed
by the event loop the request itself is holding (the WebClient shares the server's
loops), so it never completes. This happens whether or not all loops are held, and
non-blocking work on new connections is still served when a loop that accepts and
serves them is free.

Met when **all** of the following hold:
- **H3a — every request deadlocks.** In **every** run at every λ: 0 main responses `OK`
  over the whole run, and ≥ 99 % of the main requests end in `TIMEOUT` or
  `CONNECT_TIMEOUT`. Generator only.
- **H3b — the request never leaves the app.** In **every** run: the downstream receives
  **0** `/slow` requests over the whole run. Downstream only. This marker was observed in
  #20 (0 in 15/15 runs); it is stated as such.
- **H3c — without total retention, with the fresh-connection probe deciding.** In
  **≥ 3 of the 15 runs**, all of:
  - at most 3 of the 4 event loops are in `FUTURE_GET` in every app sample of the
    window;
  - **both fresh-connection probes** (`/ping`, `/ping-parallel`) answer ≥ 99 % `OK`
    with p99 ≤ 50 ms in the window;
  - 0 main responses `OK` in that run.

  That is, new work that blocks nothing is served while every A3 request deadlocks.
  These are runs where it was shown that the failure is per request, and not the
  scheduler running out of loops.

**Also reported for A3, not deciding:**
- the held-loop count per run (min and max over the window's samples);
- both probes, keep-alive and fresh, per run;
- the first experiment's (a) and (b), on the new clock rule;
- the split between `TIMEOUT` and `CONNECT_TIMEOUT`.

**Verdict:**
- H3a, H3b and H3c met → "H3 confirmed".
- H3a and H3b met but not H3c (for instance, all 4 loops held in nearly every run) →
  "deadlock confirmed, but without showing it happens with free loops". This is
  reported as "fits neither".
- Otherwise "fits neither", with every sub-criterion's figures.

## Shared criteria

- **(0) Precondition:** the CLI reports `reactor-block` on A1's `.block()` and A3's
  `.toFuture().get()`, and nothing in B.
- **(e)-B, every λ:**
  - ≥ 99 % `OK`;
  - main p99 ≤ 400 ms;
  - `OK` responses/s within λ ± 10 % (by end time, generator);
  - both keep-alive probes p99 ≤ 50 ms.
- **(f), every variant and λ** (same thresholds as the first experiment, clock rule
  above):
  - **f1:** app CPU < 50 % and GC < 1 % of the app window;
  - **f2:** downstream latency p99 ≤ 250 ms over the whole run (vacuously met with 0
    requests, reported as such);
  - **f3:** ≤ 1 % of the generator's window requests sent > 100 ms late;
  - **f4:** every event loop < 50 % of one CPU over the app window.

A cell with fewer than 5 `OK` runs is not evaluable, and its criteria count as not met.

## Outcome → consequences (each in its own PR, without merge)

1. **A1 meets H2**, with (0), (e)-B and (f) met: the #21 correction (`.block()` fails fast
   with `IllegalStateException`, every request HTTP 500) is extended to the Netty event
   loop, in a separate PR, with evidence pinned to this replication's results.
2. **A3 meets H3**, with (0), (e)-B and (f) met: measured evidence specific to
   `.toFuture().get()`, in a separate PR. With the WebClient on the server's event loops
   (Spring Boot's default), every such request deadlocks: no response, and it never
   reaches the downstream, whether or not all loops are held. The wording follows the
   figures measured here.
3. **Anything else:** no text change for that pattern. The results are published with
   the failed criterion and its figures.

## Evaluation script

`evaluate_replication.py` is committed **before the first of the 45 runs**. It reads only
`results/raw/` in this directory and writes:
- `results/criteria.md`: every criterion with its figures, and the verdicts;
- `results/summary.md`.

Smoke runs validate the harness only. They are kept in `smoke/`, are not evidence, and
are never pooled with the 45 runs.

## Limits

The same as the first experiment:
- controlled simulation, with no quotable absolute latency;
- only the versions above;
- the WebClient on Boot's default shared loops. With its own `LoopResources`, A3's
  colocation deadlock would not apply, and that is not measured.
