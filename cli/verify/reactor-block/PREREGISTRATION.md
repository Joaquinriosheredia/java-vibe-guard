# Pre-registration — `reactor-block` rule experiment

Committed **before** any experiment code exists or any run is made (Phase 2; design
`vibe-guard/docs/FASE-2-reactor-block-diseno.md`, approved 2026-10-04 with the additions
listed in "Differences from the approved design" below). After this commit the
hypotheses, thresholds and outcome rules below are frozen. If one turns out to be badly
posed, it is reported as a **deviation** in `DEVIATIONS.md`, with the original text,
the new one, what was observed and when; both are evaluated and published. It is never
rewritten here.

Smoke runs validate the harness only (that it measures, that the per-run timeout works,
that the probe answers). Their data are not evidence and are never pooled with the 90
runs.

## Question

The CLI rule `reactor-block` flags `.block()`, `.blockFirst()`, `.blockLast()` and
`.toFuture().get()` inside a `@RestController` / `@Service` / `@Component` class of a
file that imports `reactor.core.publisher`. Its stated mechanism (`rule-catalog.js`):
*blocking pins a Reactor thread (Netty event loop or `Schedulers.parallel()` worker) for
the whole I/O wait; with few such threads, throughput collapses under load*.

Does a blocking Reactor call inside a Spring bean **hold Reactor threads and stall the
scheduler**, so that work which blocks nothing stops too, and not only its own request
gets slower? In which thread context does each outcome happen?

## Competing hypotheses (both pre-registered)

Evaluated separately for each of **A1, A2 and A3** (variants below). P(V) is the thread
pool where V blocks, call(V) the blocking frame, Q(V) the non-blocking probe that shares
P(V):

| V | P(V) | call(V) | Q(V) |
|---|---|---|---|
| A1 | event loops `reactor-http-*` | `BlockingSingleSubscriber.blockingGet` | `/ping` |
| A2 | `parallel-*` workers | `BlockingSingleSubscriber.blockingGet` | `/ping-parallel` |
| A3 | event loops `reactor-http-*` | `CompletableFuture.get` | `/ping` |

