# Pre-registration — `async-returns-pending-future` (pattern B0) experiment

Committed before any experiment code exists or any run is made (Phase 3, option c,
approved by Joaquín on 2026-10-05, with variant PN and hypothesis HN added at his request). Frozen after this commit; departures go to
DEVIATIONS.md with the original text, the new one, what was observed and when, and both
are evaluated. No rule is written until this experiment's outcome says so.

## Question

An `@Async` method that **returns a future that is still pending** (it completes later,
when another component finishes) has no `join()` / `get()` in its body. No CLI rule
reports it. Does such a method **hold a thread of Spring Boot's default `@Async`
executor until the returned future completes, so the pool saturates under load like a
blocking call does**? Or does it release the thread, as its body suggests?

## Origin of the hypothesis (stated)

Found while preparing the `blocking` experiment (`cli/verify/blocking/DEVIATIONS.md`,
deviation 1). There, variant B0, run as **exploratory** and outside every criterion,
saturated like the blocking variant: 40.0 completions/s and the queue growing 80/s at
120 tasks/s, with 100 % of the executor's stack samples in the interceptor's `get()`.
That result is **not** used to evaluate anything below; this experiment tests it with
its own pre-registered criteria.

The suspected mechanism, read in the bytecode of spring-aop **6.1.6** (not measured):
- `AsyncExecutionInterceptor.lambda$invoke$0` (the task submitted to the executor)
  calls the method and, if the result is a `java.util.concurrent.Future`, calls
  `Future.get()` on it, on the executor thread;
- `doSubmit` submits `CompletableFuture` return types with
  `AsyncTaskExecutor.submitCompletable`.

## Hypotheses

- **H (pending future holds the thread):** criteria (a), (b), (c), (d) and (e) below are
  met.
- **H0 (released, as the body suggests):** the pattern variant P meets, at λ = 60 and
  120, the same thresholds the control K must meet in (c): median queue ≤ 8, p99 ≤
  300 ms, and < 5 % of executor samples in the interceptor's `get()`.
- **Neither:** reported as "fits neither", with every sub-criterion's figures. No rule
  is designed.
- **HN (nested pending future: starvation deadlock), independent of H:** see variant
  PN and criterion (g). If H is confirmed and HN is not, the outcome for the rule is the
  same; HN only adds evidence.

## Setup

- Built from the `blocking` experiment's app (`cli/verify/blocking/app`), copied into
  `cli/verify/async-pending-future/app`. One JVM: the load generator, the `@Async` bean
  and the simulated downstream all run in it; no HTTP layer, no database.
- **Versions** (no claim beyond them):
  - Spring Boot **3.2.5**, which manages **Spring Framework 6.1.6** (spring-aop and
    spring-context 6.1.6);
  - OpenJDK **21.0.12.1**;
  - Ubuntu 24.04.4 on WSL2, 16 CPUs.

  `run-experiment.sh` records in `env.txt` the jars actually resolved in the artifact.
- **`@Async` executor:** Spring Boot's default `ThreadPoolTaskExecutor`
  (`core-size=8`, unbounded queue, so 8 threads + an unbounded queue), except where a
  variant says otherwise. `spring.threads.virtual.enabled=false` except in V.
- **Downstream:** a `CompletableFuture` completed after **L = 200 ms** by a separate
  scheduler (not the `@Async` pool), as in `blocking`.
- **Expected capacity if H holds:** threads / L = 8 / 0.2 s = **40 tasks/s** (P), and
  16 / 0.2 s = **80 tasks/s** (P16).

## Variants

Each variant is a separate method, so the CLI precondition can name each one.

