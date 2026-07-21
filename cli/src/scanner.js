import { readdirSync, statSync, readFileSync } from 'fs';
import { join, extname, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkBlocking } from './rules/blocking.js';
import { checkLayers } from './rules/layers.js';
import { checkKafka, checkKafkaSendTimeout } from './rules/kafka.js';
import { checkTransactions } from './rules/transactions.js';
import { checkObservability } from './rules/observability.js';
import { RULE_CATALOG } from './rule-catalog.js';
import { printHeader, printFindings, printSummary, printJSON } from './reporter.js';
import { applySuppressions } from './suppression.js';
import { loadConfig, makeExcludeMatcher } from './config.js';
import { loadBaseline, writeBaseline, applyBaseline } from './baseline.js';
import { generateSarif } from './sarif.js';

// docs/sarif.md §7 — tool.driver.version is read from cli/package.json at
// call time (never hardcoded independently), informationUri/helpUri are the
// repo's own README, shared across every rule id.
const PACKAGE_JSON = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')
);
const REPO_URL = 'https://github.com/Joaquinriosheredia/java-vibe-guard';
const SARIF_TOOL_META = {
  version: PACKAGE_JSON.version,
  informationUri: REPO_URL,
  helpUri: `${REPO_URL}#readme`,
};

// Exported for tests (contract.test.js) to verify by function-reference
// identity that the 'blocking-kafka' alias below resolves to the exact same
// checkBlocking function as the 'blocking' entry — not a re-implementation.
export const RULES = [
  { id: 'blocking',           fn: checkBlocking },
  { id: 'layers',             fn: checkLayers },
  { id: 'kafka',              fn: checkKafka },
  { id: 'kafka-send-timeout', fn: checkKafkaSendTimeout },
  { id: 'transactions',       fn: checkTransactions },
  { id: 'observability',      fn: checkObservability },
];

// blocking-kafka has no detector of its own — checkBlocking() (blocking.js)
// emits both 'blocking' and 'blocking-kafka' findings from a single pass,
// choosing the rule id per-finding based on which async annotation it saw
// (blocking.js:50). So --rule blocking-kafka must execute checkBlocking too;
// this alias is what makes that happen without a duplicate RULES entry that
// would run the same fileContexts through checkBlocking twice.
export const RULE_FN_ALIASES = { 'blocking-kafka': 'blocking' };

const VALID_RULE_IDS = Object.keys(RULE_CATALOG);

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

  if (only && !VALID_RULE_IDS.includes(only)) {
    console.error(`Unknown rule: "${only}". Valid: ${VALID_RULE_IDS.join(', ')}`);
    return 1;
  }

  const execId = RULE_FN_ALIASES[only] || only;
  const rules = execId ? RULES.filter(r => r.id === execId) : RULES;

  const ignoredDirs = new Set(DEFAULT_IGNORED_DIRS);
  if (opts.ignore) {
    opts.ignore.split(',').map(d => d.trim()).filter(Boolean).forEach(d => ignoredDirs.add(d));
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

  // --rule filters by the emitted finding.rule after analysis.
  // This intentionally keeps CLI semantics based on ruleId rather
  // than detector implementation. If a detector emits an
  // unexpected ruleId, that finding will not match the requested
  // filter.
  const selectedFindings = only ? allFindings.filter(f => f.rule === only) : allFindings;

  const decorated = applySuppressions(selectedFindings, fileContexts, config);

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

  // The one and only "what gets reported" filter (docs/sarif.md §5): not
  // suppressed, not baseline-matched. This exact array feeds text, JSON, and
  // SARIF output, and the exit code below — no format computes its own,
  // independently-drifting version of this filter.
  const visibleFindings = findings.filter(f => !f.suppressed && !f.baselined);

  const format = opts.json ? 'json' : (opts.format || 'text');
  if (format === 'json') {
    printJSON(visibleFindings, findings, projectPath, files.length, { verbose: opts.verbose });
  } else if (format === 'sarif') {
    console.log(JSON.stringify(generateSarif(visibleFindings, SARIF_TOOL_META), null, 2));
  } else {
    printHeader(projectPath, files.length);
    printFindings(visibleFindings, findings, { verbose: opts.verbose });
    printSummary(visibleFindings, findings);
  }

  // A suppressed or baselined finding was already reviewed/accepted — it
  // must not keep blocking CI. Only findings that are still visible can
  // fail the build, regardless of which format was requested.
  return visibleFindings.some(f => f.severity === 'critical') ? 1 : 0;
}
