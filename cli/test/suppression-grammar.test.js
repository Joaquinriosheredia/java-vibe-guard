#!/usr/bin/env node
/**
 * Suppression grammar tests — verifies the CLI inline suppression parser and
 * resolution algorithm against docs/suppression-grammar.md.
 *
 * This suite is written before the implementation exists (docs/suppression-grammar.md
 * §1-9 is the spec; cli/src/suppression-grammar.js does not exist yet). All tests
 * are expected to fail — including via import failure — until that module is built.
 *
 * Run: node test/suppression-grammar.test.js
 */
import { parseSuppressionDirectives, resolveSuppression } from '../src/suppression-grammar.js';

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

function ruleIdsOf(directive) {
  return [...directive.ruleIds].sort();
}

// ─── §1: canonical regex / capture groups ────────────────────────────────────
console.log('\n📋 §1: canonical regex and capture groups');
{
  const lines = ['someCall(); // vibe-guard: ignore blocking -- legacy async wait'];
  const directives = parseSuppressionDirectives(lines);

  assert(directives.length === 1, 'one directive found');
  assert(directives[0].type === 'inline', 'classified as inline (trailing real code)');
  assert(directives[0].line === 1, 'targets its own line (1-indexed)');
  assert(ruleIdsOf(directives[0]).join(',') === 'blocking', 'rule id captured correctly');
  assert(directives[0].justification === 'legacy async wait', 'justification captured correctly');
}

{
  // rule id token must match this CLI's own shape: lowercase words + hyphens, no digits.
  const lines = ['// vibe-guard: ignore blocking-kafka', 'x();'];
  const directives = parseSuppressionDirectives(lines);
  assert(directives.length === 1, 'hyphenated rule id (blocking-kafka) is accepted');
  assert(ruleIdsOf(directives[0]).join(',') === 'blocking-kafka', 'hyphenated rule id captured whole, not split on its own hyphen');
}

// ─── §2: spacing rules ────────────────────────────────────────────────────────
console.log('\n📋 §2: spacing rules — valid variants');
{
  const validLines = [
    '// vibe-guard: ignore blocking',
    '//vibe-guard:ignore blocking',
    '// vibe-guard : ignore blocking',
    '// vibe-guard: ignore blocking,kafka',
    '// vibe-guard: ignore blocking , kafka',
    '// vibe-guard: ignore blocking--reason',
    '// vibe-guard: ignore blocking   --   reason',
  ];
  for (const line of validLines) {
    const directives = parseSuppressionDirectives([line, 'x();']);
    assert(directives.length === 1, `accepted: "${line}"`);
  }
}

console.log('\n📋 §2: spacing rules — invalid variants');
{
  const invalidLines = [
    '// vibe-guard: ignoreblocking', // zero spaces between "ignore" and rule id
  ];
  for (const line of invalidLines) {
    const directives = parseSuppressionDirectives([line, 'x();']);
    assert(directives.length === 0, `rejected (treated as ordinary comment): "${line}"`);
  }
}

// ─── §3: justification — absent "--" and empty "--" are indistinguishable ───
console.log('\n📋 §3: justification normalization');
{
  const noDashDirectives = parseSuppressionDirectives(['x(); // vibe-guard: ignore blocking']);
  const emptyDashDirectives = parseSuppressionDirectives(['x(); // vibe-guard: ignore blocking --']);

  assert(noDashDirectives[0].justification === null, 'no "--" at all yields justification: null');
  assert(emptyDashDirectives[0].justification === null, '"--" with nothing after yields justification: null');
  assert(
    noDashDirectives[0].justification === emptyDashDirectives[0].justification,
    'both cases produce exactly the same value (indistinguishable downstream)'
  );

  const embeddedDash = parseSuppressionDirectives(['x(); // vibe-guard: ignore blocking -- reason with -- a dash inside']);
  assert(
    embeddedDash[0].justification === 'reason with -- a dash inside',
    'only the first "--" is a delimiter; a second "--" is captured as literal text'
  );
}

// ─── §4: multiple rule ids — dedup, no artificial limit ─────────────────────
console.log('\n📋 §4: multiple rule ids');
{
  const dupe = parseSuppressionDirectives(['x(); // vibe-guard: ignore blocking,blocking']);
  assert(ruleIdsOf(dupe[0]).length === 1, 'duplicate rule id in the same list collapses to one (Set dedup)');

  const all8 = parseSuppressionDirectives([
    'x(); // vibe-guard: ignore blocking,blocking-kafka,kafka,kafka-send-timeout,layers,observability,reactor-block,transactions',
  ]);
  assert(ruleIdsOf(all8[0]).length === 8, 'no artificial limit — all 8 known rule ids accepted in one directive');
}

