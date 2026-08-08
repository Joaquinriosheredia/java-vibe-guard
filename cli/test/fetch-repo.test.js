#!/usr/bin/env node
/**
 * fetch-repo.js unit tests — mocked Git subprocess, no network, no real
 * `git` binary required.
 *
 * Covers:
 *  - input validation (docs/validation-contract.md §9.1 / §9.3) rejects
 *    invalid repo/commit before any subprocess is spawned;
 *  - Git argument construction (array form, `--` placement, FETCH_HEAD,
 *    never {shell: true});
 *  - error classification per the fixed taxonomy (invalid-input,
 *    repo-not-found, commit-not-found, network-error, checkout-failed,
 *    git-not-found);
 *  - a Git/network failure returns a structured result instead of
 *    throwing, so the orchestrator can continue with the next repo.
 *
 * There is no mocking library in this project's dependencies, so
 * fetchRepo() accepts an optional `spawnFn` override (defaulting to the
 * real child_process.spawnSync) purely as a test seam — real callers
 * (future run-repo.js) call fetchRepo({repo, commit}) exactly as
 * documented, with no second argument.
 *
 * Run: node test/fetch-repo.test.js
 */
import { existsSync } from 'node:fs';
import { fetchRepo, removeCheckout } from '../src/validate-public/fetch-repo.js';

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

const VALID_REPO = 'eugenp/tutorials';
const VALID_COMMIT = 'ccab8a758d1f1f5043f897548f85a74f88d904fb';

function ok(stdout = '') {
  return { status: 0, stdout, stderr: '', error: null, signal: null };
}
function fail(stderr, status = 128) {
  return { status, stdout: '', stderr, error: null, signal: null };
}
function enoentFailure() {
  return {
    status: null,
    stdout: '',
    stderr: '',
    error: Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' }),
    signal: null,
  };
}

// Records every invocation and answers from a queue of canned results,
// one per expected call, in call order (init, remote add, fetch, checkout).
// Any call beyond the queue's length is treated as an (unexpected) success
// so a test only needs to specify results up to the step it cares about.
function makeSpawnFn(results) {
  const calls = [];
  let i = 0;
  const spawnFn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const result = results[i] ?? ok();
    i += 1;
    return result;
  };
  spawnFn.calls = calls;
  return spawnFn;
}

const cleanupPaths = [];
function tracked(result) {
  if (result.checkoutPath) cleanupPaths.push(result.checkoutPath);
  return result;
}

// ── 1. Input validation (§9.1 / §9.3) — no subprocess must be spawned ──────

console.log('Input validation (§9.1 / §9.3)');
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: VALID_REPO, commit: 'ccab8a758d1f1f5043f897548f85a74f88d904f' }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'commit too short (39 hex) -> invalid-input');
  assert(spawnFn.calls.length === 0, 'commit too short -> git never invoked');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT + 'b' }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'commit too long (41 hex) -> invalid-input');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: VALID_REPO, commit: 'ccab8a758d1f1f5043f897548f85a74f88d904fg' }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'commit with non-hex char -> invalid-input');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT.toUpperCase() }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'uppercase commit -> invalid-input');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn });
  assert(r.status === 'ok', 'sanity: valid repo + valid commit is accepted by validation (control case)');
  tracked(r);
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: 'eugenp', commit: VALID_COMMIT }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'repo without "/" -> invalid-input');
  assert(spawnFn.calls.length === 0, 'repo without "/" -> git never invoked');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: 'eugenp/foo/tutorials', commit: VALID_COMMIT }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'repo with multiple "/" -> invalid-input');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: '-eugenp/tutorials', commit: VALID_COMMIT }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'repo starting with "-" -> invalid-input');
  assert(spawnFn.calls.length === 0, 'repo starting with "-" -> git never invoked (option-injection guard)');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: 'eugenp/tutorials!', commit: VALID_COMMIT }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'repo with disallowed character -> invalid-input');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: 'https://github.com/eugenp/tutorials', commit: VALID_COMMIT }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'full URL as repo -> invalid-input');
}
{
  const spawnFn = makeSpawnFn([]);
  const r = fetchRepo({ repo: 'eugenp /tutorials', commit: VALID_COMMIT }, { spawnFn });
  assert(r.status === 'error' && r.errorType === 'invalid-input', 'repo with space -> invalid-input');
}

// ── 2. Happy path + Git argument construction ──────────────────────────────

console.log('\nHappy path + Git argument construction');
{
  const spawnFn = makeSpawnFn([ok(), ok(), ok('branch ... -> FETCH_HEAD'), ok()]);
  const result = tracked(fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn }));
  const [init, remoteAdd, fetch, checkout] = spawnFn.calls;

  assert(result.status === 'ok', 'repo válido + commit válido -> status ok');
  assert(existsSync(result.checkoutPath), 'checkoutPath exists on disk');
  assert(
    Object.keys(result).sort().join(',') === ['checkoutPath', 'commit', 'repo', 'status'].sort().join(','),
    'success result has exactly the documented keys'
  );

  assert(spawnFn.calls.length === 4, 'exactly 4 git invocations (init, remote add, fetch, checkout)');
  assert(spawnFn.calls.every((c) => c.cmd === 'git'), 'every call invokes the `git` binary');
  assert(
    spawnFn.calls.every((c) => Array.isArray(c.args) && c.args.every((a) => typeof a === 'string')),
    'every call passes args as an array of strings (never a shell string)'
  );
  assert(
    spawnFn.calls.every((c) => c.opts && c.opts.shell !== true),
    'no call passes {shell: true}'
  );

  assert(init.args[0] === 'init' && init.args[1] === result.checkoutPath, 'step 1 is `git init <checkoutDir>`');

  assert(
    remoteAdd.args.join(' ') === `remote add -- origin https://github.com/${VALID_REPO}.git`,
    'step 2 is exactly `git remote add -- origin <url>`'
  );

  assert(
    fetch.args.join(' ') === `fetch --depth 1 -- origin ${VALID_COMMIT}`,
    'step 3 is exactly `git fetch --depth 1 -- origin <commit>`'
  );

  assert(
    checkout.args.join(' ') === 'checkout FETCH_HEAD',
    'step 4 checks out FETCH_HEAD via `git checkout FETCH_HEAD`'
  );
  assert(!checkout.args.includes(VALID_COMMIT), 'the raw commit SHA is never passed to `git checkout`');
  assert(!checkout.args.includes('--'), 'no "--" is forced before FETCH_HEAD (would change checkout semantics)');
}

