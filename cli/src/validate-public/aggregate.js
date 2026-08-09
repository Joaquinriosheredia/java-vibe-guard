/**
 * aggregate.js — combines the per-repo results produced by index.js's
 * manifest loop (one fetchRepo()/runRepo() outcome per validation/repos.json
 * entry) into the three validate-public artifacts (per-repo JSON,
 * summary.json, REPORT.md) and the process exit code.
 *
 * Contract: docs/validation-contract.md §3 (artifacts), §5 (reproducibility
 * — canonical excluded-fields table), §6 (unavailable repos), §7 (scope:
 * scan.healthy never affects the exit code, only status/errorType does).
 *
 * Scope (deliberately narrow, mirrors fetch-repo.js / run-repo.js):
 *   - pure: no filesystem, no subprocess, no network, no process.exit.
 *     index.js owns reading validation/repos.json, calling fetchRepo()/
 *     runRepo() per manifest entry (in manifest order), writing the three
 *     artifacts this module returns to disk, and exiting with the returned
 *     exitCode.
 *   - does NOT recompute metrics fetch-repo.js/run-repo.js/the CLI already
 *     computed (filesScanned, per-severity counts) — it only sums
 *     already-computed per-repo numbers, read straight off scan.summary.
 *   - does NOT use scan.healthy to decide the exit code (§7): whether the
 *     *scanned code* has critical findings is a different question from
 *     whether *this repo's validation run* completed. Only status/errorType
 *     (did fetch/run succeed?) drives exitCode — a repo with
 *     status:'ok' and scan.healthy:false still counts as 'ok' here.
 *   - does NOT read validation/repos.json or call fetchRepo()/runRepo()
 *     itself — index.js owns the loop and hands this module its results.
 */

// docs/validation-contract.md §2 — findings.reported and the four severity
// buckets below are the CLI's own closed rank (cli/src/rule-catalog.js:9,
// cli/src/reporter.js:4 SEVERITY_ORDER, cli/src/sarif.js:37 SEVERITY_RANK).
// Every rule currently in cli/src/rules/*.js emits only 'critical', 'major',
// or 'warning' (verified by reading every rule file) — 'info' is a defined
// tier never emitted today. reporter.js:124 does not validate f.severity
// against this list before counting it, so
// totals.findings.reported === critical+major+warning+info is a property of
// the current rule set (no rule emits a 5th severity value), not a
// structural guarantee enforced anywhere — same caveat run-repo.js already
// documents for its own sort-key collision-freedom (run-repo.js:60-71).
const SEVERITY_KEYS = ['critical', 'major', 'warning', 'info'];

// repo is always exactly "owner/name" (enforced upstream by fetch-repo.js's
// REPO_RE, docs/validation-contract.md §9.1: one '/', both sides
// [A-Za-z0-9.-], anchored) — a single replace is sufficient, there is never
// a second '/' to worry about.
export function slugify(repo) {
  return repo.replace('/', '__');
}

function shortCommit(commit) {
  return typeof commit === 'string' ? commit.slice(0, 7) : commit;
}

function validateEntry({ repo, commit, stage, result }) {
  if (typeof repo !== 'string' || typeof commit !== 'string') {
    throw new Error(`aggregate() entry missing repo/commit: ${JSON.stringify({ repo, commit })}`);
  }
  if (stage !== 'fetch' && stage !== 'run') {
    throw new Error(`aggregate() entry for ${repo} has invalid stage ${JSON.stringify(stage)} — must be 'fetch' or 'run'`);
  }
  if (!result || (result.status !== 'ok' && result.status !== 'error')) {
    throw new Error(`aggregate() entry for ${repo} has an invalid result.status: ${JSON.stringify(result && result.status)}`);
  }
  // A fetchRepo() success never reaches this module as stage:'fetch' —
  // index.js only tags an entry stage:'fetch' when it never got to call
  // runRepo() at all. A stage:'fetch' entry carrying status:'ok' means
  // index.js's own loop is wrong, not a per-repo condition to route around.
  if (stage === 'fetch' && result.status !== 'error') {
    throw new Error(
      `aggregate() entry for ${repo} is tagged stage:'fetch' but result.status is 'ok' — ` +
        `a successful fetch must be tagged stage:'run' after runRepo() executes`
    );
  }
}

