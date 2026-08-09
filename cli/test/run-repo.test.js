#!/usr/bin/env node
/**
 * run-repo.js tests.
 *
 * Unlike fetch-repo.js, scanning is 100% local — no network — so the
 * default strategy here is the REAL CLI subprocess against REAL
 * fixtures from cli/test-fixtures/ (same pattern as
 * cli/test/contract.test.js), not a mocked spawnFn. The injectable
 * `spawnFn` seam (mirrors fetch-repo.js) is used only for the one
 * scenario that's genuinely hard to trigger with a real, working
 * install: a crashed/unlaunchable subprocess.
 *
 * Run: node test/run-repo.test.js
 */
import { mkdtempSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRepo } from '../src/validate-public/run-repo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../test-fixtures');
const PACKAGE_JSON = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

const REPO = 'eugenp/tutorials'; // a label here, not a real fetch — run-repo.js never talks to GitHub
const COMMIT = 'ccab8a758d1f1f5043f897548f85a74f88d904fb';

function tmpCheckout(prefix = 'run-repo-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// ── 1-3. Real CLI + real fixtures: correct execution, findings/metrics, metadata ──

console.log('Real execution over a checkout (fixtures)');
{
  const dir = tmpCheckout();
  copyFileSync(join(FIXTURES, 'BlockingTruePositive.java'), join(dir, 'BlockingTruePositive.java'));
  copyFileSync(join(FIXTURES, 'BlockingFalsePositive.java'), join(dir, 'BlockingFalsePositive.java'));

  const result = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: dir });

  assert(result.status === 'ok', 'scan over a real checkout succeeds');
  assert(!!result.scan, 'result has a scan payload');

  // findings/métricas — known counts from these exact fixtures (BlockingTruePositive.java
  // has exactly one .join() inside a @Scheduled method; BlockingFalsePositive.java has none)
  assert(result.scan.summary.critical === 1, 'exactly 1 critical finding (the known .join() true positive)');
  assert(result.scan.filesScanned === 2, 'filesScanned counts both fixture files');
  assert(result.scan.issues.length === result.scan.summary.reported, 'issues[] length matches summary.reported');
  assert(
    result.scan.issues.some((i) => i.ruleId === 'blocking' && i.location.includes('BlockingTruePositive.java')),
    'the true-positive finding is present with the expected ruleId and file'
  );
  assert(
    !result.scan.issues.some((i) => i.location.includes('BlockingFalsePositive.java')),
    'the false-positive fixture produced no finding'
  );

  // metadata — exactly the fields fixed in contract §3
  assert(result.repo === REPO && result.commit === COMMIT, 'repo/commit are echoed exactly from the input');
  assert(result.cliVersion === PACKAGE_JSON.version, 'cliVersion matches cli/package.json');
  assert(!Number.isNaN(Date.parse(result.timestamp)), 'timestamp is a valid, parseable date');
  assert(result.exitCode === 0 || result.exitCode === 1, 'exitCode is 0 or 1');
  assert(Number.isFinite(result.durationMs) && result.durationMs >= 0, 'durationMs is a finite, non-negative number');

  assert(
    Object.keys(result).sort().join(',') ===
      ['status', 'repo', 'commit', 'cliVersion', 'timestamp', 'exitCode', 'durationMs', 'scan'].sort().join(','),
    'success result has exactly the documented top-level keys'
  );

  rmSync(dir, { recursive: true, force: true });
}

// ── normalization: projectPath + issues[] ordering (decisions 1 & 2) ───────────

