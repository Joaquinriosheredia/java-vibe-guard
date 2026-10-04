# blocking — experiment results

- Design and frozen thresholds: [`../PREREGISTRATION.md`](../PREREGISTRATION.md) (commit `a809b2c`, pushed before any experiment code).
- Deviations: [`../DEVIATIONS.md`](../DEVIATIONS.md) (1: implementation of variant B; no threshold changed).
- Criteria, met / not met with figures: [`criteria.md`](criteria.md). All variants and rates: [`summary.md`](summary.md).
- Raw data (one JSON per run, 100 ms samples, stack samples, CPU, GC) and environment: `raw/`.
- Run: commit `1e97ba0`, clean tree, 2026-10-04, AMD Ryzen 7 5700X (16 threads), WSL2, Java 21.0.12, Spring Boot 3.2.5. 5 repetitions × 4 rates × variants A–D, plus B0 at 60 and 120 (90 runs).

## The executor under test is Spring Boot's default

The pool of **8 threads with an unbounded queue** is what Spring Boot gives `@Async` when nothing is configured: in 3.2.5, `spring.task.execution.pool.core-size=8`, `max-size=Integer.MAX_VALUE`, `queue-capacity=Integer.MAX_VALUE` (read from `TaskExecutionProperties$Pool` in `spring-boot-autoconfigure-3.2.5.jar`). With an unbounded queue the pool never grows past the core size. The runs record it (`corePoolSize: 8`, `queueCapacity: 2147483647`). With `spring.threads.virtual.enabled=true` Boot replaces it with a virtual-thread `SimpleAsyncTaskExecutor` (variant D).

## Outcome

**All pre-registered criteria (a)–(e) are met** for `@Async` on the default platform-thread executor:

- A (`join()` inside `@Async`) saturates at the predicted capacity: 39.9–40.0 completions/s against 8 / 0.2 s = 40; the queue grows at λ − 40 (20.0 tasks/s at λ = 60, 80.0 at 120); 100 % of samples with 8 tasks in flight; 98–99.5 % of latency is queue wait while execution stays at 200.2 ms.
- 100 % of executor-thread stack samples are inside `CompletableFuture.join` called from the `@Async` method.
- B (same 200 ms call, thread released) does not queue at the same rates: queue 0, p99 200.3 ms.
- Below capacity (20 and 36 tasks/s) A does not queue; with 16 threads (C) the capacity doubles (79.8 completions/s).
- CPU and GC are negligible (0.1 % of the machine, 0 ms GC): the pool is the only limit.

## Limits — what these figures do not say

- It is a controlled simulation: the "downstream call" is a 200 ms timer. It shows the mechanism and where it starts (load > threads / blocking time); it does not measure any real system.
- A's latencies (p50 10.2 s at 60 tasks/s, 40.2 s at 120) grow with the length of the window, because the queue is unbounded: they are not magnitudes to quote. The stable figures are the capacity (40/s) and the queue growth (λ − 40).
- `@Scheduled` and `@EventListener` were not measured.

## Outside the criteria

- **D (virtual threads):** does not saturate (pre-registered definition): at 120 tasks/s queue slope 0.00, p99 200.3 ms, 119.6 completions/s.
- **B0 (exploratory, see DEVIATIONS.md):** an `@Async` method that *returns* a pending future, without any `join()`/`get()` in its body, saturates exactly like A (40.0 completions/s, queue +80.0/s at 120): Spring's `AsyncExecutionInterceptor` calls `Future.get()` on it on the executor thread (100 % of stack samples there). The `blocking` rule does not detect this pattern.
