# Changelog

## Unreleased

- **`blocking` evidence is now measured for `@Async`.** Pre-registered experiment
  (`cli/verify/blocking/`, design committed before any run, all criteria met): on
  Spring Boot's default `@Async` executor (8 platform threads, unbounded queue) a call
  that holds the thread caps throughput at threads / call duration (39.9–40.0 tasks/s
  with 8 threads, 79.8 with 16); above that the queue grows at (load − capacity). With
  virtual threads enabled the executor did not saturate. `@Scheduled` and
  `@EventListener` keep "documented mechanism". The evidence lines of a `blocking`
  finding change accordingly; detection and severity do not.
- **`blocking-kafka` evidence is now measured.** Pre-registered experiment
  (`cli/verify/blocking-kafka/`, design committed before any run, all criteria met):
  - the damage appears only when max.poll.records × time per record >
    max.poll.interval.ms, which with the defaults (500 records, 300 s) means more than
    600 ms per record;
  - above that threshold, in an accelerated setup (max.poll.interval.ms lowered to
    10 s), the group entered a reprocessing loop: 0 records/s committed, each record
    delivered ~10 times;
  - below it, the same blocking call caused no measured damage.

  Measured on kafka-clients 3.6.2, the classic protocol with eager rebalancing, and
  AckMode BATCH; the cooperative protocol and KIP-848 were not measured. The evidence
  lines of a `blocking-kafka` finding change accordingly; detection and severity do
  not.
- **`blocking` is WARNING instead of CRITICAL for `@Async` when the module enables
  virtual threads.** This applies only when the module's base `application.properties`
  or `application.yml` sets `spring.threads.virtual.enabled=true` and no profile or
  other config file sets it otherwise. The finding says why and cites the measured
  evidence (verify/blocking variant D: with virtual threads the default `@Async`
  executor did not saturate). Anything not determinable stays CRITICAL: the key only
  in a profile, a placeholder, `false`, absent, or no module root. `@Scheduled`,
  `@EventListener` and `blocking-kafka` are unchanged. A project whose only critical
  findings were such `@Async` calls now exits 0.
- New test (`evidence.test.js`): measured evidence must cite a source pinned to a commit
  with a line range; for this repository, the file and lines must exist at that commit.

## 2.0.0

First npm release since 1.0.3 (2026-06-12). npm 1.0.3 was published from an
older commit than the repo's own `1.0.3`: it lacked `--verify`,
`--format sarif`, `--explain`, `--baseline` and the `reactor-block` and
`kafka-send-timeout` rules. 2.0.0 is the repo's current state, published as
one version on both channels (npm `2.0.0`, Action `@v2` / `@v2.0.0`).

### Breaking — may turn a green CI red (why this is a major)

- **Two new CRITICAL rules run by default:** `reactor-block` (`.block()`,
  `.blockFirst()`, `.blockLast()`, `.toFuture().get()` in a Spring bean that
  imports Reactor) and `kafka-send-timeout` (`.send(...).get()` with no
  timeout). Projects pinned to `^1.0.3` or Action `@v1` keep 1.x behavior;
  stay there until you are ready, or suppress per finding.
- **`blocking` changed how it detects `.get()`.** 1.0.3 flagged any `.get()`
  inside an async method, including `Optional.get()`/`Map.get()` (#5).
  2.0.0 flags `.get()` only on receivers the same file declares with a
  `Future`, `CompletableFuture`, `ListenableFuture` (and similar) type, plus
  `CompletableFuture.xxxAsync(...).get()` chains. Timed
  `get(timeout, unit)` calls are not flagged. Net effect: fewer findings on
  non-Future `.get()`; Future `.get()` calls declared in another file are no
  longer detected (known gap: no cross-file type resolution).

### Added (already in the repo since 1.0.3, first time on npm)

- `--format sarif` (SARIF 2.1.0), `--explain <rule>`, `--baseline`, `--verbose`.
- `--verify VIBE-001`: reproduces connection-pool starvation in a bundled
  Spring Boot app against a Postgres container. Requires Docker 24+,
  Java 17+ and Maven on PATH.
- Rules `reactor-block` and `kafka-send-timeout` (see Breaking).

### Changed

- `testcontainers-doctor` is now a dependency (pinned to `1.0.0`: `--verify`
  parses its output text) — no global install needed.
- `--verify` runs only the doctor's `docker` and `java` checks (in parallel,
  60 s timeout). A full doctor run includes network checks (Docker Hub DNS,
  image pull) that could exceed the old 15 s timeout on slow networks and
  abort with a misleading "could not be run"; a timeout is now reported as such.
