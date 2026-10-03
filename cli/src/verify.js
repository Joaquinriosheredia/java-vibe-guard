import { spawn, execFileSync } from 'child_process';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import chalk from 'chalk';

const __dirname  = dirname(fileURLToPath(import.meta.url));
// verify/ lives inside cli/ (moved in 2.0.0) so it ships in the npm package;
// it used to sit at the repo root, outside cli/, and `npm publish` from cli/
// would have left --verify unable to find its registry.
const VERIFY_DIR = join(__dirname, '../verify');
const require    = createRequire(import.meta.url);

// ── PASO 1 helpers ───────────────────────────────────────────────────────────

// testcontainers-doctor is a dependency of this package (pinned: verify
// parses its message text). Resolve its bin from node_modules and run it with
// this same Node binary — no global install needed. Falls back to a binary on
// PATH only if the dependency is missing (e.g. a checkout without npm ci).
function tcDoctorCommand() {
  try {
    const pkgPath = require.resolve('testcontainers-doctor/package.json');
    const { bin } = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const binRel  = typeof bin === 'string' ? bin : bin['testcontainers-doctor'];
    return { cmd: process.execPath, args: [join(dirname(pkgPath), binRel)] };
  } catch {
    return { cmd: 'testcontainers-doctor', args: [] };
  }
}

// verify only needs the doctor's `docker` and `java` sections. Running just
// those (`--check`, in parallel) skips its network checks (Docker Hub DNS,
// image pull), which made a full run exceed the old 15 s timeout on slow
// networks/CI runners. Resolves { sections } or { error: 'timeout'|'failed' }.
const TC_DOCTOR_TIMEOUT_MS = 60_000;

function runTCDoctorCheck(check) {
  return new Promise((resolve) => {
    const { cmd, args } = tcDoctorCommand();
    const tc = spawn(cmd, [...args, '--json', '--no-color', '--check', check], { timeout: TC_DOCTOR_TIMEOUT_MS });
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; }, TC_DOCTOR_TIMEOUT_MS);
    tc.stdout.on('data', (d) => { out += d; });
    tc.on('close', () => {
      clearTimeout(timer);
      try { resolve({ sections: JSON.parse(out).sections ?? {} }); }
      catch { resolve({ error: timedOut ? 'timeout' : 'failed' }); }
    });
    tc.on('error', () => { clearTimeout(timer); resolve({ error: 'failed' }); });
  });
}

async function runTCDoctor() {
  const results = await Promise.all(['docker', 'java'].map(runTCDoctorCheck));
  const failed = results.find(r => r.error);
  if (failed) return { error: failed.error };
  return { sections: Object.assign({}, ...results.map(r => r.sections)) };
}

function findCheck(data, section, name) {
  return data?.sections?.[section]?.find((x) => x.name === name);
}

