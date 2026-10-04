# Deviations from PREREGISTRATION.md

The pre-registration (`51fde79`, 2026-10-04 19:03:39 +02:00) is not edited. Every departure
from it is recorded here, with the original text, the new one, what was observed and when.
Thresholds are never changed. `evaluate.py` was committed with the harness in `6967d3a`
(19:08:31), before any run; its later changes are listed here too.

Smoke runs (harness validation, never evidence) are kept in `smoke/` with their raw data,
so every observation below can be checked. None of their data are pooled with the 90 runs.

| Smoke run | Time (+02:00) | What | Window |
|---|---|---|---|
| `smoke/raw1` | 19:08:40–19:10:03 | A1, A3, B, C at λ = 50 | 5 s warm-up + 10 s |
| `smoke/raw2` | 19:13:18–19:15:54 | all six variants at λ = 50 | 5 + 10 s |
| `smoke/raw3-timeout` | 19:18:16–19:19:03 | B, A3 at λ = 10, generator limit lowered to 12 s | 5 + 10 s |
| `smoke/raw4` | 19:19:18–19:22:02 | all six variants at λ = 400 | 5 + 10 s |

## 1. Reactive runs were served by Tomcat (harness bug, found in smoke run 1)

**Pre-registered (Setup):** "The web stack is selected by property:
`spring.main.web-application-type=reactive` (Netty) for A1–A4 and B, and `servlet`
(Tomcat) for C."

**Observed (smoke run 1, 19:08:40–19:10:03):**
- A1 and A3 answered **200** to every request;
- the thread samples of the reactive runs contained Tomcat workers (`http-nio-8080-exec-*`)
  in `BLOCKING_GET`.

Starting the app by hand with `--spring.main.web-application-type=reactive` logged "Tomcat
started on port 8080". The property did select a reactive context, but with both starters on
the classpath, Spring Boot 3.2.5's `ReactiveWebServerFactoryConfiguration` imports
`EmbeddedTomcat` before `EmbeddedNetty`, so WebFlux ran on Tomcat. The downstream ran on
Tomcat too.

**Change:** `NettyServerConfig` declares the `NettyReactiveWebServerFactory` bean for reactive
contexts. It is the bean Boot's `EmbeddedNetty` would create: same `ReactorResourceFactory`
(the global loops the WebClient also uses) and same customizers. The property still selects
the stack, as pre-registered.

Checked by hand after the change: reactive → "Netty started on port 8080", servlet → "Tomcat
started on port 8080", downstream → "Netty started on port 8081".

`evaluate.py` gains a **stack check** per run: Tomcat samples present → `tomcat`, event-loop
samples only → `netty`. The criteria report any run served by the wrong server. No criterion
or threshold changes.

**Smoke run 1's data are invalid for any purpose** (wrong server) and are kept only as the
record of the bug.

## 2. Fresh-connection probes added (design change, found in smoke run 2)

**Pre-registered (Setup, Metrics 4, criteria (b), (d3), (e)):** two probes, `/ping` and
`/ping-parallel`, 5 requests/s each, on their own `HttpClient`, separate from the main
traffic. That client keeps its connections alive, so after the first probe request each
probe reuses a connection opened before the load.

**Observed (smoke run 2, A3 at λ = 50, 19:14:04–19:14:48):**
- every main request timed out (750/750);
- 3 of the 4 event loops were in `FUTURE_GET` from the first second to the end;
- the fourth loop stayed `IDLE`, and **both probes answered every request (p99 ≤ 67 ms)**.

The probes' keep-alive connections had landed on the loop that never received a main
request. Once 3 loops were held, the server stopped accepting connections, so no new
connection could reach the free loop. After the run, the harness's own `curl /ping` (a new
connection) did not answer within 2 s (`app_responsive_after = no`).

As pre-registered, the probe therefore measures "an already-open connection that happens to
sit on a free loop". It does not measure "new work that blocks nothing", and which loop the
probe lands on is a matter of chance in each run.

**New, added:** two more probes, `/ping` and `/ping-parallel` on a **fresh connection per
request**: a new `HttpClient` per request, closed afterwards. They also run at 5 requests/s
each, offset by a quarter of a period from the pre-registered ones.