- `--verify` runs the bundled app from a temp copy, so it works from a
  read-only install and leaves no build output in the package.
- The npm package ships only `bin/`, `src/`, `verify/` and `README.md`
  (1.0.3 also shipped tests and fixtures).
- MCP server version aligned to 2.0.0 (jar attached to the GitHub release).

### Fixed

- The same `Mono.block()` was reported twice (`blocking` and `reactor-block`)
  when inside an `@Async` method of a Spring bean. Only `reactor-block` is
  reported now; other blocking calls on that line still are.
- **Evidence lines no longer cite figures from other mechanisms.** 1.x printed,
  under `blocking`, "Lab #04 — throughput -74%, p99 +18.2s, pool exhausted after
  13.9s" (figures that exist in no Java-Production-Labs result file) and, under
  `blocking-kafka`, "Lab #08 — 60% request failure rate" (Lab 08 has no
  `@KafkaListener`; that benchmark measured a blocking producer `send().get()`).
  Each rule now cites only evidence that measures its own mechanism; rules
  without one say "documented mechanism, no benchmark of our own". Lab 05 and
  Lab 08 are cited under `kafka-send-timeout`, the mechanism they measured
  (both runs predate the fixes that added timeouts), with links pinned to the
  result commit. Evidence now lives in `rule-catalog.js`.
- One blocking call inside a method with several anchors (e.g. `@Async` +
  `@Scheduled`) was reported once per anchor. It is now one finding per
  (location, rule, call), naming every anchor:
  `Thread.sleep() detected in method annotated @Async, @Scheduled`.
  Single-anchor messages are unchanged, so existing baselines still match.
- `--help` listed 6 of the 8 rule ids for `--rule`.
- `--explain blocking` described the rule inaccurately (only `@Async`,
  "blocking I/O"); it now states the real anchors, calls and the
  `Future.get()` matching and its limits.
- The npm README (`cli/README.md`) described 1.0.x: it now documents
  `--verify` and its requirements, SARIF, `--explain`, `--baseline`, all 8
  rule ids and the `Future.get()` behavior.
- Three CLI test suites were failing unnoticed because `npm test` ran only
  `contract.test.js`; it now runs every suite, and CI smoke-tests the packed
  tarball installed in a clean project (including a real `--verify`).

### Known issues

- **MCP server — duplicate CRITICAL on one call:** a single `future.get()` in a
  `@Transactional` method is reported twice on the same line, as VIBE-001
  (`TransactionalAsyncRule`) and VIBE-005 (`ConnectionPoolStarvationRule`).
  The CLI's equivalent overlap (`blocking` + `reactor-block`) is fixed in 2.0.0;
  the MCP one is not yet.
- `blocking` does not detect `Future.get()` on a Future declared in another file
  (see Breaking).

## CLI stabilization

Stabilized the CLI engine (Layer 2 / GitHub Action) before starting
work on adoption features (suppressions, baseline, SARIF).

- Added fixture-by-fixture regression tests (cli/test/contract.test.js,
  Test 5) — each of the 10 existing fixtures in cli/test-fixtures/ is
  now individually asserted against its expected finding count.
