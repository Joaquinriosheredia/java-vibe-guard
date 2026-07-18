// Inline suppression comment parser and resolver.
// Spec: docs/suppression-grammar.md — any behavior change here must be
// reflected there first; this file implements that document, it does not
// define its own contract.

const DIRECTIVE = /\/\/\s*vibe-guard\s*:\s*ignore\s+([a-z]+(?:-[a-z]+)*(?:\s*,\s*[a-z]+(?:-[a-z]+)*)*)(?:\s*--\s*(.*))?\s*$/;

export function parseSuppressionDirectives(lines) {
  const directives = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = DIRECTIVE.exec(line);
    if (!match) continue;

    const ruleIds = new Set(
      match[1]
        .split(',')
        .map(token => token.trim())
        .filter(token => token.length > 0)
    );

    let justification = match[2] !== undefined ? match[2].trim() : null;
    if (justification !== null && justification.length === 0) justification = null;

    const prefix = line.slice(0, match.index);
    const standalone = prefix.trim().length === 0;

    directives.push({
      type: standalone ? 'standalone' : 'inline',
      line: standalone ? i + 2 : i + 1,
      ruleIds,
      justification,
    });
  }

  return directives;
}

export function resolveSuppression(directives, finding) {
  const inline = directives.find(d => d.type === 'inline' && d.line === finding.line && d.ruleIds.has(finding.ruleId));
  if (inline) return inline;

  const standalone = directives.find(d => d.type === 'standalone' && d.line === finding.line && d.ruleIds.has(finding.ruleId));
  if (standalone) return standalone;

  return null;
}
