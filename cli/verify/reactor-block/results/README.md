# reactor-block — results

Pre-registered experiment (`../PREREGISTRATION.md`, `51fde79`). 90 runs, 2026-10-04,
17:23–19:20 UTC, at commit `11c21d0` (clean worktree). Every run's status is `OK`.

- `criteria.md` — every criterion met / not met with its figures, in three sections:
  1. the pre-registered evaluation, which **decides**;
  2. the same criteria on the fresh-connection probes (DEVIATIONS.md, 2), not deciding;
  3. (d1) over the whole run, without cross-process clock alignment (DEVIATIONS.md, 4),
     not deciding.
- `summary.md` — per variant and λ: median [min–max] over 5 repetitions, environment and
  run table.
- `raw/` — per run: generator requests (`*.gen.json.gz`), app samples and exceptions
  (`*.app.jsonl.gz`), downstream timings, logs; `runs.jsonl` (status of every run),
  `env.txt`, `precondition.json`.

Reproduce: `./run-experiment.sh` (about 2 h), or only the evaluation: `python3 evaluate.py`.

## Verdicts (pre-registered evaluation)

| Variant | Pattern | Predicted | Verdict |
|---|---|---|---|
| A1 | `.block()` in a WebFlux handler (event loop) | H2 | **fits neither**. H2 failed only on (d1) at λ = 10: 97.0 % < 99 %, a clock artifact (DEVIATIONS.md, 4). Without it, 100 % in every run |
| A2 | `.block()` in `.map()` after `subscribeOn(parallel())` (Finding 2 shape) | H2 | **H2 confirmed**: fails fast with `IllegalStateException` |
| A3 | `.toFuture().get()` in a WebFlux handler (event loop) | H1 | **fits neither — partial retention**: see below |
| A4 | `fromCallable(.. .block()).subscribeOn(boundedElastic())` | no Reactor stall | Reactor criterion **met**; saturation of `boundedElastic` at λ = 400 (S1, S2) **met** |
| B | no blocking (control) | — | **met** at every λ |
| C | A1's code on MVC (Tomcat) | no Reactor stall | **met** at every λ |

**(0) and (f) were met for every cell.**

## What was measured

**A2: `.block()` on a `Schedulers.parallel()` worker.**
- 100 % of requests answer HTTP 500 at λ = 10, 50 and 400, each with an
  `IllegalStateException` ("block()/blockFirst()/blockLast() are blocking, which is not
  supported in thread parallel-N").
- 0–0.9 % of the workers' samples are inside `blockingGet`.
- The probe on the same workers answers with p99 ≤ 3 ms.

The call does not hold the thread: it fails on every request, at any load.

**A1: `.block()` on the event loop.** Same picture:
- 100 % HTTP 500 with the ISE naming `reactor-http-epoll-N`;
- 0–0.4 % of the loops' samples inside `blockingGet`;
- probe p99 ≤ 3 ms.

The pre-registered window count gave 97.0 % at λ = 10 because of the clock divergence
(DEVIATIONS.md, 4), so the pre-registered verdict is "fits neither".

**A3: `.toFuture().get()` on the event loop.**
- In all 15 runs (λ = 10, 50, 400): 0 successful responses and 100 % of main requests
  timed out at 10 s. The downstream received no request in the window.
- After every A3 run, the app did not answer a new connection, and it needed `SIGKILL` to
  stop.
- In each run a **fixed number of event loops was held** inside `CompletableFuture.get`
  from the start of the window to its end:
  - λ = 10: 2, 2, 4, 2, 2;
  - λ = 50: 3, 4, 3, 4, 3;
  - λ = 400: 4 in every repetition.
- With 4 held, both probes failed 100 %. With 2 or 3 held, probes on keep-alive
  connections that sat on a free loop kept answering (p99 ≤ 5 ms).
- Fresh-connection probes failed 100 % in every run at λ = 50 and 400, and in the λ = 10
  run with 4 loops held. In the four λ = 10 runs with 2 loops held, they answered.

Pre-registered criterion (a) needs ≥ 90 % of loop samples held at λ = 50. The median was
75 % (3 of 4 loops held in 3 of 5 repetitions), so (a) and therefore H1 are not met. The
keep-alive probe also kept answering in those repetitions, so (b) at λ = 50 is not met
either. The A3 class from (c) is **deadlock** (0 OK and ≥ 90 % timeouts in every
repetition). No main request ever completed.

**A4 and C.**
- Neither stalls any Reactor thread: 0 % of event-loop or `parallel` samples in
  `blockingGet`, probes p99 ≤ 3 ms at every λ.
- A4 runs out of `boundedElastic` threads at λ = 400, as predicted for a bounded pool:
  99.9 % of its samples in `blockingGet`, 54 successful responses/s (cap 200/s), 94 % of
  requests timed out.
- C holds Tomcat workers (20–41 % of their samples) and stays at 100 % success.

## Limits

- Controlled simulation: the downstream is a 200 ms timer. No absolute latency is
  quotable.
- 4 event loops, 4 `parallel` workers and 40 `boundedElastic` threads, set explicitly.
- Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18 (native epoll), Netty
  4.1.109, Tomcat 10.1.20, OpenJDK 21.0.12.1, Ubuntu 24.04.4 on WSL2. Nothing is
  generalised beyond these.
- The WebClient shares the server's loops (Boot's default). With its own `LoopResources`,
  A3 would not be measured here.
