# Deviations from PREREGISTRATION.md

The pre-registration (`8cb235b`) is not edited. Every departure from it is recorded
here, with when and why. Thresholds are never changed.

## 1. How commit failures are counted (found in a smoke run, before the experiment)

**Pre-registered (metric 6):** "Logged exceptions whose cause chain contains
`CommitFailedException`".

**Problem:** spring-kafka 3.1.4 does not log a failed commit. In a smoke run of A
(warm-up 5 s, window 30 s, client logs at INFO and spring-kafka at DEBUG) every batch
ends with `Committing: {bk-in-0=…offset=10}` followed by kafka-clients' INFO line
"Failing OffsetCommit request since the consumer is not part of an active group", then
"Lost previously assigned partitions"; no WARN or ERROR is logged and the committed
offset never moves. The only `CommitFailedException` that reaches the log is the one at
container stop, after the window. Counted as pre-registered, commit failures would be 0
while no commit succeeds.

**Change:** the consumer wrapper that already times `poll()` also records the outcome
of every `commitSync()` call (ok, or the exception class it throws). Commit failures =
`commitSync()` calls in the window that throw `CommitFailedException`
(`RebalanceInProgressException` counted apart). A smoke run with the change: A 6 of 6
commits failed with `CommitFailedException`, committed offset 0 → 0; B 20 of 20 ok.
The log-based count is still computed and reported next to it. Criterion (c)'s
threshold (> 0) is unchanged.