`evaluate.py` evaluates **every** probe criterion twice:
- with the pre-registered keep-alive probes. **This evaluation decides the verdicts and the
  consequences, as pre-registered**;
- with the fresh-connection probes, same thresholds, in a second section of
  `results/criteria.md` marked "reported, NOT deciding".

The choice of which one decides was made before the 90 runs, here. The conservative choice
is to keep the frozen one: a change made after seeing a smoke run must not be able to turn
a result into H1.

**Side effect, stated:** 10 more requests/s on every run (opening a connection each), for
every variant alike. The main traffic is unchanged.

**Also seen in the smoke runs, not a change:** A3 at λ = 10 (`smoke/raw3-timeout`) still
answered the harness's `curl` after the run; at λ = 50 and 400 it did not.

## 3. Generator time limit can be lowered (harness only, for smoke run 3)

**Pre-registered (Harness timeout):** generator hard limit 150 s per run.

**Change:** `run-experiment.sh` reads `GEN_LIMIT_S` (default **150**), so the timeout path
could be exercised. In smoke run 3, with the limit at 12 s:
- both runs were killed (`rc = 124`) and recorded as `TIMEOUT`;
- A3's app needed `SIGKILL`;
- the next run started normally;
- no JVM or port was left behind.

The 90 runs use the default, 150 s.

## Harness checks from the smoke runs (no change needed)

From `smoke/raw4` (λ = 400):
- no request sent > 100 ms late;
- downstream p99 201–205 ms;
- app CPU ≤ 6 % and every event loop ≤ 8.1 % of one CPU;
- `IllegalStateException`s recorded with the thread named in Reactor's message;
- `evaluate.py` runs end to end on the raw data.

Within the window, idle event loops are classified `IDLE`. The `OTHER` seen after the
window are threads shutting down.

## 4. Cross-process clock divergence (found after the results; reported, NOT deciding)

**Pre-registered (Metrics, "Window"):** samples, exceptions and CPU use their own timestamps
against the same interval [t₀ + 10 s, t₀ + 70 s). They are taken with each JVM's wall
clock, while the generator's times are its own monotonic clock (`nanoTime`) anchored to
its wall clock at t₀.

**Observed (after the 90 runs, 2026-10-04, ~21:20):**
- **A1, λ = 10:** (d1) not met, with an ISE/requests ratio of 97.0 % (582/600 in 3 of 5
  repetitions). Yet every main request of every A1 and A2 run returned 500, and the app
  recorded one `IllegalStateException` for each, naming a thread of the right pool:
  700/700, 3,500/3,500 and 28,000/28,000.
- **The shortfall is a misaligned window, not missing exceptions.** In every A1 and A2
  run, the app's exceptions span 2.7–5.6 s less wall-clock time than the generator's sends
  span in monotonic time (median about 3.7 s over ~70 s). When the two clocks disagree at
  t₀ + 10 s, the window's last seconds fall after the app's last exception.
- **The host's wall clock is stepped by WSL2's time sync.** Measured after the runs: one
  10 s interval advanced 8.275 s by `time.time()` and 10.029 s by `time.monotonic()`.

**Affected metrics:** only metrics that compare one JVM's timestamps with another's
window:
- the ISE count in (d1), sensitive at λ = 10, where 18 requests are 3 %;
- the window placement of the thread samples (the classes are steady through each run, so
  the shares are unaffected);
- the downstream window. f2 uses the downstream's own clock for its latencies, so it is
  unaffected.

Per-request outcomes, latencies, throughput and lateness are all generator-side, on one
clock, and are unaffected.

**Added to `evaluate.py`** (after the results): (d1-run), the same ≥ 99 % thresholds over
**every** main request of the run, which needs no alignment between clocks. The result, in
the third section of `results/criteria.md`:
- A1 and A2 meet it at every λ, with 100.0 % in every repetition;
- A3 does not (0 %).

**The pre-registered (d1) still decides.** A1's verdict stays "fits neither", and
consequence 1 covers only A2's thread context (PREREGISTRATION.md, Outcome 1). Whether to
extend the correction to the event loop on (d1-run) is for Joaquín to decide.
