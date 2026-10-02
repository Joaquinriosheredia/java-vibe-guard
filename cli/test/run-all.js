// `npm test` entrypoint: runs every test/*.test.js suite, each in its own
// process (they call process.exit), and fails if any suite fails.
// *.integration.test.js suites make real network calls to github.com and are
// skipped here; run them explicitly (see fetch-repo.integration.test.js).
//
// Before 2.0.0 `npm test` ran only contract.test.js, so three other suites
// (explain, sarif-cli, baseline-cli) were failing for weeks without CI noticing.
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const suites = readdirSync(TEST_DIR)
  .filter(f => f.endsWith('.test.js') && !f.endsWith('.integration.test.js'))
  .sort();

const failed = [];
for (const suite of suites) {
  console.log(`\n━━━ ${suite} ━━━`);
  const { status } = spawnSync(process.execPath, [join(TEST_DIR, suite)], { stdio: 'inherit' });
  if (status !== 0) failed.push(`${suite} (exit ${status})`);
}

console.log(`\n${'━'.repeat(50)}`);
if (failed.length > 0) {
  console.error(`❌ ${failed.length}/${suites.length} suites failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`✅ All ${suites.length} suites passed.`);
