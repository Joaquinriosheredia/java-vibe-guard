# blocking-kafka — experiment results

- Design and frozen thresholds: [`../PREREGISTRATION.md`](../PREREGISTRATION.md) (commit `8cb235b`, pushed before any experiment code).
- Deviations: [`../DEVIATIONS.md`](../DEVIATIONS.md) (1: commit failures counted at `commitSync()`, because spring-kafka does not log them; no threshold changed).
- Criteria, met / not met with figures: [`criteria.md`](criteria.md). All variants: [`summary.md`](summary.md).
- Raw data (one JSON per run: every poll, delivery, commit and rebalance event, group state and committed offsets every 1 s, CPU, GC), the broker log per run (gzipped), the app log per run, and the environment: `raw/`.
- Run: commit `1852bfc`, clean tree, 2026-10-04, AMD Ryzen 7 5700X (16 threads), WSL2, Docker 29.1.3, Java 21.0.12, Spring Boot 3.2.5, spring-kafka 3.1.4, kafka-clients 3.6.2, broker `confluentinc/cp-kafka:7.6.0`. 6 variants × 5 repetitions (30 runs), a fresh JVM and broker per run. `evaluate.py` committed (`359156a`) before any result was seen.

## The threshold, in general form

The damage appears when the time between two `poll()` calls exceeds `max.poll.interval.ms`. With a backlog every poll returns a full batch, so that time is **max.poll.records × time per record**, and the condition is

**max.poll.records × time per record > max.poll.interval.ms**

With the Kafka defaults (500 records, 300 s) that is **more than 600 ms per record**. This experiment lowers `max.poll.interval.ms` to 10 s (30 s in D) so that a run takes minutes: it is an **accelerated version** of the same inequality. Figures are given as T / M.

## Outcome

**All pre-registered criteria (0) and (a)–(g) are met, and (h) is met.**

- The measured time between polls is R × b in every variant (A 15.0 s, B 5.0 s, C 1.5 s, D 15.0 s, E− 9.0 s, E+ 11.0 s).
- **Only when T > M is there damage.** E− (T/M = 0.9) and E+ (1.1) run the same listener and differ by 0.2 s per record; E− has 0 rebalances and 2.17 records/s committed, E+ 22–23 rebalances and 0.
- **Not any blocking call.** The same 1.5 s block per record does no harm with a batch of 1 (C, 1.32 records/s) or with M = 30 s (D, 1.33 records/s). In both, the throughput is the theoretical 2 / b.
- **Causal chain (A).** 100 % of the window's rebalances are a member leaving with "consumer poll timeout has expired", or that consumer rejoining. Each of the 97 leaves comes from a consumer whose poll had been open 1.002–1.004 × M. There are 0 heartbeat (session-timeout) expirations.
- **Reprocessing loop (A and E+).** Every commit after an over-long batch fails with `CommitFailedException` (A 80 of 80, E+ 110 of 110), and the committed offset never moves in the 120 s window: effective throughput **0 records/s**, against 1.33 for D doing the same work. The same batch is redelivered again and again. In A each delivered record is delivered 10 times in the run, and 100 % of the window's deliveries are duplicates; in E+ it is 13 times. The group is out of `Stable` 40 of 120 s in A.
- CPU (0.1 %) and GC (0 ms) are negligible, and the broker logs no ERROR or FATAL.

## Limits — what these figures do not say

- `max.poll.interval.ms` is lowered on purpose; the result is the inequality and the T/M ratios, not the 10 s.
- It is a controlled simulation: the downstream call is a timer. No absolute latency is quotable.
- Measured with spring-kafka's defaults: AckMode BATCH, eager rebalancing (range assignor), dynamic membership, platform-thread listeners. AckMode RECORD (which commits after each record and could make partial progress), cooperative rebalancing, static membership (`group.instance.id`) and virtual-thread listeners are not measured.
- The total loop (0 records/s) depends on every batch taking longer than M. A workload where only some batches exceed M would lose part of its throughput, not all; that was not measured.
- The client metric `time-between-poll-max` agrees with the wrapper's measurement (A 15.02 s, E+ 11.02 s, D 15.01 s).
