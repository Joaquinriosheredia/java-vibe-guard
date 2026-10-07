/**
 * Regression tests for the 2.2.0 --verify hang (verify/vibe-001/HANG-2.2.0.md):
 * Maven 3.10 writes its console one byte per write(); 2.2.0 never read Maven's
 * stdout, so after ~64 KB Maven blocked and --verify waited forever, and the
 * time limit did not stop it.
 *
 *  1. runBounded() drains a child that writes 100 000 single-byte writes to stdout
 *     and to stderr (more than an unread socketpair takes).
 *  2. Its time limit kills the WHOLE tree: a grandchild that inherited the
 *     streams (like surefire's forked JVM) dies too, and the call settles.
 *     Cross-platform: also run on windows-latest (taskkill /T /F).
 *  3. verify/vibe-001 end to end with a fake `mvn` on PATH (POSIX only: on
 *     Windows `spawn('mvn')` does not resolve mvn.cmd — see HANG-2.2.0.md, limits):
 *     a. writes ~70 KB one byte at a time, then the metrics → pass;
 *     b. never finishes and has a child → error "did not finish", tree gone.
 */
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { join, delimiter } from 'path';
import { tmpdir } from 'os';
import { runBounded } from '../src/child-process.js';

let failures = 0;
const assert = (cond, msg) => { if (cond) console.log(`  ✅ ${msg}`); else { console.log(`  ❌ ${msg}`); failures++; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const NODE = process.execPath;

console.log('\n── 1. stdout and stderr are drained (100 000 one-byte writes each) ──');
{
  const child = `const fs=require('fs');for(let i=0;i<100000;i++){fs.writeSync(1,'x');fs.writeSync(2,'y');}`;
  const t0 = Date.now();
  const r = await runBounded(NODE, ['-e', child], { timeoutMs: 30_000 });
  assert(r.code === 0 && !r.timedOut, `child finished on its own (code ${r.code}, ${Date.now() - t0} ms)`);
  assert(r.stdoutBytes === 100_000, `all 100 000 stdout bytes read (${r.stdoutBytes})`);
  assert(r.stderrTail.length > 0 && r.stderrTail.length <= 8 * 1024, `stderr read, tail kept (${r.stderrTail.length} B)`);
}

console.log('\n── 2. the time limit kills the whole tree ──');
{
  // Parent prints its pid and a grandchild's; the grandchild inherits stdout/stderr
  // (holding the streams open, like a forked JVM) and both run forever.
  const parent = `const {spawn}=require('child_process');
    const gc=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});
    console.log(process.pid+' '+gc.pid);setInterval(()=>{},1000);`;
  const t0 = Date.now();
  const r = await runBounded(NODE, ['-e', parent], { timeoutMs: 2_000, keepStdout: true });
  const took = Date.now() - t0;
  const [ppid, gcpid] = r.stdout.trim().split(/\s+/).map(Number);
  await sleep(500);
  assert(r.timedOut, `timed out (settled after ${took} ms)`);
  assert(took < 2_000 + 6_000, 'settled without waiting for the held streams');
  assert(ppid > 0 && !alive(ppid), `child ${ppid} killed`);
  assert(gcpid > 0 && !alive(gcpid), `grandchild ${gcpid} killed too (${process.platform})`);
}

if (process.platform === 'win32') {
  console.log('\n── 3. verify/vibe-001 with a fake mvn: skipped on Windows (spawn("mvn") does not resolve mvn.cmd) ──');
} else {
  console.log('\n── 3. verify/vibe-001 end to end, fake mvn on PATH ──');
  const bin = mkdtempSync(join(tmpdir(), 'fake-mvn-'));
  const fakeMvn = (body) => {
    writeFileSync(join(bin, 'mvn'), `#!${NODE}\n${body}\n`);
    chmodSync(join(bin, 'mvn'), 0o755);
  };
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
  process.env.VIBE_VERIFY_TIMEOUT_MS = '8000';
  const { run } = await import('../verify/vibe-001/index.js');

  // a. Maven 3.10's console: one byte per write(), ~70 KB, then the metrics file.
  fakeMvn(`const fs=require('fs');
    for(let i=0;i<70000;i++) fs.writeSync(1,'.');
    const out=process.argv.find(a=>a.startsWith('-Dvibe.output.file=')).split('=')[1];
    fs.writeFileSync(out, JSON.stringify({poolUtilization:100, waitingRequests:15, p95LatencyMs:2000}));`);
  const a = await run();
  assert(a.status === 'pass', `70 KB of one-byte writes → --verify completes (status ${a.status}${a.error ? ': ' + a.error : ''})`);

  // b. never finishes, and has a child holding the streams.
  const pidFile = join(bin, 'pids');
  fakeMvn(`const {spawn}=require('child_process');const fs=require('fs');
    const gc=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});
    fs.writeFileSync(${JSON.stringify(pidFile)}, process.pid+' '+gc.pid);
    setInterval(()=>process.stdout.write('waiting\\n'),200);`);
  const t0 = Date.now();
  const b = await run();
  const took = Date.now() - t0;
  const [mpid, gpid] = (await import('fs')).readFileSync(pidFile, 'utf8').split(' ').map(Number);
  await sleep(500);
  assert(b.status === 'error' && /did not finish within 8s/.test(b.error), `hung mvn → error after ${took} ms: ${String(b.error).split('\n')[0]}`);
  assert(/waiting/.test(b.error), 'the error shows the last output');
  assert(!alive(mpid) && !alive(gpid), `mvn ${mpid} and its child ${gpid} killed`);
  rmSync(bin, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
