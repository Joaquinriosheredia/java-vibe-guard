import { spawn } from 'child_process';
import { readFileSync, existsSync, rmSync, cpSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR   = join(__dirname, 'app');
const METRICS   = join(tmpdir(), 'vibe-001-metrics.json');

// Maven writes target/ next to the pom. Run from a temp copy so --verify also
// works when the package is installed somewhere read-only (global npm prefix,
// npx cache) and never leaves build output inside the installed package.
function copyAppToTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-001-app-'));
  cpSync(APP_DIR, dir, { recursive: true, filter: src => !src.includes(`${join(APP_DIR, 'target')}`) });
  return dir;
}

export async function run() {
  if (existsSync(METRICS)) rmSync(METRICS);
  const workDir = copyAppToTempDir();
  const cleanup = () => rmSync(workDir, { recursive: true, force: true });

  return new Promise((resolve) => {
    const mvn = spawn('mvn', [
      'test',
      '-Dtest=VerifyRunner',
      '-Dvibe.verify=true',
      `-Dvibe.output.file=${METRICS}`,
      '-q',
      '--no-transfer-progress',
    ], {
      cwd: workDir,
      timeout: 300_000,
    });

    let stderr = '';
    mvn.stderr.on('data', (chunk) => { stderr += chunk; });

    mvn.on('close', (code) => {
      cleanup();
      if (!existsSync(METRICS)) {
        resolve({
          status: 'error',
          error: code !== 0
            ? `Maven exited ${code}. ${stderr.slice(-300)}`
            : 'VerifyRunner did not write metrics file',
        });
        return;
      }

      try {
        const raw = JSON.parse(readFileSync(METRICS, 'utf8'));
        const pass =
          raw.poolUtilization  >= 95 &&
          raw.waitingRequests  >  0  &&
          raw.p95LatencyMs     >= 800;

        resolve({
          status: pass ? 'pass' : 'fail',
          metrics: {
            poolUtilization: raw.poolUtilization,
            waitingRequests: raw.waitingRequests,
            p95LatencyMs:    raw.p95LatencyMs,
          },
        });
      } catch (e) {
        resolve({ status: 'error', error: `Failed to parse metrics: ${e.message}` });
      }
    });

    mvn.on('error', (e) => {
      cleanup();
      resolve({ status: 'error', error: `Cannot spawn mvn: ${e.message}` });
    });
  });
}
