#!/usr/bin/env node
/**
 * Contract test suite for docs/sarif.md — exercises the SARIF writer
 * (cli/src/sarif.js) at the module level, the same way baseline.test.js
 * exercises cli/src/baseline.js before wiring into scanner.js / bin/cli.js.
 *
 * cli/src/sarif.js does not exist yet. This suite is expected to fail on
 * import (ERR_MODULE_NOT_FOUND), not on assertion logic — it pins down the
 * API the writer must expose:
 *
 *   mapSeverity(cliSeverity)              — §1  → { level, securitySeverity }
 *   buildPhysicalLocation(finding)        — §2-4 → { artifactLocation, region? }
 *   filterVisibleFindings(findings)       — §5  → not suppressed, not baselined
 *   buildRules(visibleFindings)           — §6  → reportingDescriptor[]
 *   generateSarif(findings, toolMeta)     — §7  → full SARIF 2.1.0 document
 *
 * Run: node test/sarif.test.js
 */
import {
  mapSeverity,
  buildPhysicalLocation,
  filterVisibleFindings,
  buildRules,
  generateSarif,
} from '../src/sarif.js';

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

// Builds a finding in the shape applyBaseline/applySuppressions produce:
// severity, rule, message, location, plus the suppression/baseline
// decoration fields — same shape baseline.test.js's finding() helper uses.
function finding({
  rule,
  message,
  location,
  severity = 'warning',
  suppressed = false,
  baselined = false,
}) {
  return {
    severity,
    rule,
    message,
    location,
    suppressed,
    suppressedBy: suppressed ? 'inline' : null,
    justification: suppressed ? 'test fixture' : null,
    baselined,
    baselineSkipped: suppressed,
  };
}

// Recursively collects every object key name appearing anywhere in the
// value's tree — used by §9 to sweep the entire generated document for
// forbidden keys regardless of nesting depth.
function collectAllKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectAllKeys(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectAllKeys(v, keys);
    }
  }
  return keys;
}

// ─── Shared fixture ───────────────────────────────────────────────────────────
// One finding per known rule id (docs/suppression-grammar.md's eight), plus
// one suppressed and one baselined finding to exercise §5 filtering, plus the
// real file-level kafka.js case (cli/src/rules/kafka.js:79-89) for §4. The
// `transactions` rule id gets two findings at different severities (major +
// critical) to exercise the mixed-severity rule-metadata case from §6.
const fixtureFindings = [
  finding({
    rule: 'blocking',
    severity: 'critical',
    message: 'Thread.sleep() detected in @Async method',
    location: 'src/main/java/com/example/AsyncService.java:42',
  }),
  finding({
    rule: 'blocking-kafka',
    severity: 'critical',
    message: '.get() detected in @KafkaListener method',
    location: 'src/main/java/com/example/kafka/KafkaConsumerService.java:15',
  }),
  finding({
    rule: 'kafka-send-timeout',
    severity: 'critical',
    message: 'Kafka send().get() without timeout — blocks the calling thread indefinitely if the broker is slow or unavailable; use .get(timeout, TimeUnit) or handle the future asynchronously',
    location: 'src/main/java/com/example/saga/SagaOrderService.java:45',
  }),
  finding({
    rule: 'layers',
    severity: 'major',
    message: 'Controller calling Repository directly, bypassing Service layer',
    location: 'src/main/java/com/example/UserController.java:30',
  }),
  finding({
    rule: 'transactions',
    severity: 'major',
    message: '@Transactional method missing rollback configuration',
    location: 'src/main/java/com/example/OrderService.java:21',
  }),
  finding({
    rule: 'transactions',
    severity: 'critical',
    message: 'Blocking call inside @Transactional method',
    location: 'src/main/java/com/example/OrderService.java:33',
  }),
  finding({
    rule: 'kafka',
    severity: 'warning',
    message: 'Kafka config without consumer group.id',
    location: 'src/main/resources/application.yml', // file-level — no ":line"
  }),
  finding({
    rule: 'observability',
    severity: 'warning',
    message: 'Endpoint without structured logging',
    location: 'src/main/java/com/example/OrderController.java:58',
  }),
  finding({
    rule: 'reactor-block',
    severity: 'critical',
    message: "Reactive blocking call '.block()' inside Spring bean — pins a thread under load; use reactive composition (.flatMap, .map, .then) instead",
    location: 'src/main/java/com/example/search/FileContentSearchService.java:12',
  }),
  finding({
    rule: 'kafka',
    severity: 'warning',
    message: '@KafkaListener without explicit groupId',
    location: 'src/main/java/com/example/kafka/LegacyConsumer.java:12',
    suppressed: true, // must never reach visibleFindings / results
  }),
  finding({
    rule: 'observability',
    severity: 'warning',
    message: 'Endpoint without structured logging',
    location: 'src/main/java/com/example/LegacyController.java:9',
    baselined: true, // must never reach visibleFindings / results
  }),
];

