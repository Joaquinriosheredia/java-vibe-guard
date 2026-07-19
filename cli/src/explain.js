// --explain <rule> — prints curated rule information, no project scan.
// Spec: docs/explain.md — any behavior change here must be reflected there
// first; this file implements that document, it does not define its own
// contract.
import { RULE_CATALOG } from './rule-catalog.js';

const RULE_IDS = Object.keys(RULE_CATALOG);

// §4 — single-severity rules print their one value directly; mixed-severity
// rules (today, only `transactions`) list every value (already highest-first
// in the catalog) with an explicit qualifier, never a single collapsed value.
function formatSeverity(severities) {
  if (severities.length === 1) return severities[0];
  return `${severities.join(' or ')} (varies by which pattern matched — this rule id is not single-severity)`;
}

// §6 — case-sensitive lookup, exit code 2, message aligned with --verify's
// existing precedent (verify.js:101-104), not --rule's (scanner.js:62,71):
// no quotes around the offending value, "Available" wording.
export function runExplain(ruleId) {
  const entry = RULE_CATALOG[ruleId];
  if (!entry) {
    console.error(`Unknown rule: ${ruleId}. Available: ${RULE_IDS.join(', ')}`);
    return 2;
  }

  console.log('');
  console.log(ruleId);
  console.log('');
  console.log(`Severity: ${formatSeverity(entry.severities)}`);
  console.log('');
  console.log(entry.short);
  console.log('');
  console.log(entry.full);
  console.log('');

  return 0;
}
