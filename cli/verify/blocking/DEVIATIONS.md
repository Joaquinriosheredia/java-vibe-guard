# Deviations from PREREGISTRATION.md

The pre-registration is not edited. Every departure from it is recorded here, with when
and why. Thresholds are never changed.

## 1. Variant B implementation (found in a smoke run, before the experiment)

**Pre-registered:** B composes the 200 ms future with `thenApply` and *returns* it,
"so the thread is released at once".

**Problem:** that does not release the thread. Spring's `AsyncExecutionInterceptor`
(spring-aop 6.1.6, `lambda$invoke$0`) calls `Future.get()` on a future returned by an
`@Async` method, on the executor thread. A smoke run (λ = 60, 3 s window) confirmed it:
B as pre-registered queued exactly like A (p50 1.41 s, 8 threads busy, every stack in
the interceptor's `Future.get()`).

**Change:** B is a `void` `@Async` method that completes a future passed by the caller,
so the thread really is released (smoke run: queue 0, p50 200 ms). A, C and D use the
same `void` + caller-future signature, so A and B differ only in the `join()`.

**Kept as exploratory variant B0:** B exactly as pre-registered, at λ = 60 and 120,
5 repetitions. Not part of any criterion; reported separately because it shows a
pattern with the rule's effect that the rule does not detect (no `join()`/`get()` in
the method body).
