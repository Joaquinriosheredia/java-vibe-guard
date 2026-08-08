#!/usr/bin/env node
/**
 * fetch-repo.js integration tests — REAL network calls to github.com and
 * a REAL `git` binary. No mocking: calls fetchRepo({repo, commit}) with
 * no second argument, exactly as a real caller (future run-repo.js)
 * would.
 *
 * Deliberately NOT wired into `npm test` / CI (docs/validation-contract.md
 * §9.3 keeps the fast, offline unit suite as the default). Run explicitly:
 *
 *   node test/fetch-repo.integration.test.js
 *
 * Uses spring-projects/spring-petclinic (small, already pinned in
 * validation/repos.json) rather than eugenp/tutorials — this suite only
 * needs to confirm real-world Git/GitHub behavior matches the assumed
 * error-classification text, not exercise a large monorepo.
 */
import { execFileSync } from 'node:child_process';
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

const REAL_REPO = 'spring-projects/spring-petclinic';
const REAL_COMMIT = '88e37c15cf6fc8490b01bc3e8e2c800cec1ac272'; // pinned in validation/repos.json
const NONEXISTENT_REPO = 'spring-projects/this-repo-does-not-exist-jvg-check';
const NONEXISTENT_COMMIT = '0123456789abcdef0123456789abcdef01234567'; // well-formed, not a real commit

console.log('fetch-repo.js — real Git/GitHub integration tests\n');

// ── 1. Happy path: real fetch, exact commit reproducibility ────────────────

console.log('Real fetch of a pinned repo+commit');
{
  const result = fetchRepo({ repo: REAL_REPO, commit: REAL_COMMIT });
  assert(result.status === 'ok', `fetchRepo(${REAL_REPO}@${REAL_COMMIT}) succeeds against real GitHub`);

  if (result.status === 'ok') {
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: result.checkoutPath,
      encoding: 'utf8',
    }).trim();
    assert(headSha === REAL_COMMIT, 'checked-out HEAD is exactly the requested pinned SHA (not just "a" commit)');

    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: result.checkoutPath,
      encoding: 'utf8',
    }).trim();
    assert(status === '', 'checkout has a clean working tree (no local modifications)');

    removeCheckout({ checkoutPath: result.checkoutPath });
  }
}

// ── 2. Real repo-not-found classification ───────────────────────────────────

console.log('\nReal nonexistent repo');
{
  const result = fetchRepo({ repo: NONEXISTENT_REPO, commit: REAL_COMMIT });
  assert(
    result.status === 'error' && result.errorType === 'repo-not-found',
    `fetchRepo(${NONEXISTENT_REPO}) classifies as repo-not-found against real GitHub`
  );
  assert(result.checkoutPath === null, 'failed fetch leaves checkoutPath: null');
  if (result.checkoutPath) removeCheckout({ checkoutPath: result.checkoutPath });
}

// ── 3. Real commit-not-found classification ─────────────────────────────────

console.log('\nReal repo, nonexistent commit');
{
  const result = fetchRepo({ repo: REAL_REPO, commit: NONEXISTENT_COMMIT });
  assert(
    result.status === 'error' && result.errorType === 'commit-not-found',
    `fetchRepo(${REAL_REPO}@${NONEXISTENT_COMMIT}) classifies as commit-not-found against real GitHub`
  );
  if (result.checkoutPath) removeCheckout({ checkoutPath: result.checkoutPath });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