// Builds the uniform per-repo artifact envelope (docs/validation-contract.md
// §3) from one index.js-supplied entry. Same key set regardless of which
// stage produced the result, so the artifact is easy to diff/consume
// without duck-typing which stage failed.
function buildEnvelope(entry) {
  validateEntry(entry);
  const { repo, commit, stage, result, fetchMeta } = entry;

  if (stage === 'run') {
    const isOk = result.status === 'ok';
    return {
      repo,
      commit,
      status: isOk ? 'ok' : 'unavailable',
      stage,
      errorType: isOk ? null : result.errorType,
      message: isOk ? null : result.message,
      cliVersion: result.cliVersion,
      timestamp: result.timestamp,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      scan: isOk ? result.scan : null,
    };
  }

  // stage === 'fetch' — result is always a fetchRepo() failure result.
  // fetchRepo() itself reports no timestamp/durationMs (docs/validation-
  // contract.md gap analysis) — index.js is expected to capture fetchMeta
  // (its own Date.now()/toISOString() around the fetchRepo() call) and pass
  // it through; falls back to null if index.js didn't supply it, rather
  // than throwing, since a missing timing field is not a caller-contract
  // violation on the scale of a missing repo/commit/stage.
  return {
    repo,
    commit,
    status: 'unavailable',
    stage,
    errorType: result.errorType,
    message: result.message,
    cliVersion: null,
    timestamp: fetchMeta ? fetchMeta.timestamp : null,
    exitCode: null,
    durationMs: fetchMeta ? fetchMeta.durationMs : null,
    scan: null,
  };
}

// Sums numbers fetch-repo.js/run-repo.js/the CLI already computed — never
// re-derives a count from scan.issues[] itself.
function computeTotals(envelopes) {
  const totals = {
    reposTotal: envelopes.length,
    reposOk: 0,
    reposUnavailable: 0,
    filesScanned: 0,
    findings: { critical: 0, major: 0, warning: 0, info: 0, reported: 0 },
  };

  for (const e of envelopes) {
    if (e.status !== 'ok') {
      totals.reposUnavailable++;
      continue;
    }
    totals.reposOk++;
    totals.filesScanned += e.scan.filesScanned;
    for (const key of SEVERITY_KEYS) {
      totals.findings[key] += e.scan.summary[key];
    }
    // Read straight from the CLI's own summary.reported, not recomputed as
    // a sum of the four buckets above — see the SEVERITY_KEYS comment for
    // why these two are expected, but not structurally guaranteed, to agree.
    totals.findings.reported += e.scan.summary.reported;
  }

  return totals;
}

// Compact per-repo index for summary.json — status/counts only, not a
// duplicate of each repo's full scan.issues[] (that detail lives in the
// per-repo artifact file).
function buildSummaryPerRepo(envelopes) {
  return envelopes.map((e) => ({
    repo: e.repo,
    commit: e.commit,
    slug: slugify(e.repo),
    status: e.status,
    stage: e.stage,
    errorType: e.errorType,
    filesScanned: e.status === 'ok' ? e.scan.filesScanned : null,
    findings:
      e.status === 'ok'
        ? {
            critical: e.scan.summary.critical,
            major: e.scan.summary.major,
            warning: e.scan.summary.warning,
            info: e.scan.summary.info,
          }
        : null,
    healthy: e.status === 'ok' ? e.scan.healthy : null,
  }));
}