// ─── §5: directive type determined by nature, not position ─────────────────
console.log('\n📋 §5: standalone vs inline classification');
{
  const standaloneLines = [
    '        // vibe-guard: ignore blocking',
    'x();',
  ];
  const standalone = parseSuppressionDirectives(standaloneLines);
  assert(standalone.length === 1, 'standalone directive found');
  assert(standalone[0].type === 'standalone', 'classified as standalone (only whitespace before //, indentation ignored)');
  assert(standalone[0].line === 2, 'standalone directive targets the NEXT line');

  const inlineLines = ['x(); // vibe-guard: ignore blocking'];
  const inline = parseSuppressionDirectives(inlineLines);
  assert(inline[0].type === 'inline', 'classified as inline (real code precedes //)');
  assert(inline[0].line === 1, 'inline directive targets its OWN line only');
}

// ─── §6: normative resolution algorithm ─────────────────────────────────────
console.log('\n📋 §6: normative resolution algorithm — worked example');
{
  const lines = [
    '// vibe-guard: ignore layers -- legacy module boundary',
    'someCall();  // vibe-guard: ignore blocking -- justified async wait',
  ];
  const directives = parseSuppressionDirectives(lines);

  const layersFinding = resolveSuppression(directives, { ruleId: 'layers', line: 2 });
  assert(layersFinding !== null, 'finding(layers, line 2) resolves via the standalone directive (step 3-4)');
  assert(layersFinding.type === 'standalone', 'resolution correctly identifies the standalone directive as the source');

  const blockingFinding = resolveSuppression(directives, { ruleId: 'blocking', line: 2 });
  assert(blockingFinding !== null, 'finding(blocking, line 2) resolves via the inline directive (step 1-2)');
  assert(blockingFinding.type === 'inline', 'resolution correctly identifies the inline directive as the source');

  const kafkaFinding = resolveSuppression(directives, { ruleId: 'kafka', line: 2 });
  assert(kafkaFinding === null, 'finding(kafka, line 2) is covered by neither directive — remains active (step 5)');
}

console.log('\n📋 §6/§9: inline precedence over standalone when both cover the SAME rule id');
{
  // Both directives cover "blocking" — per the CLI's documented divergence from the
  // MCP server, inline must win regardless of source order (§9: same-line precedence,
  // not insertion-order precedence).
  const lines = [
    '// vibe-guard: ignore blocking -- standalone justification',
    'someCall();  // vibe-guard: ignore blocking -- inline justification',
  ];
  const directives = parseSuppressionDirectives(lines);
  const finding = resolveSuppression(directives, { ruleId: 'blocking', line: 2 });

  assert(finding !== null, 'finding resolves when both directive types cover the same rule id');
  assert(finding.type === 'inline', 'inline directive wins over standalone for the same rule id (CLI precedence, per §9)');
  assert(finding.justification === 'inline justification', 'the winning directive\'s own justification is the one surfaced');
}

// ─── §5/§9: an inline directive on line N-1 is NOT a previous-line directive ─
console.log('\n📋 §5/§9: inline directive on line N-1 does not propagate to line N');
{
  // future.join() is real code — this comment is inline (trailing), not standalone,
  // even though it sits on the line physically before the finding's line.
  const lines = [
    'future.join(); // vibe-guard: ignore transactions',
    'someOtherCall();',
  ];
  const directives = parseSuppressionDirectives(lines);

  assert(directives.length === 1, 'one directive found');
  assert(directives[0].type === 'inline', 'classified as inline (real code precedes //), not standalone');
  assert(directives[0].line === 1, 'targets only its own line (1), never line 2');

  const findingOnLine2 = resolveSuppression(directives, { ruleId: 'transactions', line: 2 });
  assert(
    findingOnLine2 === null,
    'finding on line 2 is NOT suppressed — only a standalone directive (comment-only line) counts as previous-line, an inline directive never propagates forward'
  );
}

// ─── §7: invalid rule ids — silent no-op ────────────────────────────────────
console.log('\n📋 §7: invalid rule ids');
{
  const directives = parseSuppressionDirectives(['x(); // vibe-guard: ignore nonexistent-rule -- typo or nonexistent rule']);
  assert(directives.length === 1, 'directive with an unknown rule id still parses successfully (no syntax validation against the registry)');

  const finding = resolveSuppression(directives, { ruleId: 'blocking', line: 1 });
  assert(finding === null, 'a real finding on the same line is NOT suppressed — the unknown rule id never matches anything');
}

// ─── §8: malformed comments — ignored silently ──────────────────────────────
console.log('\n📋 §8: malformed comments');
{
  const noRuleId = parseSuppressionDirectives(['// vibe-guard: ignore', 'x();']);
  assert(noRuleId.length === 0, '"// vibe-guard: ignore" with no rule id produces no directive at all');

  const ordinaryComment = parseSuppressionDirectives(['// just a regular comment explaining ignore semantics', 'x();']);
  assert(ordinaryComment.length === 0, 'an unrelated comment mentioning "ignore" is not mistaken for a directive');

  const wrongCasePrefix = parseSuppressionDirectives(['x(); // VIBE-GUARD: ignore blocking']);
  assert(wrongCasePrefix.length === 0, 'wrong-case prefix ("VIBE-GUARD") is rejected — case-sensitive per §1 of the spec');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ Suppression grammar tests FAILED — expected until cli/src/suppression-grammar.js is implemented.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ All suppression grammar tests passed.\n`);
}
