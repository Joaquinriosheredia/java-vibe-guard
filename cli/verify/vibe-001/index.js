import { spawn } from 'child_process';
import { readFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR   = join(__dirname, 'app');
const METRICS   = join(tmpdir(), 'vibe-001-metrics.json');

export async function run() {
  if (existsSync(METRICS)) rmSync(METRICS);

  return new Promise((resolve) => {
    const mvn = spawn('mvn', [
      'test',
      '-Dtest=VerifyRunner',
      '-Dvibe.verify=true',
      `-Dvibe.output.file=${METRICS}`,
      '-q',
      '--no-transfer-progress',
    ], {
      cwd: APP_DIR,
      timeout: 300_000,
    });

    let stderr = '';
    mvn.stderr.on('data', (chunk) => { stderr += chunk; });

    mvn.on('close', (code) => {
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
      resolve({ status: 'error', error: `Cannot spawn mvn: ${e.message}` });
    });
  });
}
