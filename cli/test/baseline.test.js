#!/usr/bin/env node
/**
 * Contract test suite for docs/baseline.md — exercises the baseline
 * comparator (cli/src/baseline.js) at the module level, the same way
 * contract.test.js exercises suppression.js / suppression-grammar.js
 * before wiring into scanner.js / bin/cli.js.
 *
 * cli/src/baseline.js does not exist yet. This suite is expected to fail
 * on import (ERR_MODULE_NOT_FOUND), not on assertion logic — it pins down
 * the API the comparator must expose:
 *
 *   bucketKey(finding)                          — §2
 *   groupIntoBuckets(findings)                  — §2
 *   sortBucketFindings(findings)                — §3
 *   resolveBucketCounts(sortedFindings, N)       — §4  → { baseline, new }
 *   loadBaseline(projectRoot)                   — §6, §8
 *   writeBaseline(projectRoot, findings)        — §5, §7
 *   applyBaseline(findings, baseline)           — §9
 *     → every finding gets both `baselined` and `baselineSkipped` (never
 *       omitted): baselineSkipped=true means the finding was already
 *       suppressed and never evaluated (baselined is always false in that
 *       case, by convention — no evaluation happened); baselineSkipped=false
 *       means it went through the real N/M comparison, and baselined
 *       reflects the actual outcome. Same two-field pattern as
 *       suppressed/suppressedBy: one field answers "did something happen",
 *       the other answers "why/how".
 *
 * Run: node test/baseline.test.js
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  bucketKey,
  groupIntoBuckets,
  sortBucketFindings,
  resolveBucketCounts,
  loadBaseline,
  writeBaseline,
  applyBaseline,
} from '../src/baseline.js';

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

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-guard-baseline-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Builds a finding in the shape applySuppressions produces: severity, rule,
// message, location, plus the suppression decoration fields.
function finding(rule, relativePath, message, line, suppressed = false) {
  return {
    severity: 'warning',
    rule,
    message,
    location: line == null ? relativePath : `${relativePath}:${line}`,
    suppressed,
    suppressedBy: suppressed ? 'inline' : null,
    justification: suppressed ? 'test fixture' : null,
  };
}

function lineOf(f) {
  const match = /^(.*):(\d+)$/.exec(f.location);
  return match ? Number(match[2]) : null;
}

// ═══════════════════════════════════════════════════════════════════════
// §2 — Bucket identity: (ruleId, relativePath, message), line excluded
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §2.1: real multi-endpoint observability.js case — same bucket, 5 lines');
{
  // Mirrors observability.js's actual output: one literal message emitted
  // once per under-logged endpoint in the same controller file.
  const findings = [8, 15, 22, 29, 36].map(line =>
    finding('observability', 'src/UserController.java', 'Endpoint without structured logging', line)
  );

  const buckets = groupIntoBuckets(findings);
  assert(buckets.size === 1, 'all 5 endpoints collapse into exactly 1 bucket');
  const [[, bucketFindings]] = buckets;
  assert(bucketFindings.length === 5, 'the single bucket holds all 5 findings');
}

console.log('\n📋 §2.2: differing ruleId, relativePath, or message → separate buckets');
{
  const base = finding('observability', 'src/UserController.java', 'Endpoint without structured logging', 8);
  const diffRule = finding('layers', 'src/UserController.java', 'Endpoint without structured logging', 8);
  const diffPath = finding('observability', 'src/OrderController.java', 'Endpoint without structured logging', 8);
  const diffMessage = finding('observability', 'src/UserController.java', 'Different message text', 8);

  assert(bucketKey(base) !== bucketKey(diffRule), 'different ruleId → different bucket key');
  assert(bucketKey(base) !== bucketKey(diffPath), 'different relativePath → different bucket key');
  assert(bucketKey(base) !== bucketKey(diffMessage), 'different message → different bucket key');

  const buckets = groupIntoBuckets([base, diffRule, diffPath, diffMessage]);
  assert(buckets.size === 4, 'all 4 findings land in 4 distinct buckets');
}

console.log('\n📋 §2.3: line is excluded from identity — two lines, one bucket');
{
  const a = finding('kafka', 'src/Consumer.java', '@KafkaListener without explicit groupId', 10);
  const b = finding('kafka', 'src/Consumer.java', '@KafkaListener without explicit groupId', 200);
  assert(bucketKey(a) === bucketKey(b), 'identical ruleId/relativePath/message but different lines → same bucket key');
}

console.log('\n📋 §2.4: a file-level finding (no line) and a lined finding with equal fields still share a bucket');
{
  const fileLevel = finding('kafka', 'src/kafka-config.yml', 'Kafka config without consumer group.id', null);
  const lined = finding('kafka', 'src/kafka-config.yml', 'Kafka config without consumer group.id', 3);
  assert(bucketKey(fileLevel) === bucketKey(lined), 'stripping the line from identity merges file-level and lined findings when other fields match');
}

// ═══════════════════════════════════════════════════════════════════════
// §3 — Ordering within a bucket: line ascending, then stable input order
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §3.1: sortBucketFindings orders by ascending line regardless of input order');
{
  const scrambled = [30, 10, 40, 20].map(line =>
    finding('observability', 'src/Ctrl.java', 'Endpoint without structured logging', line)
  );
  const sorted = sortBucketFindings(scrambled);
  assert(sorted.map(lineOf).join(',') === '10,20,30,40', 'sorted ascending: ' + sorted.map(lineOf).join(','));
}

console.log('\n📋 §3.2: a file-level finding sorts before every lined finding (as line 0)');
{
  const lined = finding('kafka', 'src/x.yml', 'Kafka config without consumer group.id', 5);
  const fileLevel = finding('kafka', 'src/x.yml', 'Kafka config without consumer group.id', null);
  const sorted = sortBucketFindings([lined, fileLevel]);
  assert(sorted[0] === fileLevel, 'file-level finding sorts first');
  assert(sorted[1] === lined, 'lined finding sorts second');
}

console.log('\n📋 §3.3: stable tie-break — equal-line findings keep their input array order');
{
  // Same bucket key requires identical rule/path/message; tag each finding
  // with an extra marker field (ignored by identity/sort logic) purely so
  // the test can tell them apart after sorting.
  const tag = (f, id) => ({ ...f, _tag: id });
  const a = tag(finding('kafka', 'src/x.java', 'same message', 7), 'A');
  const b = tag(finding('kafka', 'src/x.java', 'same message', 7), 'B');
  const c = tag(finding('kafka', 'src/x.java', 'same message', 7), 'C');

  const sorted = sortBucketFindings([a, b, c]);
  assert(sorted.map(f => f._tag).join('') === 'ABC', 'equal-line findings preserve original array order: ' + sorted.map(f => f._tag).join(''));

  // Reversing the input order should reverse the tie-break result too —
  // proving the order comes from the input array, not some other implicit key.
  const sortedReversed = sortBucketFindings([c, b, a]);
  assert(sortedReversed.map(f => f._tag).join('') === 'CBA', 'reversed input preserves reversed relative order: ' + sortedReversed.map(f => f._tag).join(''));
}

// ═══════════════════════════════════════════════════════════════════════
// §4 — N/M comparison algorithm
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §4.1: acceptance example — N=2, M=4 → 2 baseline, 2 new');
{
  const scrambled = [30, 10, 40, 20].map(line =>
    finding('observability', 'src/Ctrl.java', 'Endpoint without structured logging', line)
  );
  const sorted = sortBucketFindings(scrambled);
  const { baseline, new: fresh } = resolveBucketCounts(sorted, 2);

  assert(baseline.length === 2, 'exactly 2 baseline findings');
  assert(fresh.length === 2, 'exactly 2 new findings');
  assert(baseline.map(lineOf).join(',') === '10,20', 'baseline = first 2 post-sort (lines 10,20): ' + baseline.map(lineOf).join(','));
  assert(fresh.map(lineOf).join(',') === '30,40', 'new = remaining 2 post-sort (lines 30,40): ' + fresh.map(lineOf).join(','));
}

console.log('\n📋 §4.2: acceptance example — N=4, M=2 → 2 baseline, 0 new');
{
  const findings = [5, 15].map(line =>
    finding('observability', 'src/Ctrl.java', 'Endpoint without structured logging', line)
  );
  const sorted = sortBucketFindings(findings);
  const { baseline, new: fresh } = resolveBucketCounts(sorted, 4);

  assert(baseline.length === 2, 'both current findings are baseline (M <= N)');
  assert(fresh.length === 0, 'zero new findings');
}

console.log('\n📋 §4.3: edge case — bucket present only in baseline (M=0) contributes nothing, no crash');
{
  const baseline = {
    version: 1,
    generatedAt: new Date().toISOString(),
    buckets: new Map([
      [bucketKey(finding('transactions', 'src/Old.java', 'stale finding, since fixed', 1)), 3],
    ]),
  };
  // No current findings at all — the bucket only exists in the baseline.
  const result = applyBaseline([], baseline);
  assert(Array.isArray(result), 'applyBaseline returns an array, does not throw');
  assert(result.length === 0, 'no phantom findings are fabricated from a baseline-only bucket');
}

console.log('\n📋 §4.4: edge case — bucket present only in current scan (N=0) → all findings new');
{
  const current = [
    finding('blocking', 'src/Job.java', 'blocking .join() detected in @Scheduled method', 12),
  ];
  const emptyBaseline = { version: 1, generatedAt: new Date().toISOString(), buckets: new Map() };
  const result = applyBaseline(current, emptyBaseline);

  assert(result.length === 1, 'the finding passes through');
  assert(result[0].baselined === false, 'a bucket absent from the baseline (N=0) is entirely new');
  assert(result[0].baselineSkipped === false, 'the finding was actually evaluated against the baseline, not skipped');
}

// ═══════════════════════════════════════════════════════════════════════
// §5 — vibeguard-baseline.json format
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §5: writeBaseline produces the documented shape');
withTempDir(dir => {
  const findings = [
    finding('observability', 'src/Ctrl.java', 'Endpoint without structured logging', 8),
    finding('observability', 'src/Ctrl.java', 'Endpoint without structured logging', 15),
    finding('blocking', 'src/Job.java', 'blocking .join() detected in @Scheduled method', 12),
  ];
  writeBaseline(dir, findings);

  const filePath = join(dir, 'vibeguard-baseline.json');
  assert(existsSync(filePath), 'vibeguard-baseline.json is written to the project root');

  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  assert(raw.version === 1, 'version is 1');
  assert(typeof raw.generatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw.generatedAt), 'generatedAt is an ISO 8601 string');
  assert(Array.isArray(raw.buckets), 'buckets is an array');
  assert(raw.buckets.length === 2, 'exactly 2 distinct buckets (2 observability + 1 blocking, grouped)');

  const observabilityBucket = raw.buckets.find(b => b.ruleId === 'observability');
  assert(observabilityBucket, 'observability bucket is present');
  assert(observabilityBucket.relativePath === 'src/Ctrl.java', 'observability bucket has the right relativePath');
  assert(observabilityBucket.message === 'Endpoint without structured logging', 'observability bucket has the right message');
  assert(observabilityBucket.count === 2, 'observability bucket count is 2');

  const blockingBucket = raw.buckets.find(b => b.ruleId === 'blocking');
  assert(blockingBucket && blockingBucket.count === 1, 'blocking bucket count is 1');
});

// ═══════════════════════════════════════════════════════════════════════
// §6 — Defensive loading
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §6.1: vibeguard-baseline.json absent → empty baseline, no crash');
withTempDir(dir => {
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 0, 'no baseline entries when the file is absent');
});

console.log('\n📋 §6.2: invalid JSON → empty baseline, no crash');
withTempDir(dir => {
  writeFileSync(join(dir, 'vibeguard-baseline.json'), '{ this is not valid json');
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 0, 'malformed JSON falls back to an empty baseline');
});

console.log('\n📋 §6.3: wrong or missing version → treated as malformed, empty baseline');
withTempDir(dir => {
  writeFileSync(join(dir, 'vibeguard-baseline.json'), JSON.stringify({
    version: 2,
    generatedAt: new Date().toISOString(),
    buckets: [{ ruleId: 'kafka', relativePath: 'x.java', message: 'm', count: 5 }],
  }));
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 0, 'version 2 (not 1) is treated the same as invalid JSON');
});
withTempDir(dir => {
  writeFileSync(join(dir, 'vibeguard-baseline.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    buckets: [{ ruleId: 'kafka', relativePath: 'x.java', message: 'm', count: 5 }],
  }));
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 0, 'missing version field is treated the same as invalid JSON');
});

console.log('\n📋 §6.4: buckets missing or not an array → empty bucket list, not fatal');
withTempDir(dir => {
  writeFileSync(join(dir, 'vibeguard-baseline.json'), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    buckets: 'not-an-array',
  }));
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 0, 'non-array buckets field yields an empty bucket list');
});
withTempDir(dir => {
  writeFileSync(join(dir, 'vibeguard-baseline.json'), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
  }));
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 0, 'missing buckets field yields an empty bucket list');
});

console.log('\n📋 §6.5: individually malformed bucket entries are discarded, valid ones survive');
withTempDir(dir => {
  const validEntry = { ruleId: 'kafka', relativePath: 'src/x.java', message: 'valid entry', count: 3 };
  writeFileSync(join(dir, 'vibeguard-baseline.json'), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    buckets: [
      validEntry,
      { ruleId: 123, relativePath: 'src/y.java', message: 'ruleId not a string', count: 1 },
      { ruleId: 'kafka', relativePath: 'src/z.java', message: 'count not an integer', count: 'three' },
      { ruleId: 'kafka', relativePath: 'src/w.java', message: 'negative count', count: -1 },
      { ruleId: 'kafka', message: 'missing relativePath', count: 2 },
    ],
  }));
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 1, 'only the 1 well-formed entry survives, the 4 malformed ones are discarded');
  assert(baseline.buckets.get(bucketKey({ rule: 'kafka', location: 'src/x.java', message: 'valid entry' })) === 3,
    'the surviving valid entry has the correct count');
});

console.log('\n📋 §6.6: duplicate bucket keys → last entry wins');
withTempDir(dir => {
  writeFileSync(join(dir, 'vibeguard-baseline.json'), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    buckets: [
      { ruleId: 'kafka', relativePath: 'src/x.java', message: 'dup', count: 1 },
      { ruleId: 'kafka', relativePath: 'src/x.java', message: 'dup', count: 9 },
    ],
  }));
  const baseline = loadBaseline(dir);
  assert(baseline.buckets.size === 1, 'duplicate keys collapse into a single bucket entry');
  assert(baseline.buckets.get(bucketKey({ rule: 'kafka', location: 'src/x.java', message: 'dup' })) === 9,
    'the last entry (count 9) wins over the first (count 1)');
});

// ═══════════════════════════════════════════════════════════════════════
// §7 — Creation / overwrite (--baseline always fully regenerates)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §7: writeBaseline fully replaces an existing file, no merge, no confirmation');
withTempDir(dir => {
  const oldFindings = [
    finding('kafka', 'src/Old.java', 'this bucket will disappear', 1),
  ];
  writeBaseline(dir, oldFindings);

  const rawBefore = JSON.parse(readFileSync(join(dir, 'vibeguard-baseline.json'), 'utf8'));
  assert(rawBefore.buckets.some(b => b.relativePath === 'src/Old.java'), 'first write recorded the old-only bucket');

  const newFindings = [
    finding('blocking', 'src/New.java', 'this bucket is new', 1),
  ];
  // Calling writeBaseline again with different findings and no extra
  // parameters (no --force/merge flag) must fully replace the file.
  writeBaseline(dir, newFindings);

  const rawAfter = JSON.parse(readFileSync(join(dir, 'vibeguard-baseline.json'), 'utf8'));
  assert(rawAfter.buckets.length === 1, 'the regenerated file has exactly 1 bucket, not 2 (no merge)');
  assert(!rawAfter.buckets.some(b => b.relativePath === 'src/Old.java'), 'the old bucket is gone entirely — full replace');
  assert(rawAfter.buckets.some(b => b.relativePath === 'src/New.java'), 'only the new bucket remains');
});

// ═══════════════════════════════════════════════════════════════════════
// §8 — Automatic consumption by file presence, no extra flag
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §8: loadBaseline picks up the file automatically — same call, no flag, differs only by presence');
withTempDir(dir => {
  const targetFinding = finding('transactions', 'src/Svc.java', '@Transactional + @Async — transaction will NOT propagate to async thread', 7);

  // No baseline file yet: the same finding is new.
  const withoutFile = applyBaseline([targetFinding], loadBaseline(dir));
  assert(withoutFile[0].baselined === false, 'without a baseline file present, the finding is new');
  assert(withoutFile[0].baselineSkipped === false, 'it was still evaluated (not suppressed) — no file just means N=0');

  // Now a baseline file exists, created from that exact finding — loadBaseline(dir)
  // is called identically (same signature, no opt-in argument) and the outcome
  // flips purely because the file is now there.
  writeBaseline(dir, [targetFinding]);
  const withFile = applyBaseline([targetFinding], loadBaseline(dir));
  assert(withFile[0].baselined === true, 'once vibeguard-baseline.json exists, the identical finding is automatically recognized as baseline');
  assert(withFile[0].baselineSkipped === false, 'still evaluated, not skipped — evaluation is what produced baselined: true');
});

// ═══════════════════════════════════════════════════════════════════════
// §9 — Interaction with the suppression pipeline
// ═══════════════════════════════════════════════════════════════════════

console.log('\n📋 §9.1: a suppressed finding is never evaluated by applyBaseline — no bucket participation');
{
  const suppressed = finding('transactions', 'src/Svc.java', 'msg', 7, true);
  const baseline = {
    version: 1,
    generatedAt: new Date().toISOString(),
    buckets: new Map([[bucketKey(suppressed), 1]]), // even if a matching baseline entry exists
  };

  const result = applyBaseline([suppressed], baseline);
  assert(result.length === 1, 'the suppressed finding still passes through');
  assert(result[0].suppressed === true, 'suppressed flag is preserved');
  assert(result[0].baselineSkipped === true, 'baselineSkipped is true — it was already suppressed, never evaluated');
  assert(result[0].baselined === false, 'baselined is false by convention when baselineSkipped is true — no real evaluation happened');
}

console.log('\n📋 §9.2: a suppressed finding does not consume its bucket\'s baseline budget');
{
  // Two findings in the same bucket: one already suppressed (inline), one not.
  // If the suppressed one wrongly counted toward M, N=1 would only cover 1 of
  // the 2 — but since it must be excluded entirely, the single non-suppressed
  // finding should be fully covered by N=1.
  const suppressedOne = finding('kafka', 'src/Consumer.java', 'shared message', 10, true);
  const activeOne = finding('kafka', 'src/Consumer.java', 'shared message', 20, false);

  const baseline = {
    version: 1,
    generatedAt: new Date().toISOString(),
    buckets: new Map([[bucketKey(activeOne), 1]]),
  };

  const result = applyBaseline([suppressedOne, activeOne], baseline);
  const skipped = result.find(f => f.location.endsWith(':10'));
  const active = result.find(f => f.location.endsWith(':20'));
  assert(skipped.baselineSkipped === true && skipped.baselined === false, 'the suppressed sibling is skipped, not counted');
  assert(active.baselineSkipped === false, 'the non-suppressed finding was actually evaluated');
  assert(active.baselined === true, 'the non-suppressed finding is fully covered by N=1 — the suppressed sibling never consumed budget');
}

console.log('\n📋 §9.3: writeBaseline excludes suppressed findings from the written count');
withTempDir(dir => {
  const findings = [
    finding('kafka', 'src/Consumer.java', 'shared message', 10, true),  // suppressed — must not count
    finding('kafka', 'src/Consumer.java', 'shared message', 20, false),
    finding('kafka', 'src/Consumer.java', 'shared message', 30, false),
  ];
  writeBaseline(dir, findings);

  const raw = JSON.parse(readFileSync(join(dir, 'vibeguard-baseline.json'), 'utf8'));
  const bucket = raw.buckets.find(b => b.relativePath === 'src/Consumer.java');
  assert(bucket.count === 2, 'only the 2 non-suppressed findings are counted, the suppressed one is excluded: got ' + bucket.count);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ Baseline contract test FAILED.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ All baseline contract tests passed.\n`);
}
