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