- **H1 — holds the thread / stalls the scheduler** (the rule's stated mechanism). H1(V)
  is met when criteria **(a) and (b)** below, applied to V, are met at λ = 50 **and**
  λ = 400.
- **H2 — fails fast with `IllegalStateException`.** H2(V) is met when criterion **(d)**
  below, applied to V, is met at **every** λ.

H1 needs ≥ 90 % of P(V)'s samples inside call(V); H2 needs < 5 %. They cannot both be
met; if `evaluate.py` reports both, that is an evaluator bug and is reported as such.

**Verdict per variant:** H1 only → "H1 confirmed"; H2 only → "H2 confirmed"; neither →
**"fits neither"**.

**"Fits neither" is reported, not forced into H1 or H2.** The verdict line says "fits
neither", and every sub-criterion of H1 and H2 is listed with its figures. A descriptive
label is computed from the medians, without threshold changes:
- "fails, but not fast": ≥ 99 % HTTP 500, but Q(V) p99 > 50 ms or ≥ 5 % of samples in
  call(V);
- "partial retention": 5–90 % of P(V)'s samples in call(V);
- "slow, not stalled": ≥ 90 % in call(V), but Q(V) not degraded per (b);
- "other": anything else.

In that case the rule's text for that pattern is not changed (it stays "documented
mechanism"), the results are published with the figures, and the decision goes to
Joaquín.

**Predictions** (from reading the bytecode, not from any run):
- A1 → H2, A2 → H2, A3 → H1.
- In `reactor-core` 3.6.5, `BlockingSingleSubscriber.blockingGet` throws
  `IllegalStateException` when `Schedulers.isInNonBlockingThread()`. `parallel-*` workers
  are `NonBlocking`. In `reactor-netty` 1.1.18, the event-loop thread class
  `DefaultLoopResources$EventLoop` implements `reactor.core.scheduler.NonBlocking`
  (checked with `javap` while writing this file).
- `.toFuture().get()` is `CompletableFuture.get`, which has no such check.
- Since the WebClient shares (colocates) the server's event loops, A3 is predicted to
  **deadlock**, not only to slow down: the response the blocked loop waits for has to be
  processed by a loop that is blocked.

## Setup

**Fixed versions** (no claim is generalised beyond them):
- Spring Boot **3.2.5**, which manages Spring Framework 6.1.6, `reactor-core`
  **3.6.5**, `reactor-netty` **1.1.18**, Netty 4.1.109.Final and Tomcat 10.1.20.
- OpenJDK **21.0.12.1** (Ubuntu build).
- Ubuntu 24.04.4 LTS on WSL2, kernel 6.6.87.2-microsoft-standard-WSL2, 16 logical CPUs,
  15 GiB RAM.
- `run-experiment.sh` writes the versions actually resolved in the jar to
  `results/raw/env.txt`, including the Netty transport (native epoll or NIO).

**Processes:** three JVMs, all fresh per run, on the same host:
1. **Downstream** (port 8081): a WebFlux app of its own that answers `GET /slow` after
   **L = 200 ms** (`Mono.delay`). It has its own event loops and cannot be held by the
   app under test. It records arrival and completion time of every request.
2. **App under test** (port 8080): Spring Boot, Java 21, **platform threads**
   (`spring.threads.virtual.enabled=false`). The web stack is selected by property:
   `spring.main.web-application-type=reactive` (Netty) for A1–A4 and B, and `servlet`
   (Tomcat) for C. Heap `-Xms512m -Xmx512m`.
3. **Load generator**: a plain Java 21 program. Heap `-Xmx1g`.

**Thread pools fixed for every variant** (JVM system properties of the app):
- `reactor.netty.ioWorkerCount=4`: 4 event loops, shared by the server and the WebClient
  (Boot's global `ReactorResourceFactory`, as in a real app);
- `reactor.schedulers.defaultPoolSize=4`: 4 `parallel` workers;
- **`boundedElastic`** (A4), fixed explicitly:
  - `reactor.schedulers.defaultBoundedElasticSize=40` threads;
  - `reactor.schedulers.defaultBoundedElasticQueueSize=100000` queued tasks per thread
    (reactor-core's semantics), effectively unbounded here: at most
    (400 − 200)/s × 80 s = 16,000 tasks;
  - **expected capacity: 40 / 0.2 s = 200 requests/s**;
- **WebClient connection pool:** `reactor.netty.pool.maxConnections=500`. The default in
  reactor-netty 1.1.18 is max(CPUs, 8) × 2 = 32 connections, with a pending-acquire
  limit of 2 × that. With 32 connections, B would be capped at 32 / 0.2 s = 160/s
  below λ = 400, and the control would measure the pool, not Reactor;
- Tomcat (C): `server.tomcat.threads.max=200`, so C's expected capacity is
  200 / 0.2 s = 1,000/s.

**Load generator:**
- open model at a constant rate λ, independent of responses;
- a scheduler thread computes target times t₀ + k/λ, and each request is sent from its
  own virtual thread with `java.net.http.HttpClient` (HTTP/1.1, connect timeout 10 s,
  request timeout 10 s);
- the main traffic and the probes use two separate `HttpClient` instances, so a stalled
  connection pool on the main traffic cannot delay the probes on the client side.

**Probes:** **5 requests/s to each** of two endpoints that block nothing:
- `/ping`: `Mono.just`, on the event loop;
- `/ping-parallel`: `Mono.fromCallable` with `subscribeOn(Schedulers.parallel())`.

**Run timeline:**
- downstream and app started and ready (`/ping` answers 200) before the generator starts;
- generator: **10 s warm-up + 60 s window** of scheduled requests, then waits for every
  pending request to finish (at most the 10 s client timeout).

## Variants

All variants call the same downstream. Only how the result is awaited, and on which
thread, changes. Each variant is a separate class in its own file.

| Id | Pattern | Thread where it blocks | Rule flags it |
|---|---|---|---|
| **A1** | WebFlux handler returning `webClient…bodyToMono().block()` | event loop | yes |
| **A2** | `Mono.just(..).subscribeOn(Schedulers.parallel()).map(x -> client.call().block())` (the Finding 2 shape) | `parallel` worker | yes |
| **A3** | WebFlux handler returning `webClient…bodyToMono().toFuture().get()` | event loop | yes |
| **A4** | `Mono.fromCallable(() -> client.call().block()).subscribeOn(Schedulers.boundedElastic())` | `boundedElastic` (40 threads) | yes |
| **B** (control) | `return webClient…bodyToMono()`, no blocking | none | no |
| **C** (context control) | same code as A1, run on MVC (Tomcat, 200 threads) | Tomcat worker | yes |

**Loads:** λ ∈ {**10, 50, 400**} requests/s.
- 10 is below every capacity.
- 50 is above the capacity of 4 held event loops (4 / 0.2 s = 20/s).
- 400 is above the capacity of A4 (200/s).

**Repetitions:** **5** per (variant, λ), so 6 × 3 × 5 = **90 runs**. The repetition is
the outermost loop, then λ, then the variants in the order A1, A2, A3, A4, B, C, so
drift affects every cell alike.

## Harness timeout

- The generator runs under a hard limit of **150 s** per run (expected about 82 s:
  `timeout -k 5 150`).
- If it is killed, the run's status is **`TIMEOUT`**. The harness then stops the app and
  the downstream and continues with the next run.
- No run can block the batch.
- Every run ends with the harness stopping the downstream and the app: `SIGTERM`, then
  `SIGKILL` 10 s later. It records which one was needed.
- Before stopping the app it calls `GET /ping` once with a 2 s timeout and records
  `app_responsive_after` (yes/no).

**Run statuses:**
- `OK`;
- `TIMEOUT`;
- `STARTUP_FAILED`: a JVM was not ready within 60 s;
- `GENERATOR_ERROR`: the generator exited non-zero.

Only `OK` runs carry data. A cell (variant, λ) with fewer than 5 `OK` runs is **not
evaluable**, and every criterion that needs it counts as **not met**. The available
repetitions are still reported, with each run's status.

**Interbloqueo (deadlock) is a measured outcome, not a harness status.** It is
classified from the data in criterion (c), whether or not the harness had to kill
anything.

## Metrics

1. **Per request** (generator): kind (main, `/ping`, `/ping-parallel`), target time,
   actual send time, end time, and outcome:
   - `OK` (HTTP 200);
   - `HTTP_500`;
   - `HTTP_OTHER`;
   - `TIMEOUT` (request timeout);
   - `CONNECT_TIMEOUT`;
   - `IO_ERROR`.
2. **Server exceptions** (app, `@RestControllerAdvice` for `Throwable`, both stacks):
   time, class, message and current thread name. The thread named in Reactor's message
   ("…not supported in thread X") is parsed from the message.
3. **Thread samples every 500 ms** (app, `ThreadMXBean.dumpAllThreads`). Pools by name:
   - event loops `reactor-http-*`;
   - `parallel-\d+`;
   - `boundedElastic-\d+`;
   - Tomcat `http-nio-\d+-exec-\d+`.

   Each thread sample is classified, first match wins:
   1. **`BLOCKING_GET`**: the stack contains `reactor.core.publisher.BlockingSingleSubscriber.blockingGet`
      and a frame of the experiment's package (called from the handler);
   2. **`FUTURE_GET`**: the stack contains `java.util.concurrent.CompletableFuture.get`
      and a frame of the experiment's package;
   3. **`IDLE`**: the top frame is an epoll / selector wait (`EPoll.wait`, `epollWait`,
      `SelectorImpl.select`), or the thread is parked waiting for a task (a pool's
      `getTask` / `take` / `poll`);
   4. **`OTHER`**.

   Samples are written line by line (flushed), so a killed app loses nothing.
4. **Probe** latency and error rate, per endpoint.
5. **Throughput:** main requests answered `OK` whose end time falls in the window,
   divided by 60 s.
6. **Downstream:** requests received per second and their latency (completion − arrival),
   fetched from the downstream's `/stats` at the end of the run.
7. **Resources:**
   - app process CPU (process CPU time over the window ÷ (60 s × CPUs));
   - CPU time of each event-loop thread over the window ÷ 60 s;
   - GC time over the window ÷ 60 s;
   - generator lateness: actual send − target time;
   - environment and commit.

**Window:** a request belongs to the window when its **target time** is within
[t₀ + 10 s, t₀ + 70 s), except for throughput (metric 5, by end time). Samples,
exceptions and CPU use their own timestamps against the same interval.

**Latency of failed requests:** a failed request's latency is its time to failure (a
timeout counts as ~10 s), and it is also counted as an error. Percentiles include
failed requests.

## Pre-registered criteria

Evaluated on the **median of the 5 repetitions**, unless "every repetition" is stated.
"Samples" means thread samples (thread × sampling tick) of the named pool in the window.

**(0) Precondition:** `node bin/cli.js --json --rule reactor-block app/src/main/java`
reports `reactor-block` in the files of A1, A2, A3, A4 and C, and none in B, the probes
or the downstream.

**(a) Retention** (V ∈ {A1, A2, A3}; λ = 50 and 400): ≥ 90 % of P(V)'s samples are
call(V) (`BLOCKING_GET` for A1 and A2, `FUTURE_GET` for A3).

**(b) Stall, not just slowness** (V ∈ {A1, A2, A3}; λ = 50 and 400):
- Q(V) has p50 ≥ 1 s **or** ≥ 10 % errors or timeouts;
- **and** in B, at the same λ, Q(V) has p99 ≤ 50 ms.

**(c) Capacity or deadlock** (A3; λ = 50 and 400): main `OK` responses ≤ 23/s (the
4 / 0.2 s ceiling + 15 %). The A3 result is further classified, in every repetition at
λ = 50 and 400:
- **deadlock**: 0 main `OK` responses in the window, and ≥ 90 % of the window's main
  requests end in `TIMEOUT` or `CONNECT_TIMEOUT`;
- **stall without deadlock**: (c) met with > 0 `OK` responses;
- the share of timeouts is reported for every λ, including 10.

**(d) Fails fast, no retention** (V ∈ {A1, A2}; every λ; the same thresholds are also
computed for A3, so its H2 verdict exists):
- **d1:** ≥ 99 % of the window's main requests are `HTTP_500`, **and** the app recorded,
  in the window, `IllegalStateException`s whose message names a thread of P(V) in
  number ≥ 99 % of the window's main requests;
- **d2:** < 5 % of P(V)'s samples are call(V);
- **d3:** Q(V) p99 ≤ 50 ms.

**(e) Controls.**
- **B, every λ:**
  - ≥ 99 % `OK`;
  - main p99 ≤ 400 ms;
  - `OK` responses/s = λ ± 10 %;
  - both probes p99 ≤ 50 ms.
- **A4, Reactor criterion** (does blocking on `boundedElastic` stall any Reactor
  thread?):
  - both probes p99 ≤ 50 ms at every λ;
  - < 5 % of event-loop and of `parallel` samples are `BLOCKING_GET` at every λ;
  - ≥ 99 % `OK` at λ = 10 and 50.
- **C, every λ:**
  - 0 samples of event loops or `parallel` workers are `BLOCKING_GET` or `FUTURE_GET`;
  - both probes p99 ≤ 50 ms;
  - ≥ 99 % `OK`.

**(S) A4 saturation, separate from the Reactor criterion.** This is `boundedElastic`
running out of threads, which is what a bounded pool is designed to do. It does **not**
decide whether the rule's mechanism (stalling Reactor threads) applies. It is reported
next to (e), against the explicit limit:
- **S1:** at λ = 400, ≥ 90 % of `boundedElastic` samples are `BLOCKING_GET` (the pool
  is saturated);
- **S2:** at λ = 400, main `OK` responses ≤ 230/s (expected capacity of 200/s + 15 %);
- also reported for every λ: `OK` share, `OK`/s, timeouts and `boundedElastic` busy
  share.

**(f) No other cause, every variant and λ:**
- **f1:** app process CPU < 50 % and GC < 1 % of the window;
- **f2:** downstream latency p99 ≤ 250 ms. If the downstream received no request in the
  window, f2 is vacuously met, and the report says so;
- **f3:** ≤ 1 % of the window's requests (main and probes) were sent more than 100 ms
  after their target time;
- **f4 (added):** every event-loop thread used < 50 % of one CPU over the window, so a
  stalled probe cannot be explained by CPU-saturated event loops.

## Outcome → consequences

Each consequence goes in its own PR, without merge.

1. **H2 for A1 and/or A2**, with (0), (e)-B and (f) met: the rule's evidence and
   mechanism text (`rule-catalog.js`, the CLI message, the CLI README and the root
   README) are corrected to describe what was measured.
   - The text says: `.block()` on that thread does not hold the thread; every affected
     request fails with HTTP 500 (`IllegalStateException`) as soon as the path runs,
     under any load.
   - If only one of A1 / A2 meets H2, the correction covers only that thread context.
   - The detection does not change: it is still a defect, of a different kind.
2. **H1 for A3**, with (c), (0), (e)-B and (f) met: measured evidence specific to
   `.toFuture().get()` on the event loop. It holds the event loops and stalls work that
   blocks nothing, and it says "deadlock" or "stall" according to (c).
3. **A4 Reactor criterion and C met as predicted**, with (0) and (f): a separate
   proposal, with fixtures, for the rule to stop flagging
   `subscribeOn(Schedulers.boundedElastic())` and MVC-only (non-reactive web stack)
   use. The proposal quotes (S) as a limit of A4: the bounded pool still has a capacity.
4. **H1 for A1 or A2** (contrary to the prediction), with (0), (e)-B and (f): measured
   evidence for `.block()` in that context, with the same wording rules.
5. **Any other criterion not met:** the affected pattern stays "documented mechanism".
   The results are published anyway, with the failed criterion and its figures.

## Evaluation script

`evaluate.py` is committed **before the first of the 90 runs**. It reads only
`results/raw/` and writes:
- `results/summary.md`: per cell, the median and min–max over repetitions;
- `results/criteria.md`: every criterion met / not met, with the figures used, and the
  H1 / H2 verdict per variant.

Any change to `evaluate.py` after its commit is listed in `DEVIATIONS.md`, with the diff
summary and what prompted it.

## Limits stated in the results

- Controlled simulation: the downstream is a timer, and no absolute latency is quotable.
- Reactor threads fixed at 4: more cores give more event loops; the ceiling changes,
  the mechanism does not.
- Only the versions above. Not measured:
  - BlockHound;
  - Reactor on virtual threads;
  - a WebClient with its own `LoopResources` (which would separate client and server
    loops and remove A3's colocation deadlock);
  - other Reactor or Netty versions;
  - Undertow or Jetty.

## Differences from the approved design

All of these were made while writing this file, before any code or run, and the first
three at Joaquín's request on 2026-10-04:
1. H1 / H2 framed as competing hypotheses with a "fits neither" outcome. The design had
   the same criteria, without the verdict structure.
2. A4: `boundedElastic` limits fixed explicitly. The design's "≥ 90 % of
   `boundedElastic` samples in `blockingGet` at λ = 400" moves from (e) to the separate
   saturation block (S), with S2 added. (e)-A4 gains "< 5 % of Reactor-thread samples
   in `BLOCKING_GET`".
3. A per-run harness timeout and run statuses, with deadlock as a measured outcome. The
   deadlock / stall split in (c) is new; the design reported the timeout share with no
   threshold.
4. `reactor.netty.pool.maxConnections=500` (not in the design), from the default found
   in the bytecode (above).
5. Probe rate stated as 5/s **per endpoint**, the window defined by target time, and
   failed requests counted in percentiles.
6. f4 (event-loop CPU) added. With 16 CPUs, f1's "< 50 % of the process" could not
   detect 4 saturated event loops (at most 25 %).
7. (d) also computed for A3, so each of A1–A3 has an H1 and an H2 verdict.

No threshold of the design was relaxed.
