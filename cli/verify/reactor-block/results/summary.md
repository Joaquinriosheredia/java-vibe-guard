# Summary — reactor-block

Median [min–max] over the OK repetitions of each cell. Window: 60 s after a 10 s warm-up, by target time (OK/s by end time). Not quotable as absolute latencies (controlled simulation, PREREGISTRATION.md).

## Environment

```
date_utc=2026-10-04T17:23:03Z
commit=11c21d0964212de1863402692514fd8f341f3eee
worktree_dirty=no
os=Ubuntu 24.04.4 LTS Linux 6.6.87.2-microsoft-standard-WSL2
cpu=AMD Ryzen 7 5700X 8-Core Processor
cpus=16
mem_total=15Gi
java=openjdk version "21.0.12.1" 2026-08-18 | OpenJDK Runtime Environment (build 21.0.12.1+1-1-24.04.4-Ubuntu)
spring_boot=3.2.5 spring-webflux-6.1.6.jar reactor-core-3.6.5.jar reactor-netty-core-1.1.18.jar reactor-netty-http-1.1.18.jar netty-transport-native-epoll-4.1.109.Final-linux-x86_64.jar tomcat-embed-core-10.1.20.jar
app_props=-Dreactor.netty.ioWorkerCount=4 -Dreactor.schedulers.defaultPoolSize=4 -Dreactor.schedulers.defaultBoundedElasticSize=40 -Dreactor.schedulers.defaultBoundedElasticQueueSize=100000 -Dreactor.netty.pool.maxConnections=500 server.tomcat.threads.max=200 heap=512m
reps=5 lambdas=10 50 400 variants=A1 A2 A3 A4 B C warmup_s=10 window_s=60 probe_rate=5 gen_limit_s=150
```

## λ = 10 requests/s

