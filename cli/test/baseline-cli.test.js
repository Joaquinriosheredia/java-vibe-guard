#!/usr/bin/env node
/**
 * Wiring tests for --baseline and automatic baseline consumption inside
 * runGuard (scanner.js). baseline.test.js already exercises the comparator
 * (bucketKey, applyBaseline, writeBaseline, ...) in isolation — this file
 * exercises the CLI-level composition: does runGuard actually call those
 * functions, in the right order, with the right inputs.
 *
 * Run: node test/baseline-cli.test.js
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import {
  mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, cpSync,
} from 'fs';
import { tmpdir } from 'os';
import { collectFiles } from '../src/scanner.js';
import { applySuppressions } from '../src/suppression.js';
import { loadConfig } from '../src/config.js';
import { loadBaseline, applyBaseline } from '../src/baseline.js';
import { checkTransactions } from '../src/rules/transactions.js';

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

// Mirrors runGuard's own pipeline (scanner.js) using its exported pieces,
// so the assertions below are checking the exact composition runGuard uses —
// not a re-implementation of it.
function scanWithBaseline(dir) {
  const config = loadConfig(dir);
  const files = collectFiles(dir, []);
  const fileContexts = files.map(filePath => ({
    filePath,
    lines: readFileSync(filePath, 'utf8').split('\n'),
    relativePath: relative(dir, filePath),
    fileName: filePath.split('/').pop(),
  }));
  const allFindings = checkTransactions(fileContexts);
  const decorated = applySuppressions(allFindings, fileContexts, config);
  const baseline = loadBaseline(dir);
  return applyBaseline(decorated, baseline);
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

// ─── Test 1: --baseline generates the file correctly over real test-fixtures/ ──
console.log('\n📋 Test 1: --baseline writes vibeguard-baseline.json from a real scan');
{
  const dir = mkdtempSync(join(tmpdir(), 'vg-baseline-gen-'));
  try {
    cpSync(FIXTURES, dir, { recursive: true });
    const { stdout, exitCode } = run(['--baseline', dir]);

    assert(exitCode === 0, 'exit code is 0 — baseline creation is not a pass/fail check');
    assert(stdout.includes('Baseline written to vibeguard-baseline.json'), 'stdout confirms the write');
    assert(!/CRITICAL|WARNING/.test(stdout), 'no normal report is printed in --baseline mode');

    const written = JSON.parse(readFileSync(join(dir, 'vibeguard-baseline.json'), 'utf8'));
    assert(written.version === 1, 'written file has version 1');
    assert(typeof written.generatedAt === 'string', 'written file has a generatedAt timestamp');
    assert(Array.isArray(written.buckets), 'written file has a buckets array');

    const totalCount = written.buckets.reduce((sum, b) => sum + b.count, 0);
    assert(totalCount === 11, `bucket counts sum to the 11 active findings in test-fixtures/: got ${totalCount}`);

    const activeCount = totalCount;
    assert(
      stdout.includes(`generated from ${activeCount} active findings; 0 suppressed findings omitted`),
      'confirmation message reports the right active/suppressed counts'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Test 2: --baseline overwrites an existing file without asking (§7) ────────
console.log('\n📋 Test 2: --baseline fully replaces an existing baseline file');
{
  const dir = mkdtempSync(join(tmpdir(), 'vg-baseline-overwrite-'));
  try {
    writeFileSync(join(dir, 'Active.java'), ACTIVE_SRC);
    writeFileSync(join(dir, 'vibeguard-baseline.json'), JSON.stringify({
      version: 1,
      generatedAt: '2020-01-01T00:00:00.000Z',
      buckets: [{ ruleId: 'stale-rule', relativePath: 'Gone.java', message: 'stale', count: 99 }],
    }));

    const { exitCode } = run(['--baseline', dir]);
    assert(exitCode === 0, 'exit code is 0');

    const written = JSON.parse(readFileSync(join(dir, 'vibeguard-baseline.json'), 'utf8'));
    assert(
      !written.buckets.some(b => b.ruleId === 'stale-rule'),
      'the stale bucket from the old file is gone — no merge'
    );
    assert(
      written.buckets.some(b => b.relativePath === 'Active.java'),
      'the new file reflects the current scan'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Test 3: a write failure exits 1 with a clear message, not a crash ────────
console.log('\n📋 Test 3: write failure is caught, not an unhandled exception');
{
  const dir = mkdtempSync(join(tmpdir(), 'vg-baseline-write-fail-'));
  try {
    writeFileSync(join(dir, 'Active.java'), ACTIVE_SRC);
    chmodSync(dir, 0o555); // read + execute only — writeFileSync into dir will EACCES

    const { stdout, stderr, exitCode } = run(['--baseline', dir]);

    assert(exitCode === 1, 'exit code is 1 on write failure');
    assert(stderr.includes('Failed to write vibeguard-baseline.json'), 'stderr has our controlled error message');
    assert(!stdout.includes('Baseline written'), 'stdout does not falsely confirm a write');
    assert(!/at .*\(.*node:internal/.test(stderr), 'stderr is not a raw Node stack trace — the error was caught, not thrown');
  } finally {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Test 4: automatic consumption decorates findings with baselined/baselineSkipped ──
console.log('\n📋 Test 4: automatic consumption decorates findings when vibeguard-baseline.json exists');
{
  const dir = mkdtempSync(join(tmpdir(), 'vg-baseline-consume-'));
  try {
    writeFileSync(join(dir, 'Suppressed.java'), SUPPRESSED_SRC);
    writeFileSync(join(dir, 'Active.java'), ACTIVE_SRC);

    // Generate a real baseline via the actual --baseline flag first (only the
    // Active.java finding gets a bucket — Suppressed.java's is never counted).
    const { exitCode: genExit } = run(['--baseline', dir]);
    assert(genExit === 0, 'baseline generation for the fixture project succeeds');

    const decorated = scanWithBaseline(dir);
    assert(decorated.length === 2, 'both findings are present (one suppressed, one active)');

    const suppressedFinding = decorated.find(f => f.suppressed);
    const activeFinding = decorated.find(f => !f.suppressed);

    assert(!!suppressedFinding, 'the suppressed finding is in the result');
    assert(suppressedFinding.baselineSkipped === true, 'suppressed finding: baselineSkipped is true — never evaluated');
    assert(suppressedFinding.baselined === false, 'suppressed finding: baselined is false by convention');

    assert(!!activeFinding, 'the active finding is in the result');
    assert(activeFinding.baselineSkipped === false, 'active finding: baselineSkipped is false — it was evaluated');
    assert(activeFinding.baselined === true, 'active finding: baselined is true — it matches the freshly written baseline');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Test 5: zero regression with no vibeguard-baseline.json and no --baseline ─
console.log('\n📋 Test 5: zero regression when no baseline file and no --baseline flag are involved');
{
  const dir = mkdtempSync(join(tmpdir(), 'vg-baseline-noop-'));
  try {
    cpSync(FIXTURES, dir, { recursive: true });
    const { stdout, exitCode } = run(['--json', dir]);
    const json = JSON.parse(stdout);

    assert(json.summary.critical === 5, 'summary.critical is 5 (includes the KafkaBlockingProbe.java blocking-kafka fixture)');
    assert(json.summary.major === 1, 'summary.major unchanged at 1');
    assert(json.summary.warning === 5, 'summary.warning unchanged at 5');
    assert(json.summary.reported === 11 && json.summary.total === 11, 'reported === total === 11 (was 10 before the blocking-kafka fixture was added)');
    assert(json.summary.suppressed === 0, 'suppressed is 0, unchanged');
    assert(exitCode === 1, 'exit code is 1, unchanged — real criticals still fail the build');
    assert(
      json.issues.every(i => !('baselined' in i) && !('baselineSkipped' in i)),
      'baseline decoration is an internal pipeline detail — not part of the public JSON contract'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('\n' + '─'.repeat(51));
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
console.log('─'.repeat(51));

if (failed > 0) {
  console.error('\n❌ Baseline CLI wiring tests failed.');
  process.exit(1);
} else {
  console.log('\n✅ All baseline CLI wiring tests passed.');
}
