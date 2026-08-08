/**
 * fetch-repo.js — produces a reproducible local checkout of a single
 * pinned {repo, commit} pair from validation/repos.json.
 *
 * Contract: docs/validation-contract.md §9 (input validation & Git
 * execution safety) and the fetch-repo.js design discussion it closes.
 *
 * Scope (deliberately narrow):
 *   - does NOT run the scanner/runGuard, generate reports, or aggregate
 *     results across repos — it hands back one checkout, or a
 *     structured failure, for exactly the one {repo, commit} it's given;
 *   - does NOT read validation/repos.json itself — the orchestrator
 *     (future run-repo.js / index.js) owns iterating the manifest;
 *   - does NOT cache checkouts — every call is a fresh checkout in a
 *     fresh temp directory (docs/validation-contract.md §4.5);
 *   - does NOT delete a *successful* checkout — the caller must call
 *     removeCheckout() once it's done reading checkoutPath. A *failed*
 *     checkout is cleaned up internally, since a failure result's
 *     checkoutPath is always null and the caller has no path to clean.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// docs/validation-contract.md §9.1 — exact regexes, do not edit without
// updating that section too.
export const COMMIT_RE = /^[0-9a-f]{40}$/;
export const REPO_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;

// ~6x the 18.8s measured for the largest repo currently in scope
// (eugenp/tutorials) — generous enough to absorb normal variance
// without letting a hung fetch stall the whole validate-public run.
const GIT_TIMEOUT_MS = 120_000;

const CHECKOUT_DIR_PREFIX = 'java-vibe-guard-validate-public-';

function isValidRepo(repo) {
  return typeof repo === 'string' && REPO_RE.test(repo);
}

function isValidCommit(commit) {
  return typeof commit === 'string' && COMMIT_RE.test(commit);
}

function errorResult(repo, commit, errorType, message) {
  return { status: 'error', repo, commit, errorType, message, checkoutPath: null };
}

function tail(text, maxLines = 5) {
  if (!text) return '';
  const lines = text.trim().split('\n');
  return lines.slice(-maxLines).join('\n');
}

function buildMessage(result, fallback) {
  if (result.error) return String(result.error.message || fallback);
  return tail(result.stderr) || fallback;
}

// Classifies a failed spawnFn() result into the fixed errorType taxonomy.
// `isFetchStep` gates the repo/commit-specific classifications: only the
// `git fetch` step actually talks to the remote in a way that can
// produce "repository not found" / "couldn't find remote ref" — the
// other three steps (init, remote add, checkout) are local, so any of
// their failures that isn't "git itself is missing" is `checkout-failed`
// by definition.
function classifyGitFailure(result, { isFetchStep = false } = {}) {
  if (result.error) {
    if (result.error.code === 'ENOENT') return 'git-not-found';
    return 'network-error'; // includes ETIMEDOUT and other spawn-level failures
  }
  if (result.signal) return 'network-error'; // killed, e.g. by the timeout above
  if (!isFetchStep) return 'checkout-failed';

  const stderr = result.stderr || '';
  if (
    /repository .* not found/i.test(stderr) ||
    /could not read from remote repository/i.test(stderr)
  ) {
    return 'repo-not-found';
  }
  if (
    /couldn'?t find remote ref/i.test(stderr) ||
    /no such remote ref/i.test(stderr) ||
    /reference is not a tree/i.test(stderr) ||
    /not our ref/i.test(stderr) // GitHub's actual message for `fetch <sha>` on a real SHA it doesn't have — confirmed empirically 2026-08-08
  ) {
    return 'commit-not-found';
  }
  return 'network-error'; // could not resolve host, connection refused, etc.
}

function cleanupDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort — a cleanup failure must not mask the original Git error.
  }
}

/**
 * Fetches a single {repo, commit} pinned pair into a fresh temp checkout.
 *
 * @param {{repo: string, commit: string}} input
 * @param {{spawnFn?: typeof spawnSync}} [overrides] - test-only seam; real
 *   callers never pass this. Defaults to the real child_process.spawnSync.
 * @returns {object} success: {status:'ok', repo, commit, checkoutPath}
 *   failure: {status:'error', repo, commit, errorType, message, checkoutPath:null}
 *   Never throws for an expected per-repo failure (invalid input, Git/
 *   network/GitHub errors) — only for a real environment failure (e.g.
 *   the temp directory itself cannot be created), which the orchestrator
 *   cannot meaningfully "skip past" per repo.
 */
export function fetchRepo({ repo, commit }, { spawnFn = spawnSync } = {}) {
  if (!isValidRepo(repo)) {
    return errorResult(
      repo,
      commit,
      'invalid-input',
      `repo must match the required "owner/name" format (${REPO_RE}); got ${JSON.stringify(repo)}`
    );
  }
  if (!isValidCommit(commit)) {
    return errorResult(
      repo,
      commit,
      'invalid-input',
      `commit must be exactly 40 lowercase hex characters (${COMMIT_RE}); got ${JSON.stringify(commit)}`
    );
  }

  // Fresh directory every call — never reuse a checkout from a prior run,
  // so a corrupted or partial prior checkout can never be silently reused
  // (docs/validation-contract.md §4.5). mkdtempSync failing is a real
  // environment problem (disk full, no permission on os.tmpdir()), not a
  // per-repo failure — let it throw and propagate.
  const checkoutDir = mkdtempSync(join(tmpdir(), CHECKOUT_DIR_PREFIX));
  const url = `https://github.com/${repo}.git`;

  // Each step's args are a plain array — never a shell string, never
  // string-interpolated — per docs/validation-contract.md §9.2. `--` is
  // used where that section fixed it (steps 2 and 3); deliberately
  // omitted before FETCH_HEAD in step 4, where it would change
  // `checkout`'s argument from "revision" to "pathspec".
  const steps = [
    { args: ['init', checkoutDir], cwd: undefined, isFetchStep: false },
    { args: ['remote', 'add', '--', 'origin', url], cwd: checkoutDir, isFetchStep: false },
    { args: ['fetch', '--depth', '1', '--', 'origin', commit], cwd: checkoutDir, isFetchStep: true },
    { args: ['checkout', 'FETCH_HEAD'], cwd: checkoutDir, isFetchStep: false },
  ];

  for (const step of steps) {
    const result = spawnFn('git', step.args, {
      cwd: step.cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
    });

    if (result.status !== 0 || result.error) {
      const errorType = classifyGitFailure(result, { isFetchStep: step.isFetchStep });
      cleanupDir(checkoutDir);
      return errorResult(repo, commit, errorType, buildMessage(result, `git ${step.args[0]} failed`));
    }
  }

  return { status: 'ok', repo, commit, checkoutPath: checkoutDir };
}

/**
 * Removes a checkout produced by a successful fetchRepo() call. The
 * orchestrator owns calling this — fetch-repo.js never deletes a
 * successful checkout itself, since the scanner still needs to read it.
 * Safe no-op if checkoutPath is null/undefined or already gone.
 */
export function removeCheckout({ checkoutPath } = {}) {
  if (!checkoutPath) return;
  rmSync(checkoutPath, { recursive: true, force: true });
}
