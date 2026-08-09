#!/usr/bin/env node
/**
 * aggregate.js tests.
 *
 * aggregate.js is pure (no filesystem, no subprocess, no network) — every
 * test here is data-in/data-out over synthetic entries shaped exactly like
 * real fetchRepo()/runRepo() results (docs/validation-contract.md §3/§9,
 * cli/src/validate-public/fetch-repo.js, cli/src/validate-public/run-repo.js).
 * No spawnFn mocking, no real Git/CLI subprocess involved.
 *
 * Run: node test/aggregate.test.js
 */
import { aggregate, slugify } from '../src/validate-public/aggregate.js';

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

const CLI_VERSION = '9.9.9-test';
const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);

// ── fixture builders — mirror the real fetch-repo.js/run-repo.js shapes ────

function makeScan({ filesScanned = 10, critical = 0, major = 0, warning = 0, info = 0, healthy, issues = [] } = {}) {
  const reported = critical + major + warning + info;
  return {
    timestamp: '2020-01-01T00:00:00.000Z',
    projectPath: 'irrelevant-for-aggregate-tests', // run-repo.js already normalizes this; aggregate.js never reads it
    filesScanned,
    summary: { critical, major, warning, info, reported, suppressed: 0, total: reported },
    healthy: healthy !== undefined ? healthy : critical === 0,
    issues,
  };
}

function makeRunOk({ repo, commit = COMMIT_A, scan, timestamp = '2020-01-01T00:00:00.000Z', exitCode = 0, durationMs = 100 }) {
  return {
    repo,
    commit,
    stage: 'run',
    result: { status: 'ok', repo, commit, cliVersion: CLI_VERSION, timestamp, exitCode, durationMs, scan },
  };
}

function makeRunError({
  repo,
  commit = COMMIT_A,
  errorType = 'checkout-empty',
  message = 'no files found',
  timestamp = '2020-01-01T00:00:00.000Z',
  exitCode = null,
  durationMs = 50,
}) {
  return {
    repo,
    commit,
    stage: 'run',
    result: { status: 'error', repo, commit, errorType, message, cliVersion: CLI_VERSION, timestamp, exitCode, durationMs, scan: null },
  };
}

function makeFetchError({
  repo,
  commit = COMMIT_A,
  errorType = 'repo-not-found',
  message = 'repository not found',
  fetchMeta = { timestamp: '2020-01-01T00:00:00.000Z', durationMs: 20 },
} = {}) {
  return {
    repo,
    commit,
    stage: 'fetch',
    result: { status: 'error', repo, commit, errorType, message, checkoutPath: null },
    fetchMeta,
  };
}

const MANIFEST = [
  { repo: 'eugenp/tutorials', commit: COMMIT_A },
  { repo: 'spring-projects/spring-petclinic', commit: COMMIT_B },
];

// ── 1. All repos ok ──────────────────────────────────────────────────────

console.log('All repos ok');
{
  const entries = [
    makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 100, critical: 1, major: 2 }) }),
    makeRunOk({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, scan: makeScan({ filesScanned: 30, warning: 1 }) }),
  ];
  const result = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });

  assert(result.exitCode === 0, 'exitCode is 0 when every repo is ok');
  assert(result.summary.totals.reposOk === 2, 'reposOk counts both repos');
  assert(result.summary.totals.reposUnavailable === 0, 'reposUnavailable is 0');
  assert(result.summary.totals.filesScanned === 130, 'filesScanned sums across repos (100+30)');
  assert(result.summary.totals.findings.critical === 1, 'critical sums correctly');
  assert(result.summary.totals.findings.major === 2, 'major sums correctly');
  assert(result.summary.totals.findings.warning === 1, 'warning sums correctly');
  assert(result.perRepo.every((p) => p.content.status === 'ok'), 'every per-repo artifact has status ok');
}

// ── 2. One unavailable (fetch) + one ok ─────────────────────────────────

