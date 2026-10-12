// Run for the B0 extended-corpus audit — exactly PREREGISTRATION.md "Run".
// For each repo in corpus.json: pinned shallow checkout (validate-public fetch-repo.js),
// then the CLI with --rule async-returns-pending-future --json. Writes results/.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRepo, removeCheckout } from '../../cli/src/validate-public/fetch-repo.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '../../cli/bin/cli.js');
const RULE = 'async-returns-pending-future';
const corpus = JSON.parse(readFileSync(join(HERE, 'corpus.json'), 'utf8'));
const outDir = join(HERE, 'results');
mkdirSync(outDir, { recursive: true });
const ruleCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).stdout.trim();

const summary = [];
for (const { repo, commit } of corpus.repos) {
  const file = join(outDir, `${repo.replace('/', '__')}.json`);
  const fetched = fetchRepo({ repo, commit });
  if (fetched.status !== 'ok') {
    const rec = { repo, commit, status: 'error', stage: 'fetch', errorType: fetched.errorType, message: fetched.message };
    writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
    summary.push({ repo, status: 'error', findings: null });
    process.stderr.write(`${repo}: fetch error ${fetched.errorType}\n`);
    continue;
  }
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [CLI, fetched.checkoutPath, '--rule', RULE, '--json'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 600_000 });
  const durationMs = Number((process.hrtime.bigint() - t0) / 1_000_000n);
  removeCheckout(fetched);
  let scan = null;
  try { scan = JSON.parse(r.stdout); } catch { /* recorded below */ }
  const rec = scan
    ? { repo, commit, status: 'ok', ruleCommit, exitCode: r.status, durationMs, scan }
    : { repo, commit, status: 'error', stage: 'scan', ruleCommit, exitCode: r.status, signal: r.signal, durationMs, stderr: (r.stderr || '').slice(-2000) };
  if (scan) for (const i of scan.issues) i.location = i.location.split(fetched.checkoutPath).join('');
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  summary.push({ repo, status: rec.status, findings: scan ? scan.issues.length : null, filesScanned: scan?.filesScanned });
  process.stderr.write(`${repo}: ${rec.status} ${scan ? scan.issues.length + ' findings' : ''}\n`);
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ ruleCommit, ranAt: new Date().toISOString(), repos: summary }, null, 2) + '\n');
