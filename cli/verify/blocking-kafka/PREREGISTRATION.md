# Pre-registration — `blocking-kafka` rule experiment

Committed **before** any experiment code exists or any run is made (Phase 2; design
approved 2026-10-04 with adjustments: effective-throughput criterion, reprocessing-loop
check, general form of the threshold). After this commit the thresholds below are
frozen. If one turns out to be badly posed, it is reported as a **deviation** in
`DEVIATIONS.md`, next to the original text; it is never rewritten here.

## Question

The CLI rule `blocking-kafka` flags `Thread.sleep()`, `.join()`, `.block*()` and
`Future.get()` inside `@KafkaListener` methods. Its stated mechanism (`rule-catalog.js`):
*a blocking call delays the consumer's next `poll()`; past `max.poll.interval.ms` the
group coordinator considers the consumer dead and rebalances the group*.

Does a blocking call inside a `@KafkaListener` cause rebalances, redelivered records
and lost throughput **because the time between two `poll()` calls exceeds
`max.poll.interval.ms`**, and only then — not for any blocking call?

Notation:
- **M** = `max.poll.interval.ms`.
- **R** = `max.poll.records`.
- **b** = time the listener blocks per record.
- **T** = time between two consecutive `poll()` calls of one consumer. With a backlog,
  every poll returns a full batch, so the prediction is **T ≈ R × b**.

General form of the threshold under test: **R × b > M**. With the Kafka defaults
(R = 500, M = 300 s) that is **b > 600 ms per record**. This experiment lowers M to
10 s so that a run takes minutes: it is an **accelerated version** of the same
inequality, and its figures are expressed as T / M.

## Setup

- Spring Boot **3.2.5** app (spring-kafka and kafka-clients at the versions Boot 3.2.5
  manages), Java 21, no HTTP layer and no database.
- Broker: `confluentinc/cp-kafka:7.6.0` (Kafka 3.6) through Testcontainers, **a fresh
  broker per run**, single node.
- Topic with **6 partitions**, replication factor 1. Before the consumers start, a
  backlog of **3,000 records** (500 per partition) is produced and flushed. Each
  record's value is a unique id. No records are produced during the run, so lag is
  end offset − committed offset.
- One `@KafkaListener` (record listener) with **concurrency 2**: one consumer group
  with 2 consumers, each on its own thread. Range assignor (the kafka-clients default),
  so 3 partitions per consumer.
- Listener threads are **platform threads** (`spring.threads.virtual.enabled=false`),
  so this experiment is separate from the virtual-thread effect seen in Lab 05.
- Offsets: spring-kafka defaults — `enable.auto.commit=false` and **AckMode BATCH**
  (the offsets of a poll are committed after the whole batch is processed, before the
  next poll). `session.timeout.ms` and `heartbeat.interval.ms` are left at their
  defaults (45 s and 3 s), so a consumer that blocks keeps heartbeating.
- The blocking call: the listener calls a simulated downstream that returns a
  `CompletableFuture` completed after **b** by a separate scheduler, and waits for it
  with `.join()`, the call the rule detects. **The listener code is identical in all
  variants**; only b, R and M change, through configuration.

## Variants

| Id | b | R | M | Predicted T | T / M |
|---|---|---|---|---|---|
| **A** (pattern above the threshold) | 1.5 s | 10 | 10 s | 15 s | 1.5 |
| **B** (control: shorter block) | 0.5 s | 10 | 10 s | 5 s | 0.5 |
| **C** (control: batch of 1) | 1.5 s | 1 | 10 s | 1.5 s | 0.15 |
| **D** (control: higher M) | 1.5 s | 10 | 30 s | 15 s | 0.5 |
| **E−** (just below) | 0.9 s | 10 | 10 s | 9 s | 0.9 |
| **E+** (just above) | 1.1 s | 10 | 10 s | 11 s | 1.1 |

Theoretical committed throughput if no rebalance happens: **2 / b** records/s
(2 consumers, one record at a time each). A 1.33, B 4.00, C 1.33, D 1.33, E− 2.22,
E+ 1.82.

## Run protocol

- t0 = the listener container starts. **20 s warm-up** (not measured), then a
  **120 s measurement window**, then the run stops.
- **5 repetitions** per variant; a fresh JVM and a fresh broker per run. Repetitions
  outermost and variants interleaved, so drift affects every variant alike.
- Before the runs: the CLI is run with `--rule blocking-kafka` on the listener source.

## Metrics