console.log('\nOne unavailable (fetch failure) + one ok');
{
  const entries = [
    makeFetchError({ repo: 'eugenp/tutorials', commit: COMMIT_A, errorType: 'commit-not-found' }),
    makeRunOk({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, scan: makeScan({ filesScanned: 30, warning: 2 }) }),
  ];
  const result = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });

  assert(result.exitCode === 1, 'exitCode is 1 when at least one repo is unavailable');
  assert(result.summary.totals.reposOk === 1, 'reposOk counts only the successful repo');
  assert(result.summary.totals.reposUnavailable === 1, 'reposUnavailable counts the failed repo');
  // the failed repo must not contaminate totals derived from the ok repo
  assert(result.summary.totals.filesScanned === 30, 'filesScanned only counts the ok repo (fetch failure contributes nothing)');
  assert(result.summary.totals.findings.warning === 2, 'findings only counted from the ok repo');

  const failedEnvelope = result.perRepo.find((p) => p.slug === slugify('eugenp/tutorials')).content;
  assert(failedEnvelope.status === 'unavailable', 'failed repo envelope has status unavailable');
  assert(failedEnvelope.stage === 'fetch', 'failed repo envelope records stage:fetch');
  assert(failedEnvelope.errorType === 'commit-not-found', 'failed repo envelope carries fetchRepo() errorType unchanged');
  assert(failedEnvelope.scan === null, 'failed repo envelope has scan:null');
  assert(failedEnvelope.cliVersion === null, "fetch-stage failure has cliVersion:null — run-repo.js never executed");
}

// ── 3. All repos unavailable ─────────────────────────────────────────────

console.log('\nAll repos unavailable');
{
  const entries = [
    makeFetchError({ repo: 'eugenp/tutorials', commit: COMMIT_A, errorType: 'repo-not-found' }),
    makeRunError({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, errorType: 'checkout-empty' }),
  ];
  const result = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });

  assert(result.exitCode === 1, 'exitCode is 1 when every repo is unavailable');
  assert(result.summary.totals.reposOk === 0, 'reposOk is 0');
  assert(result.summary.totals.reposUnavailable === 2, 'reposUnavailable counts both');
  assert(result.summary.totals.filesScanned === 0, 'filesScanned is 0 — nothing was ever scanned');
  assert(
    result.summary.totals.findings.critical === 0 &&
      result.summary.totals.findings.major === 0 &&
      result.summary.totals.findings.warning === 0 &&
      result.summary.totals.findings.info === 0 &&
      result.summary.totals.findings.reported === 0,
    'every findings bucket is 0'
  );
  assert(
    result.summary.perRepo.every((r) => r.status === 'unavailable' && r.errorType),
    'every summary.perRepo entry carries its own errorType'
  );
}

// ── 4. One repo ok but scan.healthy:false — must NOT affect exitCode ────

console.log("\nOne repo ok with scan.healthy:false (critical findings) — must not fail aggregate.js");
{
  const entries = [
    makeRunOk({
      repo: 'eugenp/tutorials',
      commit: COMMIT_A,
      scan: makeScan({ filesScanned: 50, critical: 3, healthy: false, issues: [{ severity: 'critical', ruleId: 'blocking', location: 'A.java:1', message: 'x' }] }),
    }),
    makeRunOk({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, scan: makeScan({ filesScanned: 20 }) }),
  ];
  const result = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });

  const unhealthyEnvelope = result.perRepo.find((p) => p.slug === slugify('eugenp/tutorials')).content;
  assert(unhealthyEnvelope.status === 'ok', 'status is ok despite scan.healthy:false — fetch and run both succeeded');
  assert(unhealthyEnvelope.scan.healthy === false, 'scan.healthy:false is preserved unchanged in the artifact');
  assert(result.exitCode === 0, 'exitCode is 0 — scan.healthy never drives aggregate.js exit code (contract §7)');
  assert(result.summary.totals.reposUnavailable === 0, 'reposUnavailable is 0 — an unhealthy scan is not an unavailable repo');
  assert(result.summary.totals.findings.critical === 3, 'the 3 critical findings are still counted in totals');
}

// ── 5. Findings spread across multiple different repos ──────────────────

console.log('\nFindings spread across different repos sum correctly');
{
  const entries = [
    makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10, critical: 2 }) }),
    makeRunOk({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, scan: makeScan({ filesScanned: 10, major: 5 }) }),
  ];
  const result = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });
  assert(result.summary.totals.findings.critical === 2, 'critical from repo A alone is not lost');
  assert(result.summary.totals.findings.major === 5, 'major from repo B alone is not lost');
  assert(result.summary.totals.findings.reported === 7, 'reported is the sum across both repos, not just the last one processed');
}

// ── 6. Severity aggregation across mixed buckets ─────────────────────────

console.log('\nSeverity aggregation across mixed critical/major/warning/info');
{
  const entries = [
    makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10, critical: 1, major: 1, warning: 1, info: 1 }) }),
    makeRunOk({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, scan: makeScan({ filesScanned: 10, critical: 2, warning: 3 }) }),
  ];
  const result = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });
  assert(result.summary.totals.findings.critical === 3, 'critical bucket sums independently (1+2)');
  assert(result.summary.totals.findings.major === 1, 'major bucket sums independently (1+0)');
  assert(result.summary.totals.findings.warning === 4, 'warning bucket sums independently (1+3)');
  assert(result.summary.totals.findings.info === 1, 'info bucket sums independently (1+0)');
}