| Id | Method | Executor | Returns |
|---|---|---|---|
| **P** (pattern) | `@Async CompletableFuture<T> m()` returns `downstream.call().thenApply(..)`: pending, completes ~200 ms later | default (8 threads) | the pending future |
| **P16** (dose) | as P | `spring.task.execution.pool.core-size=16` | the pending future |
| **K** (control: completed future) | `@Async CompletableFuture<T> m(done)` issues the same `downstream.call()`, completes the caller's `done` future from the callback, and returns `CompletableFuture.completedFuture(..)` at once | default (8 threads) | an already-completed future |
| **N** (control: no `@Async`) | P's body in a method without `@Async`, called directly by the generator thread | none | the pending future |
| **V** (condition: virtual threads) | as P | `spring.threads.virtual.enabled=true` (Boot's virtual-thread `SimpleAsyncTaskExecutor`, no fixed pool) | the pending future |
| **PN** (nested, for HN) | `@Async CompletableFuture<T> outer()` returns the future of **another `@Async` method** in another bean, `inner()`, which runs on the **same default executor**. `inner()` returns the pending downstream future, as P does | default (8 threads), shared by outer and inner | the inner method's future (pending until the inner task has run its ~200 ms) |

PN's mechanism, as predicted from the same bytecode:
- each outer task holds a thread inside the interceptor's `get()` until its inner task
  completes;
- the inner task is queued on the same executor behind the waiting outers, and it also
  holds a thread for ~200 ms;
- without deadlock the expected capacity is 8 / (2 × 0.2 s) = **20 outer tasks/s**;
- if all 8 threads are outer tasks waiting for inner tasks queued behind them, nothing
  can run again (starvation deadlock), and the state never recovers.

End-to-end latency is measured to the completion of the future the caller observes:
- P, P16, V and PN: the future Spring returns, completed by the (outer) executor
  task;
- K: the caller's `done` future, completed from the downstream callback;
- N: the returned future itself.

## Load and runs

- Open model, as in `blocking`: a generator thread submits at constant rate λ,
  independent of completions.
- λ ∈ **{20, 36, 60, 120} tasks/s** (0.5×, 0.9×, 1.5× and 3× the expected capacity of
  P). PN also runs at **λ = 10** (0.5× its expected capacity of 20/s), so HN has a load
  below its threshold.
- **5 s warm-up + 30 s window**, then the run drains every task submitted in the
  window.
- **5 repetitions** per (variant, λ), a fresh JVM per run: 5 × 4 × 5 = 100 runs, plus
  PN at 5 loads × 5 = 25, so **125 runs** (about 100 minutes). The repetition is the
  outermost loop, then λ, then the variants in the order P, K, N, V, P16, PN (PN alone
  at λ = 10).
- **Bounded drain:** after the window, the run waits at most **20 s** for the tasks
  submitted in the window. Tasks still pending are recorded as `unfinished` (a
  deadlocked PN run never drains). The JVM then exits whatever its executor threads
  are doing.
- **Per-run harness timeout (mandatory, a deadlock must not hang the batch):** 120 s
  (expected about 45–60 s), enforced from outside the JVM (`timeout -k 5 120`). A run
  killed by the timeout is recorded as `TIMEOUT`, and the batch continues. A cell with fewer than 5
  `OK` runs is not evaluable, and its criteria count as not met.

## Clock rule (template rule 6)

- Every time is `System.nanoTime()` inside the single JVM: submit, method start, task
  end and end-to-end completion.
- No timestamp is compared across processes.
- A clock preflight (60 s, wall against monotonic) is written to `env.txt`. It is
  informational.

## Metrics

- **Per task** (submitted in the window):
  - queue wait (submit → method start);
  - execution (method start → executor task end, which is when the interceptor's
    `get()` returns; for K, method return; N has no executor);
  - end-to-end latency;
  - p50, p95, p99.
- **Every 100 ms in the window:**
  - in-flight (started, task not ended);
  - queue (submitted, not started);
  - completions;
  - executor `activeCount` and `queue.size()` (P, P16, K).
- **Every 500 ms:** stack of every `@Async` executor thread (P, P16, K, PN). A sample is
  **`INTERCEPTOR_GET`** when the stack contains
  `org.springframework.aop.interceptor.AsyncExecutionInterceptor.lambda$invoke$0` and,
  above it, `java.util.concurrent.CompletableFuture.get` (or `Future.get`).
  - For PN, each such sample is also labelled **OUTER** or **INNER**: the kind of the
    last `@Async` method that thread entered. A thread runs one task at a time, so that
    is the task it is waiting in.
- **PN only, every 100 ms:**
  - outer tasks started and finished;
  - inner tasks submitted (one per started outer task) and started;
  - **inner tasks pending in the queue** (submitted, not started).
- **Per run:**
  - completions/s in the window;
  - number of tasks run by the `@Async` executor (N: must be 0);
  - process CPU and GC time;
  - environment and commit.
- **Queue slope:** least-squares slope of the sampled queue size over the window.

## Pre-registered criteria

Medians of the 5 repetitions unless stated. Thresholds are those of `blocking`, applied
to the new pattern.

**(0) Precondition (informational, the gap):** CLI 2.2.0 (`--rule blocking` and
`--rule reactor-block`) reports nothing on P's method. If it does report something, the
gap is smaller than assumed; this is reported and the experiment still runs.

**(a) Saturation, P at λ = 60 and 120:**
- in-flight = 8 in ≥ 90 % of the 100 ms samples;
- queue slope within ±20 % of (λ − 40): 16–24 tasks/s at 60, 64–96 at 120;
- queue wait ≥ 80 % of mean end-to-end latency;
- median execution 180–220 ms.

**(b) The threads are in the interceptor's `get()`, P at λ = 60 and 120:** ≥ 90 % of
executor-thread stack samples are `INTERCEPTOR_GET`.

**(c) The controls do not queue, at λ = 60 and 120:**
- **K:**
  - median queue ≤ 8;
  - p99 end-to-end ≤ 300 ms;
  - < 5 % of executor samples `INTERCEPTOR_GET`;
  - P's p50 ≥ 5× K's p50 at the same λ, and the min–max ranges of P and K over the
    repetitions do not overlap.
- **N:**
  - p99 end-to-end ≤ 300 ms;
  - completions/s = λ ± 10 %;
  - **0 tasks** run by the `@Async` executor.

  This shows that neither the returned future nor the downstream causes the queue:
  only the `@Async` interception does.

**(d) Dose–response:**
- P at λ = 20 and 36: queue slope within ±2 tasks/s;
- P completions/s at λ = 60 and 120 within 34–46 (40 ± 15 %);
- P16 completions/s at λ = 120 within 68–92 (80 ± 15 %), and P16 at λ = 60 queue slope
  within ±2 tasks/s.

**(e) No other bottleneck:**
- P at λ = 60 and 120: mean process CPU < 50 % and GC < 1 % of the window;
- K at λ = 120: completions/s = λ ± 10 %. The downstream and the generator sustain
  120/s when nothing holds the executor.

**(f) Virtual threads (decides only the scope of the rule's severity, not H):** V at
λ = 120 has queue slope within ±2 tasks/s and p99 ≤ 400 ms in the median.
- If met, a future rule would treat virtual-thread modules as `blocking` does since
  2.1.0 (#18): WARNING with the same conservative criterion.
- If not met, no exception for virtual threads.

**(g) HN — nested pending future: saturation or starvation deadlock (PN).** Per run, in
the **last 10 s of the window**, the run is a **deadlock** when all of these hold:
- **0 outer tasks completed;**
- ≥ 90 % of the executor-thread stack samples are `INTERCEPTOR_GET` labelled **OUTER**;
- **inner tasks pending in the queue ≥ 1** in every 100 ms sample.

Otherwise the run **saturates without deadlock** when outer completions in those 10 s
are > 0.

- **HN confirmed:**
  - every repetition at λ = 60 and 120 is a deadlock;
  - and at λ = 10, no repetition is a deadlock, with outer completions/s = λ ± 10 %.
- **HN refuted (saturates, no deadlock):**
  - no repetition at λ = 60 and 120 is a deadlock;
  - and PN's completions/s there are within 17–23 (20 ± 15 %).
- **Anything else:** "fits neither", with the figures.

Reported for every λ, not deciding: deadlocked repetitions per λ (the load at which it
starts, expected between 20 and 36), the time from the window start to the last outer
completion, unfinished tasks after the drain, and the TIMEOUT runs.

## Outcome

- **H confirmed** ((a)–(e) met): the mechanism is measured, and the next step (design
  of a precision-first detection, with the list of shapes it reports and does not
  report, plus fixtures) is proposed to Joaquín before any implementation. The
  evidence would be pinned to these results and scoped to "default platform-thread
  `@Async` executor, Spring Framework 6.1.6".
- **H0** (P meets K's thresholds): no rule. The results are published as a refutation
  of B0's exploratory result.
- **Anything else:** "fits neither". No rule; the results are published with the
  failed criteria and their figures.
- **HN is independent.** If H is confirmed, the rule proceeds whether HN is confirmed
  or not. A confirmed HN adds evidence (the nested form deadlocks instead of only
  saturating); it does not change the rule's scope by itself.

## Evaluation script

`evaluate.py` is committed with the harness, **before any run** (smoke or real). Its
later changes are listed in DEVIATIONS.md. Smoke runs only validate the harness; they
are kept in `smoke/` and are never evidence.

## Limits stated in the results

- Controlled simulation: the downstream is a 200 ms timer, and no absolute latency is
  quotable.
- Only Spring Framework 6.1.6 / Boot 3.2.5 and the default `@Async` executor
  (8 threads, unbounded queue), plus 16 threads and virtual threads.
- **Not measured:**
  - other Spring Framework versions, whose interceptor may differ;
  - custom executors (bounded queues, rejection policies);
  - return types other than `CompletableFuture` (`ListenableFuture`, plain `Future`);
  - `@Async` through AspectJ weaving instead of proxies.