1. **Time between polls.** Each consumer is wrapped (spring-kafka consumer
   post-processor) so that every `poll()` call is recorded: consumer, start, end,
   records returned. T = start of a poll − start of that consumer's previous poll
   (the definition of the client's own `time-between-poll` metric). The client metric
   `time-between-poll-max` is read at the end of the run as a cross-check (reported,
   not a criterion).
2. **Rebalances.** Every broker `Preparing to rebalance group` log line with its time.
   Rebalances in the window are classified by the reason the broker logs:
   - **LEAVE_POLL_TIMEOUT:** a member leaves with client reason "consumer poll timeout
     has expired";
   - **REJOIN:** a member of a consumer joins after that same consumer left by
     LEAVE_POLL_TIMEOUT (attributed by client id);
   - **HEARTBEAT_EXPIRATION:** a member removed on heartbeat expiration (session
     timeout);
   - **OTHER:** anything else.

   Also recorded on the client: `ConsumerRebalanceListener` events (revoked, assigned,
   lost) with their time, and the client's "consumer poll timeout has expired"
   warnings.
3. **Group state.** `AdminClient.describeConsumerGroups` every 1 s. Reported: seconds
   of the window with the group not `Stable`.
4. **Committed offsets.** `AdminClient.listConsumerGroupOffsets` every 1 s; the sum
   over the 6 partitions.
5. **Deliveries.** Every listener invocation: id, partition, offset, consumer, start,
   end. A **duplicate** is a delivery of an id that had already been delivered earlier
   in the run (warm-up included).
6. **Commit failures.** Logged exceptions whose cause chain contains
   `CommitFailedException` (and, counted apart, `RebalanceInProgressException`).
7. **Other bottlenecks.** Process CPU of the app JVM (`OperatingSystemMXBean`, share
   of all CPUs), GC time (`GarbageCollectorMXBean`), broker log lines at `ERROR` or
   `FATAL`, and whether the broker container was still running at the end.
8. Environment and commit, per experiment.

Derived:
- **Effective throughput** = (committed-offset sum at the end of the window − at the
  start) / 120 s: unique records with a committed offset per second.
- **Reprocessing loop** (per repetition): the committed-offset sum does not advance
  for **≥ 60 consecutive seconds** of the window while records are still being
  delivered in that period.
- **Redelivery:** deliveries per id (median and max over ids delivered in the window)
  and the share of the window's deliveries that are duplicates.

## Pre-registered criteria

Evaluated on the **median of the 5 repetitions**, unless "every repetition" is stated.

**(0) Precondition:** the CLI reports the listener's `.join()` as `blocking-kafka`.

**(a) Cause.**
- A and E+: the maximum T in the window > M in every repetition.
- B, C, D and E−: the maximum T in the window < M (of that variant) in every
  repetition.

**(b) Causal chain, A.**
- ≥ 90 % of the window's rebalances are LEAVE_POLL_TIMEOUT or REJOIN.
- 0 HEARTBEAT_EXPIRATION in every repetition.
- Every LEAVE_POLL_TIMEOUT comes from a consumer whose poll in progress at that moment
  had started ≥ 0.95 × M earlier.

**(c) Consequence, A.** ≥ 3 rebalances in the window, duplicates > 0 and commit
failures > 0.

**(d) Controls.** B, C and D: 0 rebalances in the window and 0 duplicates, in every
repetition.

**(e) Sharp threshold.** E−: 0 rebalances in the window in every repetition. E+: ≥ 1
rebalance in the window in every repetition.

**(f) No other cause.** All variants: the broker container still running at the end,
0 broker `ERROR`/`FATAL` lines, app process CPU < 50 % and GC < 1 % of the window.

**(g) Effective throughput.**
- **g1, controls at capacity:** B 3.40–4.60, C 1.13–1.53, D 1.13–1.53 and E− 1.89–2.56
  records/s (2 / b ± 15 %).
- **g2, damage:** A ≤ 50 % of D (same work per record, only M differs), and E+ ≤ 50 %
  of E−.

**(h) Reprocessing loop** (decides the wording, see Outcome).
- A in a reprocessing loop in ≥ 4 of 5 repetitions, and A's effective throughput
  ≤ 10 % of D's.
- No repetition of B, C, D or E− in a reprocessing loop.
- Reported in any case: deliveries per id (median, max) and the duplicate share, for
  A and E+.

## Outcome

- **Measured evidence:** (0) and (a)–(g) all met. The rule's `evidence` then points to
  the versioned results, pinned to a commit. Its text says that the measured damage
  appears **when T > M** (R × b > max.poll.interval.ms), **not for any blocking call**,
  states the threshold in its general form with the defaults' equivalent (500 records,
  300 s → 600 ms per record), and presents the M = 10 s setup as an accelerated
  version.
  - If (h) is met, the text may say that A enters a reprocessing loop (the same batch
    redelivered without the committed offset advancing), with the redelivery figures.
  - If (h) is not met, the text gives the measured throughput loss only, without the
    word "loop".
- **Stays "documented mechanism":** (0) or any of (a)–(g) not met. The results are
  still published, with which criterion failed and its figures.

## Limits stated in the results

- M is lowered on purpose; figures are given as T / M and in the general form.
- No absolute latency is quotable.
- AckMode RECORD, cooperative rebalancing, static membership (`group.instance.id`) and
  virtual-thread listeners are not measured.