console.log('\nReproducibility normalization (contract §5)');
{
  const dir = tmpCheckout();
  copyFileSync(join(FIXTURES, 'BlockingTruePositive.java'), join(dir, 'BlockingTruePositive.java'));
  const result = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: dir });

  assert(
    result.scan.projectPath === REPO,
    'scan.projectPath is normalized to the stable repo slug, not the volatile mkdtemp checkoutPath'
  );
  assert(result.scan.projectPath !== dir, 'scan.projectPath is NOT the raw checkout directory');

  rmSync(dir, { recursive: true, force: true });
}
{
  // Deterministic, offline proof of the sort itself: a scrambled, mocked CLI
  // payload with findings from two ruleIds and out-of-lexicographic-order
  // locations. No real fs traversal order involved — this isolates
  // normalizeScan()/compareIssues() from any filesystem non-determinism.
  const scrambled = JSON.stringify({
    timestamp: '2020-01-01T00:00:00.000Z',
    projectPath: '/tmp/some-mkdtemp-path-abc123',
    filesScanned: 2,
    summary: { critical: 2, major: 0, warning: 1, info: 0, reported: 3, suppressed: 0, total: 3 },
    healthy: false,
    issues: [
      { severity: 'warning', ruleId: 'kafka', location: 'B.java:5', message: 'zzz' },
      { severity: 'critical', ruleId: 'blocking', location: 'A.java:10', message: 'bbb' },
      { severity: 'critical', ruleId: 'blocking', location: 'A.java:2', message: 'aaa' },
    ],
  });
  const spawnFn = () => ({ status: 1, stdout: scrambled, stderr: '', error: null });
  const result = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: '/irrelevant' }, { spawnFn });

  const order = result.scan.issues.map((i) => `${i.ruleId}|${i.location}|${i.message}`);
  // Expected: sorted by (ruleId, location, message) as plain string comparison —
  // 'blocking' < 'kafka' lexicographically; within blocking, 'A.java:10' <
  // 'A.java:2' lexicographically too (string compare, not numeric line order —
  // '1' < '2' as characters). This is intentional and documented, not a bug.
  const expected = ['blocking|A.java:10|bbb', 'blocking|A.java:2|aaa', 'kafka|B.java:5|zzz'];
  assert(JSON.stringify(order) === JSON.stringify(expected), 'issues[] is sorted deterministically by (ruleId, location, message)');
}
{
  // Best-effort real-world proof alongside the deterministic one above: two
  // independent checkouts of identical fixture content, written in reversed
  // order, must normalize to byte-identical scan.issues.
  const dirA = tmpCheckout('run-repo-order-a-');
  const dirB = tmpCheckout('run-repo-order-b-');
  const files = ['BlockingTruePositive.java', 'KafkaTruePositive.java', 'ObservabilityTruePositive.java'];
  for (const f of files) copyFileSync(join(FIXTURES, f), join(dirA, f));
  for (const f of [...files].reverse()) copyFileSync(join(FIXTURES, f), join(dirB, f));

  const resultA = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: dirA });
  const resultB = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: dirB });

  assert(resultA.status === 'ok' && resultB.status === 'ok', 'both independent checkouts scan successfully');
  assert(
    JSON.stringify(resultA.scan.issues) === JSON.stringify(resultB.scan.issues),
    'two independent checkouts of identical content normalize to byte-identical scan.issues'
  );

  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
}

// ── 4. Checkout inválido (checkout-empty) — real CLI, real empty dir ───────────

console.log('\ncheckout-empty (real CLI, empty checkout)');
{
  const dir = tmpCheckout('run-repo-empty-');
  const result = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: dir });

  assert(result.status === 'error' && result.errorType === 'checkout-empty', 'an empty checkout classifies as checkout-empty');
  assert(result.scan === null, 'checkout-empty result has scan: null');
  assert(result.cliVersion === PACKAGE_JSON.version, 'cliVersion is still reported on failure');

  rmSync(dir, { recursive: true, force: true });
}

// ── 5. Fallo de ejecución (scan-execution-failed) — spawnFn inyectado ──────────

console.log('\nscan-execution-failed (mocked subprocess)');
{
  const spawnFn = () => ({
    status: null,
    stdout: '',
    stderr: '',
    error: Object.assign(new Error('spawnSync node ENOENT'), { code: 'ENOENT' }),
  });
  const result = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: '/irrelevant' }, { spawnFn });
  assert(result.status === 'error' && result.errorType === 'scan-execution-failed', 'unlaunchable subprocess classifies as scan-execution-failed');
  assert(result.scan === null, 'scan-execution-failed result has scan: null');
}
{
  const spawnFn = () => ({ status: 137, stdout: '', stderr: 'Killed', error: null });
  const result = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: '/irrelevant' }, { spawnFn });
  assert(
    result.status === 'error' && result.errorType === 'scan-execution-failed',
    'an exit code outside {0,1} classifies as scan-execution-failed'
  );
}
{
  const spawnFn = () => ({ status: 0, stdout: 'not valid json{{{', stderr: '', error: null });
  const result = runRepo({ status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: '/irrelevant' }, { spawnFn });
  assert(
    result.status === 'error' && result.errorType === 'scan-execution-failed',
    'unparseable stdout classifies as scan-execution-failed'
  );
}

// ── 6. Violación de invariante de entrada — nunca se llama con status:'error' ──

console.log('\nCaller-contract violation (status must be "ok")');
for (const badInput of [
  { status: 'error', repo: REPO, commit: COMMIT, checkoutPath: null },
  { status: 'ok', repo: REPO, commit: COMMIT, checkoutPath: null },
  { status: 'ok', repo: REPO, commit: COMMIT }, // checkoutPath missing
  {},
]) {
  let threw = false;
  try {
    runRepo(badInput);
  } catch {
    threw = true;
  }
  assert(threw, `runRepo(${JSON.stringify(badInput)}) throws instead of returning a silent result`);
}

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
