#!/usr/bin/env node
/**
 * Contract test suite for docs/explain.md — exercises the shared rule
 * catalog (cli/src/rule-catalog.js) at the module level, and the
 * `--explain <rule>` CLI wiring (bin/cli.js) end-to-end via spawnSync,
 * the same way sarif.test.js exercises the SARIF writer in isolation
 * and sarif-cli.test.js exercises its CLI wiring — combined into one
 * file here since --explain's surface is small enough not to need the
 * two-file split.
 *
 * cli/src/rule-catalog.js does not exist yet, and --explain is not wired
 * into bin/cli.js yet. This suite is expected to fail on import
 * (ERR_MODULE_NOT_FOUND on '../src/rule-catalog.js'), not on assertion
 * logic — every spawnSync-based test below would also independently fail
 * (commander rejects the unrecognized --explain option) even if the
 * import somehow succeeded.
 *
 * Run: node test/explain.test.js
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { RULE_CATALOG } from '../src/rule-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../bin/cli.js');
const SARIF_SRC = join(__dirname, '../src/sarif.js');
const RULE_CATALOG_SRC = join(__dirname, '../src/rule-catalog.js');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

// A field is "present, in order" if each subsequent field's first
// occurrence in stdout comes after the previous one's — per docs/explain.md
// §4, exact spacing/line breaks are not normative, only field presence and
// order.
function assertFieldOrder(stdout, fields, label) {
  let lastIndex = -1;
  let inOrder = true;
  for (const field of fields) {
    const idx = stdout.indexOf(field);
    if (idx === -1 || idx <= lastIndex) { inOrder = false; break; }
    lastIndex = idx;
  }
  assert(inOrder, label);
}

const SIX_RULE_IDS = ['blocking', 'blocking-kafka', 'kafka', 'layers', 'observability', 'transactions'];
const AVAILABLE_LIST = SIX_RULE_IDS.join(', ');

// ─── §1: Purpose — no project scan, no path argument ─────────────────────────
console.log('\n📋 §1: Purpose — --explain runs without scanning any project');
{
  const { stdout, exitCode } = run(['--explain', 'kafka']);
  assert(exitCode === 0, 'exit code is 0 with no path argument at all');
  assert(!stdout.includes('Scanning:'), 'no scan-related header is printed — printHeader is never called');
  assert(!/files scanned|filesScanned/i.test(stdout), 'no file-count / scan-summary output appears');
}

// ─── §2: Data source — cli/src/rule-catalog.js ───────────────────────────────
console.log('\n📋 §2: Data source — rule-catalog.js content and corrected comment');
{
  assert(typeof RULE_CATALOG === 'object' && RULE_CATALOG !== null, 'RULE_CATALOG is exported as an object');

  const kafka = RULE_CATALOG.kafka;
  assert(
    kafka?.short === 'Kafka configuration and listener anti-patterns.',
    'kafka.short matches the exact text that used to live in sarif.js:50 verbatim'
  );
  assert(
    kafka?.full === 'Flags Kafka usage issues: Zookeeper-based configuration deprecated in Kafka 3.x, @KafkaListener without an explicit groupId, listeners without retry/DLQ handling, and consumer configuration missing group.id.',
    'kafka.full matches the exact text that used to live in sarif.js:51 verbatim'
  );

  const transactions = RULE_CATALOG.transactions;
  assert(
    transactions?.short === 'Transactional-boundary and rollback anti-patterns.',
    'transactions.short matches the exact text that used to live in sarif.js:62 verbatim'
  );

  // severities field — new in this extraction, per docs/explain.md §2.
  assert(Array.isArray(RULE_CATALOG.blocking?.severities), 'blocking.severities is an array');
  assert(RULE_CATALOG.blocking.severities.join(',') === 'critical', 'blocking: single severity, critical');
  assert(RULE_CATALOG['blocking-kafka'].severities.join(',') === 'critical', 'blocking-kafka: single severity, critical');
  assert(RULE_CATALOG.kafka.severities.join(',') === 'warning', 'kafka: single severity, warning');
  assert(RULE_CATALOG.layers.severities.join(',') === 'major', 'layers: single severity, major');
  assert(RULE_CATALOG.observability.severities.join(',') === 'warning', 'observability: single severity, warning');
  assert(
    RULE_CATALOG.transactions.severities.join(',') === 'critical,major',
    'transactions: mixed severity, highest-first (critical, major) — matches transactions.js:21/33 evidence'
  );

  // Corrected comment — the old sarif.js:37-39 comment incorrectly claimed
  // this content mirrors the README's "Why These Rules Exist" prose. The
  // property that actually matters is FALSE ATTRIBUTION (a claim that the
  // content comes from the README), not the mere word "README" appearing —
  // the corrected comment legitimately mentions "README" itself, to explain
  // *why* it isn't the source (README.md documents the MCP server's
  // unrelated VIBE-001..007 rules, not the CLI's rule ids). A blanket
  // "must not contain README" check would fail that legitimate, honest text
  // just as readily as it would catch a real regression — it tests the
  // wrong property. Detect the actual bad pattern instead: an attribution
  // verb ("mirrors", "comes from", "is sourced from", "is extracted from",
  // "based on", "copied from", "taken from") pointing at "README" within a
  // short span, WITHOUT an immediately preceding negation ("not") — that
  // negation is exactly what separates the old bug ("Content mirrors ...
  // the README's ... prose") from the corrected text ("not extracted from
  // any existing document (... README.md's ... documents ... instead)").
  function hasFalseReadmeAttribution(text) {
    const verbs = /(mirrors|comes from|is sourced from|sourced from|is extracted from|extracted from|based on|copied from|taken from)/gi;
    let match;
    while ((match = verbs.exec(text))) {
      const window = text.slice(match.index, Math.min(text.length, match.index + 200));
      if (/README/i.test(window)) {
        const beforeVerb = text.slice(Math.max(0, match.index - 10), match.index);
        if (!/\bnot\s*$/i.test(beforeVerb)) return true;
      }
    }
    return false;
  }

  const catalogSrc = readFileSync(RULE_CATALOG_SRC, 'utf8');
  const sarifSrc = readFileSync(SARIF_SRC, 'utf8');
  assert(
    !hasFalseReadmeAttribution(catalogSrc),
    'rule-catalog.js does not claim its content mirrors/comes from/is sourced from/is extracted from/is based on the README (mentioning README to explain it is NOT the source is fine)'
  );
  assert(
    !hasFalseReadmeAttribution(sarifSrc),
    'sarif.js no longer repeats the incorrect README attribution either'
  );
  assert(
    /curated|hand/i.test(catalogSrc) && /cli\/src\/rules/i.test(catalogSrc),
    'rule-catalog.js explains the real provenance: manually curated from reading cli/src/rules/*.js'
  );
  assert(sarifSrc.includes('rule-catalog.js'), 'sarif.js imports from rule-catalog.js instead of defining the catalog locally');
  assert(!/const RULE_DESCRIPTIONS\s*=/.test(sarifSrc), 'sarif.js no longer defines RULE_DESCRIPTIONS inline');
}

// ─── §3: Valid rule ids — the 6-id list, not RULES's 5-id list ───────────────
console.log('\n📋 §3: Valid rule ids — exactly the 6 real finding.rule values');
{
  const keys = Object.keys(RULE_CATALOG).sort();
  assert(
    keys.join(',') === [...SIX_RULE_IDS].sort().join(','),
    `RULE_CATALOG has exactly the 6 real rule ids, including blocking-kafka: got ${keys.join(',')}`
  );
  assert(keys.includes('blocking-kafka'), 'blocking-kafka is present — unlike RULES/--rule\'s 5-id list (issue #7)');
}

// ─── §4: Output format — 4 fields, in order ───────────────────────────────────
console.log('\n📋 §4: Output format — rule id, Severity line, short, full, in that order');
{
  const single = run(['--explain', 'kafka']);
  assertFieldOrder(
    single.stdout,
    [
      'kafka',
      'Severity: warning',
      'Kafka configuration and listener anti-patterns.',
      'Flags Kafka usage issues:',
    ],
    'kafka: rule id, Severity, short, full appear in this exact order'
  );

  const mixed = run(['--explain', 'transactions']);
  const expectedMixedSeverityLine =
    'Severity: critical or major (varies by which pattern matched — this rule id is not single-severity)';
  assert(
    mixed.stdout.includes(expectedMixedSeverityLine),
    'transactions: mixed-severity line matches docs/explain.md §4 verbatim, including the qualifier'
  );
  assertFieldOrder(
    mixed.stdout,
    [
      'transactions',
      expectedMixedSeverityLine,
      'Transactional-boundary and rollback anti-patterns.',
      'Detects @Transactional methods',
    ],
    'transactions: rule id, Severity (mixed), short, full appear in this exact order'
  );
  assert(
    !mixed.stdout.includes('Severity: critical\n') && !mixed.stdout.includes('Severity: major\n'),
    'transactions never collapses to a single fabricated severity value'
  );
}

// ─── §5: Behavior — all 6 valid rule ids produce the 4 fields, exit 0 ───────
console.log('\n📋 §5: Behavior — every one of the 6 real rule ids works end-to-end');
{
  for (const ruleId of SIX_RULE_IDS) {
    const { stdout, stderr, exitCode } = run(['--explain', ruleId]);
    const entry = RULE_CATALOG[ruleId];
    assert(exitCode === 0, `--explain ${ruleId}: exit code 0`);
    assert(stderr === '', `--explain ${ruleId}: nothing on stderr`);
    assert(stdout.includes(ruleId), `--explain ${ruleId}: rule id appears in stdout`);
    assert(stdout.includes(entry.short), `--explain ${ruleId}: short description appears verbatim`);
    assert(stdout.includes(entry.full), `--explain ${ruleId}: full description appears verbatim`);
    for (const severity of entry.severities) {
      assert(stdout.includes(severity), `--explain ${ruleId}: severity "${severity}" appears in the Severity line`);
    }
  }
}

// ─── §6: Behavior — invalid rule id: case-sensitive, exit 2, exact message ──
console.log('\n📋 §6: Behavior — invalid rule id (case-sensitive, exit 2)');
{
  const { stdout, stderr, exitCode } = run(['--explain', 'nonexistent-xyz']);
  assert(exitCode === 2, 'exit code is 2, matching --verify\'s precedent, not --rule\'s 1');
  assert(stdout === '', 'nothing printed to stdout on an unknown rule id');
  assert(
    stderr.includes(`Unknown rule: nonexistent-xyz. Available: ${AVAILABLE_LIST}`),
    'stderr message matches the exact documented format, no quotes around the value'
  );
  assert(!stderr.includes('"nonexistent-xyz"'), 'the offending value is never wrapped in quotes (unlike --rule\'s message)');

  // Case sensitivity: an uppercase variant of a real rule id is ALSO unknown.
  const upper = run(['--explain', 'KAFKA']);
  assert(upper.exitCode === 2, '--explain KAFKA (uppercase of a real id) is rejected — case-sensitive lookup');
  assert(
    upper.stderr.includes(`Unknown rule: KAFKA. Available: ${AVAILABLE_LIST}`),
    '--explain KAFKA produces the same unknown-rule message shape, value verbatim'
  );
}

// ─── §7: Behavior — valid id, wrong capitalization: no special case ─────────
console.log('\n📋 §7: Behavior — wrong-capitalization rule id is a plain non-match, no special case');
{
  const { stdout, stderr, exitCode } = run(['--explain', 'Blocking']);
  assert(exitCode === 2, '--explain Blocking: exit code 2, identical to any other invalid id');
  assert(stdout === '', '--explain Blocking: nothing on stdout');
  assert(
    stderr.includes(`Unknown rule: Blocking. Available: ${AVAILABLE_LIST}`),
    '--explain Blocking: message shape identical to docs/explain.md §7\'s worked example'
  );

  // Same shape as an entirely unrelated bogus value — no "did you mean" hint,
  // no partial credit for being a near-miss.
  const unrelated = run(['--explain', 'totally-made-up']);
  assert(
    stderr.replace('Blocking', 'totally-made-up') === unrelated.stderr,
    'the wrong-capitalization case produces byte-identical message shape to an unrelated invalid id (only the value differs)'
  );
  assert(!stderr.includes('did you mean'), 'no "did you mean" suggestion — a near-miss gets no special treatment');
}

// ─── §8: CLI wiring — bin/cli.js branch order and argument handling ─────────
console.log('\n📋 §8: CLI wiring — --explain <rule>, no path required, precedes --verify');
{
  const noPath = run(['--explain', 'layers']);
  assert(noPath.exitCode === 0, '--explain works with zero positional arguments');

  // --explain takes precedence over --verify when both are given, per the
  // `if (opts.explain) {...} else if (opts.verify) {...}` branch order.
  const both = run(['--explain', 'kafka', '--verify', 'VIBE-001']);
  assert(both.exitCode === 0, '--explain wins when both --explain and --verify are passed together');
  assert(both.stdout.includes('kafka'), 'output is the explain output for kafka, not a --verify run');
  assert(!/VIBE-001 Verification/.test(both.stdout), '--verify\'s own final output never runs when --explain is also present');
  assert(!/Environment Check/.test(both.stdout), '--verify\'s environment pre-check never runs either — runVerify is never called at all, not just short-circuited partway through');

  // --explain with no value at all is commander's own argument-parsing
  // error, identical in kind to --verify's existing behavior — not
  // something --explain implements itself.
  const noValue = run(['--explain']);
  assert(noValue.exitCode !== 0, '--explain with no value fails via commander\'s own argument parsing');
}

// ─── §9: Out of scope for v1 — no format variant, no bulk flag, issue #7 stands ──
console.log('\n📋 §9: Out of scope — no --format for explain, no --explain-all, issue #7 untouched');
{
  const plain = run(['--explain', 'kafka']);
  const withFormat = run(['--format', 'json', '--explain', 'kafka']);
  assert(
    withFormat.stdout === plain.stdout,
    '--format has no effect on --explain output — no JSON/SARIF variant exists for explain in v1'
  );

  const explainAll = run(['--explain-all']);
  assert(explainAll.exitCode !== 0, '--explain-all is not a recognized option — rejected by commander');

  // Issue #7 (--rule rejects blocking-kafka) is explicitly not fixed by this
  // work — --explain uses its own correct 6-id list, but --rule's separate,
  // narrower 5-id list is untouched.
  const ruleFlag = run(['--rule', 'blocking-kafka', join(__dirname, '../test-fixtures')]);
  assert(
    ruleFlag.exitCode === 1 && /Unknown rule: "blocking-kafka"/.test(ruleFlag.stderr),
    '--rule blocking-kafka still fails exactly as before (issue #7 untouched by this work)'
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ explain contract test FAILED.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ All explain contract tests passed.\n`);
}
