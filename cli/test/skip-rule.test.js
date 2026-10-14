#!/usr/bin/env node
/**
 * --skip-rule <ids>: findings of the named rule ids are not reported, in any
 * format, and do not count for the exit code. Everything else is identical to
 * the default scan of test-fixtures/. observability is opt-in since 2.4.0: it is
 * not in that default scan, and skipping it changes nothing.
 *
 * Run: node test/skip-rule.test.js
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const json = (args) => {
  const r = run([FIXTURES, '--format', 'json', ...args]);
  return { ...r, issues: JSON.parse(r.stdout).issues };
};
const key = (i) => `${i.ruleId}|${i.location}|${i.message}`;

console.log('\n📋 observability is opt-in (2.4.0): not in the default set');
const base = json([]);
assert(!base.issues.some(i => i.ruleId === 'observability'), 'the default scan of test-fixtures/ has no observability finding');
const onlyObs = json(['--rule', 'observability']);
assert(onlyObs.issues.length > 0 && onlyObs.issues.every(i => i.ruleId === 'observability'), '--rule observability still runs it');
const skipObs = json(['--skip-rule', 'observability']);
assert(
  JSON.stringify(skipObs.issues.map(key)) === JSON.stringify(base.issues.map(key)) && skipObs.code === base.code,
  '--skip-rule observability is accepted and changes nothing in a default scan'
);

console.log('\n📋 --skip-rule kafka');
const skipped = json(['--skip-rule', 'kafka']);
assert(base.issues.some(i => i.ruleId === 'kafka'), 'the default scan of test-fixtures/ has kafka findings (precondition)');
assert(!skipped.issues.some(i => i.ruleId === 'kafka'), 'no kafka finding with --skip-rule kafka');
assert(
  JSON.stringify(skipped.issues.map(key)) === JSON.stringify(base.issues.filter(i => i.ruleId !== 'kafka').map(key)),
  'every other finding is identical, in the same order'
);
assert(skipped.code === base.code, `exit code unchanged (${base.code}): kafka is only a warning`);

const text = run([FIXTURES, '--skip-rule', 'kafka']);
const kafkaMessages = base.issues.filter(i => i.ruleId === 'kafka').map(i => i.message);
assert(kafkaMessages.every(m => !text.stdout.includes(m)), 'text output has none of the kafka findings');
assert(kafkaMessages.every(m => run([FIXTURES]).stdout.includes(m)), 'they are in the text output without the option (control)');
const sarif = JSON.parse(run([FIXTURES, '--format', 'sarif', '--skip-rule', 'kafka']).stdout);
const run0 = sarif.runs[0];
assert(!run0.results.some(r => r.ruleId === 'kafka'), 'SARIF has no kafka result');
assert(!run0.tool.driver.rules.some(r => r.id === 'kafka'), 'SARIF driver.rules does not list kafka');
assert(run0.results.length === skipped.issues.length, 'SARIF result count equals the JSON issue count');

console.log('\n📋 several ids, case and spaces');
const two = json(['--skip-rule', ' Layers , kafka ']);
assert(!two.issues.some(i => i.ruleId === 'layers' || i.ruleId === 'kafka'), 'comma-separated, trimmed, case-insensitive like --rule');
assert(two.issues.length === base.issues.filter(i => i.ruleId !== 'layers' && i.ruleId !== 'kafka').length, 'only those two rules are removed');

console.log('\n📋 rule ids that share a detector');
const noBlocking = json(['--skip-rule', 'blocking']);
assert(!noBlocking.issues.some(i => i.ruleId === 'blocking'), 'skip blocking: no blocking finding');
assert(
  noBlocking.issues.filter(i => i.ruleId === 'blocking-kafka').length === base.issues.filter(i => i.ruleId === 'blocking-kafka').length,
  'skip blocking keeps every blocking-kafka finding (same detector, still run)'
);
const noReactor = json(['--skip-rule', 'reactor-block']);
const reactiveBlocking = (issues) => issues.filter(i => i.ruleId === 'blocking' && /^blocking \.(block|blockFirst|blockLast)\(\)/.test(i.message)).map(key).sort();
const onlyBlocking = json(['--rule', 'blocking']);
assert(!noReactor.issues.some(i => i.ruleId === 'reactor-block'), 'skip reactor-block: no reactor-block finding');
assert(
  JSON.stringify(reactiveBlocking(noReactor.issues)) === JSON.stringify(reactiveBlocking(onlyBlocking.issues)),
  'skip reactor-block: a reactive .block() is reported under blocking, as with --rule blocking'
);

console.log('\n📋 errors');
const unknown = run([FIXTURES, '--skip-rule', 'nope']);
assert(unknown.code === 1 && /Unknown rule in --skip-rule: "nope"/.test(unknown.stderr), 'unknown id: exit 1 with the list of valid ids');
const contradiction = run([FIXTURES, '--rule', 'kafka', '--skip-rule', 'kafka']);
assert(contradiction.code === 1 && /contradict/.test(contradiction.stderr), '--rule X --skip-rule X: exit 1');

console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n❌ --skip-rule tests FAILED.\n');
  process.exit(1);
}
console.log('\n✅ All --skip-rule tests passed.\n');
