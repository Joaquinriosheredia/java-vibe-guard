#!/usr/bin/env node
/**
 * Regression suite for collectFiles() (cli/src/scanner.js) — issue #10:
 * readdirSync() entry order is filesystem/OS-dependent, so collectFiles()
 * must sort entries itself rather than trust that order, or the same
 * directory tree can yield a different files[] (and therefore a different
 * issues[] order downstream, see reporter.js/sarif.js) purely because two
 * scans ran on different machines/filesystems.
 *
 * There is no mocking library in this project's dependencies (see
 * fetch-repo.test.js), so collectFiles() accepts an optional readdirFn
 * override — same test-seam pattern as fetchRepo()'s spawnFn — purely to
 * let this suite feed it two different, controlled raw orderings for the
 * exact same directory without depending on real filesystem behavior.
 * Plain `fs.readdirSync` monkey-patching does not work here: Node's named
 * import of a builtin module is not a live binding to a later-reassigned
 * `fs.readdirSync` (verified empirically before writing this suite).
 *
 * Run: node test/scanner.test.js
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { collectFiles } from '../src/scanner.js';

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

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-guard-scanner-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── collectFiles() sorts entries regardless of readdirFn's raw order ───────
console.log('collectFiles() — deterministic order across scrambled readdirFn (issue #10)');

withTempDir((dir) => {
  // Real files on disk — content/existence is what statSync/extname need;
  // the raw *order* readdirFn hands back is what's under test, not what's
  // really on the filesystem for this directory.
  writeFileSync(join(dir, 'Zebra.java'), '');
  writeFileSync(join(dir, 'apple.java'), '');
  writeFileSync(join(dir, 'Mango.java'), '');
  writeFileSync(join(dir, 'banana.yml'), '');
  writeFileSync(join(dir, 'ignored.txt'), ''); // wrong extension — must never appear

  const realNames = ['Zebra.java', 'apple.java', 'Mango.java', 'banana.yml', 'ignored.txt'];
  const orderA = [...realNames]; // as-is
  const orderB = [...realNames].reverse(); // deliberately the opposite order
  const orderC = ['banana.yml', 'ignored.txt', 'Mango.java', 'Zebra.java', 'apple.java']; // shuffled

  function collectWithOrder(order) {
    const readdirFn = (d) => (d === dir ? order : []);
    return collectFiles(dir, [], undefined, { readdirFn });
  }

  const filesA = collectWithOrder(orderA);
  const filesB = collectWithOrder(orderB);
  const filesC = collectWithOrder(orderC);

  assert(
    JSON.stringify(filesA) === JSON.stringify(filesB) && JSON.stringify(filesB) === JSON.stringify(filesC),
    'same directory, three different raw readdirFn() orderings → identical files[] (order-independent)'
  );

  // Code-unit sort (not localeCompare): 'Mango.java' < 'Zebra.java' < 'apple.java'
  // because uppercase letters sort before lowercase in UTF-16 code-unit order.
  const expected = [
    join(dir, 'Mango.java'),
    join(dir, 'Zebra.java'),
    join(dir, 'apple.java'),
    join(dir, 'banana.yml'),
  ];
  assert(
    JSON.stringify(filesA) === JSON.stringify(expected),
    `files[] is in plain code-unit sorted order (not localeCompare): got ${JSON.stringify(filesA)}`
  );

  assert(
    !filesA.some(f => f.endsWith('ignored.txt')),
    'non-matching extension is still excluded regardless of raw readdirFn() order'
  );
});

// ─── The sort applies at every directory level, recursively ─────────────────
console.log('\ncollectFiles() — scrambled order at every nested directory level');

withTempDir((dir) => {
  mkdirSync(join(dir, 'zdir'));
  mkdirSync(join(dir, 'adir'));
  writeFileSync(join(dir, 'zdir', 'b.java'), '');
  writeFileSync(join(dir, 'zdir', 'a.java'), '');
  writeFileSync(join(dir, 'adir', 'y.java'), '');
  writeFileSync(join(dir, 'adir', 'x.java'), '');

  // readdirFn deliberately returns each directory's entries in reverse of
  // what a real sorted listing would be, at every level.
  const readdirFn = (d) => {
    if (d === dir) return ['zdir', 'adir'];
    if (d === join(dir, 'zdir')) return ['b.java', 'a.java'];
    if (d === join(dir, 'adir')) return ['y.java', 'x.java'];
    return [];
  };

  const files = collectFiles(dir, [], undefined, { readdirFn });
  const expected = [
    join(dir, 'adir', 'x.java'),
    join(dir, 'adir', 'y.java'),
    join(dir, 'zdir', 'a.java'),
    join(dir, 'zdir', 'b.java'),
  ];
  assert(
    JSON.stringify(files) === JSON.stringify(expected),
    `top-level dirs and each subdirectory's files are all sorted, depth-first: got ${JSON.stringify(files)}`
  );
});

// ─── No readdirFn override (default param) still uses the real fs ───────────
console.log('\ncollectFiles() — default readdirFn (no override) still scans the real filesystem');

withTempDir((dir) => {
  writeFileSync(join(dir, 'z.java'), '');
  writeFileSync(join(dir, 'a.java'), '');
  const files = collectFiles(dir, []); // no 4th arg — real fs.readdirSync path
  assert(
    JSON.stringify(files) === JSON.stringify([join(dir, 'a.java'), join(dir, 'z.java')]),
    'real fs.readdirSync path (default readdirFn) still returns sorted files[]'
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ Scanner contract test FAILED.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ All scanner contract tests passed.\n`);
}