const TOOL_META = {
  version: '1.0.3',
  informationUri: 'https://github.com/Joaquinriosheredia/java-vibe-guard',
  helpUri: 'https://github.com/Joaquinriosheredia/java-vibe-guard#readme',
};

// ─── §1: severity mapping ─────────────────────────────────────────────────────
console.log('\n📋 §1: severity mapping (CLI severity → SARIF level / security-severity)');
{
  const critical = mapSeverity('critical');
  const major = mapSeverity('major');
  const warning = mapSeverity('warning');
  const info = mapSeverity('info');

  assert(critical.level === 'error', 'critical → level error');
  assert(critical.securitySeverity === '9.5', 'critical → security-severity "9.5" (string)');
  assert(major.level === 'error', 'major → level error');
  assert(major.securitySeverity === '7.5', 'major → security-severity "7.5" (string)');
  assert(warning.level === 'warning', 'warning → level warning');
  assert(warning.securitySeverity === '5.0', 'warning → security-severity "5.0" (string)');
  assert(info.level === 'note', 'info → level note');
  assert(info.securitySeverity === '2.0', 'info → security-severity "2.0" (string)');

  assert(critical.level === major.level, 'critical and major collapse to the same SARIF level');
  assert(
    critical.securitySeverity !== major.securitySeverity,
    'security-severity is the only field distinguishing critical from major'
  );
  assert(typeof critical.securitySeverity === 'string', 'security-severity is always a string, never a JSON number');
}

// ─── §2: artifactLocation.uri ─────────────────────────────────────────────────
console.log('\n📋 §2: artifactLocation.uri — POSIX relativePath, no file://, no absolute path');
{
  const f = finding({
    rule: 'kafka',
    location: 'src/main/java/com/example/kafka/KafkaConsumerService.java:15',
  });
  const loc = buildPhysicalLocation(f);

  assert(
    loc.artifactLocation.uri === 'src/main/java/com/example/kafka/KafkaConsumerService.java',
    'uri is the relativePath, line suffix stripped'
  );
  assert(!loc.artifactLocation.uri.startsWith('file://'), 'uri never carries a file:// prefix');
  assert(!loc.artifactLocation.uri.startsWith('/'), 'uri is never an absolute path');
  assert(!loc.artifactLocation.uri.includes('\\'), 'uri never contains a Windows backslash separator');
}

// ─── §3: region present only for line-numbered findings ──────────────────────
console.log('\n📋 §3: region — startLine only, no endLine/endColumn');
{
  const f = finding({ rule: 'layers', location: 'src/main/java/com/example/UserController.java:30' });
  const loc = buildPhysicalLocation(f);

  assert('region' in loc, 'region is present for a line-numbered finding');
  assert(loc.region.startLine === 30, 'startLine matches the finding\'s own line number exactly');
  assert(!('endLine' in loc.region), 'endLine is never emitted');
  assert(!('endColumn' in loc.region), 'endColumn is never emitted');
  assert(!('startColumn' in loc.region), 'startColumn is never emitted (no column data computed by the CLI)');
}

// ─── §4: file-level findings (no line) — real kafka.js:81 case ──────────────
console.log('\n📋 §4: file-level findings — physicalLocation with only artifactLocation, no region');
{
  const f = finding({
    rule: 'kafka',
    severity: 'warning',
    message: 'Kafka config without consumer group.id',
    location: 'src/main/resources/application.yml',
  });
  const loc = buildPhysicalLocation(f);

  assert(loc.artifactLocation.uri === 'src/main/resources/application.yml', 'artifactLocation.uri is the bare relativePath');
  assert(!('region' in loc), 'region is entirely absent for a file-level finding — not region: undefined, the key itself is missing');
}

