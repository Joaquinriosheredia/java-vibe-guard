/**
 * run-repo.js — runs the full java-vibe-guard scan against a checkout
 * produced by fetch-repo.js, and returns a self-contained, reproducible
 * result: the CLI's own JSON output (normalized, see below) plus run
 * metadata.
 *
 * Contract: docs/validation-contract.md §3 (metadata fields), §5
 * (reproducibility — what's excluded vs. normalized), and the
 * run-repo.js design discussion they close.
 *
 * Scope (deliberately narrow, mirrors fetch-repo.js):
 *   - does NOT fetch anything — must only be called with fetchRepo()'s
 *     `status:'ok'` result. Anything else is a caller/orchestrator bug,
 *     not a per-repo condition to route around — it throws.
 *   - does NOT aggregate across repos, write files to disk, or decide
 *     validate-public's overall exit code — that's index.js/aggregate.js.
 *   - does NOT import or call runGuard() directly, and does NOT modify
 *     scanner.js or bin/cli.js. runGuard() is async and side-effecting
 *     (its JSON goes to console.log via reporter.js's printJSON, not to
 *     a return value) — the only way to get structured output without
 *     touching scanner.js is to run the real CLI as a subprocess and
 *     parse its stdout, exactly like cli/test/contract.test.js already
 *     does for testing.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = join(__dirname, '../../bin/cli.js');
const PACKAGE_JSON = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

// ~50x the 2.26s measured for a full scan of eugenp/tutorials (29,141
// files) — scanning is local/offline (no network), so this only needs
// to guard against a genuine hang, not absorb normal variance.
const SCAN_TIMEOUT_MS = 120_000;

function tail(text, maxLines = 5) {
  if (!text) return '';
  const lines = text.trim().split('\n');
  return lines.slice(-maxLines).join('\n');
}

function errorResult(repo, commit, errorType, message, { timestamp, durationMs, exitCode = null }) {
  return {
    status: 'error',
    repo,
    commit,
    errorType,
    message,
    cliVersion: PACKAGE_JSON.version,
    timestamp,
    exitCode,
    durationMs,
    scan: null,
  };
}

// docs/validation-contract.md §5 — (ruleId, location, message) is a
// provably collision-free ordering key for the CLI's current rule
// implementations: every rule in cli/src/rules/*.js deduplicates its own
// findings by (location, message) before returning (verified by reading
// every rule file, not assumed), and each rule's message text is
// hardcoded, rule-specific prose that never coincides with another
// rule's message at the same location. So within one ruleId, (location,
// message) is already unique; across different ruleIds, the ruleId
// itself already distinguishes them. The `return 0` below is therefore
// unreachable today — kept as an explicit, documented graceful fallback
// rather than assuming the invariant can never change if the rules
// change in the future.
//
// Plain code-unit comparison (`<`/`>`), never `localeCompare()`:
// locale-aware collation can differ across ICU builds/machines, which
// would silently reintroduce the exact cross-machine ordering
// non-determinism (issue #10) this normalization exists to remove.
function compareIssues(a, b) {
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  if (a.location !== b.location) return a.location < b.location ? -1 : 1;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return 0;
}

// docs/validation-contract.md §5 — normalizes the two fields the CLI's
// raw JSON output is not reproducible in, at the run-repo.js boundary,
// without touching scanner.js/collectFiles() (issue #10 stays open,
// unfixed, on purpose):
//   - `projectPath` is the checkoutPath passed to the CLI, a random
//     mkdtemp path that's different on every fetchRepo() call by design
//     (§4.5, no reuse/caching) — replaced with the stable manifest slug
//     (`repo`, e.g. "eugenp/tutorials") so the persisted artifact itself
//     is reproducible, not just "ignored when diffing".
//   - `issues[]` order depends on collectFiles()'s unsorted
//     readdirSync() (issue #10) — sorted deterministically here as a
//     post-processing step over the JSON already received from the
//     subprocess, not a scanner.js fix.
function normalizeScan(rawScan, repo) {
  return {
    ...rawScan,
    projectPath: repo,
    issues: [...rawScan.issues].sort(compareIssues),
  };
}

/**
 * Runs the CLI scan against a checkout produced by fetchRepo().
 *
 * @param {{status: 'ok', repo: string, commit: string, checkoutPath: string}} input
 *   Must be exactly a fetchRepo() success result — never a failure
 *   result. Passing anything else throws; it means the orchestrator
 *   called this function when it shouldn't have (see contract §1).
 * @param {{spawnFn?: typeof spawnSync}} [overrides] - test-only seam,
 *   mirrors fetch-repo.js. Defaults to the real child_process.spawnSync.
 * @returns {object} success:
 *   {status:'ok', repo, commit, cliVersion, timestamp, exitCode,
 *    durationMs, scan}
 *   failure:
 *   {status:'error', repo, commit, errorType, message, cliVersion,
 *    timestamp, exitCode, durationMs, scan:null}
 *   Never throws for an expected per-repo scan failure (checkout-empty,
 *   scan-execution-failed) — only for the caller-contract violation
 *   above, which is not a per-repo condition.
 */
export function runRepo({ repo, commit, checkoutPath, status } = {}, { spawnFn = spawnSync } = {}) {
  if (status !== 'ok' || typeof checkoutPath !== 'string' || !checkoutPath) {
    throw new Error(
      `runRepo() must only be called with a fetchRepo() success result; got ${JSON.stringify({ status, checkoutPath })}`
    );
  }

  const startedAt = Date.now();
  const result = spawnFn(process.execPath, [CLI_BIN, checkoutPath, '--format', 'json'], {
    encoding: 'utf8',
    timeout: SCAN_TIMEOUT_MS,
  });
  const durationMs = Date.now() - startedAt;
  const timestamp = new Date().toISOString();

  // The CLI binary itself couldn't be launched (e.g. ENOENT) — not a
  // per-repo condition, since it would fail identically for every repo.
  if (result.error) {
    return errorResult(
      repo,
      commit,
      'scan-execution-failed',
      String(result.error.message || 'failed to launch the CLI subprocess'),
      { timestamp, durationMs, exitCode: null }
    );
  }

  const exitCode = result.status;
  const stdout = (result.stdout || '').trim();

  // runGuard() only ever returns 0 or 1 (cli/src/scanner.js) — anything
  // else means the process crashed outside runGuard's own control flow.
  if (exitCode !== 0 && exitCode !== 1) {
    return errorResult(
      repo,
      commit,
      'scan-execution-failed',
      tail(result.stderr) || `CLI exited with unexpected code ${exitCode}`,
      { timestamp, durationMs, exitCode }
    );
  }

  // cli/src/scanner.js:99-102 — collectFiles() found zero matching files
  // under checkoutPath, so runGuard() returns 1 *before* printJSON() ever
  // runs: stdout is empty. The checkout itself is valid (fetchRepo()
  // already succeeded) but has nothing java-vibe-guard can scan — a
  // different condition from a fetch failure, hence a different
  // errorType than any of fetchRepo()'s.
  if (!stdout) {
    return errorResult(
      repo,
      commit,
      'checkout-empty',
      tail(result.stderr) || 'no Java/config files found under checkoutPath',
      { timestamp, durationMs, exitCode }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (e) {
    return errorResult(
      repo,
      commit,
      'scan-execution-failed',
      `CLI stdout was not valid JSON: ${e.message}`,
      { timestamp, durationMs, exitCode }
    );
  }

  return {
    status: 'ok',
    repo,
    commit,
    cliVersion: PACKAGE_JSON.version,
    timestamp,
    exitCode,
    durationMs,
    scan: normalizeScan(parsed, repo),
  };
}
