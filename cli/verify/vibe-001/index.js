import { readFileSync, existsSync, rmSync, cpSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { runBounded } from '../../src/child-process.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR   = join(__dirname, 'app');
const METRICS   = join(tmpdir(), 'vibe-001-metrics.json');

// Hard limit for the whole Maven run (build + Testcontainers + the experiment).
// VIBE_VERIFY_TIMEOUT_MS exists for the regression tests.
const MAVEN_TIMEOUT_MS = Number(process.env.VIBE_VERIFY_TIMEOUT_MS) || 300_000;

// Maven writes target/ next to the pom. Run from a temp copy so --verify also
// works when the package is installed somewhere read-only (global npm prefix,
// npx cache) and never leaves build output inside the installed package.
function copyAppToTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-001-app-'));
  cpSync(APP_DIR, dir, { recursive: true, filter: src => !src.includes(`${join(APP_DIR, 'target')}`) });
  return dir;
}

function lastLines(text, n = 10) {
  return text.trim().split('\n').slice(-n).join('\n');
}

export async function run() {
  if (existsSync(METRICS)) rmSync(METRICS);
  const workDir = copyAppToTempDir();

  // stdout and stderr are both read (runBounded): 2.2.0 never read Maven's stdout,
  // and with Maven 3.10 that deadlocked the first run (see HANG-2.2.0.md).
  const mvn = await runBounded('mvn', [
    'test',
    '-Dtest=VerifyRunner',
    '-Dvibe.verify=true',
    `-Dvibe.output.file=${METRICS}`,
    '-q',
    '--no-transfer-progress',
  ], { cwd: workDir, timeoutMs: MAVEN_TIMEOUT_MS });

  rmSync(workDir, { recursive: true, force: true });

  if (mvn.error) {
    return { status: 'error', error: `Cannot spawn mvn: ${mvn.error.message}` };
  }
  if (mvn.timedOut) {
    return {
      status: 'error',
      error: `Maven did not finish within ${MAVEN_TIMEOUT_MS / 1000}s and was stopped (whole process tree killed). `
        + `Last output:\n${lastLines(mvn.stdout + '\n' + mvn.stderrTail)}`,
    };
  }
  if (!existsSync(METRICS)) {
    return {
      status: 'error',
      error: mvn.code !== 0
        ? `Maven exited ${mvn.code}. ${lastLines(mvn.stderrTail || mvn.stdout)}`
        : 'VerifyRunner did not write metrics file',
    };
  }

  try {
    const raw = JSON.parse(readFileSync(METRICS, 'utf8'));
    const pass =
      raw.poolUtilization  >= 95 &&
      raw.waitingRequests  >  0  &&
      raw.p95LatencyMs     >= 800;

    return {
      status: pass ? 'pass' : 'fail',
      metrics: {
        poolUtilization: raw.poolUtilization,
        waitingRequests: raw.waitingRequests,
        p95LatencyMs:    raw.p95LatencyMs,
      },
    };
  } catch (e) {
    return { status: 'error', error: `Failed to parse metrics: ${e.message}` };
  }
}
