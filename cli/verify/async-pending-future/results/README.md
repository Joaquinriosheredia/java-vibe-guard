# async-returns-pending-future (B0) — results

Pre-registered experiment (`../PREREGISTRATION.md`, `c5ae6ad`). Harness and `evaluate.py`
at `75e2aac`, before any run. Deviation 1 (K's execution metric, which enters no
criterion) fixed at `6536c16`. 125 runs on 2026-10-05, from 11:00 UTC, at `6536c16`
with a clean worktree. Every run's status is `OK`, with no `TIMEOUT`.

- `criteria.md` — every criterion with its figures, and the verdicts.
- `summary.md` — per variant and rate: median [min–max] over 5 repetitions.
- `raw/` — one JSON per run, plus `runs.jsonl`, `env.txt` (with the clock preflight) and
  the CLI precondition.

All times are `System.nanoTime()` in one JVM (clock rule).

## Verdicts

**H confirmed:** an `@Async` method that returns a still-pending `CompletableFuture`
holds a thread of Spring Boot's default executor until the future completes. Its body
has no `join()` or `get()`. Criteria (a)–(e) are met:
- **P** (8 threads):
  - capped at 39.7 completions/s at 60 and 120 tasks/s (expected 8 / 0.2 s = 40);
  - the queue grows at λ − 40 (20.0 and 80.1 tasks/s);
  - 98–99 % of the latency is queue wait;
  - **100 %** of the executor threads' stack samples are in `CompletableFuture.get`,
    called from `AsyncExecutionInterceptor.lambda$invoke$0` (spring-aop 6.1.6).
- **P16:** 79.5 completions/s at 120 (expected 80). The cap scales with threads / call
  duration.
- **K** (returns `completedFuture`, same work): no queue, p99 200 ms, 0 % in the
  interceptor's `get()`, 119.6 completions/s at 120. P's p50 is 10.2 s at 60 and 23.5 s
  at 120, against 200 ms for K.
- **N** (same body, no `@Async`): p99 200 ms, completions/s = λ, 0 tasks on the
  executor.
- Process CPU 0.1 %, GC 0 %.

CLI 2.2.0 reports nothing on these methods (`blocking`, `reactor-block`): this is the
gap.

**(f) met:** with virtual threads (V) there is no saturation at 120 tasks/s (queue slope
0, p99 200 ms).

**HN confirmed: the nested form deadlocks.** PN: an `@Async` method returning the future
of another `@Async` method on the same 8-thread executor.
- At **λ = 60 and 120**, in every repetition, all 8 threads are outer tasks in the
  interceptor's `get()`, waiting for inner tasks queued behind them. **0 completions:
  the starvation deadlock had already set in before the measurement window.**
- At **λ = 36**, the same in every repetition.
- At **λ = 20**, exactly its expected capacity (8 / (2 × 0.2 s)), every repetition
  deadlocked 9–18 s into the window and never recovered.
- At **λ = 10**: no deadlock, 9.97 completions/s.

## Limits

- Controlled simulation (200 ms timer); no absolute latency is quotable.
- Spring Framework 6.1.6 (Boot 3.2.5), OpenJDK 21.0.12.1, Ubuntu 24.04.4 on WSL2.
- Only the default executor (8 threads, unbounded queue), 16 threads and virtual
  threads.
- **Not measured:**
  - other Spring versions;
  - custom executors (bounded queues, rejection policies);
  - `ListenableFuture` and plain `Future` return types;
  - AspectJ-mode `@Async`.
