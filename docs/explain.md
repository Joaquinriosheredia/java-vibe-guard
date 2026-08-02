# `--explain` Contract

Normative specification for the `--explain <rule>` command, as accepted by
the java-vibe-guard **CLI**. This document is the contract an
implementation must satisfy — it is written before `cli/src/rule-catalog.js`
and the `--explain` wiring exist, specifically so both can be built against
a fixed spec instead of ad hoc behavior. Same role for `--explain` that
`docs/suppression-grammar.md` plays for inline suppression, `docs/baseline.md`
plays for the baseline comparator, and `docs/sarif.md` plays for SARIF
output.

## 1. Purpose

`--explain <rule>` prints curated, human-readable information about a
single rule id — what it detects, why it matters, what severity it
produces — **without scanning any project**. It takes no `path` argument,
touches no filesystem beyond loading its own catalog module, and runs no
rule check function. It exists so a developer (or CI log reader) who sees
`kafka` or `blocking-kafka` in a finding can look up what that rule id
means without opening source code.

## 2. Data source — `cli/src/rule-catalog.js`

The catalog lives in a new shared module, `cli/src/rule-catalog.js`,
extracted **verbatim** from the `RULE_DESCRIPTIONS` object currently
defined inline in `cli/src/sarif.js:40-65`. `sarif.js` is updated to
`import` from this module instead of defining the object locally — the
text content itself does not change, only where it lives. This gives
`--explain` and the SARIF writer (`buildRules`, `docs/sarif.md` §6) a
single shared source for `short`/`full` rule text: one object, two
consumers, zero duplicated copies.

**Correction carried over from `sarif.js`**: the comment currently at
`cli/src/sarif.js:37-39` claims this content "mirrors... the README's
'Why These Rules Exist' prose." That is not true — that README section
(`README.md:80-153`) documents the MCP server's `VIBE-001`–`VIBE-007`
Java rules, an entirely different id space that does not correspond 1:1
with the CLI's rule ids. The content in the catalog was authored ad hoc
by reading each rule's implementation in `cli/src/rules/*.js`, not
extracted from any existing document. The comment on the new
`rule-catalog.js` module must say this plainly — no README attribution,
no implied external source that doesn't actually exist.

**New field this document introduces — `severities`.** The existing
`short`/`full` fields are carried over unchanged, but neither captures
severity, and §4 below requires representing it without fabricating a
single false value for rules that aren't single-severity. `rule-catalog.js`
therefore adds one field per entry:

```js
{
  blocking:            { short, full, severities: ['critical'] },
  'blocking-kafka':    { short, full, severities: ['critical'] },
  kafka:               { short, full, severities: ['warning'] },
  'kafka-send-timeout': { short, full, severities: ['critical'] },
  layers:              { short, full, severities: ['major'] },
  observability:       { short, full, severities: ['warning'] },
  'reactor-block':     { short, full, severities: ['critical'] },
  transactions:        { short, full, severities: ['critical', 'major'] },
}
```

`severities` is a manually curated array (same authoring method as
`short`/`full` — read the rule's source, not derived at runtime from a
scan), ordered highest-severity-first using the same rank already
established in `reporter.js`'s `SEVERITY_ORDER` / `sarif.js`'s
`SEVERITY_RANK` (`critical` > `major` > `warning` > `info`). It lists
every distinct severity that rule id's `findings.push(...)` call sites in
`cli/src/rules/*.js` can produce:

- `blocking` / `blocking-kafka`: always `critical`
  (`cli/src/rules/blocking.js:49`, same literal for both rule ids).
- `kafka`: always `warning` (`cli/src/rules/kafka.js:22,51,62,80`, all four
  call sites).
- `kafka-send-timeout`: always `critical` (`cli/src/rules/kafka.js:154`,
  single call site). New rule — evidence: Java-Production-Labs
  `SagaOrderService.java:45` (commit `01cee18`) and
  `StreamController.java:53` (commit `dcb0358`), both a
  `.send(...).get()` chain with no timeout, blocking the calling thread
  indefinitely under broker slowness/unavailability.
- `layers`: always `major` (`cli/src/rules/layers.js:28,38`).
- `observability`: always `warning` (`cli/src/rules/observability.js:54`).
- `reactor-block`: always `critical` (`cli/src/rules/reactor-block.js`, two
  `findings.push(...)` call sites, both `critical`). New rule — faithful CLI
  port of the MCP server's VIBE-002 (`ReactorBlockingCallRule.java`), gated
  additionally on a `reactor.core.publisher` import (not present in the
  Java original). Evidence: README.md "Found in the Wild" Finding 2,
  `FileContentSearchService.java` (`eugenp/tutorials`) — a `.block()` call
  with none of `blocking.js`'s four anchor annotations
  (`@Scheduled`/`@Async`/`@EventListener`/`@KafkaListener`) present.
