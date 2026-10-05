#!/usr/bin/env node
/**
 * Evidence contract (vibe-guard rule 1: every public figure comes from a versioned,
 * reproducible artifact). For every rule in cli/src/rule-catalog.js:
 *
 * - `kind: 'mechanism'` carries text only; it must not quote figures.
 * - `kind: 'measured'` cites each result with a GitHub URL pinned to a commit SHA
 *   (never a branch) and a line range. When the source is this repository, the file
 *   must exist at that commit and the line range must be inside it, so the text and
 *   the data cannot drift apart. CI checks out the full history for this.
 *
 * Plus the specific wording decided for `blocking` (2026-10-04): condition stated,
 * capacity figures, virtual threads, no absolute latencies, and @Scheduled /
 * @EventListener kept as documented mechanism. And for `blocking-kafka` (2026-10-04):
 * the threshold in general form with the defaults' equivalent, the reprocessing loop
 * above it, no measured damage below it, and the limits (versions and protocol). And for
 * `reactor-block` (2026-10-04): .block() on a Schedulers.parallel() worker fails fast with
 * IllegalStateException (measured, H2), not "pins the thread"; the event loop and
 * .toFuture().get() stay documented mechanism (they fit neither pre-registered hypothesis).
 *
 * Run: node test/evidence.test.js
 */
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { RULE_CATALOG } from '../src/rule-catalog.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const THIS_REPO = 'Joaquinriosheredia/java-vibe-guard';
const SOURCE = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([0-9a-f]{7,40})\/([^#]+)#L(\d+)-L(\d+)$/;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    failed++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function fileAtCommit(sha, path) {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${sha}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

console.log('\nEvidence contract');
for (const [rule, entry] of Object.entries(RULE_CATALOG)) {
  const e = entry.evidence;
  if (!e) continue;

  if (e.kind === 'mechanism') {
    test(`${rule}: mechanism evidence quotes no figures`, () => {
      assert(!/\d+(\.\d+)?\s*(%|ms\b|s\b|×|tasks\/s|req\/s)/.test(e.text), `figure in mechanism text: ${e.text}`);
    });
    continue;
  }

  test(`${rule}: kind is 'mechanism' or 'measured'`, () => assert(e.kind === 'measured', `unknown kind ${e.kind}`));
  test(`${rule}: measured evidence has at least one result`, () => assert(Array.isArray(e.results) && e.results.length > 0, 'no results'));

  for (const r of e.results ?? []) {
    const m = SOURCE.exec(r.source ?? '');
    test(`${rule} (${r.lab}): source pinned to a commit with a line range`, () => {
      assert(m, `source is not a commit-pinned GitHub URL with #Lx-Ly: ${r.source}`);
      assert(Number(m[4]) <= Number(m[5]), `empty line range in ${r.source}`);
    });
    if (m && m[1] === THIS_REPO) {
      test(`${rule} (${r.lab}): cited file and lines exist at ${m[2]}`, () => {
        let content;
        try {
          content = fileAtCommit(m[2], m[3]);
        } catch {
          throw new Error(`${m[3]} not found at ${m[2]} (shallow clone? CI needs fetch-depth: 0)`);
        }
        const lines = content.split('\n').length;
        assert(Number(m[5]) <= lines, `${m[3]}@${m[2]} has ${lines} lines, cited up to L${m[5]}`);
      });
    }
  }
}

console.log('\nblocking: wording decided on 2026-10-04');
const blocking = RULE_CATALOG.blocking.evidence;
const text = blocking.results.map(r => r.text).join(' ');
test('states the condition: default @Async executor, 8 platform threads, unbounded queue', () =>
  assert(/default @Async executor \(8 platform threads, unbounded queue\)/.test(text), text));
test('quotes capacity = threads / call duration, 39.9-40.0 with 8 and 79.8 with 16', () =>
  assert(/threads \/ call duration/.test(text) && /39\.9-40\.0 tasks\/s with 8 threads/.test(text) && /79\.8 with 16/.test(text), text));
test('quotes queue growth and the 98-99.5% queue-wait share', () =>
  assert(/\(load - capacity\)/.test(text) && /98-99\.5% of latency is queue wait/.test(text), text));
test('says the control without holding the thread did not queue', () => assert(/did not queue/.test(text), text));
test('says it does not saturate with virtual threads', () =>
  assert(/virtual threads enabled .* did not saturate/.test(text), text));
test('quotes no absolute latency', () => assert(!/\d+(\.\d+)?\s*(ms|s)\b/.test(text), `absolute latency in: ${text}`));
test('cites the pre-registered results at c4e5ddd', () =>
  assert(blocking.results[0].source.includes('/blob/c4e5ddd/cli/verify/blocking/results/criteria.md'), blocking.results[0].source));
test('@Scheduled and @EventListener stay documented mechanism', () =>
  assert(blocking.mechanism?.scope === '@Scheduled, @EventListener' && !/\d/.test(blocking.mechanism.text), JSON.stringify(blocking.mechanism)));

console.log('\nblocking-kafka: wording decided on 2026-10-04');
const bk = RULE_CATALOG['blocking-kafka'].evidence;
const bkText = (bk.results ?? []).map(r => r.text).join(' ');
test('is measured, one result', () => assert(bk.kind === 'measured' && bk.results.length === 1, JSON.stringify(bk)));
test('states the threshold in general form', () =>
  assert(/max\.poll\.records x time per record > max\.poll\.interval\.ms/.test(bkText), bkText));
test('gives the defaults\' equivalent: 500 records, 300 s, more than 600 ms per record', () =>
  assert(/500 records and 300 s: more than 600 ms per record/.test(bkText), bkText));
test('presents the 10 s runs as an accelerated setup', () => assert(/accelerated setup \(max\.poll\.interval\.ms lowered to 10 s\)/.test(bkText), bkText));
test('above the threshold: reprocessing loop, 0 records/s committed, each record delivered ~10 times', () =>
  assert(/reprocessing loop: 0 records\/s committed, each record delivered ~10 times/.test(bkText), bkText));
test('below the threshold: no measured damage from the same blocking call', () =>
  assert(/Below it, the same blocking call caused no measured damage/.test(bkText), bkText));
test('says the damage appears only above the threshold, not for any blocking call', () =>
  assert(/damage appears only when/.test(bkText), bkText));
test('states the limits: client version, protocol, cooperative and KIP-848 not measured', () =>
  assert(/kafka-clients 3\.6\.2/.test(bkText) && /classic group protocol with eager rebalancing/.test(bkText)
    && /cooperative protocol, KIP-848 and AckMode RECORD were not measured/.test(bkText), bkText));
test('cites the pre-registered results at a6f32ef', () =>
  assert(bk.results[0].source.includes('/blob/a6f32ef/cli/verify/blocking-kafka/results/criteria.md'), bk.results[0].source));

console.log('\nreactor-block: wording decided on 2026-10-04 (pre-registered H2 for Schedulers.parallel())');
const rb = RULE_CATALOG['reactor-block'];
const rbText = (rb.evidence.results ?? []).map(r => r.text).join(' ');
test('is measured, one result, for .block() on Schedulers.parallel()', () =>
  assert(rb.evidence.kind === 'measured' && rb.evidence.results.length === 1 && /Schedulers\.parallel\(\)/.test(rb.evidence.results[0].lab), JSON.stringify(rb.evidence)));
test('says it does not hold the thread and throws IllegalStateException on every call', () =>
  assert(/does not hold the thread/.test(rbText) && /IllegalStateException/.test(rbText) && /on every call/.test(rbText), rbText));
test('says 100% of affected requests failed with HTTP 500 at every load measured', () =>
  assert(/100% of the requests through that path failed with HTTP 500 at every load measured/.test(rbText), rbText));
test('states the versions measured', () =>
  assert(/Spring Boot 3\.2\.5, reactor-core 3\.6\.5, reactor-netty 1\.1\.18/.test(rbText), rbText));
test('quotes no absolute latency', () => assert(!/\d+(\.\d+)?\s*(ms|s)\b/.test(rbText), rbText));
test('cites the pre-registered results at c934bd7', () =>
  assert(rb.evidence.results[0].source.includes('/blob/c934bd7/cli/verify/reactor-block/results/criteria.md'), rb.evidence.results[0].source));
test('the event loop and .toFuture().get() stay documented mechanism, without parallel workers', () =>
  assert(rb.evidence.mechanism?.scope === '.block() on the Netty event loop, .toFuture().get()' && !/parallel/.test(rb.evidence.mechanism.text)
    && !/\d/.test(rb.evidence.mechanism.text), JSON.stringify(rb.evidence.mechanism)));
test('the rule description no longer says it pins a Schedulers.parallel() worker', () =>
  assert(!/pins the calling thread \(e\.g\. a Schedulers\.parallel\(\) worker/.test(rb.full) && /it does not pin the worker/.test(rb.full), rb.full));

console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n❌ evidence contract test FAILED.\n');
  process.exit(1);
} else {
  console.log('\n✅ All evidence contract tests passed.\n');
}
