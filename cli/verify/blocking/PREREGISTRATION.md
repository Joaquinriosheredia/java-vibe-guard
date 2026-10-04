# Pre-registration — `blocking` rule experiment

Committed **before** any experiment code exists or any run is made (Phase 2, approved
2026-10-04). After this commit the thresholds below are frozen. If one turns out to be
badly posed, it is reported as a **deviation** in the results, next to the original
text; it is never rewritten here.

## Question

The CLI rule `blocking` flags `Thread.sleep()`, `.join()`, `.block*()` and `Future.get()`
inside `@Async` / `@Scheduled` / `@EventListener` methods. Its stated mechanism
(`rule-catalog.js`): *the call holds a thread of the executor for its whole duration;
under load the pool saturates*.

Does a blocking call inside an `@Async` method saturate Spring Boot's default `@Async`
executor and queue tasks, **because the call holds the thread**, and not for another
reason?

Scope: `@Async` only. `@Scheduled` and `@EventListener` are not measured here and keep
"documented mechanism, no benchmark of our own".

## Setup

- Spring Boot **3.2.5** app (same skeleton as `cli/verify/vibe-001`), Java 21, no HTTP
  layer and no database: tasks are submitted from the same JVM, so neither Tomcat's
  pool nor HikariCP can be the bottleneck.
- `@Async` executor: Spring Boot's **default** `ThreadPoolTaskExecutor`
  (`spring.task.execution.pool.*` defaults in 3.2.5: `core-size=8`,
  `max-size=Integer.MAX_VALUE`, `queue-capacity=Integer.MAX_VALUE`). With an unbounded
  queue the pool never grows past the core size, so it behaves as **8 threads + an
  unbounded queue**. Nothing is configured except where a variant says so.
- Simulated downstream call: a `CompletableFuture` completed after **L = 200 ms** by a
  separate scheduler (not the `@Async` pool).
- Theoretical capacity of variant A: **K = 8 / 0.2 s = 40 tasks/s**.

## Variants

| Id | `@Async` method | Executor |
|---|---|---|
| **A** (rule pattern) | waits for the 200 ms future with `.join()` — the thread is held 200 ms | default (8 threads) |
| **B** (control) | same 200 ms future, composed with `thenApply` and returned; no `join()` — the thread is released at once | default (8 threads) |
| **C** (dose) | as A | `spring.task.execution.pool.core-size=16` |
| **D** (condition) | as A | `spring.threads.virtual.enabled=true` (Boot uses a virtual-thread `SimpleAsyncTaskExecutor`, no fixed pool) |

A, B and C run with `spring.threads.virtual.enabled=false`.

## Load

- Open model: a dedicated generator thread submits tasks at a constant rate **λ**,
  independent of completions.
- λ ∈ **{20, 36, 60, 120} tasks/s** = 0.5×, 0.9×, 1.5×, 3× K.
- Each run: **5 s warm-up** at λ (not measured) + **30 s measurement window**, then
  submission stops and every task submitted in the window is awaited (drain).
- **5 repetitions** per (variant, λ), a fresh JVM per run. Reported: median and
  min–max across repetitions.

## Metrics

Per task (tasks submitted in the window): queue wait (submit → method start),
execution (start → end), end-to-end latency (submit → future complete), p50/p95/p99.

Sampled every 100 ms in the window: tasks started and not finished (in-flight),
tasks submitted and not started (queue), completions. For A/B/C also the executor's
`activeCount` and `queue.size()`.

Sampled every 500 ms in the window (A, B, C): stack of every `@Async` executor thread.

Per run: completions/s in the window, process CPU (`OperatingSystemMXBean`), GC time
(`GarbageCollectorMXBean`), environment and commit.

Queue growth slope: least-squares slope (tasks/s) of the sampled queue size over the
window.

## Pre-registered criteria

All evaluated on the **median of the 5 repetitions**, unless stated.

**(a) Saturation, A at λ = 60 and 120:**
- in-flight = 8 in ≥ 90 % of the 100 ms samples;
- queue slope within ±20 % of (λ − 40): 16–24 tasks/s at 60, 64–96 at 120;
- queue wait ≥ 80 % of mean end-to-end latency;
- median execution 180–220 ms.

**(b) Threads are in the blocking call, A at λ = 60 and 120:** ≥ 90 % of
executor-thread stack samples are inside `CompletableFuture.join` called from the
`@Async` method.

**(c) The control does not queue, B at λ = 60 and 120:** median queue size ≤ 8 and
p99 latency ≤ 300 ms; A's p50 latency ≥ 5× B's p50 at the same λ; A and B p50 ranges
(min–max over repetitions) do not overlap.

**(d) Dose–response:**
- A at λ = 20 and 36: queue slope within ±2 tasks/s (no sustained growth);
- A completions/s at λ = 60 and 120 within 34–46 (40 ± 15 %);
- C completions/s at λ = 120 within 68–92 (80 ± 15 %), and C at λ = 60 has queue slope
  within ±2 tasks/s.

**(e) No other bottleneck, A at λ = 60 and 120:** mean process CPU < 50 % and GC
time < 1 % of the window.

## Outcome

- **Measured evidence for `@Async`:** (a)–(e) all met. The rule's `evidence` then
  points to the versioned results, pinned to a commit, scoped to "`@Async` on the
  default platform-thread executor".
- **Stays "documented mechanism, no benchmark of our own":** any of (a)–(e) not met.
  The result is still published, with which criterion failed and its figures.
- **D (reported, not a criterion):** if D at λ = 120 has queue slope within ±2 tasks/s
  and p99 ≤ 400 ms, D "does not saturate". A separate proposal (not this PR) will then
  suggest changing the rule's severity when a project enables virtual threads.
