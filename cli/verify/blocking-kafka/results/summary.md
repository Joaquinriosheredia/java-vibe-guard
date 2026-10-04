# blocking-kafka — summary

Threshold under test, general form: **max.poll.records × time per record > max.poll.interval.ms** (R × b > M). With the Kafka defaults (500 records, 300 s) that is **600 ms per record**. This setup lowers M to 10 s (30 s in D) as an **accelerated version** of the same inequality; figures are given as T / M. No absolute latency is quotable.

Median (min – max) over repetitions; window 120 s after a 20 s warm-up.

| Variant | b | R | M | R × b / M | max T / M | rebalances | LEAVE / REJOIN / HB / OTHER (sum) | duplicates | commits ok / failed (sum) | group not Stable (s) | effective throughput (rec/s) | theoretical 2/b | loop reps | deliveries per id (median / max) | duplicate share | CPU | GC | client time-between-poll-max (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 1.5 s | 10 | 10 s | 1.50 | 1.50 (1.50 – 1.50) | 18 (16 – 20) | 40 / 50 / 0 / 0 | 160 (158 – 160) | 0 / 80 | 40 (40 – 40) | 0.00 (0.00 – 0.00) | 1.33 | 5/5 | 10.0 (10.0 – 10.0) / 10 (10 – 10) | 100.0 % (100.0 % – 100.0 %) | 0.1 % (0.0 % – 0.1 %) | 0.0 % (0.0 % – 0.0 %) | 15.02 (15.02 – 15.02) |
| B | 0.5 s | 10 | 10 s | 0.50 | 0.50 (0.50 – 0.50) | 0 (0 – 0) | 0 / 0 / 0 / 0 | 0 (0 – 0) | 240 / 0 | 0 (0 – 0) | 4.00 (4.00 – 4.00) | 4.00 | 0/5 | 1.0 (1.0 – 1.0) / 1 (1 – 1) | 0.0 % (0.0 % – 0.0 %) | 0.1 % (0.1 % – 0.1 %) | 0.0 % (0.0 % – 0.0 %) | 5.01 (5.01 – 5.01) |
| C | 1.5 s | 1 | 10 s | 0.15 | 0.15 (0.15 – 0.15) | 0 (0 – 0) | 0 / 0 / 0 / 0 | 0 (0 – 0) | 790 / 0 | 0 (0 – 0) | 1.32 (1.32 – 1.32) | 1.33 | 0/5 | 1.0 (1.0 – 1.0) / 1 (1 – 1) | 0.0 % (0.0 % – 0.0 %) | 0.1 % (0.1 % – 0.1 %) | 0.0 % (0.0 % – 0.0 %) | 1.50 (1.50 – 1.50) |
| D | 1.5 s | 10 | 30 s | 0.50 | 0.50 (0.50 – 0.50) | 0 (0 – 0) | 0 / 0 / 0 / 0 | 0 (0 – 0) | 80 / 0 | 0 (0 – 0) | 1.33 (1.33 – 1.33) | 1.33 | 0/5 | 1.0 (1.0 – 1.0) / 1 (1 – 1) | 0.0 % (0.0 % – 0.0 %) | 0.1 % (0.0 % – 0.1 %) | 0.0 % (0.0 % – 0.0 %) | 15.01 (15.01 – 15.01) |
| E- | 0.9 s | 10 | 10 s | 0.90 | 0.90 (0.90 – 0.90) | 0 (0 – 0) | 0 / 0 / 0 / 0 | 0 (0 – 0) | 130 / 0 | 0 (0 – 0) | 2.17 (2.17 – 2.17) | 2.22 | 0/5 | 1.0 (1.0 – 1.0) / 1 (1 – 1) | 0.0 % (0.0 % – 0.0 %) | 0.1 % (0.1 % – 0.1 %) | 0.0 % (0.0 % – 0.0 %) | 9.01 (9.01 – 9.01) |
| E+ | 1.1 s | 10 | 10 s | 1.10 | 1.10 (1.10 – 1.10) | 23 (22 – 23) | 55 / 58 / 0 / 0 | 218 (218 – 218) | 0 / 110 | 11 (11 – 11) | 0.00 (0.00 – 0.00) | 1.82 | 5/5 | 13.0 (13.0 – 13.0) / 13 (13 – 13) | 100.0 % (100.0 % – 100.0 %) | 0.1 % (0.1 % – 0.1 %) | 0.0 % (0.0 % – 0.0 %) | 11.02 (11.02 – 11.02) |

Environment:

```
date_utc=2026-10-04T07:16:31Z
commit=1852bfcd71f3a1dda1196e28a49d44e385d19311
worktree_dirty=no
os=Linux 6.6.87.2-microsoft-standard-WSL2
cpu=AMD Ryzen 7 5700X 8-Core Processor
cpus=16
mem_total=15Gi
java=openjdk version "21.0.12.1" 2026-08-18
docker=29.1.3
spring_boot=3.2.5 spring_kafka=spring-kafka-3.1.4.jar kafka_clients=kafka-clients-3.6.2.jar
broker_image=confluentinc/cp-kafka:7.6.0
reps=5 warmup_s=20 window_s=120
```
