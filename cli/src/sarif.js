// SARIF 2.1.0 writer.
// Spec: docs/sarif.md — any behavior change here must be reflected there
// first; this file implements that document, it does not define its own
// contract.
import { RULE_CATALOG } from './rule-catalog.js';

const LOCATION = /^(.*):(\d+)$/;

const SARIF_VERSION = '2.1.0';
const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';
const TOOL_NAME = 'java-vibe-guard';

// §1 — one CLI severity maps to exactly one SARIF level and one fixed
// security-severity band value. security-severity is not a computed score;
// it is a stable representative of GitHub's own official band, always a
// string (GitHub reads it as a string, never a JSON number).
const SEVERITY_LEVEL = {
  critical: 'error',
  major: 'error',
  warning: 'warning',
  info: 'note',
};

const SEVERITY_SECURITY_SCORE = {
  critical: '9.5',
  major: '7.5',
  warning: '5.0',
  info: '2.0',
};

// §6 "Mixed-severity rule ids" — fixed aggregation order used ONLY to
// resolve rule.defaultConfiguration.level and rule.properties["security-severity"]
// when one ruleId emits findings at more than one severity (e.g.
// `transactions`, which spans major and critical). Never used for
// result.level — each result's level always comes straight from its own
// finding's severity via SEVERITY_LEVEL/mapSeverity above.
const SEVERITY_RANK = { critical: 0, major: 1, warning: 2, info: 3 };

export function mapSeverity(severity) {
  return {
    level: SEVERITY_LEVEL[severity],
    securitySeverity: SEVERITY_SECURITY_SCORE[severity],
  };
}

// §2-4 — artifactLocation.uri is always the relativePath portion of
// finding.location (POSIX, no file://, no leading "/"), already guaranteed
// by scanner.js's relativePath computation upstream of this module. region
// is present only when finding.location carries a real ":line" suffix
// (same LOCATION regex suppression.js/baseline.js already use); a
// file-level finding gets a physicalLocation with no region key at all —
// not region: undefined, the key itself is absent.
export function buildPhysicalLocation(finding) {
  const match = LOCATION.exec(finding.location);
  if (!match) {
    return { artifactLocation: { uri: finding.location } };
  }
  const [, relativePath, line] = match;
  return {
    artifactLocation: { uri: relativePath },
    region: { startLine: Number(line) },
  };
}

// §5 — the only findings SARIF ever sees. Suppressed and baseline-matched
// findings are excluded upstream of this module entirely; SARIF's native
// result.suppressions is never used (GitHub Code Scanning doesn't honor it
// anyway — a result marked there still surfaces as an open alert).
export function filterVisibleFindings(findings) {
  return findings.filter(f => !f.suppressed && !f.baselined);
}

function highestSeverity(severities) {
  return [...severities].sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0];
}

// §6 — one reportingDescriptor per distinct ruleId present in
// visibleFindings. helpUri is always the same shared README URL, never a
// per-rule page. security-severity lives at rule.properties, a sibling of
// defaultConfiguration — not nested inside it.
export function buildRules(visibleFindings, toolMeta) {
  const severitiesByRuleId = new Map();
  for (const finding of visibleFindings) {
    if (!severitiesByRuleId.has(finding.rule)) severitiesByRuleId.set(finding.rule, []);
    severitiesByRuleId.get(finding.rule).push(finding.severity);
  }

  const rules = [];
  for (const [ruleId, severities] of severitiesByRuleId) {
    const { level, securitySeverity } = mapSeverity(highestSeverity(severities));
    const description = RULE_CATALOG[ruleId] ?? { short: ruleId, full: ruleId };
    rules.push({
      id: ruleId,
      name: ruleId,
      shortDescription: { text: description.short },
      fullDescription: { text: description.full },
      helpUri: toolMeta.helpUri,
      defaultConfiguration: { level },
      properties: { 'security-severity': securitySeverity },
    });
  }
  return rules;
}

// §7 — full SARIF 2.1.0 document. toolMeta = { version, informationUri,
// helpUri }; version/informationUri are supplied by the caller (read from
// cli/package.json at the call site) rather than read from disk here, so
// this module stays a pure function of its inputs.
export function generateSarif(findings, toolMeta) {
  const visibleFindings = filterVisibleFindings(findings);

  const results = visibleFindings.map(finding => ({
    ruleId: finding.rule,
    level: mapSeverity(finding.severity).level,
    message: { text: finding.message },
    locations: [{ physicalLocation: buildPhysicalLocation(finding) }],
  }));

  return {
    version: SARIF_VERSION,
    $schema: SARIF_SCHEMA,
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: toolMeta.version,
            informationUri: toolMeta.informationUri,
            rules: buildRules(visibleFindings, toolMeta),
          },
        },
        results,
      },
    ],
  };
}
