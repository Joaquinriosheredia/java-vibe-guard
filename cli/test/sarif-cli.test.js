#!/usr/bin/env node
/**
 * Wiring tests for --format (text|json|sarif) and the --json compatibility
 * alias inside runGuard (scanner.js). sarif.test.js already exercises the
 * SARIF writer (cli/src/sarif.js) in isolation — this file exercises the
 * CLI-level composition: does runGuard actually route the *same*
 * visibleFindings array (docs/sarif.md §5) into text, JSON, and SARIF
 * output, and into the exit code, with zero regression on the pre-existing
 * --json behavior.
 *
 * Run: node test/sarif-cli.test.js
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../bin/cli.js');
const FIXTURES = join(__dirname, '../test-fixtures');

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

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

// Reconstructs the same `relativePath[:line]` string a finding's own
// `location` field already carries, from a SARIF physicalLocation — so a
// SARIF result and a JSON issue can be compared on equal footing.
function locationOfSarifResult(result) {
  const loc = result.locations[0].physicalLocation;
  const line = loc.region?.startLine;
  return line == null ? loc.artifactLocation.uri : `${loc.artifactLocation.uri}:${line}`;
}

function findingKeysFromJSON(json) {
  return new Set(json.issues.map(i => JSON.stringify([i.ruleId, i.location, i.message])));
}

function findingKeysFromSarif(doc) {
  return new Set(
    doc.runs[0].results.map(r => JSON.stringify([r.ruleId, locationOfSarifResult(r), r.message.text]))
  );
}

const SUPPRESSED_SRC = `package com.example;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Async;

public class Suppressed {
    @Transactional // vibe-guard: ignore transactions -- test fixture
    @Async
    public void saveAndSend() {
    }
}
`;

const ACTIVE_SRC = `package com.example;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Async;

public class Active {
    @Transactional
    @Async
    public void saveAndSend() {
    }
}
`;

// ─── Test 1: --format sarif over real test-fixtures/ produces a valid document ──
console.log('\n📋 Test 1: --format sarif over test-fixtures/ produces a well-formed SARIF 2.1.0 document');
{
  const { stdout, stderr, exitCode } = run(['--format', 'sarif', FIXTURES]);
  let doc;
  assert((() => { try { doc = JSON.parse(stdout); return true; } catch { return false; } })(), 'stdout is valid JSON');
  assert(stderr === '', 'nothing printed to stderr');

  assert(doc.version === '2.1.0', 'version is "2.1.0"');
  assert(
    doc['$schema'] === 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    'schema points at the OASIS SARIF 2.1.0 schema'
  );
  assert(doc.runs.length === 1, 'exactly one run');

  const driver = doc.runs[0].tool.driver;
  assert(driver.name === 'java-vibe-guard', 'tool.driver.name is java-vibe-guard');
  assert(typeof driver.version === 'string' && driver.version.length > 0, 'tool.driver.version is populated from package.json');
  assert(driver.informationUri === 'https://github.com/Joaquinriosheredia/java-vibe-guard', 'tool.driver.informationUri is the repo URL');
  assert(driver.rules.every(r => r.helpUri === driver.rules[0].helpUri), 'every rule shares the same helpUri');

  const results = doc.runs[0].results;
  assert(results.length === 13, `13 results, matching the 13 active findings in test-fixtures/: got ${results.length}`);
  assert(results.every(r => ['error', 'warning', 'note'].includes(r.level)), 'every result has a valid SARIF level');
  assert(results.every(r => typeof r.message.text === 'string' && r.message.text.length > 0), 'every result has a non-empty message');
  assert(
    results.every(r => typeof r.locations[0].physicalLocation.artifactLocation.uri === 'string'),
    'every result has an artifactLocation.uri'
  );
  assert(
    results.every(r => !r.locations[0].physicalLocation.artifactLocation.uri.startsWith('/')),
    'no artifactLocation.uri is an absolute path'
  );

  assert(exitCode === 1, 'exit code is 1 — test-fixtures/ has real critical findings, same as --json/text');
}

// ─── Test 2: zero regression — default (text) and --json behave exactly as before ──
console.log('\n📋 Test 2: zero regression for default text output and --json');
{
  const textRun = run([FIXTURES]);
  assert(textRun.exitCode === 1, 'default (no flags) exit code is 1, unchanged');
  assert(textRun.stdout.includes('java-vibe-guard'), 'default output still prints the human-readable header');
  assert(/CRITICAL/.test(textRun.stdout), 'default output still lists CRITICAL findings');

  const jsonRun = run(['--json', FIXTURES]);
  const json = JSON.parse(jsonRun.stdout);
  assert(jsonRun.exitCode === 1, '--json exit code is 1, unchanged');
  assert(json.summary.critical === 7, '--json summary.critical is 7 (includes the KafkaBlockingProbe.java blocking-kafka fixture and the 2 KafkaSendTimeoutTruePositive.java findings)');
  assert(json.summary.major === 1, '--json summary.major unchanged at 1');
  assert(json.summary.warning === 5, '--json summary.warning unchanged at 5');
  assert(json.summary.reported === 13 && json.summary.total === 13, '--json reported === total === 13 (was 11 before the kafka-send-timeout fixtures were added)');
  assert(json.summary.suppressed === 0, '--json suppressed is 0, unchanged');

  const formatJsonRun = run(['--format', 'json', FIXTURES]);
  const formatJson = JSON.parse(formatJsonRun.stdout);
  assert(formatJsonRun.exitCode === 1, '--format json exit code is 1, same as --json');
  assert(
    JSON.stringify({ ...json, timestamp: null }) === JSON.stringify({ ...formatJson, timestamp: null }),
    '--json and --format json produce identical output (timestamp aside) — --json is a true alias, not a separate path'
  );
}

// ─── Test 3: invalid --format value is rejected, not silently accepted ────────
console.log('\n📋 Test 3: an unknown --format value is rejected by the CLI');
{
  const { exitCode, stderr } = run(['--format', 'xml', FIXTURES]);
  assert(exitCode !== 0, 'non-zero exit code for an unrecognized format');
  assert(/invalid|choices/i.test(stderr), 'stderr explains the format is invalid');
}

// ─── Test 4: a suppressed or baseline-matched finding never reaches SARIF ─────
console.log('\n📋 Test 4: suppressed and baseline-matched findings are absent from --format sarif, end-to-end');
{
  const dir = mkdtempSync(join(tmpdir(), 'vg-sarif-filter-'));
  try {
    // Suppressed.java: inline-suppressed — must never appear in any format.
    // Active.java: baselined via a real --baseline run below — must also
    // never appear in --format sarif once the baseline is in place.
    writeFileSync(join(dir, 'Suppressed.java'), SUPPRESSED_SRC);
    writeFileSync(join(dir, 'Active.java'), ACTIVE_SRC);

    // Confirm both findings are visible before any baseline exists.
    const before = JSON.parse(run(['--json', '--rule', 'transactions', dir]).stdout);
    assert(before.issues.length === 1, 'before baselining: only the non-suppressed (Active.java) finding is visible');
    assert(before.issues[0].location.startsWith('Active.java'), 'the one visible finding is Active.java, not Suppressed.java');

    // Generate a baseline that captures Active.java's finding as pre-existing debt.
    const { exitCode: genExit } = run(['--baseline', '--rule', 'transactions', dir]);
    assert(genExit === 0, 'baseline generation succeeds');

    // Now Active.java is baseline-matched — it must vanish from SARIF too,
    // exactly like Suppressed.java, via the same visibleFindings filter.
    const sarifDoc = JSON.parse(run(['--format', 'sarif', '--rule', 'transactions', dir]).stdout);
    const sarifLocations = sarifDoc.runs[0].results.map(r => locationOfSarifResult(r));

    assert(sarifDoc.runs[0].results.length === 0, 'no results at all: the one finding is now baseline-matched, the other was already suppressed');
    assert(!sarifLocations.some(l => l.startsWith('Suppressed.java')), 'the suppressed finding is absent from SARIF results');
    assert(!sarifLocations.some(l => l.startsWith('Active.java')), 'the now-baselined finding is absent from SARIF results');

    // And the exit code reflects that too — nothing left to fail the build on.
    const { exitCode: finalExit } = run(['--format', 'sarif', '--rule', 'transactions', dir]);
    assert(finalExit === 0, 'exit code is 0 — both findings are accounted for (suppressed + baselined), none visible');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Test 5: logical equivalence — --json and --format sarif report the same findings ──
console.log('\n📋 Test 5: --json and --format sarif carry the same logical findings, only the representation differs');
{
  const json = JSON.parse(run(['--json', FIXTURES]).stdout);
  const sarif = JSON.parse(run(['--format', 'sarif', FIXTURES]).stdout);

  const jsonKeys = findingKeysFromJSON(json);
  const sarifKeys = findingKeysFromSarif(sarif);

  assert(jsonKeys.size === 13, `--json reports 13 distinct (ruleId, location, message) tuples: got ${jsonKeys.size}`);
  assert(sarifKeys.size === 13, `--format sarif reports 13 distinct (ruleId, location, message) tuples: got ${sarifKeys.size}`);

  const onlyInJson = [...jsonKeys].filter(k => !sarifKeys.has(k));
  const onlyInSarif = [...sarifKeys].filter(k => !jsonKeys.has(k));

  assert(onlyInJson.length === 0, `no finding is present in --json but missing from SARIF: ${JSON.stringify(onlyInJson)}`);
  assert(onlyInSarif.length === 0, `no finding is present in SARIF but missing from --json: ${JSON.stringify(onlyInSarif)}`);
  assert(
    jsonKeys.size === sarifKeys.size && onlyInJson.length === 0 && onlyInSarif.length === 0,
    '(ruleId, location, message) sets are exactly identical between --json and --format sarif'
  );
}

console.log('\n' + '─'.repeat(51));
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
console.log('─'.repeat(51));

if (failed > 0) {
  console.error('\n❌ SARIF CLI wiring tests failed.');
  process.exit(1);
} else {
  console.log('\n✅ All SARIF CLI wiring tests passed.');
}
