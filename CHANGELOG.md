# Changelog

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
