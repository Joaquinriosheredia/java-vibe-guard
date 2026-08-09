#!/usr/bin/env node
/**
 * index.js — orchestrates the full validate-public pipeline: reads
 * validation/repos.json, runs fetchRepo() -> runRepo() per manifest
 * entry (in manifest order, sequentially), calls aggregate() once with
 * the collected results, and writes the three artifacts it returns to
 * validation/results/.
 *
 * Contract: docs/validation-contract.md §10.1 (index.js's expected shape
 * of entries), §10.6 (what's index.js's job vs. aggregate.js's), §5
 * (canonical excluded-fields table — fetchMeta.timestamp/durationMs are
 * the exact fields row 1/2 of that table already anticipates for
 * stage:'fetch' entries), §7 (scope — exitCode comes from aggregate(),
 * never reinterpreted here).
 *
 * Scope (deliberately narrow, mirrors fetch-repo.js / run-repo.js /
 * aggregate.js):
 *   - runValidatePublic() returns a number (0 or 1) — it never mutates
 *     process.exitCode itself and never calls process.exit(). Only the
 *     entrypoint-guard block at the bottom of this file assigns the
 *     returned number to process.exitCode, exactly mirroring bin/cli.js's
 *     own `process.exitCode = await runGuard(...)` pattern.
 *   - runFn is only ever called after a fetchFn() success (status:'ok')
 *     — a failed fetch pushes a stage:'fetch' entry and `continue`s to
 *     the next repo. runRepo() itself throws if ever called otherwise
 *     (run-repo.js:124-129), so this is enforced twice.
 *   - fetchFn()/runFn() failures (status:'error') are never wrapped in
 *     try/catch — those are the module's own documented per-repo
 *     failure surface, always returned, never thrown. Anything either
 *     module *throws* (a real environment failure or a caller-contract
 *     violation) is deliberately NOT per-repo-catchable — it propagates
 *     to the single top-level try/catch and aborts the whole run.
 *   - no new errorType values are invented anywhere — every per-repo
 *     entry's errorType/message comes verbatim from fetchRepo()/
 *     runRepo(). A broken manifest or a filesystem failure is not
 *     encoded as a per-repo entry at all; it aborts the run entirely.
 *   - no shell usage of any kind — index.js itself never spawns
 *     anything; all subprocess execution already lives inside
 *     fetchFn()/runFn().
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRepo, removeCheckout } from './fetch-repo.js';
import { runRepo } from './run-repo.js';
import { aggregate } from './aggregate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// cli/src/validate-public -> cli/src -> cli -> repo root
const REPO_ROOT = join(__dirname, '../../..');
const DEFAULT_REPOS_PATH = join(REPO_ROOT, 'validation/repos.json');
const DEFAULT_RESULTS_DIR = join(REPO_ROOT, 'validation/results');
const CLI_VERSION = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')).version;

/**
 * @param {{
 *   fetchFn?: typeof fetchRepo,
 *   runFn?: typeof runRepo,
 *   removeCheckoutFn?: typeof removeCheckout,
 *   aggregateFn?: typeof aggregate,
 *   reposPath?: string,
 *   resultsDir?: string,
 * }} [options] - every field is a test-only seam; real callers (the
 *   entrypoint block below) never pass any of them. reposPath/resultsDir
 *   let tests point at real tmpdirs instead of the actual
 *   validation/repos.json or validation/results/ — this function never
 *   touches the real repo's validation/ directory unless called with no
 *   options, which only the entrypoint guard below ever does.
 * @returns {number} 0 or 1 — the process exit code. Never throws: any
 *   failure (manifest unreadable/malformed, filesystem failure, or a
 *   propagated fetchFn()/runFn()/aggregateFn() throw) is caught here and
 *   converted to a returned 1, logged to stderr first.
 */
export function runValidatePublic(options = {}) {
  const {
    fetchFn = fetchRepo,
    runFn = runRepo,
    removeCheckoutFn = removeCheckout,
    aggregateFn = aggregate,
    reposPath = DEFAULT_REPOS_PATH,
    resultsDir = DEFAULT_RESULTS_DIR,
  } = options;

  try {
    const manifest = JSON.parse(readFileSync(reposPath, 'utf8'));
    if (!Array.isArray(manifest)) {
      throw new Error(`${reposPath} must contain a JSON array, got ${typeof manifest}`);
    }

    // Sequential, in manifest order — never Promise.all, never reordered.
    // aggregate.js expects entries already in manifest order
    // (docs/validation-contract.md §10.1); a plain for...of over the
    // parsed array trivially guarantees that.
    const entries = [];
    for (const { repo, commit } of manifest) {
      const fetchStart = Date.now();
      const fetchResult = fetchFn({ repo, commit });
      const fetchDurationMs = Date.now() - fetchStart;
      const fetchTimestamp = new Date().toISOString();

      if (fetchResult.status !== 'ok') {
        entries.push({
          repo,
          commit,
          stage: 'fetch',
          result: fetchResult,
          fetchMeta: { timestamp: fetchTimestamp, durationMs: fetchDurationMs },
        });
        continue; // runFn is never called for this repo
      }

      let runResult;
      try {
        runResult = runFn(fetchResult);
      } finally {
        // Always clean up the checkout runFn just read, whether it
        // succeeded or errored (fetch-repo.js:17-19: fetchRepo() never
        // deletes a successful checkout itself — the caller must).
        removeCheckoutFn(fetchResult);
      }
      entries.push({ repo, commit, stage: 'run', result: runResult });
    }

    const { exitCode, perRepo, summary, report } = aggregateFn(entries, { manifest, cliVersion: CLI_VERSION });

    // Wipe and recreate AFTER aggregateFn() has already computed
    // everything in memory, and right before writing — never at the
    // start of the run. If something throws mid-loop (an environment
    // failure), the previous run's artifacts are left untouched instead
    // of being replaced by an empty directory. Only once we have a
    // complete, valid result ready to write does the directory get
    // cleared, so it ends up reflecting exactly the current manifest —
    // no phantom files from repos removed from validation/repos.json.
    rmSync(resultsDir, { recursive: true, force: true });
    mkdirSync(resultsDir, { recursive: true });

    // perRepo[i].path (aggregate.js) is a REPO_ROOT-relative literal
    // ("validation/results/<slug>.json") that doesn't know about a
    // caller-supplied resultsDir override — using it directly here would
    // silently ignore the resultsDir option in tests. slug + resultsDir
    // is used instead, and is byte-identical to path in the default
    // (real) case, since DEFAULT_RESULTS_DIR is exactly what path
    // already assumes.
    for (const { slug, content } of perRepo) {
      writeFileSync(join(resultsDir, `${slug}.json`), JSON.stringify(content, null, 2));
    }
    writeFileSync(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(resultsDir, 'REPORT.md'), report);

    return exitCode;
  } catch (e) {
    console.error(e.stack || e.message || String(e));
    return 1;
  }
}

// Entrypoint guard — importing this module (e.g. from a test) never runs
// the pipeline; only running it directly (`node index.js`) does.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runValidatePublic();
}
