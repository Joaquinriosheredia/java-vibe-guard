import { stripComments } from './strip-comments.js';

const CONTROLLER_RES = [/@RestController\b/, /@Controller\b/];

export function checkTransactions(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    // Issue #9: strip comments before the file-level gate — discovered
    // during that issue's design review that this gate had the exact same
    // unprotected-comment defect as layers.js/observability.js, despite
    // transactions.js being cited as the "already correct" reference (its
    // @Async/ctx check below, lines ~30-33, was already comment-safe; this
    // separate isController gate was not). A comment merely mentioning
    // "@RestController"/"@Controller" must not open the Controller-method
    // check for a class that isn't really a controller.
    const content = stripComments(lines.join('\n'));
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
          location: `${relativePath}:${i + 1}`,
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
          location: `${relativePath}:${i + 1}`,
        });
      }
    }
  }

  return deduplicate(findings);
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
