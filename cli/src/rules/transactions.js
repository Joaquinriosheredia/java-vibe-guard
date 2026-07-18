const CONTROLLER_RES = [/@RestController\b/, /@Controller\b/];

export function checkTransactions(fileContexts) {
  const findings = [];

  for (const { filePath, lines, fileName } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    const content = lines.join('\n');
    const isController = CONTROLLER_RES.some(re => re.test(content));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (!/@Transactional\b/.test(line)) continue;

      // @Transactional on a Controller method
      if (isController) {
        findings.push({
          severity: 'major',
          rule: 'transactions',
          message: '@Transactional on Controller method (move to Service layer)',
          location: `${fileName}:${i + 1}`,
        });
      }

      // @Transactional + @Async in the same method boundary (propagation breaks)
      const ctx = lines.slice(Math.max(0, i - 3), Math.min(i + 5, lines.length)).join('\n');
      const ctxNoComments = stripComments(ctx);
      if (/@Async\b/.test(ctxNoComments)) {
        findings.push({
          severity: 'critical',
          rule: 'transactions',
          message: '@Transactional + @Async — transaction will NOT propagate to async thread',
          location: `${fileName}:${i + 1}`,
        });
      }
    }
  }

  return deduplicate(findings);
}

// Strips line (//...) and block (/*...*/) comments so annotation text
// mentioned inside a comment isn't mistaken for a real annotation.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function deduplicate(findings) {
  const seen = new Set();
  return findings.filter(f => {
    const key = `${f.location}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
