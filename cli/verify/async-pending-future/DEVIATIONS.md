# Deviations from PREREGISTRATION.md

The pre-registration (`c5ae6ad`, 2026-10-05 12:51:23 +02:00) is not edited. Departures are
recorded here with the original text, the new one, what was observed and when. The
harness and `evaluate.py` were committed in `75e2aac` (12:54:02), before any run.

Smoke runs (harness only, never evidence) are kept in `smoke/`.

| Smoke run | Time (UTC) | What |
|---|---|---|
| `smoke/raw1` | 10:54–10:58 | every variant at λ = 60 and PN at λ = 10, 1 repetition, 15 s window |
| `smoke/raw2` | 10:59 | K at λ = 60 after the fix of deviation 1 (execution p50 0.01 ms; latency p50 200 ms) |

## 1. K's "execution" measured to the wrong future (harness bug, found in smoke run 1)

**Pre-registered (Metrics):** execution = method start → executor task end; "for K,
method return".

**Observed (smoke run 1):** the harness measured K's execution to the completion of the
caller's `done` future, about 200 ms later, and reported execution p50 = 200 ms.

**Change:** the harness records the completion of Spring's returned future for K
(`Task.taskEndNs`) and uses it for K's execution. Every other variant is unchanged.

K's execution enters no criterion: (c) uses K's queue, latency (end-to-end, to `done`, as
pre-registered) and stack samples. No threshold or criterion changes.