// ─── §5: filtering — only visibleFindings reach SARIF ────────────────────────
console.log('\n📋 §5: filtering — SARIF results come only from visibleFindings (not suppressed, not baselined)');
{
  const visible = filterVisibleFindings(fixtureFindings);

  assert(visible.length === 9, `9 of 11 fixture findings are visible (2 excluded): got ${visible.length}`);
  assert(
    visible.every(f => !f.suppressed),
    'no suppressed finding survives filterVisibleFindings'
  );
  assert(
    visible.every(f => !f.baselined),
    'no baselined finding survives filterVisibleFindings'
  );
  assert(
    !visible.some(f => f.location.includes('LegacyConsumer.java')),
    'the suppressed finding (LegacyConsumer.java) is gone'
  );
  assert(
    !visible.some(f => f.location.includes('LegacyController.java')),
    'the baselined finding (LegacyController.java) is gone'
  );

  const doc = generateSarif(fixtureFindings, TOOL_META);
  const results = doc.runs[0].results;
  assert(results.length === 9, `generated SARIF has exactly 9 results, matching visibleFindings: got ${results.length}`);
  assert(
    !results.some(r => r.locations[0].physicalLocation.artifactLocation.uri.includes('LegacyConsumer.java')),
    'suppressed finding never reaches results[]'
  );
  assert(
    !results.some(r => r.locations[0].physicalLocation.artifactLocation.uri.includes('LegacyController.java')),
    'baselined finding never reaches results[]'
  );
}

// ─── §6: rules array (reportingDescriptor) ────────────────────────────────────
console.log('\n📋 §6: rules array — one entry per distinct ruleId, mixed-severity resolution, helpUri');
{
  const visible = filterVisibleFindings(fixtureFindings);
  const rules = buildRules(visible, TOOL_META);
  const ruleIds = rules.map(r => r.id).sort();

  assert(
    ruleIds.join(',') === ['blocking', 'blocking-kafka', 'kafka', 'kafka-send-timeout', 'layers', 'observability', 'reactor-block', 'transactions'].sort().join(','),
    `one reportingDescriptor per distinct ruleId present in visibleFindings: got ${ruleIds.join(',')}`
  );

  const kafkaRule = rules.find(r => r.id === 'kafka');
  assert(kafkaRule.name === 'kafka', 'name equals id — no invented human-readable name');
  assert(kafkaRule.helpUri === TOOL_META.helpUri, 'helpUri points at the shared README URL');
  assert(typeof kafkaRule.shortDescription.text === 'string' && kafkaRule.shortDescription.text.length > 0, 'shortDescription.text is a non-empty string');
  assert(typeof kafkaRule.fullDescription.text === 'string' && kafkaRule.fullDescription.text.length > 0, 'fullDescription.text is a non-empty string');

  const blockingRule = rules.find(r => r.id === 'blocking');
  const blockingKafkaRule = rules.find(r => r.id === 'blocking-kafka');
  assert(blockingRule.helpUri === blockingKafkaRule.helpUri, 'helpUri is identical across different rule ids — never a per-rule URL');

  // security-severity lives at rule.properties, a sibling of defaultConfiguration
  // — NOT nested inside defaultConfiguration.properties (docs/sarif.md correction).
  assert(
    kafkaRule.properties && kafkaRule.properties['security-severity'] === '5.0',
    'security-severity sits at rule.properties["security-severity"]'
  );
  assert(
    !kafkaRule.defaultConfiguration.properties,
    'defaultConfiguration itself carries no properties bag — security-severity is not nested there'
  );
  assert(typeof kafkaRule.properties['security-severity'] === 'string', 'security-severity is a string at the rule level too');

  // transactions emits both major (line 21) and critical (line 33) findings.
  // Rule-level metadata must summarize to the highest severity present...
  const transactionsRule = rules.find(r => r.id === 'transactions');
  assert(transactionsRule.defaultConfiguration.level === 'error', 'defaultConfiguration.level for transactions resolves to the highest severity (critical → error)');
  assert(transactionsRule.properties['security-severity'] === '9.5', 'rule.properties["security-severity"] for transactions resolves to critical\'s "9.5", the highest of the two');

  // ...but each individual result keeps its own real severity, never bumped
  // to the rule's resolved maximum.
  const doc = generateSarif(fixtureFindings, TOOL_META);
  const txResults = doc.runs[0].results.filter(r => r.ruleId === 'transactions');
  assert(txResults.length === 2, 'both transactions findings appear as separate results');
  const majorResult = txResults.find(r => r.locations[0].physicalLocation.region.startLine === 21);
  const criticalResult = txResults.find(r => r.locations[0].physicalLocation.region.startLine === 33);
  assert(majorResult.level === 'error', 'the major transactions finding still shows level error (major→error per §1, not because the rule maxed to critical)');
  assert(criticalResult.level === 'error', 'the critical transactions finding shows level error');
  assert(
    majorResult.message.text === '@Transactional method missing rollback configuration',
    'result-level content is never altered by the rule-level mixed-severity resolution — each result keeps its own message/severity'
  );
}