function parseDockerMajor(msg = '') {
  const m = String(msg).match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

function parseMemoryMB(msg = '') {
  const m = String(msg).match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return 0;
  return m[2].toUpperCase() === 'GB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1]);
}

function parseJavaMajor(msg = '') {
  const m = String(msg).match(/major:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ── PASO 2 helper ─────────────────────────────────────────────────────────────

function imageIsCached(image) {
  try {
    execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// ── PASO 4 renderer ──────────────────────────────────────────────────────────

function renderResult(result) {
  console.log('');
  console.log(chalk.bold('VIBE-001 Verification'));
  console.log('');

  if (result.status === 'error') {
    console.log(chalk.red(`✗ Verification error: ${result.error}`));
    return;
  }

  const { poolUtilization, waitingRequests, p95LatencyMs } = result.metrics;
  const okUtil  = poolUtilization >= 95;
  const okWait  = waitingRequests > 0;
  const okP95   = p95LatencyMs >= 800;

  console.log('Observed:');
  console.log(
    okUtil
      ? chalk.green(`✓ Connection pool fully utilized (utilization: ${poolUtilization.toFixed(0)}%)`)
      : chalk.red(`✗ Pool not fully utilized (utilization: ${poolUtilization.toFixed(0)}%)`)
  );
  console.log(
    okWait
      ? chalk.green(`✓ Requests blocked waiting for connections (waiting: ${waitingRequests})`)
      : chalk.red(`✗ No requests blocked waiting (waiting: ${waitingRequests})`)
  );
  console.log(
    okP95
      ? chalk.green(`✓ Latency amplification under concurrency (p95: ${p95LatencyMs}ms)`)
      : chalk.red(`✗ Insufficient latency amplification (p95: ${p95LatencyMs}ms)`)
  );

  console.log('');
  console.log('Matches behavior documented in:');
  console.log(chalk.cyan('Java Production Lab #04'));
  console.log('');
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runVerify(rule) {
  // Load registry lazily so unknown rules fail early
  const { registry } = await import(pathToFileURL(join(VERIFY_DIR, 'registry.js')).href);

  if (!registry[rule]) {
    console.error(chalk.red(`Unknown rule: ${rule}. Available: ${Object.keys(registry).join(', ')}`));
    return 2;
  }

  // ── PASO 1: Environment pre-check ─────────────────────────────────────────
  console.log('');
  console.log(chalk.bold('Environment Check'));

  const tc = await runTCDoctor();

  if (tc.error === 'timeout') {
    console.log(chalk.red(`✗ testcontainers-doctor did not finish within ${TC_DOCTOR_TIMEOUT_MS / 1000}s — is the Docker daemon responsive?`));
    return 2;
  }
  if (tc.error) {
    console.log(chalk.red('✗ testcontainers-doctor could not be run — reinstall java-vibe-guard (it ships as a dependency)'));
    return 2;
  }

  const dockerMajor = parseDockerMajor(findCheck(tc, 'docker', 'Docker client version')?.message);
  const memMB       = parseMemoryMB(findCheck(tc, 'docker', 'Available memory')?.message);
  const javaMajor   = parseJavaMajor(findCheck(tc, 'java',   'Java version')?.message);

  const dockerOk = dockerMajor >= 24;
  const memOk    = memMB       >= 512;
  const javaOk   = javaMajor   >= 17;

  console.log(dockerOk
    ? chalk.green(`✓ Docker ${dockerMajor}.x`)
    : chalk.red(`✗ Docker ${dockerMajor}.x (need 24+)`));
  console.log(javaOk
    ? chalk.green(`✓ Java ${javaMajor}`)
    : chalk.red(`✗ Java ${javaMajor} (need 17+)`));
  console.log(memOk
    ? chalk.green('✓ Memory OK')
    : chalk.red(`✗ Memory too low (${Math.round(memMB)}MB free, need 512MB)`));

  if (!dockerOk || !memOk || !javaOk) {
    console.log(chalk.red('\nEnvironment check failed — fix issues above before running --verify'));
    return 2;
  }

  // ── PASO 2: Image cache check ─────────────────────────────────────────────
  console.log('');
  if (!imageIsCached('postgres:16-alpine')) {
    console.log(chalk.gray('postgres:16-alpine not found'));
    console.log(chalk.gray('First run will download image (~45s)'));
    console.log(chalk.gray('Subsequent runs: ~15s'));
    console.log('');
  }

  // ── PASO 3: Run verifier ──────────────────────────────────────────────────
  console.log(chalk.gray('Running VIBE-001 verification…'));

  const verifierPath = join(VERIFY_DIR, registry[rule].verifier, 'index.js');
  const { run } = await import(pathToFileURL(verifierPath).href);
  const result = await run();

  // ── PASO 4: Render output ─────────────────────────────────────────────────
  renderResult(result);

  if (result.status === 'pass')  return 0;
  if (result.status === 'fail')  return 1;
  return 2;
}
