import { spawn, spawnSync } from 'child_process';

// Runs a child process to completion with a hard time limit. Shared by --verify
// (Maven, testcontainers-doctor).
//
// Every stdout/stderr byte is read: an unread stdout once deadlocked --verify
// VIBE-001 (2.2.0). Node gives a child's stdout a UNIX socketpair; Maven 3.10.0
// writes its console one byte per write(), and an unread socketpair stops
// accepting 1-byte writes after ~64 KB, while a first --verify run prints ~67 KB.
// Maven then blocked writing, stopped draining surefire's fork and waited for it
// forever (see cli/verify/vibe-001/HANG-2.2.0.md).
//
// The time limit kills the whole process tree, not only the direct child: Maven
// forks a test JVM, and killing just `mvn` used to leave the 'close' event
// waiting on a stream the fork still held open.
//   - POSIX: the child leads its own process group (detached), and the group is
//     sent SIGKILL. Because the group is separate, Ctrl+C / SIGTERM to this
//     process would no longer reach it: those signals kill the tree too.
//   - Windows: `taskkill /PID <pid> /T /F`, built into Windows, kills the tree.

const TAIL_BYTES = 8 * 1024;

export function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

function keepTail(buffer, chunk) {
  const joined = Buffer.concat([buffer, chunk]);
  return joined.length > TAIL_BYTES ? joined.subarray(joined.length - TAIL_BYTES) : joined;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs: number, keepStdout?: boolean }} opts
 *   keepStdout: keep ALL of stdout (for a caller that parses it); otherwise only its tail.
 * @returns {Promise<{ code: number|null, signal: string|null, timedOut: boolean, error?: Error,
 *   stdout: string, stdoutBytes: number, stderrTail: string }>}
 */
export function runBounded(cmd, args, { cwd, env, timeoutMs, keepStdout = false }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      });
    } catch (error) {
      resolve({ code: null, signal: null, timedOut: false, error, stdout: '', stdoutBytes: 0, stderrTail: '' });
      return;
    }

    const stdoutChunks = [];
    let stdoutTail = Buffer.alloc(0);
    let stdoutBytes = 0;
    let stderrTail = Buffer.alloc(0);
    let timedOut = false;
    let settled = false;

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (keepStdout) stdoutChunks.push(chunk);
      else stdoutTail = keepTail(stdoutTail, chunk);
    });
    child.stderr.on('data', (chunk) => { stderrTail = keepTail(stderrTail, chunk); });

    const onSignal = (signal) => {
      killTree(child.pid);
      process.kill(process.pid, signal);
    };
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((s) => process.once(s, onSignal));

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      signals.forEach((s) => process.removeListener(s, onSignal));
      resolve({
        stdout: (keepStdout ? Buffer.concat(stdoutChunks) : stdoutTail).toString('utf8'),
        stdoutBytes,
        stderrTail: stderrTail.toString('utf8'),
        timedOut,
        ...result,
      });
    };

    let grace;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      // Do not wait forever for 'close' (a stream may still be held open by a
      // process the kill missed): settle a few seconds after the kill.
      grace = setTimeout(() => finish({ code: null, signal: 'SIGKILL' }), 5_000);
    }, timeoutMs);

    child.on('error', (error) => finish({ code: null, signal: null, error }));
    child.on('close', (code, signal) => finish({ code, signal }));
  });
}
