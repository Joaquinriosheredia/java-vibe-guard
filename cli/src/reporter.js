import chalk from 'chalk';
import { RULE_CATALOG } from './rule-catalog.js';

const SEVERITY_ICON  = { critical: '❌', major: '❌', warning: '⚠️ ', info: 'ℹ️ ' };
const SEVERITY_ORDER = { critical: 0, major: 1, warning: 2, info: 3 };

// Evidence lines under CRITICAL findings come from rule-catalog.js
// (`evidence`), the same source as --explain and SARIF descriptions.
function formatEvidence(rule) {
  const e = RULE_CATALOG[rule]?.evidence;
  if (!e) return null;
  if (e.kind === 'mechanism') {
    return chalk.gray(`  Evidence: documented mechanism, no benchmark of our own — ${e.text}`);
  }
  const lines = e.results.flatMap(r => [
    chalk.gray(`  Evidence (measured, ${r.lab}): ${r.text}`),
    chalk.gray(`  Source: ${r.source}`),
  ]);
  // Measured for part of the rule only: the rest keeps the mechanism-only label.
  if (e.mechanism) {
    lines.push(chalk.gray(`  Evidence (${e.mechanism.scope}): documented mechanism, no benchmark of our own — ${e.mechanism.text}`));
  }
  return lines.join('\n');
}

function label(severity) {
  switch (severity) {
    case 'critical': return chalk.red.bold('CRITICAL');
    case 'major':    return chalk.yellow.bold('MAJOR');
    case 'warning':  return chalk.yellow('WARNING');
    default:         return chalk.cyan('INFO');
  }
}

export function printHeader(projectPath, fileCount) {
  console.log('');
  console.log(chalk.bold.blue('java-vibe-guard') + chalk.gray(' — vibe coding detector for Java/Spring Boot'));
  console.log(chalk.gray(`Scanning: ${projectPath}  (${fileCount} files)\n`));
}

function formatSuppressedBlock(f) {
  const reason = f.justification ? `${f.suppressedBy} — ${f.justification}` : f.suppressedBy;
  return [
    chalk.gray('  SUPPRESSED'),
    chalk.gray(`  ${f.rule}`),
    chalk.gray(`  ${f.location}`),
    chalk.gray(`  Reason: ${reason}`),
  ].join('\n');
}

export function printFindings(visibleFindings, findings, { verbose = false } = {}) {
  if (visibleFindings.length === 0) {
    console.log(chalk.bold.green('✅ No vibe coding patterns detected. Looks production-ready!'));
  } else {
    const sorted = [...visibleFindings].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)
    );
    for (const f of sorted) {
      const icon = SEVERITY_ICON[f.severity] ?? 'ℹ️ ';
      console.log(`${icon} ${label(f.severity)}: ${f.message} → ${chalk.cyan(f.location)}`);
      if (f.severity === 'critical') {
        const evidence = formatEvidence(f.rule);
        if (evidence) console.log(evidence);
      }
    }
  }

  if (verbose) {
    const suppressedFindings = findings.filter(f => f.suppressed);
    if (suppressedFindings.length > 0) {
      console.log('');
      console.log(chalk.gray(`── ${suppressedFindings.length} suppressed finding(s) ──`));
      for (const f of suppressedFindings) {
        console.log(formatSuppressedBlock(f));
      }
    }
  }
}

export function printSummary(visibleFindings, findings) {
  const suppressedCount = findings.length - visibleFindings.length;

  const c = { critical: 0, major: 0, warning: 0, info: 0 };
  for (const f of visibleFindings) c[f.severity] = (c[f.severity] || 0) + 1;

  console.log('');
  console.log(chalk.gray('─'.repeat(62)));

  const parts = [];
  if (c.critical > 0) parts.push(chalk.red.bold(`${c.critical} critical`));
  if (c.major > 0)    parts.push(chalk.yellow(`${c.major} major`));
  if (c.warning > 0)  parts.push(chalk.yellow(`${c.warning} warnings`));
  if (c.info > 0)     parts.push(chalk.cyan(`${c.info} info`));
  if (!parts.length)  parts.push(chalk.green('0 issues'));

  console.log(`📊 Summary: ${parts.join(' · ')}`);
  if (suppressedCount > 0) {
    console.log(chalk.gray(`   ${visibleFindings.length} reported · ${suppressedCount} suppressed · ${findings.length} total`));
  }
  console.log(chalk.gray('─'.repeat(62)));
  console.log('');

  if (c.critical === 0 && c.major === 0 && c.warning === 0) {
    console.log(chalk.bold.green('✅ Production-ready! No vibe coding patterns found.'));
  } else if (c.critical > 0) {
    console.log(chalk.bold.red(`🚨 ${c.critical} CRITICAL issue(s) found — fix before deploying to production.`));
  } else {
    console.log(chalk.bold.yellow('⚠️  No critical issues — review warnings before deploying.'));
  }
  console.log('');
}

export function printJSON(visibleFindings, findings, projectPath, fileCount, { verbose = false } = {}) {
  const suppressedFindings = findings.filter(f => f.suppressed);

  const c = { critical: 0, major: 0, warning: 0, info: 0 };
  for (const f of visibleFindings) c[f.severity] = (c[f.severity] || 0) + 1;

  const output = {
    timestamp: new Date().toISOString(),
    projectPath,
    filesScanned: fileCount,
    summary: {
      ...c,
      reported: visibleFindings.length,
      suppressed: suppressedFindings.length,
      total: findings.length,
    },
    healthy: c.critical === 0,
    issues: visibleFindings.map(f => ({
      severity: f.severity,
      ruleId: f.rule,
      message: f.message,
      location: f.location,
    })),
  };

  if (verbose) {
    output.suppressedIssues = suppressedFindings.map(f => ({
      ruleId: f.rule,
      location: f.location,
      suppressedBy: f.suppressedBy,
      justification: f.justification,
    }));
  }

  console.log(JSON.stringify(output, null, 2));
}
