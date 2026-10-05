# reactor-block replication — results

Pre-registered replication (`../PREREGISTRATION.md` in this directory, `f606904`;
instrument and evaluator at `98ad478`, before any run). 45 runs on 2026-10-05, from
04:37 UTC, at `98ad478` with a clean worktree. Every run's status is `OK`.

Smoke run: `smoke/raw1`, A1, A3 and B at λ = 50, short window. It validated the harness
only and changed nothing, so there are no deviations. Clock preflight before the batch: 2
wall-clock steps in 60 s (−2.27 s). The stepping regime was active, which is why every
deciding criterion uses a single clock (`AUDITORIA-RELOJ.md` in vibe-guard).

- `criteria.md` — every criterion with its figures, and the verdicts.
- `summary.md` — per variant and λ: median [min–max] over 5 repetitions.
- `raw/` — per run; `runs.jsonl`, `env.txt`, `precondition.json`.

## Verdicts

**A1: H2 confirmed.** `.block()` in a WebFlux handler, on the event loop:
- 100 % of the window's main requests are HTTP 500 whose body names
  `IllegalStateException` on a `reactor-http-*` thread, in every repetition at 10, 50
  and 400 requests/s. This is counted on the generator alone;
- 0–0.6 % of event-loop samples are in `blockingGet`;
- keep-alive `/ping` median p99 1–2 ms.

The call does not hold the event loop: it fails on every request.

**A3: H3 confirmed.** `.toFuture().get()` in a WebFlux handler, with the WebClient on the
server's event loops (Spring Boot's default):
- **H3a:** in all 15 runs, **0 successful responses**; 100 % of the main requests timed
  out (request or connect timeout, 10 s).
- **H3b:** in all 15 runs, the downstream received **0** requests. The call never leaves
  the app.
- **H3c:** in 3 of 15 runs (the pre-registered minimum was 3; all three at λ = 10), only
  2 of the 4 event loops were held for the whole window, and both fresh-connection
  probes answered 100 % with p99 ≤ 9 ms. Meanwhile every A3 request deadlocked.
- Held loops per run:
  - λ = 10: 4, 2, 2, 2, 4;
  - λ = 50: 3, 4, 3, 4, 4;
  - λ = 400: 4 in every repetition.
- When all 4 loops are held, everything else stops too: both probes fail 100 %.

(0), (e)-B and (f) met everywhere.

## Limits

The same as the first experiment:
- controlled simulation;
- Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18, OpenJDK 21.0.12.1, WSL2;
- the WebClient on the shared default loops. A WebClient with its own `LoopResources`
  was not measured.

H3c was met at its threshold, not above it: whether a run ends with free loops depends
on where connections land.
