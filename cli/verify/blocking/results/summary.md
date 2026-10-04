# blocking — results by variant and rate

Median (min – max) over repetitions. Raw data: `results/raw/`.

```
date_utc=2026-10-04T03:37:42Z
commit=1e97ba044dcf8acd7b2636bbdc759df4c638b262
worktree_dirty=no
os=Linux 6.6.87.2-microsoft-standard-WSL2
cpu=AMD Ryzen 7 5700X 8-Core Processor
cpus=16
mem_total=15Gi
java=openjdk version "21.0.12.1" 2026-08-18
spring_boot=3.2.5
reps=5 rates=20 36 60 120 warmup_s=5 window_s=30
```

## A at 20 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 19.9 (19.9 – 19.9) |
| p50 (ms) | 200.3 (200.2 – 200.3) |
| p99 (ms) | 200.5 (200.4 – 200.6) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.1 % (0.0 % – 0.1 %) |
| In-flight = pool | 0.0 % (0.0 % – 0.0 %) |
| Stacks in join() | 49.8 % (49.8 % – 49.8 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## A at 36 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – -0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 35.9 (35.9 – 35.9) |
| p50 (ms) | 200.2 (200.2 – 200.2) |
| p99 (ms) | 200.4 (200.4 – 200.5) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.0 % (0.0 % – 0.0 %) |
| In-flight = pool | 20.0 % (20.0 % – 20.3 %) |
| Stacks in join() | 99.8 % (99.8 % – 99.8 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## A at 60 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 20.03 (20.03 – 20.03) |
| Queue (median) | 398 (398 – 399) |
| Completions/s | 39.9 (39.9 – 39.9) |
| p50 (ms) | 10200.5 (10197.6 – 10209.8) |
| p99 (ms) | 17582.1 (17581.5 – 17587.5) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 98.0 % (98.0 % – 98.0 %) |
| In-flight = pool | 100.0 % (100.0 % – 100.0 %) |
| Stacks in join() | 100.0 % (100.0 % – 100.0 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## A at 120 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 80.00 (79.99 – 80.01) |
| Queue (median) | 1594 (1594 – 1595) |
| Completions/s | 40.0 (40.0 – 40.0) |
| p50 (ms) | 40166.8 (40164.9 – 40171.7) |
| p99 (ms) | 69642.7 (69640.5 – 69652.4) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 99.5 % (99.5 % – 99.5 %) |
| In-flight = pool | 100.0 % (100.0 % – 100.0 %) |
| Stacks in join() | 100.0 % (100.0 % – 100.0 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## B at 20 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 19.9 (19.9 – 19.9) |
| p50 (ms) | 200.2 (200.2 – 200.3) |
| p99 (ms) | 200.5 (200.4 – 200.5) |
| Execution p50 (ms) | 200.1 (200.1 – 200.1) |
| Queue wait share | 0.1 % (0.0 % – 0.1 %) |
| In-flight = pool | 0.0 % (0.0 % – 0.0 %) |
| Stacks in join() | 0.0 % (0.0 % – 0.0 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## B at 36 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 35.9 (35.9 – 35.9) |
| p50 (ms) | 200.2 (200.2 – 200.2) |
| p99 (ms) | 200.4 (200.3 – 200.6) |
| Execution p50 (ms) | 200.1 (200.1 – 200.1) |
| Queue wait share | 0.0 % (0.0 % – 0.1 %) |
| In-flight = pool | 20.0 % (20.0 % – 20.0 %) |
| Stacks in join() | 0.0 % (0.0 % – 0.0 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## B at 60 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – -0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 59.8 (59.8 – 59.8) |
| p50 (ms) | 200.2 (200.2 – 200.2) |
| p99 (ms) | 200.3 (200.3 – 200.4) |
| Execution p50 (ms) | 200.1 (200.1 – 200.1) |
| Queue wait share | 0.0 % (0.0 % – 0.0 %) |
| In-flight = pool | 0.0 % (0.0 % – 0.0 %) |
| Stacks in join() | 0.0 % (0.0 % – 0.0 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.2 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## B at 120 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 119.6 (119.6 – 119.6) |
| p50 (ms) | 200.2 (200.2 – 200.2) |
| p99 (ms) | 200.2 (200.2 – 200.3) |
| Execution p50 (ms) | 200.1 (200.1 – 200.1) |
| Queue wait share | 0.0 % (0.0 % – 0.0 %) |
| In-flight = pool | 0.0 % (0.0 % – 0.0 %) |
| Stacks in join() | 0.0 % (0.0 % – 0.0 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.2 % (0.2 % – 0.3 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## B0 at 60 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 20.03 (20.03 – 20.04) |
| Queue (median) | 398 (398 – 399) |
| Completions/s | 39.9 (39.9 – 39.9) |
| p50 (ms) | 10200.2 (10197.7 – 10206.9) |
| p99 (ms) | 17582.1 (17581.4 – 17587.2) |
| Execution p50 (ms) | 200.1 (200.1 – 200.1) |
| Queue wait share | 98.0 % (98.0 % – 98.0 %) |
| In-flight = pool | 100.0 % (99.7 % – 100.0 %) |
| Stacks in join() | 0.0 % (0.0 % – 0.0 %) |
| Stacks in interceptor get() | 100.0 % (100.0 % – 100.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## B0 at 120 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 80.00 (79.99 – 80.00) |
| Queue (median) | 1594 (1594 – 1594) |
| Completions/s | 40.0 (40.0 – 40.0) |
| p50 (ms) | 40164.1 (40162.6 – 40201.3) |
| p99 (ms) | 69641.1 (69638.6 – 69693.8) |
| Execution p50 (ms) | 200.1 (200.1 – 200.2) |
| Queue wait share | 99.5 % (99.5 % – 99.5 %) |
| In-flight = pool | 100.0 % (100.0 % – 100.0 %) |
| Stacks in join() | 0.0 % (0.0 % – 0.0 %) |
| Stacks in interceptor get() | 100.0 % (100.0 % – 100.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## C at 20 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 19.9 (19.9 – 19.9) |
| p50 (ms) | 200.3 (200.2 – 200.3) |
| p99 (ms) | 200.5 (200.4 – 201.4) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.1 % (0.0 % – 0.1 %) |
| In-flight = pool | 0.0 % (0.0 % – 0.0 %) |
| Stacks in join() | 24.9 % (24.9 % – 24.9 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## C at 36 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 35.9 (35.9 – 35.9) |
| p50 (ms) | 200.2 (200.2 – 200.3) |
| p99 (ms) | 200.4 (200.4 – 200.7) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.0 % (0.0 % – 0.1 %) |
| In-flight = pool | 0.0 % (0.0 % – 0.0 %) |
| Stacks in join() | 49.9 % (49.9 % – 49.9 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## C at 60 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 59.8 (59.8 – 59.8) |
| p50 (ms) | 200.2 (200.2 – 200.2) |
| p99 (ms) | 200.3 (200.3 – 200.4) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.0 % (0.0 % – 0.0 %) |
| In-flight = pool | 0.0 % (0.0 % – 0.0 %) |
| Stacks in join() | 74.9 % (74.9 % – 74.9 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.1 % (0.1 % – 0.2 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## C at 120 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 40.06 (40.05 – 40.07) |
| Queue (median) | 798 (797 – 798) |
| Completions/s | 79.8 (79.8 – 79.8) |
| p50 (ms) | 10200.7 (10197.0 – 10207.3) |
| p99 (ms) | 17579.2 (17579.1 – 17582.6) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 98.0 % (98.0 % – 98.0 %) |
| In-flight = pool | 100.0 % (99.7 % – 100.0 %) |
| Stacks in join() | 100.0 % (100.0 % – 100.0 %) |
| Stacks in interceptor get() | 0.0 % (0.0 % – 0.0 %) |
| Process CPU | 0.2 % (0.2 % – 0.2 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## D at 20 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | 0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 19.9 (19.9 – 19.9) |
| p50 (ms) | 200.3 (200.3 – 200.3) |
| p99 (ms) | 200.7 (200.6 – 200.8) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.1 % (0.1 % – 0.1 %) |
| In-flight = pool | — |
| Stacks in join() | — |
| Stacks in interceptor get() | — |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## D at 36 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 35.9 (35.9 – 35.9) |
| p50 (ms) | 200.2 (200.2 – 200.3) |
| p99 (ms) | 200.5 (200.4 – 200.7) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.0 % (0.0 % – 0.1 %) |
| In-flight = pool | — |
| Stacks in join() | — |
| Stacks in interceptor get() | — |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## D at 60 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 59.8 (59.8 – 59.8) |
| p50 (ms) | 200.2 (200.2 – 200.2) |
| p99 (ms) | 200.4 (200.3 – 200.5) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.0 % (0.0 % – 0.0 %) |
| In-flight = pool | — |
| Stacks in join() | — |
| Stacks in interceptor get() | — |
| Process CPU | 0.1 % (0.1 % – 0.1 %) |
| GC share | 0.00 % (0.00 % – 0.00 %) |

## D at 120 tasks/s (n=5)

| Metric | Value |
|---|---|
| Queue slope (tasks/s) | -0.00 (-0.00 – 0.00) |
| Queue (median) | 0 (0 – 0) |
| Completions/s | 119.6 (119.6 – 119.6) |
| p50 (ms) | 200.2 (200.2 – 200.2) |
| p99 (ms) | 200.3 (200.3 – 200.5) |
| Execution p50 (ms) | 200.2 (200.2 – 200.2) |
| Queue wait share | 0.0 % (0.0 % – 0.0 %) |
| In-flight = pool | — |
| Stacks in join() | — |
| Stacks in interceptor get() | — |
| Process CPU | 0.3 % (0.2 % – 0.3 %) |
| GC share | 0.02 % (0.02 % – 0.02 %) |