// ── 3. Error classification ─────────────────────────────────────────────────

console.log('\nError classification');
{
  const spawnFn = makeSpawnFn([
    ok(),
    ok(),
    fail("remote: Repository not found.\nfatal: repository 'https://github.com/eugenp/does-not-exist.git/' not found"),
  ]);
  const r = tracked(fetchRepo({ repo: 'eugenp/does-not-exist', commit: VALID_COMMIT }, { spawnFn }));
  assert(r.status === 'error' && r.errorType === 'repo-not-found', 'nonexistent repo -> repo-not-found');
  assert(r.checkoutPath === null, 'error result has checkoutPath: null');
  assert(typeof r.message === 'string' && r.message.length > 0, 'error result has a non-empty message');
}
{
  const spawnFn = makeSpawnFn([ok(), ok(), fail(`fatal: couldn't find remote ref ${VALID_COMMIT}`)]);
  const r = tracked(fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn }));
  assert(r.status === 'error' && r.errorType === 'commit-not-found', 'nonexistent SHA -> commit-not-found');
}
{
  // GitHub's actual message for `git fetch <sha>` on a well-formed SHA it
  // doesn't have — confirmed empirically against real GitHub 2026-08-08,
  // see fetch-repo.integration.test.js. Regression-proofs that finding
  // without depending on real network.
  const spawnFn = makeSpawnFn([
    ok(),
    ok(),
    fail(`fatal: remote error: upload-pack: not our ref ${VALID_COMMIT}`),
  ]);
  const r = tracked(fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn }));
  assert(
    r.status === 'error' && r.errorType === 'commit-not-found',
    'nonexistent SHA (real GitHub wording: "not our ref") -> commit-not-found'
  );
}
{
  const spawnFn = makeSpawnFn([
    ok(),
    ok(),
    fail("fatal: unable to access 'https://github.com/eugenp/tutorials.git/': Could not resolve host: github.com"),
  ]);
  const r = tracked(fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn }));
  assert(r.status === 'error' && r.errorType === 'network-error', 'DNS/connection failure -> network-error');
}
{
  const spawnFn = makeSpawnFn([ok(), ok(), ok('branch'), fail('fatal: unable to write new index file')]);
  const r = tracked(fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn }));
  assert(
    r.status === 'error' && r.errorType === 'checkout-failed',
    'checkout step fails after a successful fetch -> checkout-failed (distinct from network-error)'
  );
}
{
  const spawnFn = makeSpawnFn([enoentFailure()]);
  const r = tracked(fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn }));
  assert(r.status === 'error' && r.errorType === 'git-not-found', 'git binary missing (ENOENT) -> git-not-found');
  assert(spawnFn.calls.length === 1, 'git-not-found is detected on the first call, no further steps attempted');
}

// ── 4. Never throws for expected (per-repo) failures ───────────────────────

console.log('\nNever throws for expected (per-repo) failures');
{
  const scenarios = [
    ['repo-not-found', [ok(), ok(), fail('remote: Repository not found.')]],
    ['commit-not-found', [ok(), ok(), fail("couldn't find remote ref")]],
    ['network-error', [ok(), ok(), fail('Could not resolve host: github.com')]],
    ['checkout-failed', [ok(), ok(), ok(), fail('fatal: unable to write new index file')]],
    ['git-not-found', [enoentFailure()]],
  ];
  for (const [label, results] of scenarios) {
    const spawnFn = makeSpawnFn(results);
    let threw = false;
    let result;
    try {
      result = fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn });
    } catch {
      threw = true;
    }
    assert(!threw, `${label} scenario does not throw`);
    if (result) tracked(result);
  }
}

// ── 5. removeCheckout() ─────────────────────────────────────────────────────

console.log('\nremoveCheckout()');
{
  assert(
    (() => {
      removeCheckout({ checkoutPath: null });
      return true;
    })(),
    'removeCheckout({checkoutPath: null}) is a safe no-op'
  );
  assert(
    (() => {
      removeCheckout({});
      return true;
    })(),
    'removeCheckout({}) is a safe no-op'
  );
}
{
  const spawnFn = makeSpawnFn([ok(), ok(), ok(), ok()]);
  const result = fetchRepo({ repo: VALID_REPO, commit: VALID_COMMIT }, { spawnFn });
  removeCheckout({ checkoutPath: result.checkoutPath });
  assert(!existsSync(result.checkoutPath), 'removeCheckout() actually deletes the checkout directory');
  assert(
    (() => {
      removeCheckout({ checkoutPath: result.checkoutPath });
      return true;
    })(),
    'calling removeCheckout() twice on the same path does not throw'
  );
}

// ── cleanup + summary ────────────────────────────────────────────────────────

for (const p of cleanupPaths) {
  removeCheckout({ checkoutPath: p });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
