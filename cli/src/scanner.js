import { readdirSync, statSync, readFileSync } from 'fs';
import { join, extname, relative, resolve } from 'path';
import { checkBlocking } from './rules/blocking.js';
import { checkLayers } from './rules/layers.js';
import { checkKafka } from './rules/kafka.js';
import { checkTransactions } from './rules/transactions.js';
import { checkObservability } from './rules/observability.js';
import { printHeader, printFindings, printSummary, printJSON } from './reporter.js';
import { applySuppressions } from './suppression.js';
import { loadConfig, makeExcludeMatcher } from './config.js';
import { loadBaseline, writeBaseline, applyBaseline } from './baseline.js';

const RULES = [
  { id: 'blocking',      fn: checkBlocking },
  { id: 'layers',        fn: checkLayers },
  { id: 'kafka',         fn: checkKafka },
  { id: 'transactions',  fn: checkTransactions },
  { id: 'observability', fn: checkObservability },
];

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules', '.git', 'target', 'build', '.gradle', '.mvn',
  'out', 'dist', '.idea', '__pycache__', 'benchmark',
]);

const SCAN_EXTENSIONS = new Set(['.java', '.yml', '.yaml', '.properties', '.xml', '.gradle', '.kts']);

export function collectFiles(dir, files = [], ignoredDirs = DEFAULT_IGNORED_DIRS) {
  let entries;
  try { entries = readdirSync(dir); } catch { return files; }
  for (const entry of entries) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    if (stat.isDirectory()) {
      collectFiles(fullPath, files, ignoredDirs);
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function runGuard(projectPath, opts = {}) {
  const absPath = resolve(projectPath);
  const only = opts.rule ? opts.rule.toLowerCase() : null;
  const rules = only ? RULES.filter(r => r.id === only) : RULES;

  const ignoredDirs = new Set(DEFAULT_IGNORED_DIRS);
  if (opts.ignore) {
    opts.ignore.split(',').map(d => d.trim()).filter(Boolean).forEach(d => ignoredDirs.add(d));
  }

  if (only && rules.length === 0) {
    console.error(`Unknown rule: "${only}". Valid: ${RULES.map(r => r.id).join(', ')}`);
    return 1;
  }

  const config = loadConfig(absPath);
  const isExcluded = makeExcludeMatcher(config.exclude);

  const files = collectFiles(absPath, [], ignoredDirs)
    .filter(filePath => !isExcluded(relative(absPath, filePath)));
  if (files.length === 0) {
    console.error(`No Java/config files found in: ${absPath}`);
    return 1;
  }

  const fileContexts = files.map(filePath => {
    let lines = [];
    try { lines = readFileSync(filePath, 'utf8').split('\n'); } catch {}
    return {
      filePath,
      lines,
      relativePath: relative(absPath, filePath),
      fileName: filePath.split('/').pop(),
    };
  });

  const allFindings = [];
  for (const rule of rules) {
    try {
      const findings = rule.fn(fileContexts);
      allFindings.push(...findings);
    } catch (e) {
      if (!opts.json) console.error(`Rule ${rule.id} error: ${e.message}`);
    }
  }

  const decorated = applySuppressions(allFindings, fileContexts, config);

  // --baseline stops here: write the snapshot and exit. No report, no
  // criticals-based exit code — baseline creation isn't a pass/fail check
  // (docs/baseline.md §7). writeBaseline itself stays unguarded; this is the
  // one place that catches a write failure, same pattern as the file-count
  // and per-rule guards above.
  if (opts.baseline) {
    let written;
    try {
      written = writeBaseline(absPath, decorated);
    } catch (e) {
      console.error(`Failed to write vibeguard-baseline.json: ${e.message}`);
      return 1;
    }
    const activeCount = decorated.filter(f => !f.suppressed).length;
    const suppressedCount = decorated.filter(f => f.suppressed).length;
    console.log('Baseline written to vibeguard-baseline.json');
    console.log(`(${written.buckets.length} buckets generated from ${activeCount} active findings; ${suppressedCount} suppressed findings omitted)`);
    return 0;
  }

  // Automatic consumption (docs/baseline.md §8): if vibeguard-baseline.json
  // exists at the project root, every non-suppressed finding is evaluated
  // against it and decorated with baselined/baselineSkipped. Its absence
  // means an empty baseline — identical to today's behavior.
  const baseline = loadBaseline(absPath);
  const findings = applyBaseline(decorated, baseline);
  const visibleFindings = findings.filter(f => !f.suppressed);

  if (opts.json) {
    printJSON(findings, projectPath, files.length, { verbose: opts.verbose });
  } else {
    printHeader(projectPath, files.length);
    printFindings(findings, { verbose: opts.verbose });
    printSummary(findings);
  }

  // A suppressed finding was reviewed and accepted by the user — it must not
  // keep blocking CI. Only findings that are still visible can fail the build.
  return visibleFindings.some(f => f.severity === 'critical') ? 1 : 0;
}