// ── 7. Invariant: reported === critical+major+warning+info ──────────────

console.log('\nInvariant: totals.findings.reported === sum of the four severity buckets');
{
  // Realistic mixed case, plus an all-unavailable case (0 === 0) and an
  // all-zero-findings-but-ok case, matching every severity distribution
  // reporter.js can currently produce (docs/validation-contract.md §5
  // caveat: this holds because every rule in cli/src/rules/*.js only ever
  // emits 'critical'/'major'/'warning' today — verified by reading every
  // rule file — not because reporter.js enforces it).
  const cases = [
    [
      makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10, critical: 2, major: 1, warning: 4, info: 0 }) }),
      makeRunOk({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, scan: makeScan({ filesScanned: 10, warning: 1 }) }),
    ],
    [
      makeFetchError({ repo: 'eugenp/tutorials', commit: COMMIT_A }),
      makeRunError({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B }),
    ],
    [
      makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10 }) }),
      makeRunOk({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, scan: makeScan({ filesScanned: 10 }) }),
    ],
    [   // caso 4: un repo ok con findings no triviales + un repo unavailable
        // en la MISMA llamada — el unavailable no debe aportar nada, así que
        // reported debe ser exactamente la suma de los 4 buckets del repo ok.
      makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10, critical: 3, major: 2, warning: 1, info: 1 }) }),
      makeFetchError({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B }),
    ],
  ];

  for (const entries of cases) {
    const { summary } = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });
    const { critical, major, warning, info, reported } = summary.totals.findings;
    assert(
      reported === critical + major + warning + info,
      `reported (${reported}) === critical+major+warning+info (${critical + major + warning + info})`
    );
  }

  // Caso 4 aislado, con aserciones propias (no solo el invariante genérico
  // del loop de arriba): confirma explícitamente que el repo unavailable
  // aporta CERO — no solo que la suma cuadre por casualidad.
  {
    const entries = [
      makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10, critical: 3, major: 2, warning: 1, info: 1 }) }),
      makeFetchError({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B }),
    ];
    const { summary } = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });
    const { critical, major, warning, info, reported } = summary.totals.findings;
    assert(critical === 3 && major === 2 && warning === 1 && info === 1, 'severity buckets equal the ok repo\'s own counts exactly — unavailable repo added nothing');
    assert(reported === 7, 'reported (7) comes entirely from the ok repo, not inflated or deflated by the unavailable one');
    assert(reported === critical + major + warning + info, 'invariant holds in the mixed ok+unavailable case, not just in all-ok or all-unavailable cases');
  }
}

// ── 8. Determinism ────────────────────────────────────────────────────────

console.log('\nDeterminism');
{
  const entries = [
    makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10, critical: 1 }) }),
    makeFetchError({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B }),
  ];

  const r1 = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });
  const r2 = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });

  assert(r1.exitCode === r2.exitCode, 'exitCode is identical across two calls with identical input');
  assert(JSON.stringify(r1.summary.totals) === JSON.stringify(r2.summary.totals), 'totals are byte-identical across two calls');
  assert(JSON.stringify(r1.summary.perRepo) === JSON.stringify(r2.summary.perRepo), 'summary.perRepo is byte-identical across two calls');
  assert(JSON.stringify(r1.perRepo.map((p) => p.content)) === JSON.stringify(r2.perRepo.map((p) => p.content)), 'per-repo artifact contents are byte-identical across two calls');
  // generatedAt is the one field explicitly excluded from the reproducibility
  // comparison (docs/validation-contract.md §5 canonical table) — it is
  // expected to differ (or coincidentally match) call to call, so it is
  // deliberately not asserted equal or unequal here.

  // output order must match entries/manifest order, never arrival order —
  // aggregate.js does no async work and never reorders its input.
  assert(
    r1.perRepo.map((p) => p.content.repo).join(',') === 'eugenp/tutorials,spring-projects/spring-petclinic',
    'perRepo preserves entries order exactly'
  );
  assert(
    r1.summary.perRepo.map((p) => p.repo).join(',') === 'eugenp/tutorials,spring-projects/spring-petclinic',
    'summary.perRepo preserves entries order exactly'
  );

  // feeding entries in the reverse order must reverse the output order too
  // — proof that order is driven by input order, not by any internal sort
  // or grouping by status.
  const reversed = aggregate([...entries].reverse(), { manifest: MANIFEST, cliVersion: CLI_VERSION });
  assert(
    reversed.perRepo.map((p) => p.content.repo).join(',') === 'spring-projects/spring-petclinic,eugenp/tutorials',
    'reversing input entries reverses output order — confirms no filesystem/arrival-order dependence, only input order'
  );
}

