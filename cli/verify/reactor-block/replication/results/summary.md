# Summary — reactor-block replication

Median [min–max] over the OK repetitions. Generator window by target time; app window [F + 10 s, F + 70 s) on its nanoTime; downstream over the whole run. No absolute latency is quotable (controlled simulation).

## Environment

```
date_utc=2026-10-05T04:37:06Z
commit=98ad478ebb48ddb54cb430b53593e0a5c22bc061
worktree_dirty=no
os=Ubuntu 24.04.4 LTS Linux 6.6.87.2-microsoft-standard-WSL2
cpu=AMD Ryzen 7 5700X 8-Core Processor
cpus=16
mem_total=15Gi
java=openjdk version "21.0.12.1" 2026-08-18 | OpenJDK Runtime Environment (build 21.0.12.1+1-1-24.04.4-Ubuntu)
spring_boot=3.2.5 spring-webflux-6.1.6.jar reactor-core-3.6.5.jar reactor-netty-core-1.1.18.jar reactor-netty-http-1.1.18.jar netty-transport-native-epoll-4.1.109.Final-linux-x86_64.jar tomcat-embed-core-10.1.20.jar
app_props=-Dreactor.netty.ioWorkerCount=4 -Dreactor.schedulers.defaultPoolSize=4 -Dreactor.schedulers.defaultBoundedElasticSize=40 -Dreactor.schedulers.defaultBoundedElasticQueueSize=100000 -Dreactor.netty.pool.maxConnections=500 server.tomcat.threads.max=200 heap=512m
replication_of=../PREREGISTRATION.md (c934bd7)
reps=5 lambdas=10 50 400 variants=A1 A3 B warmup_s=10 window_s=60 probe_rate=5 gen_limit_s=150
clock_step at_s=9.8 step_ms=-1135
clock_step at_s=42.1 step_ms=-1131
clock_preflight seconds=60 steps=2 wall_minus_monotonic_ms=-2267
```

## λ = 10 requests/s

