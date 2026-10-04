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

## 2. Criterion (b) reworded between the approved design and the pre-registration

**Original criterion (approved design, 2026-10-04):** "at least 90 % of A's rebalances
are preceded, by less than 5 s, by a member leaving the group because its poll timeout
expired, from a member whose time between polls exceeded M. None is attributed to
`session.timeout`."

**New criterion (pre-registration `8cb235b`):** ≥ 90 % of the window's rebalances are
LEAVE_POLL_TIMEOUT or REJOIN, classified by the reason the broker logs; 0
HEARTBEAT_EXPIRATION in every repetition; every LEAVE_POLL_TIMEOUT from a consumer whose
poll in progress had started ≥ 0.95 × M earlier.

**What was known and when.** The rewording was made while writing the pre-registration,
committed at 09:07:50 (+02:00) on 2026-10-04, before any experiment code existed. The
first smoke run started around 09:11 (its output is timestamped 09:12:14). The reason
was a prediction from the design, not an observation: after a poll-timeout leave the
consumer finishes its batch and rejoins about T − M later, which in A is 15 − 10 = 5 s,
exactly the edge of the 5 s window. It was recorded in DECISIONS.md at the time
(`3d31364`, 09:08:10). It still changed a criterion of the approved design without a
new approval, so it is recorded here as a deviation, as requested on 2026-10-04.

**Original criterion evaluated** (after the results, on the same versioned raw data,
no new runs; `evaluate.py` reports it in `results/criteria.md` and `results/summary.md`,
outside the outcome):
- **Met:** 100 % of A's window rebalances in every repetition (20/20, 18/18, 16/16,
  18/18, 18/18); 0 heartbeat expirations.
- **By a margin of milliseconds:** the 50 rebalances not started by the leave itself
  (the rejoins) come 4.978–4.999 s after the leave (median 4.993 s), 1–22 ms inside the
  5 s window. The delay is T − M by construction, so on a slightly slower run the
  original wording would have failed with the same mechanism. The pre-registered
  wording does not depend on that delay.