// ─── §7: document structure ───────────────────────────────────────────────────
console.log('\n📋 §7: top-level document structure');
{
  const doc = generateSarif(fixtureFindings, TOOL_META);

  assert(doc.version === '2.1.0', 'version is the literal string "2.1.0"');
  assert(
    doc['$schema'] === 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    'schema points at the OASIS SARIF 2.1.0 schema'
  );
  assert(Array.isArray(doc.runs) && doc.runs.length === 1, 'exactly one run — no multi-run output in v1');

  const driver = doc.runs[0].tool.driver;
  assert(driver.name === 'java-vibe-guard', 'tool.driver.name is the literal CLI name');
  assert(driver.version === TOOL_META.version, 'tool.driver.version comes from the caller-supplied version (package.json in real use), never hardcoded independently');
  assert(driver.informationUri === TOOL_META.informationUri, 'tool.driver.informationUri is the repo root URL');
  assert(Array.isArray(driver.rules) && driver.rules.length > 0, 'tool.driver.rules is populated');
}

// ─── §8: no invented data ──────────────────────────────────────────────────────
console.log('\n📋 §8: no invented data — never synthesize column/end-line information');
{
  const doc = generateSarif(fixtureFindings, TOOL_META);
  const allRegions = doc.runs[0].results
    .flatMap(r => r.locations)
    .map(l => l.physicalLocation.region)
    .filter(Boolean);

  assert(allRegions.length > 0, 'sanity check — at least one line-numbered result exists in the fixture');
  assert(
    allRegions.every(r => !('endLine' in r) && !('endColumn' in r) && !('startColumn' in r)),
    'no region in the generated document ever carries endLine, endColumn, or startColumn'
  );
}

// ─── §9: no-goals not emitted ─────────────────────────────────────────────────
console.log('\n📋 §9: no-goals not emitted — deferred fields absent anywhere in the document');
{
  const doc = generateSarif(fixtureFindings, TOOL_META);
  const allKeys = collectAllKeys(doc);

  const forbiddenKeys = [
    'baselineState',
    'suppressions',
    'fixes',
    'codeFlows',
    'relatedLocations',
    'category',
  ];

  for (const key of forbiddenKeys) {
    assert(!allKeys.has(key), `"${key}" does not appear anywhere in the generated SARIF document`);
  }

  // Belt-and-suspenders: check the specific locations SARIF would actually
  // allow each of these, not just a global key sweep.
  const results = doc.runs[0].results;
  assert(results.every(r => !('suppressions' in r)), 'no individual result carries a suppressions array');
  assert(results.every(r => !('baselineState' in r)), 'no individual result carries baselineState');
  assert(results.every(r => !('fixes' in r)), 'no individual result carries fixes');
  assert(results.every(r => !('codeFlows' in r)), 'no individual result carries codeFlows');
  assert(results.every(r => !('relatedLocations' in r)), 'no individual result carries relatedLocations');
  assert(!('category' in doc.runs[0]), 'the run object carries no category field');

  assert(
    results.length === 9 && results.length === fixtureFindings.filter(f => !f.suppressed && !f.baselined).length,
    'sanity check — the document under test actually has results to sweep, not an empty array that would trivially pass'
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ SARIF contract test FAILED.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ All SARIF contract tests passed.\n`);
}
