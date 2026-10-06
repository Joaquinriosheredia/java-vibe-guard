/**
 * Every child process the CLI starts must have its stdout and stderr either read
 * or explicitly discarded. 2.2.0's --verify never read Maven's stdout and, with
 * Maven 3.10, deadlocked (verify/vibe-001/HANG-2.2.0.md).
 *
 * Static check over the shipped code (src/, bin/, verify/*.js and
 * verify/<rule>/index.js). For each call to spawn / spawnSync / exec / execSync /
 * execFile / execFileSync / fork (or a `spawnFn` seam):
 *   1. its options must set `stdio` explicitly;
 *   2. for an asynchronous call (spawn, exec, execFile, fork), a 'pipe' for stdout
 *      or stderr requires the same file to read it: `<child>.stdout.on('data'` /
 *      `<child>.stderr.on('data'`. Synchronous calls buffer both streams into their
 *      result, so Node itself reads them.
 * A new call that breaks either rule fails this test.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const assert = (cond, msg) => { if (cond) console.log(`  ✅ ${msg}`); else { console.log(`  ❌ ${msg}`); failures++; } };

const CALL_RE = /(?<![\w$.])(spawnSync|spawn|execFileSync|execFile|execSync|exec|fork|spawnFn)\s*\(/g;
const ASYNC = new Set(['spawn', 'execFile', 'exec', 'fork']);

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
             .replace(/(^|[^:])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));
}

// Text between the call's parentheses (balanced), or null.
function callArgs(code, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < code.length; k++) {
    if (code[k] === '(') depth++;
    else if (code[k] === ')' && --depth === 0) return code.slice(openIdx + 1, k);
  }
  return null;
}

// Problems found in one source text; `name` is for messages.
export function auditSource(source, name) {
  const code = stripComments(source);
  const problems = [];
  const calls = [];
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(code)) !== null) {
    const before = code.slice(Math.max(0, m.index - 30), m.index);
    if (/\b(function|import|export)\s*[\w\s{,]*$/.test(before)) continue; // a declaration, not a call
    if (/\bfunction\s+$/.test(before)) continue;
    const args = callArgs(code, m.index + m[0].length - 1);
    if (args === null) continue;
    const line = code.slice(0, m.index).split('\n').length;
    const where = `${name}:${line} ${m[1]}(…)`;
    calls.push(where);
    const stdio = /\bstdio\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/.exec(args);
    if (!stdio) { problems.push(`${where}: no explicit stdio`); continue; }
    if (!ASYNC.has(m[1])) continue;
    const entries = stdio[1].startsWith('[')
      ? stdio[1].slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''))
      : [0, 1, 2].map(() => stdio[1].replace(/['"]/g, ''));
    const assigned = /(?:const|let|var)?\s*([\w$]+)\s*=\s*$/.exec(code.slice(Math.max(0, m.index - 60), m.index));
    const child = assigned ? assigned[1] : null;
    for (const [idx, stream] of [[1, 'stdout'], [2, 'stderr']]) {
      if ((entries[idx] ?? 'pipe') !== 'pipe') continue;
      const reads = child && new RegExp(`\\b${child}\\.${stream}\\.on\\(\\s*['"]data['"]`).test(code);
      if (!reads) problems.push(`${where}: ${stream} is 'pipe' but never read (${child ?? 'unassigned child'}.${stream}.on('data', …))`);
    }
  }
  return { calls, problems };
}

function shippedFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) out.push(p);
    }
  };
  walk(join(CLI_DIR, 'src'));
  walk(join(CLI_DIR, 'bin'));
  for (const e of readdirSync(join(CLI_DIR, 'verify'))) {
    const p = join(CLI_DIR, 'verify', e);
    if (p.endsWith('.js')) out.push(p);
    else if (statSync(p).isDirectory()) {
      try { statSync(join(p, 'index.js')); out.push(join(p, 'index.js')); } catch { /* no verifier */ }
    }
  }
  return out;
}

console.log('\n── The checker itself catches the bad shapes ──');
{
  const bad1 = auditSource("const c = spawn('mvn', ['test'], { cwd });", 'bad1');
  assert(bad1.problems.some(p => /no explicit stdio/.test(p)), 'spawn without stdio → flagged');
  const bad2 = auditSource("const c = spawn('mvn', [], { stdio: ['ignore', 'pipe', 'pipe'] }); c.stderr.on('data', d => {});", 'bad2');
  assert(bad2.problems.some(p => /stdout is 'pipe' but never read/.test(p)), "stdout 'pipe' never read (the 2.2.0 bug) → flagged");
  const bad3 = auditSource("execFileSync('docker', ['info'], { timeout: 5000 });", 'bad3');
  assert(bad3.problems.some(p => /no explicit stdio/.test(p)), 'execFileSync without stdio → flagged');
  const ok1 = auditSource("const c = spawn('x', [], { stdio: ['ignore', 'pipe', 'ignore'] }); c.stdout.on('data', d => {});", 'ok1');
  assert(ok1.problems.length === 0, "stdout read, stderr 'ignore' → accepted");
  const ok2 = auditSource("spawnSync('taskkill', ['/T'], { stdio: 'ignore' });", 'ok2');
  assert(ok2.problems.length === 0 && ok2.calls.length === 1, "spawnSync with stdio 'ignore' → accepted");
  const ok3 = auditSource("// spawn('mvn') in a comment\nconst re = /x/; re.exec('a');", 'ok3');
  assert(ok3.calls.length === 0, 'comments and RegExp.exec() are not calls');
}

console.log('\n── Shipped code ──');
const files = shippedFiles();
const all = { calls: [], problems: [] };
for (const f of files) {
  const r = auditSource(readFileSync(f, 'utf8'), relative(CLI_DIR, f));
  all.calls.push(...r.calls);
  all.problems.push(...r.problems);
}
all.calls.forEach(c => console.log(`     · ${c}`));
// Guard against the scan silently finding nothing (e.g. a moved file).
for (const expected of ['src/child-process.js', 'src/verify.js', 'src/validate-public/fetch-repo.js', 'src/validate-public/run-repo.js']) {
  assert(all.calls.some(c => c.startsWith(expected)), `scan finds the child-process call in ${expected}`);
}
assert(all.problems.length === 0, `every stdout/stderr is read or explicitly discarded${all.problems.length ? ':\n       ' + all.problems.join('\n       ') : ''}`);

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
