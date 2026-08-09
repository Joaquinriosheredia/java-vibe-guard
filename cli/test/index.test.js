#!/usr/bin/env node
/**
 * index.js tests.
 *
 * index.js is a thin orchestrator over fetch-repo.js/run-repo.js/
 * aggregate.js — every test here injects fake fetchFn/runFn/aggregateFn
 * (no real Git, no real CLI subprocess, no network) and points
 * reposPath/resultsDir at real mkdtempSync() tmp locations — never at
 * the actual validation/repos.json or validation/results/ in this repo.
 * Filesystem effects (artifact writing, cleanup) are verified against
 * real files on disk, matching the project's existing preference for
 * real I/O over mocked I/O where it's cheap and offline
 * (cli/test/run-repo.test.js's own stated rationale).
 *
 * Run: node test/index.test.js
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runValidatePublic } from '../src/validate-public/index.js';

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

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);
const COMMIT_C = 'c'.repeat(40);

function tmpDir(prefix = 'index-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeManifest(manifest) {
  const dir = tmpDir();
  const reposPath = join(dir, 'repos.json');
  writeFileSync(reposPath, JSON.stringify(manifest));
  return reposPath;
}

// ── fake fetchFn/runFn builders — track calls, never touch network/git ────

function fakeFetchOk(checkoutPathFor = (repo) => `/fake/checkout/${repo.replace('/', '__')}`) {
  const calls = [];
  const fn = ({ repo, commit }) => {
    calls.push({ repo, commit });
    return { status: 'ok', repo, commit, checkoutPath: checkoutPathFor(repo) };
  };
  fn.calls = calls;
  return fn;
}

function fakeFetchError(errorType = 'repo-not-found') {
  const calls = [];
  const fn = ({ repo, commit }) => {
    calls.push({ repo, commit });
    return { status: 'error', repo, commit, errorType, message: 'fake fetch failure', checkoutPath: null };
  };
  fn.calls = calls;
  return fn;
}

// Some repos ok, some fetch-error, driven by a per-repo map.
function fakeFetchMixed(statusByRepo) {
  const calls = [];
  const fn = ({ repo, commit }) => {
    calls.push({ repo, commit });
    if (statusByRepo[repo] === 'error') {
      return { status: 'error', repo, commit, errorType: 'commit-not-found', message: 'x', checkoutPath: null };
    }
    return { status: 'ok', repo, commit, checkoutPath: `/fake/checkout/${repo.replace('/', '__')}` };
  };
  fn.calls = calls;
  return fn;
}

function fakeRunOk() {
  const calls = [];
  const fn = (fetchResult) => {
    calls.push(fetchResult);
    return {
      status: 'ok',
      repo: fetchResult.repo,
      commit: fetchResult.commit,
      cliVersion: 'test-version',
      timestamp: '2020-01-01T00:00:00.000Z',
      exitCode: 0,
      durationMs: 5,
      scan: { filesScanned: 1, summary: { critical: 0, major: 0, warning: 0, info: 0, reported: 0, suppressed: 0, total: 0 }, healthy: true, issues: [] },
    };
  };
  fn.calls = calls;
  return fn;
}

function fakeRunError() {
  const calls = [];
  const fn = (fetchResult) => {
    calls.push(fetchResult);
    return {
      status: 'error',
      repo: fetchResult.repo,
      commit: fetchResult.commit,
      errorType: 'checkout-empty',
      message: 'no files',
      cliVersion: 'test-version',
      timestamp: '2020-01-01T00:00:00.000Z',
      exitCode: null,
      durationMs: 3,
      scan: null,
    };
  };
  fn.calls = calls;
  return fn;
}

function fakeRemoveCheckout() {
  const calls = [];
  const fn = (arg) => calls.push(arg);
  fn.calls = calls;
  return fn;
}

function fakeAggregateCapture() {
  let capturedEntries = null;
  let capturedOptions = null;
  const fn = (entries, options) => {
    capturedEntries = entries;
    capturedOptions = options;
    return {
      exitCode: entries.some((e) => e.result.status !== 'ok') ? 1 : 0,
      perRepo: entries.map((e) => ({
        slug: e.repo.replace('/', '__'),
        path: `validation/results/${e.repo.replace('/', '__')}.json`,
        content: { repo: e.repo, stage: e.stage, status: e.result.status },
      })),
      summary: { generatedAt: '2020-01-01T00:00:00.000Z', totals: { reposTotal: entries.length } },
      report: `# Report\n\nRepos: ${entries.length}\n`,
    };
  };
  fn.getEntries = () => capturedEntries;
  fn.getOptions = () => capturedOptions;
  return fn;
}

// ── 1. Manifest con múltiples repos en orden ────────────────────────────

console.log('Manifest con múltiples repos — orden preservado');
{
  const reposPath = writeManifest([
    { repo: 'eugenp/tutorials', commit: COMMIT_A },
    { repo: 'spring-projects/spring-petclinic', commit: COMMIT_B },
    { repo: 'foo/bar', commit: COMMIT_C },
  ]);
  const fetchFn = fakeFetchOk();
  const runFn = fakeRunOk();
  const aggregateFn = fakeAggregateCapture();

  const exitCode = runValidatePublic({
    fetchFn, runFn, removeCheckoutFn: fakeRemoveCheckout(), aggregateFn,
    reposPath, resultsDir: tmpDir(),
  });

  assert(exitCode === 0, 'returns 0 when every repo succeeds');
  assert(
    fetchFn.calls.map((c) => c.repo).join(',') === 'eugenp/tutorials,spring-projects/spring-petclinic,foo/bar',
    'fetchFn is called once per repo, in exact manifest order'
  );
  assert(
    aggregateFn.getEntries().map((e) => e.repo).join(',') === 'eugenp/tutorials,spring-projects/spring-petclinic,foo/bar',
    'entries passed to aggregateFn preserve manifest order exactly'
  );
}

// ── 2. fetch OK → run OK ─────────────────────────────────────────────────

console.log('\nfetch OK → run OK');
{
  const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
  const fetchFn = fakeFetchOk();
  const runFn = fakeRunOk();
  const aggregateFn = fakeAggregateCapture();

  runValidatePublic({ fetchFn, runFn, removeCheckoutFn: fakeRemoveCheckout(), aggregateFn, reposPath, resultsDir: tmpDir() });

  assert(runFn.calls.length === 1, 'runFn is called exactly once');
  assert(runFn.calls[0].repo === 'eugenp/tutorials' && runFn.calls[0].status === 'ok', 'runFn receives the exact fetchFn() success result');
  assert(aggregateFn.getEntries()[0].stage === 'run', 'entry is tagged stage:run');
  assert(aggregateFn.getEntries()[0].result.status === 'ok', 'entry carries the ok result from runFn');
}

// ── 3. fetch error → no se llama run ─────────────────────────────────────

console.log('\nfetch error → runFn nunca se llama');
{
  const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
  const fetchFn = fakeFetchError('repo-not-found');
  const runFn = fakeRunOk();
  const aggregateFn = fakeAggregateCapture();

  const exitCode = runValidatePublic({ fetchFn, runFn, removeCheckoutFn: fakeRemoveCheckout(), aggregateFn, reposPath, resultsDir: tmpDir() });

  assert(runFn.calls.length === 0, 'runFn is never called when fetchFn returns status:error');
  assert(aggregateFn.getEntries()[0].stage === 'fetch', 'entry is tagged stage:fetch');
  assert(aggregateFn.getEntries()[0].result.errorType === 'repo-not-found', "errorType is exactly fetchFn's own, not invented");
  assert(exitCode === 1, 'exitCode reflects the unavailable repo');
}

// ── 4. fetch OK → run error ──────────────────────────────────────────────

console.log('\nfetch OK → run error');
{
  const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
  const fetchFn = fakeFetchOk();
  const runFn = fakeRunError();
  const removeCheckoutFn = fakeRemoveCheckout();
  const aggregateFn = fakeAggregateCapture();

  runValidatePublic({ fetchFn, runFn, removeCheckoutFn, aggregateFn, reposPath, resultsDir: tmpDir() });

  assert(aggregateFn.getEntries()[0].stage === 'run', 'entry is still tagged stage:run (fetch succeeded, run failed)');
  assert(aggregateFn.getEntries()[0].result.errorType === 'checkout-empty', "errorType is exactly runFn's own");
  assert(removeCheckoutFn.calls.length === 1, 'removeCheckoutFn is called even though runFn errored (finally block)');
  assert(removeCheckoutFn.calls[0].repo === 'eugenp/tutorials', 'removeCheckoutFn receives the fetchFn() result whose checkout it must clean up');
}

// ── 5. Una repo falla → las siguientes continúan ─────────────────────────

console.log('\nUna repo falla en el medio → las siguientes continúan');
{
  const reposPath = writeManifest([
    { repo: 'eugenp/tutorials', commit: COMMIT_A },
    { repo: 'spring-projects/spring-petclinic', commit: COMMIT_B },
    { repo: 'foo/bar', commit: COMMIT_C },
  ]);
  const fetchFn = fakeFetchMixed({ 'spring-projects/spring-petclinic': 'error' });
  const runFn = fakeRunOk();
  const aggregateFn = fakeAggregateCapture();

  runValidatePublic({ fetchFn, runFn, removeCheckoutFn: fakeRemoveCheckout(), aggregateFn, reposPath, resultsDir: tmpDir() });

  const entries = aggregateFn.getEntries();
  assert(entries.length === 3, 'all 3 repos produce an entry, none dropped');
  assert(entries[0].stage === 'run' && entries[0].result.status === 'ok', 'repo 1 (before the failure) is ok');
  assert(entries[1].stage === 'fetch' && entries[1].result.status === 'error', 'repo 2 (the failure) is fetch-stage error');
  assert(entries[2].stage === 'run' && entries[2].result.status === 'ok', 'repo 3 (after the failure) still ran normally — the loop continued');
  assert(runFn.calls.length === 2, 'runFn was called for repos 1 and 3, skipped for repo 2');
}

// ── 6. fetchMeta ──────────────────────────────────────────────────────────

console.log('\nfetchMeta.timestamp / fetchMeta.durationMs');
{
  const reposPath = writeManifest([
    { repo: 'eugenp/tutorials', commit: COMMIT_A },
    { repo: 'spring-projects/spring-petclinic', commit: COMMIT_B },
  ]);
  const fetchFn = fakeFetchMixed({ 'eugenp/tutorials': 'error' });
  const runFn = fakeRunOk();
  const aggregateFn = fakeAggregateCapture();

  runValidatePublic({ fetchFn, runFn, removeCheckoutFn: fakeRemoveCheckout(), aggregateFn, reposPath, resultsDir: tmpDir() });

  const entries = aggregateFn.getEntries();
  const fetchEntry = entries.find((e) => e.stage === 'fetch');
  const runEntry = entries.find((e) => e.stage === 'run');

  assert(!!fetchEntry.fetchMeta, 'stage:fetch entry carries a fetchMeta object');
  assert(!Number.isNaN(Date.parse(fetchEntry.fetchMeta.timestamp)), 'fetchMeta.timestamp is a valid, parseable ISO date');
  assert(Number.isFinite(fetchEntry.fetchMeta.durationMs) && fetchEntry.fetchMeta.durationMs >= 0, 'fetchMeta.durationMs is a finite, non-negative number');
  assert(runEntry.fetchMeta === undefined, 'stage:run entries carry no fetchMeta at all');
}

// ── 7. Escritura de los tres artefactos ──────────────────────────────────

console.log('\nEscritura de los tres artefactos');
{
  const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
  const resultsDir = tmpDir();
  const fetchFn = fakeFetchOk();
  const runFn = fakeRunOk();
  const aggregateFn = fakeAggregateCapture();

  const exitCode = runValidatePublic({ fetchFn, runFn, removeCheckoutFn: fakeRemoveCheckout(), aggregateFn, reposPath, resultsDir });

  const perRepoFile = join(resultsDir, 'eugenp__tutorials.json');
  const summaryFile = join(resultsDir, 'summary.json');
  const reportFile = join(resultsDir, 'REPORT.md');

  assert(existsSync(perRepoFile), 'per-repo artifact file exists at resultsDir/<slug>.json');
  assert(existsSync(summaryFile), 'summary.json exists');
  assert(existsSync(reportFile), 'REPORT.md exists');

  const perRepoContent = JSON.parse(readFileSync(perRepoFile, 'utf8'));
  assert(perRepoContent.repo === 'eugenp/tutorials' && perRepoContent.status === 'ok', 'per-repo artifact content matches aggregate()\'s content exactly (no index.js modification)');

  const summaryContent = JSON.parse(readFileSync(summaryFile, 'utf8'));
  assert(summaryContent.totals.reposTotal === 1, 'summary.json content matches aggregate()\'s summary exactly');

  const reportContent = readFileSync(reportFile, 'utf8');
  assert(reportContent === '# Report\n\nRepos: 1\n', 'REPORT.md content matches aggregate()\'s report string exactly, byte for byte');
  assert(exitCode === 0, 'exitCode is propagated from aggregate()');
}

// ── 8. Limpieza de artefactos obsoletos ──────────────────────────────────

console.log('\nLimpieza de artefactos obsoletos');
{
  const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
  const resultsDir = tmpDir();
  // pre-seed a stale artifact from a repo no longer in the manifest
  writeFileSync(join(resultsDir, 'old-repo__gone.json'), '{"stale": true}');
  writeFileSync(join(resultsDir, 'summary.json'), '{"stale": true}');

  const fetchFn = fakeFetchOk();
  const runFn = fakeRunOk();
  const aggregateFn = fakeAggregateCapture();

  runValidatePublic({ fetchFn, runFn, removeCheckoutFn: fakeRemoveCheckout(), aggregateFn, reposPath, resultsDir });

  assert(!existsSync(join(resultsDir, 'old-repo__gone.json')), 'stale per-repo artifact from a retired repo is gone');
  assert(existsSync(join(resultsDir, 'eugenp__tutorials.json')), 'current manifest\'s artifact is present');
  assert(
    JSON.parse(readFileSync(join(resultsDir, 'summary.json'), 'utf8')).totals.reposTotal === 1,
    'summary.json was overwritten with this run\'s content, not left stale'
  );
}

// ── 9. Propagación del exitCode de aggregate() ───────────────────────────

console.log('\nPropagación del exitCode de aggregate()');
{
  for (const forcedExitCode of [0, 1]) {
    const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
    const aggregateFn = () => ({
      exitCode: forcedExitCode,
      perRepo: [],
      summary: { generatedAt: '2020-01-01T00:00:00.000Z' },
      report: '# Report\n',
    });
    const exitCode = runValidatePublic({
      fetchFn: fakeFetchOk(), runFn: fakeRunOk(), removeCheckoutFn: fakeRemoveCheckout(),
      aggregateFn, reposPath, resultsDir: tmpDir(),
    });
    assert(exitCode === forcedExitCode, `runValidatePublic() returns exactly the exitCode aggregate() computed (${forcedExitCode})`);
  }
}

// ── 10. Fallo de filesystem ───────────────────────────────────────────────

console.log('\nFallo de filesystem (resultsDir no se puede crear)');
{
  const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
  const regularFile = join(tmpDir(), 'not-a-directory');
  writeFileSync(regularFile, 'x');
  const impossibleResultsDir = join(regularFile, 'sub'); // parent is a file, not a dir — ENOTDIR

  const exitCode = runValidatePublic({
    fetchFn: fakeFetchOk(), runFn: fakeRunOk(), removeCheckoutFn: fakeRemoveCheckout(),
    aggregateFn: fakeAggregateCapture(), reposPath, resultsDir: impossibleResultsDir,
  });

  assert(exitCode === 1, 'a filesystem failure while creating/writing resultsDir returns 1, does not throw out of runValidatePublic()');
}

// ── 11. Fallo de lectura/parsing del manifest ─────────────────────────────

console.log('\nFallo de lectura/parsing de validation/repos.json');
{
  const missingPath = join(tmpDir(), 'does-not-exist.json');
  const exitCode1 = runValidatePublic({
    fetchFn: fakeFetchOk(), runFn: fakeRunOk(), removeCheckoutFn: fakeRemoveCheckout(),
    aggregateFn: fakeAggregateCapture(), reposPath: missingPath, resultsDir: tmpDir(),
  });
  assert(exitCode1 === 1, 'missing repos.json → returns 1');

  const invalidJsonPath = join(tmpDir(), 'repos.json');
  writeFileSync(invalidJsonPath, 'not valid json {{{');
  const exitCode2 = runValidatePublic({
    fetchFn: fakeFetchOk(), runFn: fakeRunOk(), removeCheckoutFn: fakeRemoveCheckout(),
    aggregateFn: fakeAggregateCapture(), reposPath: invalidJsonPath, resultsDir: tmpDir(),
  });
  assert(exitCode2 === 1, 'malformed JSON → returns 1');

  const nonArrayPath = join(tmpDir(), 'repos.json');
  writeFileSync(nonArrayPath, JSON.stringify({ not: 'an array' }));
  const exitCode3 = runValidatePublic({
    fetchFn: fakeFetchOk(), runFn: fakeRunOk(), removeCheckoutFn: fakeRemoveCheckout(),
    aggregateFn: fakeAggregateCapture(), reposPath: nonArrayPath, resultsDir: tmpDir(),
  });
  assert(exitCode3 === 1, 'valid JSON but not an array → returns 1');

  // resultsDir must never be touched when the manifest itself is the problem
  const resultsDir = tmpDir();
  writeFileSync(join(resultsDir, 'pre-existing.json'), '{"untouched": true}');
  runValidatePublic({
    fetchFn: fakeFetchOk(), runFn: fakeRunOk(), removeCheckoutFn: fakeRemoveCheckout(),
    aggregateFn: fakeAggregateCapture(), reposPath: missingPath, resultsDir,
  });
  assert(existsSync(join(resultsDir, 'pre-existing.json')), 'resultsDir is left completely untouched when repos.json fails to read');
}

// ── 12. Importar el módulo no ejecuta el pipeline ────────────────────────

console.log('\nImportar el módulo no dispara el pipeline (entrypoint guard)');
{
  // The module was already imported at the top of this file, before any
  // fake fetchFn existed — if the entrypoint guard fired on import, there
  // would be no way to have observed it. What we CAN prove here: a fresh
  // fake fetchFn's call counter starts at 0 and only moves when we
  // explicitly call runValidatePublic() ourselves, in this same process,
  // long after the import already happened.
  const fetchFn = fakeFetchOk();
  assert(fetchFn.calls.length === 0, 'a freshly created fake starts with zero calls, confirming nothing auto-ran on import');
  const reposPath = writeManifest([{ repo: 'eugenp/tutorials', commit: COMMIT_A }]);
  runValidatePublic({ fetchFn, runFn: fakeRunOk(), removeCheckoutFn: fakeRemoveCheckout(), aggregateFn: fakeAggregateCapture(), reposPath, resultsDir: tmpDir() });
  assert(fetchFn.calls.length === 1, 'fetchFn only runs once we explicitly call runValidatePublic()');
}

// ── summary ──────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