function buildReport({ generatedAt, cliVersion, totals, perRepo }) {
  const lines = [];
  lines.push('# Public Validation Report');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`CLI version: ${cliVersion}`);
  lines.push('');
  lines.push(
    '**Scope note:** this measures CLI stability and reproducibility on real codebases, ' +
      'not detection quality — see docs/validation-contract.md §7. A repo with `healthy: false` ' +
      '(critical findings in the scanned code) is an expected result, not a failed validation run.'
  );
  lines.push('');
  lines.push('## Repos');
  lines.push('');
  lines.push('| Repo | Commit | Status | Files scanned | Critical | Major | Warning | Info | Healthy |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of perRepo) {
    const f = r.findings || {};
    lines.push(
      `| ${r.repo} | ${shortCommit(r.commit)} | ${r.status} | ${r.filesScanned ?? '—'} | ` +
        `${f.critical ?? '—'} | ${f.major ?? '—'} | ${f.warning ?? '—'} | ${f.info ?? '—'} | ${r.healthy ?? '—'} |`
    );
  }
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Repos: ${totals.reposOk}/${totals.reposTotal} ok, ${totals.reposUnavailable} unavailable`);
  lines.push(`- Files scanned: ${totals.filesScanned}`);
  lines.push(
    `- Findings: ${totals.findings.reported} reported ` +
      `(${totals.findings.critical} critical, ${totals.findings.major} major, ` +
      `${totals.findings.warning} warning, ${totals.findings.info} info)`
  );

  const unavailable = perRepo.filter((r) => r.status === 'unavailable');
  if (unavailable.length > 0) {
    lines.push('');
    lines.push('## Unavailable repos');
    lines.push('');
    for (const r of unavailable) {
      lines.push(`- \`${r.repo}\` (${r.stage}): ${r.errorType}`);
    }
  }

  return lines.join('\n');
}

/**
 * @param {Array<{repo: string, commit: string, stage: 'fetch'|'run', result: object, fetchMeta?: {timestamp: string, durationMs: number}}>} entries
 *   One element per validation/repos.json entry, in manifest order.
 *   stage:'run' + result = a runRepo() return value verbatim (ok or error).
 *   stage:'fetch' + result = a fetchRepo() FAILURE result verbatim (a
 *   fetchRepo() success is never passed with stage:'fetch' — it must be
 *   re-tagged stage:'run' after runRepo() executes on it).
 * @param {{manifest: Array<{repo: string, commit: string}>, cliVersion: string}} options
 *   manifest: the full validation/repos.json content, echoed into
 *   summary.json as-is. cliVersion: resolved by the caller (index.js) —
 *   this module never reads cli/package.json itself, to stay pure.
 * @returns {{exitCode: 0|1, perRepo: Array<{slug: string, path: string, content: object}>, summary: object, report: string}}
 *   perRepo[i].path is the exact validation/results/<slug>.json path;
 *   index.js writes perRepo[i].content there, summary to
 *   validation/results/summary.json, and report to
 *   validation/results/REPORT.md.
 */
export function aggregate(entries, { manifest, cliVersion }) {
  const envelopes = entries.map(buildEnvelope);
  const totals = computeTotals(envelopes);
  // docs/validation-contract.md §7 / §5 (concrete case): exitCode depends
  // only on status/errorType (did the validation run complete?), never on
  // scan.healthy (does the scanned code have critical findings?) — a repo
  // with status:'ok' and scan.healthy:false does not affect this.
  const exitCode = totals.reposUnavailable > 0 ? 1 : 0;
  const generatedAt = new Date().toISOString();

  const perRepo = envelopes.map((e) => ({
    slug: slugify(e.repo),
    path: `validation/results/${slugify(e.repo)}.json`,
    content: e,
  }));

  const summaryPerRepo = buildSummaryPerRepo(envelopes);

  const summary = {
    generatedAt,
    cliVersion,
    manifest,
    totals,
    perRepo: summaryPerRepo,
    exitCode,
  };

  const report = buildReport({ generatedAt, cliVersion, totals, perRepo: summaryPerRepo });

  return { exitCode, perRepo, summary, report };
}