| metric | A1 | A2 | A3 | A4 | B | C |
|---|---|---|---|---|---|---|
| OK runs | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| OK | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] |
| 500 | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| timeouts | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| OK/s | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 10.00 [10.00–10.00] | 10.00 [10.00–10.00] | 10.00 [10.00–10.00] |
| main p99 | 4 ms [3 ms–7 ms] | 5 ms [4 ms–10 ms] | 11810 ms [11731 ms–12526 ms] | 211 ms [208 ms–212 ms] | 210 ms [209 ms–211 ms] | 211 ms [210 ms–213 ms] |
| /ping p50 | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–10000 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–2 ms] | 1 ms [1 ms–2 ms] |
| /ping p99 | 3 ms [2 ms–5 ms] | 3 ms [2 ms–5 ms] | 3 ms [3 ms–11810 ms] | 2 ms [2 ms–3 ms] | 2 ms [2 ms–4 ms] | 3 ms [2 ms–4 ms] |
| /ping err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel p99 | 3 ms [2 ms–10 ms] | 3 ms [3 ms–7 ms] | 4 ms [3 ms–11810 ms] | 2 ms [2 ms–3 ms] | 2 ms [2 ms–3 ms] | 3 ms [2 ms–4 ms] |
| /ping-parallel err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping fresh p50 | 2 ms [2 ms–2 ms] | 2 ms [2 ms–2 ms] | 2 ms [2 ms–10002 ms] | 2 ms [2 ms–2 ms] | 2 ms [2 ms–2 ms] | 2 ms [2 ms–3 ms] |
| /ping fresh p99 | 5 ms [4 ms–11 ms] | 4 ms [4 ms–13 ms] | 8 ms [4 ms–11813 ms] | 4 ms [3 ms–5 ms] | 4 ms [3 ms–6 ms] | 4 ms [3 ms–5 ms] |
| /ping fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel fresh p99 | 4 ms [4 ms–10 ms] | 4 ms [4 ms–16 ms] | 8 ms [5 ms–11814 ms] | 4 ms [4 ms–6 ms] | 4 ms [4 ms–5 ms] | 4 ms [4 ms–5 ms] |
| /ping-parallel fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop BG | 0.0 % [0.0 %–0.2 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop FG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 50.0 % [50.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop idle | 96.6 % [89.3 %–99.1 %] | 96.6 % [95.8 %–100.0 %] | 50.0 % [0.0 %–50.0 %] | 96.5 % [92.3 %–97.4 %] | 96.6 % [94.5 %–96.6 %] | 96.6 % [96.0 %–97.4 %] |
| parallel BG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| bElastic BG | n/a | n/a | n/a | 48.3 % [38.3 %–51.8 %] | n/a | n/a |
| tomcat BG | n/a | n/a | n/a | n/a | n/a | 19.8 % [19.8 %–20.2 %] |
| ISE loop/req | 97.0 % [97.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| ISE parallel/req | 0.0 % [0.0 %–0.0 %] | 100.0 % [95.7 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| downstream req/s | 9.70 [9.68–10.00] | 10.00 [9.53–10.00] | 0.00 [0.00–0.00] | 9.70 [9.68–10.00] | 10.00 [9.70–10.00] | 9.70 [9.57–10.00] |
| downstream p99 | 206 ms [205 ms–208 ms] | 206 ms [204 ms–209 ms] | n/a | 208 ms [205 ms–210 ms] | 206 ms [205 ms–207 ms] | 207 ms [206 ms–209 ms] |
| app CPU | 0.5 % [0.5 %–0.6 %] | 0.6 % [0.5 %–0.6 %] | 0.3 % [0.0 %–0.3 %] | 0.5 % [0.5 %–0.5 %] | 0.5 % [0.4 %–0.5 %] | 0.5 % [0.5 %–0.6 %] |
| max loop CPU | 1.2 % [1.0 %–2.0 %] | 1.1 % [0.9 %–1.2 %] | 1.3 % [0.0 %–1.6 %] | 1.1 % [1.0 %–1.2 %] | 1.0 % [0.9 %–1.4 %] | 0.4 % [0.3 %–0.4 %] |
| GC | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| late >100 ms | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |

## λ = 50 requests/s

| metric | A1 | A2 | A3 | A4 | B | C |
|---|---|---|---|---|---|---|
| OK runs | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| OK | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] |
| 500 | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| timeouts | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| OK/s | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 50.00 [50.00–50.00] | 50.00 [50.00–50.00] | 50.00 [50.00–50.00] |
| main p99 | 3 ms [2 ms–3 ms] | 3 ms [2 ms–3 ms] | 11808 ms [11750 ms–11851 ms] | 206 ms [205 ms–208 ms] | 206 ms [205 ms–210 ms] | 206 ms [205 ms–207 ms] |
| /ping p50 | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 2 ms [2 ms–10001 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] |
| /ping p99 | 2 ms [1 ms–3 ms] | 2 ms [1 ms–2 ms] | 5 ms [3 ms–11809 ms] | 2 ms [1 ms–2 ms] | 2 ms [1 ms–2 ms] | 2 ms [2 ms–3 ms] |
| /ping err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel p99 | 3 ms [2 ms–5 ms] | 2 ms [2 ms–2 ms] | 5 ms [4 ms–11809 ms] | 2 ms [1 ms–2 ms] | 2 ms [1 ms–2 ms] | 3 ms [2 ms–3 ms] |
| /ping-parallel err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping fresh p50 | 2 ms [2 ms–2 ms] | 2 ms [2 ms–2 ms] | 10002 ms [10001 ms–10002 ms] | 2 ms [2 ms–2 ms] | 2 ms [2 ms–2 ms] | 2 ms [2 ms–2 ms] |
| /ping fresh p99 | 3 ms [3 ms–8 ms] | 3 ms [2 ms–3 ms] | 11812 ms [11753 ms–11854 ms] | 3 ms [2 ms–4 ms] | 3 ms [2 ms–3 ms] | 3 ms [3 ms–4 ms] |
| /ping fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel fresh p99 | 4 ms [3 ms–12 ms] | 3 ms [3 ms–4 ms] | 11812 ms [11754 ms–11854 ms] | 4 ms [3 ms–4 ms] | 3 ms [2 ms–4 ms] | 4 ms [3 ms–5 ms] |
| /ping-parallel fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop BG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop FG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 75.0 % [75.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop idle | 96.6 % [94.7 %–96.6 %] | 96.6 % [95.4 %–96.6 %] | 25.0 % [0.0 %–25.0 %] | 96.0 % [93.2 %–96.6 %] | 95.8 % [93.1 %–96.6 %] | 95.8 % [93.9 %–96.6 %] |
| parallel BG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| bElastic BG | n/a | n/a | n/a | 43.6 % [40.5 %–48.0 %] | n/a | n/a |
| tomcat BG | n/a | n/a | n/a | n/a | n/a | 40.6 % [39.6 %–41.6 %] |
| ISE loop/req | 100.0 % [99.7 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| ISE parallel/req | 0.0 % [0.0 %–0.0 %] | 100.0 % [97.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| downstream req/s | 50.00 [49.87–50.00] | 50.00 [48.50–50.00] | 0.00 [0.00–0.00] | 50.00 [48.50–50.00] | 50.00 [47.92–50.00] | 50.00 [48.48–50.00] |
| downstream p99 | 203 ms [203 ms–205 ms] | 203 ms [202 ms–205 ms] | n/a | 204 ms [203 ms–205 ms] | 204 ms [203 ms–208 ms] | 203 ms [203 ms–204 ms] |
| app CPU | 1.1 % [0.9 %–1.1 %] | 1.1 % [0.9 %–1.2 %] | 0.2 % [0.0 %–0.2 %] | 1.1 % [0.8 %–1.1 %] | 0.9 % [0.8 %–1.0 %] | 1.3 % [1.0 %–1.4 %] |
| max loop CPU | 2.3 % [1.6 %–2.7 %] | 1.4 % [1.3 %–1.9 %] | 1.1 % [0.0 %–1.4 %] | 1.6 % [1.1 %–1.7 %] | 1.8 % [1.2 %–2.1 %] | 0.6 % [0.5 %–0.7 %] |
| GC | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| late >100 ms | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |

## λ = 400 requests/s

| metric | A1 | A2 | A3 | A4 | B | C |
|---|---|---|---|---|---|---|
| OK runs | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| OK | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 5.8 % [4.8 %–7.5 %] | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] |
| 500 | 100.0 % [100.0 %–100.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| timeouts | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 94.2 % [92.5 %–95.2 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| OK/s | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 0.00 [0.00–0.00] | 54.12 [42.78–54.30] | 400.00 [400.00–400.00] | 400.00 [400.00–400.00] |
| main p99 | 1 ms [1 ms–1 ms] | 1 ms [1 ms–2 ms] | 11797 ms [11780 ms–11815 ms] | 11803 ms [11767 ms–11824 ms] | 203 ms [202 ms–203 ms] | 203 ms [202 ms–203 ms] |
| /ping p50 | 1 ms [1 ms–1 ms] | 1 ms [0 ms–1 ms] | 10000 ms [10000 ms–10000 ms] | 1 ms [1 ms–1 ms] | 1 ms [0 ms–1 ms] | 1 ms [1 ms–1 ms] |
| /ping p99 | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 11799 ms [11781 ms–11816 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] |
| /ping err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel p99 | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 11800 ms [11781 ms–11816 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–2 ms] |
| /ping-parallel err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping fresh p50 | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 10002 ms [10002 ms–10002 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] | 1 ms [1 ms–1 ms] |
| /ping fresh p99 | 3 ms [2 ms–3 ms] | 2 ms [2 ms–3 ms] | 11800 ms [11784 ms–11820 ms] | 2 ms [2 ms–3 ms] | 2 ms [2 ms–2 ms] | 3 ms [2 ms–3 ms] |
| /ping fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| /ping-parallel fresh p99 | 3 ms [2 ms–6 ms] | 2 ms [2 ms–4 ms] | 11800 ms [11784 ms–11819 ms] | 2 ms [2 ms–3 ms] | 2 ms [2 ms–3 ms] | 3 ms [3 ms–3 ms] |
| /ping-parallel fresh err | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop BG | 0.2 % [0.0 %–0.4 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop FG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 100.0 % [100.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| loop idle | 93.9 % [88.7 %–98.0 %] | 93.9 % [91.2 %–95.3 %] | 0.0 % [0.0 %–0.0 %] | 94.6 % [92.5 %–97.3 %] | 92.7 % [90.5 %–94.5 %] | 95.9 % [94.3 %–96.6 %] |
| parallel BG | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.9 %] | n/a | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| bElastic BG | n/a | n/a | n/a | 99.9 % [99.9 %–99.9 %] | n/a | n/a |
| tomcat BG | n/a | n/a | n/a | n/a | n/a | 39.5 % [39.3 %–39.8 %] |
| ISE loop/req | 100.0 % [97.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| ISE parallel/req | 0.0 % [0.0 %–0.0 %] | 100.0 % [97.0 %–100.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |
| downstream req/s | 399.97 [387.98–400.00] | 400.00 [387.88–400.00] | 0.00 [0.00–0.00] | 53.48 [45.33–53.72] | 400.00 [399.98–400.00] | 400.00 [388.35–400.00] |
| downstream p99 | 202 ms [202 ms–202 ms] | 202 ms [201 ms–202 ms] | n/a | 202 ms [202 ms–203 ms] | 202 ms [202 ms–202 ms] | 201 ms [201 ms–202 ms] |
| app CPU | 1.5 % [1.4 %–1.6 %] | 1.8 % [1.7 %–2.0 %] | 0.0 % [0.0 %–0.0 %] | 2.5 % [2.4 %–2.9 %] | 1.3 % [1.2 %–1.4 %] | 1.9 % [1.8 %–2.1 %] |
| max loop CPU | 4.6 % [4.0 %–4.9 %] | 3.7 % [3.5 %–3.9 %] | 0.0 % [0.0 %–0.0 %] | 6.4 % [6.2 %–7.1 %] | 4.0 % [3.9 %–4.4 %] | 1.6 % [1.6 %–1.8 %] |
| GC | 0.1 % [0.0 %–0.1 %] | 0.1 % [0.1 %–0.1 %] | 0.0 % [0.0 %–0.0 %] | 0.1 % [0.1 %–0.1 %] | 0.0 % [0.0 %–0.1 %] | 0.1 % [0.0 %–0.1 %] |
| late >100 ms | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] | 0.0 % [0.0 %–0.0 %] |

## Runs

| run | status | stack | app answering after | app stop | downstream stop |
|---|---|---|---|---|---|
| A1-l10-r1 | OK | netty | yes | term | term |
| A2-l10-r1 | OK | netty | yes | term | term |
| A3-l10-r1 | OK | netty | no | kill | term |
| A4-l10-r1 | OK | netty | yes | term | term |
| B-l10-r1 | OK | netty | yes | term | term |
| C-l10-r1 | OK | tomcat | yes | term | term |
| A1-l50-r1 | OK | netty | yes | term | term |
| A2-l50-r1 | OK | netty | yes | term | term |
| A3-l50-r1 | OK | netty | no | kill | term |
| A4-l50-r1 | OK | netty | yes | term | term |
| B-l50-r1 | OK | netty | yes | term | term |
| C-l50-r1 | OK | tomcat | yes | term | term |
| A1-l400-r1 | OK | netty | yes | term | term |
| A2-l400-r1 | OK | netty | yes | term | term |
| A3-l400-r1 | OK | netty | no | kill | term |
| A4-l400-r1 | OK | netty | yes | term | term |
| B-l400-r1 | OK | netty | yes | term | term |
| C-l400-r1 | OK | tomcat | yes | term | term |
| A1-l10-r2 | OK | netty | yes | term | term |
| A2-l10-r2 | OK | netty | yes | term | term |
| A3-l10-r2 | OK | netty | no | kill | term |
| A4-l10-r2 | OK | netty | yes | term | term |
| B-l10-r2 | OK | netty | yes | term | term |
| C-l10-r2 | OK | tomcat | yes | term | term |
| A1-l50-r2 | OK | netty | yes | term | term |
| A2-l50-r2 | OK | netty | yes | term | term |
| A3-l50-r2 | OK | netty | no | kill | term |
| A4-l50-r2 | OK | netty | yes | term | term |
| B-l50-r2 | OK | netty | yes | term | term |
| C-l50-r2 | OK | tomcat | yes | term | term |
| A1-l400-r2 | OK | netty | yes | term | term |
| A2-l400-r2 | OK | netty | yes | term | term |
| A3-l400-r2 | OK | netty | no | kill | term |
| A4-l400-r2 | OK | netty | yes | term | term |
| B-l400-r2 | OK | netty | yes | term | term |
| C-l400-r2 | OK | tomcat | yes | term | term |
| A1-l10-r3 | OK | netty | yes | term | term |
| A2-l10-r3 | OK | netty | yes | term | term |
| A3-l10-r3 | OK | netty | no | kill | term |
| A4-l10-r3 | OK | netty | yes | term | term |
| B-l10-r3 | OK | netty | yes | term | term |
| C-l10-r3 | OK | tomcat | yes | term | term |
| A1-l50-r3 | OK | netty | yes | term | term |
| A2-l50-r3 | OK | netty | yes | term | term |
| A3-l50-r3 | OK | netty | no | kill | term |
| A4-l50-r3 | OK | netty | yes | term | term |
| B-l50-r3 | OK | netty | yes | term | term |
| C-l50-r3 | OK | tomcat | yes | term | term |
| A1-l400-r3 | OK | netty | yes | term | term |
| A2-l400-r3 | OK | netty | yes | term | term |
| A3-l400-r3 | OK | netty | no | kill | term |
| A4-l400-r3 | OK | netty | yes | term | term |
| B-l400-r3 | OK | netty | yes | term | term |
| C-l400-r3 | OK | tomcat | yes | term | term |
| A1-l10-r4 | OK | netty | yes | term | term |
| A2-l10-r4 | OK | netty | yes | term | term |
| A3-l10-r4 | OK | netty | no | kill | term |
| A4-l10-r4 | OK | netty | yes | term | term |
| B-l10-r4 | OK | netty | yes | term | term |
| C-l10-r4 | OK | tomcat | yes | term | term |
| A1-l50-r4 | OK | netty | yes | term | term |
| A2-l50-r4 | OK | netty | yes | term | term |
| A3-l50-r4 | OK | netty | no | kill | term |
| A4-l50-r4 | OK | netty | yes | term | term |
| B-l50-r4 | OK | netty | yes | term | term |
| C-l50-r4 | OK | tomcat | yes | term | term |
| A1-l400-r4 | OK | netty | yes | term | term |
| A2-l400-r4 | OK | netty | yes | term | term |
| A3-l400-r4 | OK | netty | no | kill | term |
| A4-l400-r4 | OK | netty | yes | term | term |
| B-l400-r4 | OK | netty | yes | term | term |
| C-l400-r4 | OK | tomcat | yes | term | term |
| A1-l10-r5 | OK | netty | yes | term | term |
| A2-l10-r5 | OK | netty | yes | term | term |
| A3-l10-r5 | OK | netty | no | kill | term |
| A4-l10-r5 | OK | netty | yes | term | term |
| B-l10-r5 | OK | netty | yes | term | term |
| C-l10-r5 | OK | tomcat | yes | term | term |
| A1-l50-r5 | OK | netty | yes | term | term |
| A2-l50-r5 | OK | netty | yes | term | term |
| A3-l50-r5 | OK | netty | no | kill | term |
| A4-l50-r5 | OK | netty | yes | term | term |
| B-l50-r5 | OK | netty | yes | term | term |
| C-l50-r5 | OK | tomcat | yes | term | term |
| A1-l400-r5 | OK | netty | yes | term | term |
| A2-l400-r5 | OK | netty | yes | term | term |
| A3-l400-r5 | OK | netty | no | kill | term |
| A4-l400-r5 | OK | netty | yes | term | term |
| B-l400-r5 | OK | netty | yes | term | term |
| C-l400-r5 | OK | tomcat | yes | term | term |
