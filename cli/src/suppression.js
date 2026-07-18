import { parseSuppressionDirectives, resolveSuppression } from './suppression-grammar.js';

const LOCATION = /^(.*):(\d+)$/;

export function applySuppressions(findings, fileContexts, config) {
  const contextsByPath = new Map(fileContexts.map(fc => [fc.relativePath, fc]));
  const directivesByPath = new Map();

  function directivesFor(relativePath) {
    if (!directivesByPath.has(relativePath)) {
      const fileContext = contextsByPath.get(relativePath);
      directivesByPath.set(
        relativePath,
        fileContext ? parseSuppressionDirectives(fileContext.lines) : []
      );
    }
    return directivesByPath.get(relativePath);
  }

  return findings.map(finding => {
    // File-level findings (see CONTRIBUTING.md's "location: relativePath alone"
    // exception) have no line to resolve a directive against.
    const match = LOCATION.exec(finding.location);
    if (!match) {
      return { ...finding, suppressed: false, suppressedBy: null, justification: null };
    }

    const [, relativePath, lineStr] = match;
    const directives = directivesFor(relativePath);
    const winner = resolveSuppression(directives, { ruleId: finding.rule, line: Number(lineStr) });

    if (!winner) {
      return { ...finding, suppressed: false, suppressedBy: null, justification: null };
    }

    return {
      ...finding,
      suppressed: true,
      suppressedBy: winner.type,
      justification: winner.justification,
    };
  });
}