// ── 9. Artifact generation — exact shapes ─────────────────────────────────

console.log('\nArtifact generation');
{
  const entries = [
    makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 10, critical: 1 }) }),
    makeFetchError({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B, errorType: 'repo-not-found' }),
  ];
  const result = aggregate(entries, { manifest: MANIFEST, cliVersion: CLI_VERSION });

  const okEnvelope = result.perRepo.find((p) => p.slug === slugify('eugenp/tutorials')).content;
  assert(
    Object.keys(okEnvelope).sort().join(',') ===
      ['repo', 'commit', 'status', 'stage', 'errorType', 'message', 'cliVersion', 'timestamp', 'exitCode', 'durationMs', 'scan'].sort().join(','),
    'per-repo artifact (ok) has exactly the documented envelope keys'
  );

  const failedEnvelope = result.perRepo.find((p) => p.slug === slugify('spring-projects/spring-petclinic')).content;
  assert(
    Object.keys(failedEnvelope).sort().join(',') === Object.keys(okEnvelope).sort().join(','),
    'per-repo artifact (unavailable, fetch stage) has the SAME key set as an ok artifact — uniform envelope'
  );

  assert(result.perRepo[0].path === 'validation/results/eugenp__tutorials.json', 'per-repo path uses the slugified repo name');
  assert(result.perRepo[1].path === 'validation/results/spring-projects__spring-petclinic.json', 'slug replaces the single "/" with "__"');

  assert(
    Object.keys(result.summary).sort().join(',') ===
      ['generatedAt', 'cliVersion', 'manifest', 'totals', 'perRepo', 'exitCode'].sort().join(','),
    'summary.json has exactly the documented top-level keys'
  );
  assert(result.summary.manifest === MANIFEST, 'summary.manifest echoes the manifest object passed in');

  assert(typeof result.report === 'string' && result.report.startsWith('# Public Validation Report'), 'report is a markdown string with the expected title');
  assert(result.report.includes('eugenp/tutorials'), 'report table includes the ok repo');
  assert(result.report.includes('spring-projects/spring-petclinic'), 'report table includes the unavailable repo');
  assert(result.report.includes('## Unavailable repos'), 'report has an Unavailable repos section when applicable');
  assert(result.report.includes('repo-not-found'), 'report cites the errorType of the unavailable repo');
}

// ── 10. Exit codes — table-driven ─────────────────────────────────────────

console.log('\nExit codes');
{
  const scenarios = [
    {
      label: 'all ok',
      entries: [makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 5 }) })],
      expected: 0,
    },
    {
      label: 'one unavailable',
      entries: [makeFetchError({ repo: 'eugenp/tutorials', commit: COMMIT_A })],
      expected: 1,
    },
    {
      label: 'all unavailable',
      entries: [makeFetchError({ repo: 'eugenp/tutorials', commit: COMMIT_A }), makeRunError({ repo: 'spring-projects/spring-petclinic', commit: COMMIT_B })],
      expected: 1,
    },
    {
      label: 'ok with critical findings (scan.healthy:false)',
      entries: [makeRunOk({ repo: 'eugenp/tutorials', commit: COMMIT_A, scan: makeScan({ filesScanned: 5, critical: 9, healthy: false }) })],
      expected: 0,
    },
  ];

  for (const { label, entries, expected } of scenarios) {
    const result = aggregate(entries, { manifest: MANIFEST.slice(0, entries.length), cliVersion: CLI_VERSION });
    assert(result.exitCode === expected, `"${label}" → exitCode ${expected}`);
  }
}

// ── 11. Caller-contract violations ────────────────────────────────────────

console.log('\nCaller-contract violations (invalid entries throw, not silent results)');
for (const badEntries of [
  [{ repo: 'x/y', commit: COMMIT_A, stage: 'bogus', result: { status: 'ok' } }],
  [{ repo: 'x/y', commit: COMMIT_A, stage: 'fetch', result: { status: 'ok' } }], // fetch success must be re-tagged stage:'run'
  [{ repo: 'x/y', commit: COMMIT_A, stage: 'run', result: { status: 'bogus' } }],
  [{ commit: COMMIT_A, stage: 'run', result: { status: 'ok' } }], // missing repo
]) {
  let threw = false;
  try {
    aggregate(badEntries, { manifest: MANIFEST, cliVersion: CLI_VERSION });
  } catch {
    threw = true;
  }
  assert(threw, `aggregate(${JSON.stringify(badEntries)}) throws instead of returning a silent result`);
}

// ── summary ──────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