| metric | A1 | A3 | B |
|---|---|---|---|
| OK runs | 5/5 | 5/5 | 5/5 |
| OK | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] |
| 500 | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| 500 ISE_LOOP | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| timeouts | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| OK/s | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 10.00 [10.00–10.00] |
| main p99 | 4 ms [3 ms–4 ms] | 10885 ms [10664 ms–11125 ms] | 208 ms [208 ms–209 ms] |
| /ping p99 | 2 ms [2 ms–3 ms] | 5 ms [3 ms–11125 ms] | 2 ms [2 ms–3 ms] |
| /ping err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel p99 | 3 ms [2 ms–3 ms] | 9 ms [4 ms–11125 ms] | 3 ms [2 ms–3 ms] |
| /ping fresh p99 | 4 ms [3 ms–5 ms] | 9 ms [5 ms–11128 ms] | 4 ms [3 ms–4 ms] |
| /ping fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel fresh p99 | 4 ms [4 ms–5 ms] | 8 ms [5 ms–11127 ms] | 4 ms [4 ms–5 ms] |
| /ping-parallel fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop BG | 0.0 % [0.0 %–0.2 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop FG | 0.0 % [0.0 %–0.0 %] | 50.0 % [50.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop idle | 100.0 % [81.0 %–100.0 %] | 48.1 % [0.0 %–50.0 %] | 99.8 % [92.8 %–100.0 %] |
| loops held max | 0 [0–0] | 2 [2–4] | 0 [0–0] |
| downstream requests (run) | 700 [700–700] | 0 [0–0] | 700 [700–700] |
| downstream p99 | 206 ms [205 ms–209 ms] | n/a | 207 ms [206 ms–207 ms] |
| app CPU | 0.5 % [0.5 %–0.6 %] | 0.3 % [0.0 %–0.3 %] | 0.5 % [0.4 %–0.5 %] |
| max loop CPU | 1.2 % [1.0 %–1.4 %] | 1.3 % [0.0 %–1.5 %] | 1.1 % [0.9 %–1.5 %] |
| GC | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| late >100 ms | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |

## λ = 50 requests/s

| metric | A1 | A3 | B |
|---|---|---|---|
| OK runs | 5/5 | 5/5 | 5/5 |
| OK | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] |
| 500 | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| 500 ISE_LOOP | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| timeouts | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| OK/s | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 50.00 [50.00–50.00] |
| main p99 | 2 ms [2 ms–3 ms] | 10804 ms [10688 ms–10963 ms] | 205 ms [204 ms–205 ms] |
| /ping p99 | 2 ms [2 ms–2 ms] | 10689 ms [4 ms–10963 ms] | 2 ms [1 ms–2 ms] |
| /ping err | 0.0 % [0.0 %–0.0 %] | 100.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel p99 | 2 ms [2 ms–2 ms] | 10689 ms [3 ms–10963 ms] | 2 ms [1 ms–2 ms] |
| /ping fresh p99 | 3 ms [2 ms–3 ms] | 10806 ms [10691 ms–10966 ms] | 3 ms [3 ms–4 ms] |
| /ping fresh err | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel fresh p99 | 3 ms [3 ms–3 ms] | 10806 ms [10691 ms–10966 ms] | 3 ms [2 ms–3 ms] |
| /ping-parallel fresh err | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop BG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop FG | 0.0 % [0.0 %–0.0 %] | 100.0 % [75.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop idle | 97.2 % [95.6 %–100.0 %] | 0.0 % [0.0 %–25.0 %] | 100.0 % [97.6 %–100.0 %] |
| loops held max | 0 [0–0] | 4 [3–4] | 0 [0–0] |
| downstream requests (run) | 3500 [3500–3500] | 0 [0–0] | 3500 [3500–3500] |
| downstream p99 | 203 ms [202 ms–204 ms] | n/a | 203 ms [203 ms–204 ms] |
| app CPU | 1.0 % [0.8 %–1.0 %] | 0.0 % [0.0 %–0.2 %] | 0.9 % [0.8 %–1.0 %] |
| max loop CPU | 1.9 % [1.3 %–2.5 %] | 0.0 % [0.0 %–1.3 %] | 1.8 % [1.2 %–1.9 %] |
| GC | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| late >100 ms | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |

## λ = 400 requests/s

| metric | A1 | A3 | B |
|---|---|---|---|
| OK runs | 5/5 | 5/5 | 5/5 |
| OK | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] |
| 500 | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| 500 ISE_LOOP | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| timeouts | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| OK/s | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 400.00 [400.00–400.00] |
| main p99 | 1 ms [1 ms–1 ms] | 10830 ms [10692 ms–10931 ms] | 202 ms [202 ms–202 ms] |
| /ping p99 | 1 ms [1 ms–1 ms] | 10831 ms [10693 ms–10932 ms] | 1 ms [1 ms–1 ms] |
| /ping err | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel p99 | 1 ms [1 ms–1 ms] | 10831 ms [10693 ms–10932 ms] | 1 ms [1 ms–1 ms] |
| /ping fresh p99 | 2 ms [2 ms–3 ms] | 10833 ms [10695 ms–10934 ms] | 2 ms [2 ms–2 ms] |
| /ping fresh err | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel fresh p99 | 3 ms [2 ms–3 ms] | 10833 ms [10695 ms–10934 ms] | 2 ms [2 ms–2 ms] |
| /ping-parallel fresh err | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop BG | 0.0 % [0.0 %–0.6 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop FG | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop idle | 95.9 % [93.4 %–97.9 %] | 0.0 % [0.0 %–0.0 %] | 96.3 % [94.7 %–98.9 %] |
| loops held max | 0 [0–0] | 4 [4–4] | 0 [0–0] |
| downstream requests (run) | 28000 [27996–28000] | 0 [0–0] | 27999 [27998–28000] |
| downstream p99 | 201 ms [201 ms–202 ms] | n/a | 202 ms [201 ms–202 ms] |
| app CPU | 1.4 % [1.3 %–1.5 %] | 0.0 % [0.0 %–0.0 %] | 1.3 % [1.2 %–1.3 %] |
| max loop CPU | 4.5 % [3.8 %–4.6 %] | 0.0 % [0.0 %–0.0 %] | 4.1 % [3.8 %–4.3 %] |
| GC | 0.1 % [0.1 %–0.1 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| late >100 ms | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |

## Runs

| run | status | stack | app answering after | app stop |
|---|---|---|---|---|
| A1-l10-r1 | OK | netty | yes | term |
| A3-l10-r1 | OK | netty | no | kill |
| B-l10-r1 | OK | netty | yes | term |
| A1-l50-r1 | OK | netty | yes | term |
| A3-l50-r1 | OK | netty | no | kill |
| B-l50-r1 | OK | netty | yes | term |
| A1-l400-r1 | OK | netty | yes | term |
| A3-l400-r1 | OK | netty | no | kill |
| B-l400-r1 | OK | netty | yes | term |
| A1-l10-r2 | OK | netty | yes | term |
| A3-l10-r2 | OK | netty | no | kill |
| B-l10-r2 | OK | netty | yes | term |
| A1-l50-r2 | OK | netty | yes | term |
| A3-l50-r2 | OK | netty | no | kill |
| B-l50-r2 | OK | netty | yes | term |
| A1-l400-r2 | OK | netty | yes | term |
| A3-l400-r2 | OK | netty | no | kill |
| B-l400-r2 | OK | netty | yes | term |
| A1-l10-r3 | OK | netty | yes | term |
| A3-l10-r3 | OK | netty | no | kill |
| B-l10-r3 | OK | netty | yes | term |
| A1-l50-r3 | OK | netty | yes | term |
| A3-l50-r3 | OK | netty | no | kill |
| B-l50-r3 | OK | netty | yes | term |
| A1-l400-r3 | OK | netty | yes | term |
| A3-l400-r3 | OK | netty | no | kill |
| B-l400-r3 | OK | netty | yes | term |
| A1-l10-r4 | OK | netty | yes | term |
| A3-l10-r4 | OK | netty | no | kill |
| B-l10-r4 | OK | netty | yes | term |
| A1-l50-r4 | OK | netty | yes | term |
| A3-l50-r4 | OK | netty | no | kill |
| B-l50-r4 | OK | netty | yes | term |
| A1-l400-r4 | OK | netty | yes | term |
| A3-l400-r4 | OK | netty | no | kill |
| B-l400-r4 | OK | netty | yes | term |
| A1-l10-r5 | OK | netty | yes | term |
| A3-l10-r5 | OK | netty | no | kill |
| B-l10-r5 | OK | netty | yes | term |
| A1-l50-r5 | OK | netty | yes | term |
| A3-l50-r5 | OK | netty | no | kill |
| B-l50-r5 | OK | netty | yes | term |
| A1-l400-r5 | OK | netty | yes | term |
| A3-l400-r5 | OK | netty | no | kill |
| B-l400-r5 | OK | netty | yes | term |