- Fixed `transactions` rule flagging `@Async` inside comments
  (#6, commit `6cf3cb6`). Root cause: context window matching searched
  literal text without stripping comments first. Implementation bug,
  scope unchanged.
- Narrowed `blocking` rule scope by design (#5, commit `7a18298`).
  Removed generic `.get()` detection — cannot reliably distinguish
  blocking `Future.get()`/`CompletableFuture.get()` from non-blocking
  `Optional.get()`, `Map.get()`, etc. without receiver type resolution,
  which this regex-based engine doesn't have. Trade-off: direct
  `Future.get()`/`CompletableFuture.get()` calls (not via `.join()`)
  are no longer flagged. Documented as input for the pending CLI/MCP
  architecture decision.
- Corrected the Layer 2 / Layer 3 capability matrix in README.md to
  reflect actual rule coverage per engine (cli vs mcp-server).
- Opened #4 tracking validation figures in README.md ("17,137 files",
  "0 false positives") that are not currently reproducible from
  versioned artifacts in the repo.
- Changed finding `location` from bare filename to project-relative
  path in all 5 rules (commit `4286808`). Two files with the same
  basename in different directories (e.g. `module-a/OrderService.java`
  and `module-b/OrderService.java`) previously produced identical
  `location` strings.
- Fixed a reproducible false negative in `deduplicate()`: findings from
  same-named files in different directories (e.g. `OrderService.java`
  in `module-a/` and `module-b/`) could collide on the same dedup key
  (`basename:line|message`), silently dropping one real finding. Both
  findings now surface correctly. (commit `4286808`)

This concludes the CLI stabilization phase. Subsequent work focuses
on adoption features (CLI suppressions, baseline, SARIF and explain).

## New rule: kafka-send-timeout

Added a new CLI rule (Layer 2) covering an anti-pattern not caught by
any existing rule: a Kafka producer `send()` consumed with an
unbounded blocking `.get()`.

- New rule `kafka-send-timeout`, severity `critical`. Detects
  `<kafkaTemplate>.send(...).get()` with no timeout argument, gated to
  files that import `KafkaTemplate` or `org.springframework.kafka` —
  same scope-gate reasoning used elsewhere in this regex-based engine
  (without it, an unrelated `EmailService.send(msg).get()` or HTTP
  client `.send(req).get()` would also match).
- Evidence: Java-Production-Labs bugs #2 and #3 —
  `SagaOrderService.java:45` (commit `01cee18`, Lab 05 Saga Pattern)
  and `StreamController.java:53` (commit `dcb0358`, Lab 08 Kafka
  Streams), both fixed by switching to `.get(timeout, TimeUnit)`.
  Lab 08's benchmark (already cited in README's VIBE-006 section)
  measured a 60% request failure rate under this exact pattern during
  a simulated broker outage.
- Accepted false negatives, same class of limitation already
  documented for `blocking`'s `Future.get()` handling: `.send()` and
  `.get()` split across multiple lines, and `.get()` reached through
  an intermediate `Future<X>` variable, are not detected — both would
  require receiver-type resolution this engine doesn't have.
- Registered in `RULE_CATALOG` and `RULES` (`scanner.js`), bringing
  the CLI to 7 total rule ids (was 6: `blocking`, `blocking-kafka`,
  `kafka`, `layers`, `observability`, `transactions`). All downstream
  consumers — `--explain`, `--rule` validation, SARIF output,
  suppression grammar, and their docs — updated to the same 7-id list.

## New rule: reactor-block

Added a new CLI rule (Layer 2), a faithful port of the MCP server's
VIBE-002 (`ReactorBlockingCallRule.java`) — closing the gap the
Found-in-the-Wild investigation identified: `blocking.js` only detects
blocking calls anchored to `@Scheduled`/`@Async`/`@EventListener`/
`@KafkaListener`, and never fires on a `.block()` inside an
unannotated reactive method chain.

- New rule `reactor-block`, severity `critical`. Detects `.block()`,
  `.blockFirst()`, `.blockLast()`, or `.toFuture().get()` inside a
  class annotated `@RestController`, `@Service`, or `@Component`,
  excluding `@Test`, `@PostConstruct`, and `main()` methods — same
  class/method anchoring as VIBE-002, ported using a brace-depth state
  machine (`cli/src/rules/reactor-block.js`) instead of `blocking.js`'s
  fixed-line-window approach, because the class-level anchor must stay
  in scope across every method in the class, not just a window after
  the annotation.
- One deliberate difference from the MCP original: gated on the file
  importing `reactor.core.publisher` (explicit or wildcard), checked
  once before the class/method tracking begins. Without it, a
  `.block()`/`.blockFirst()`/`.blockLast()` call on some unrelated,
  non-Reactor API inside any `@Service`/`@RestController`/`@Component`
  would also match — a false-positive class the single-file MCP tool
  call didn't have to guard against.
- Evidence: README's "Found in the Wild" Finding 2 —
  `FileContentSearchService.java` (`eugenp/tutorials`,
  `spring-reactive-modules`), `.block()` inside `.map()` on a
  `Schedulers.parallel()` worker, with none of `blocking.js`'s four
  anchor annotations present.
- Accepted false negatives, same class of limitation already
  documented for other rules in this regex-based engine: Reactor used
  via a static import or a bare `Publisher<T>` type with no direct
  `reactor.core.publisher` import; and VIBE-002's own pre-existing
  limitation around nested lambdas/private methods not tracked by the
  brace-depth counter.
- Registered in `RULE_CATALOG` and `RULES` (`scanner.js`), bringing
  the CLI to 8 total rule ids (was 7). All downstream consumers —
  `--explain`, `--rule` validation, SARIF output, suppression grammar,
  and their docs — updated to the same 8-id list.