- `transactions`: **both** `critical` and `major`
  (`cli/src/rules/transactions.js:23-24` emits `major`, `:35-36` emits
  `critical`) — the only mixed-severity rule id today.

This is hand-maintained, not auto-derived: if a future change to
`cli/src/rules/*.js` adds or removes a severity for some rule id, this
array must be updated by hand in the same change — nothing enforces the
two staying in sync automatically (same caution already applied to the
duplicated env var block in `action.yml`, for the same underlying reason:
no mechanism ties two independently-maintained locations together).

## 3. Valid rule ids

The eight real values that appear in `finding.rule` across
`cli/src/rules/*.js`, in the canonical order already established in
`docs/suppression-grammar.md`:

```
blocking, blocking-kafka, kafka, kafka-send-timeout, layers, observability, reactor-block, transactions
```

`RULES` (`cli/src/scanner.js:29-40`) — the array of detector functions —
now has 7 entries, one per rule-check function (`kafka-send-timeout` and
`reactor-block` each got their own detector, `checkKafkaSendTimeout` and
`checkReactorBlock`, unlike `blocking-kafka` below); that is still unrelated
to id *validation*. `--rule`'s unknown-rule check (`cli/src/scanner.js:76`)
derives its valid-id list from `RULE_CATALOG` the same way `--explain` does
(`VALID_RULE_IDS = Object.keys(RULE_CATALOG)`, mirroring `explain.js`'s
`RULE_IDS`), so both flags now validate against the same 8-id list.
`blocking-kafka` has no detector of its own — `checkBlocking()`
emits both `blocking` and `blocking-kafka` findings from one pass — so
`--rule blocking-kafka` executes `checkBlocking()` via an explicit alias
and then narrows the result to `finding.rule === 'blocking-kafka'` in a
post-filter (issue #7, fixed).

## 4. Output format

Printed to stdout, in this fixed field order, for a single matched rule id:

1. The rule id itself, verbatim (e.g. `kafka`).
2. `Severity: <value>` — see below for the single-severity and
   mixed-severity cases.
3. The `short` description text.
4. The `full` description text.

**Single-severity rule** (`severities.length === 1`): `Severity:` is
followed by that one value directly, e.g. `Severity: warning`.

**Mixed-severity rule** (`severities.length > 1` — today, only
`transactions`): the line lists every value from the array (already
highest-first), joined with `" or "`, plus an explicit qualifier — never
a single collapsed value, because that would fabricate a severity this
rule id does not consistently have:

```
Severity: critical or major (varies by which pattern matched — this rule id is not single-severity)
```

This is a deliberate departure from `docs/sarif.md` §6's "highest severity
wins" resolution for `rule.defaultConfiguration.level`: that collapse
exists there only because SARIF's schema allows exactly one
`defaultConfiguration.level` per rule descriptor — a hard structural
constraint. `--explain` has no such constraint; it is free text, so it
states the true, complete set instead of picking a representative one.

**Field order is normative; exact spacing/line-breaks/color are not.**
Unlike the JSON and SARIF output contracts, nothing consumes `--explain`'s
stdout programmatically in v1 (§7 — no `--format` applies to it), so this
document fixes *which* fields appear and in *what order*, not the literal
byte layout. An implementation is free to add blank lines or terminal
color between fields as long as the four fields above appear, in order,
with recognizable content.

## 5. Behavior — valid rule id

Example invocation and the fields it must produce, using `kafka` (single
severity) and `transactions` (mixed severity):

```
$ node bin/cli.js --explain kafka
kafka

Severity: warning

Kafka configuration and listener anti-patterns.

Flags Kafka usage issues: Zookeeper-based configuration deprecated in Kafka
3.x, @KafkaListener without an explicit groupId, listeners without
retry/DLQ handling, and consumer configuration missing group.id.
```

```
$ node bin/cli.js --explain transactions
transactions

Severity: critical or major (varies by which pattern matched — this rule id is not single-severity)

Transactional-boundary and rollback anti-patterns.

Detects @Transactional methods with missing rollback configuration or
blocking calls made while holding a database transaction open, either of
which can exhaust the connection pool or cause silent data loss under
failure.
```

No `path` argument is read or required — `--explain kafka` alone (no
project directory) is a complete, valid invocation. Exit code `0`.

## 6. Behavior — invalid rule id

Aligned with `--verify`'s existing precedent (`cli/src/verify.js:101-104`),
**not** with `--rule`'s (`cli/src/scanner.js:62,71`) — the two already
disagree with each other in this codebase (case sensitivity, exit code,
and message wording all differ), so this is a deliberate choice of one
existing precedent over the other, not "the" precedent:

- **Case-sensitive.** No `.toLowerCase()` normalization anywhere in the
  lookup — `--explain kafka` matches, `--explain Kafka` does not (§ next
  section has a full worked example of this specific case).
- **Exit code `2`** — matching `--verify`'s unknown-rule exit code, not
  `--rule`'s `1`.
- **Message, printed to stderr via `console.error`, exact format** (no
  quotes around the offending value, matching `--verify`'s wording, not
  `--rule`'s quoted-value wording):
  ```
  Unknown rule: X. Available: blocking, blocking-kafka, kafka, kafka-send-timeout, layers, observability, reactor-block, transactions
  ```
  where `X` is the raw value passed to `--explain`, unmodified (not
  lowercased, not trimmed beyond what commander itself does to argument
  parsing).

Worked example:

```
$ node bin/cli.js --explain nonexistent-xyz
Unknown rule: nonexistent-xyz. Available: blocking, blocking-kafka, kafka, kafka-send-timeout, layers, observability, reactor-block, transactions
```
Exit code: `2`.

## 7. Behavior — valid rule id, wrong capitalization

Documented explicitly, not left implicit: because lookup is case-sensitive
(§6), a rule id that is valid in every way except capitalization is
treated as a complete non-match — there is no case-insensitive fallback,
no "did you mean" suggestion, no partial credit.

```
$ node bin/cli.js --explain Blocking
Unknown rule: Blocking. Available: blocking, blocking-kafka, kafka, kafka-send-timeout, layers, observability, reactor-block, transactions
```
Exit code: `2` — identical in every respect (message shape, stream, exit
code) to any other non-matching value; `Blocking` is not treated
differently from `nonexistent-xyz` just because it differs from a real
rule id only in casing.

## 8. CLI wiring — `bin/cli.js`

`--explain <rule>` is a new option, same shape as the existing
`--verify <rule>` (a mandatory value on the flag itself, not a positional
argument — consistent with `--verify`, not with the positional
`[path]` argument `runGuard` takes). Commander's own argument-parsing
error fires if `--explain` is given with no value at all, identical to
`--verify`'s existing behavior — this is inherited from commander, not
something `--explain` implements itself.

Resolution is a new branch prepended to the existing `if`/`else if` chain
in `cli/bin/cli.js:33-40`, without restructuring what's already there:

```js
if (opts.explain) {
  process.exitCode = await runExplain(opts.explain);
} else if (opts.verify) {
  process.exitCode = await runVerify(opts.verify);
} else if (!projectPath) {
  console.error('Error: path argument is required (or use --verify <rule>)');
  process.exit(1);
} else {
  process.exitCode = await runGuard(projectPath, opts);
}
```

No `projectPath` is required or consulted when `opts.explain` is set —
same as `--verify`, `--explain` short-circuits before the
`!projectPath` check that every other invocation must pass.

## 9. Out of scope for v1

- **explain v2** — migrating the catalog's source from
  `cli/src/rule-catalog.js` (a plain JS object) to `rules/*.md` files (one
  markdown page per rule id), if that is ever decided. §2 is written so
  that migration only changes what `rule-catalog.js` imports/returns, not
  `--explain`'s or `sarif.js`'s consumption of it — but the migration
  itself is not part of this contract.
- **Any additional flag on `--explain`** — `--format` applied to
  `--explain` (e.g. a JSON-shaped explain output), `--explain-all` (dump
  every rule id at once), or any other variant. v1 is exactly
  `--explain <rule>`, one rule id in, plain text out, nothing else.
- ~~**Fixing `--rule`'s rejection of `blocking-kafka`**~~ — was tracked
  separately as issue #7; now fixed. `--rule` validates against
  `RULE_CATALOG`'s 8-id list, same as `--explain` (§3), and
  `--rule blocking-kafka` filters findings to exactly that ruleId.

## 10. Status

This document is the normative reference for `--explain`'s rule id
validation, output fields, and CLI wiring, to be implemented in
`cli/src/rule-catalog.js`, `cli/src/explain.js` (or equivalent), and
`bin/cli.js`, exercised by a contract test suite the same way
`docs/baseline.md` and `docs/sarif.md` are exercised by their respective
test suites. No implementation exists yet — this document precedes it.
