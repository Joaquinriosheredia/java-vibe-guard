export function applySuppressions(findings, fileContexts, config) {
  return findings.map(f => ({ ...f, suppressed: false }));
}
