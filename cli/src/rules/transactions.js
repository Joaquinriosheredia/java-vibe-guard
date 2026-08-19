import { stripComments } from './strip-comments.js';

const CONTROLLER_RES = [/@RestController\b/, /@Controller\b/];

// Second matching site fixed after issue #9, not by it — see the block
// comment above stripCommentsPreservingLines() below for the full history
// and why a plain per-line stripComments() call (the pattern #9 used for
// blocking.js's/kafka.js's annotation anchors) is not enough here.
function stripCommentsPreservingLines(text) {
  return text
    // Same block-comment regex as the shared stripComments(), except the
    // matched span is blanked character-by-character instead of deleted
    // outright — every '\n' inside a multi-line /* ... */ comment is kept,
    // so re-splitting the result on '\n' still lines up 1:1 with the
    // original `lines` array. stripComments() itself cannot be reused for
    // this: it deletes a matched span's newlines along with its text, which
    // is harmless for its existing callers (they only ever run a single
    // boolean regex test over the result, e.g. this file's own isController
    // gate below, or kafka.js's per-line/window checks) but would silently
    // shift every subsequent line's index — and therefore this rule's
    // reported location:${i+1} — once a multi-line comment appeared earlier
    // in the file.
    .replace(/\/\*[\s\S]*?\*\//g, span => span.replace(/[^\n]/g, ''))
    .replace(/\/\/.*$/gm, '');
}

export function checkTransactions(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    // Issue #9: strip comments before the file-level gate — discovered
    // during that issue's design review that this gate had the exact same
    // unprotected-comment defect as layers.js/observability.js, despite
    // transactions.js being cited as the "already correct" reference (its
    // @Async/ctx check below, was already comment-safe — fixed earlier, by
    // issue #6/commit 6cf3cb6, 2026-07-18, not by #9; this separate
    // isController gate was not). A comment merely mentioning
    // "@RestController"/"@Controller" must not open the Controller-method
    // check for a class that isn't really a controller.
    const content = stripComments(lines.join('\n'));
    const isController = CONTROLLER_RES.some(re => re.test(content));

    // Fixes the SECOND, still-unprotected matching site in this file: the
    // @Transactional trigger itself, immediately below. Neither issue #6
    // (which only touched the @Async/ctx check further below in this same
    // loop) nor issue #9 (which only touched the isController gate directly
    // above — its own commit message scopes it to "class/method-level
    // annotation anchors that decide whether to open detection", and this
    // per-line trigger is not an anchor, it's the finding site itself, the
    // same scope boundary #9 explicitly drew for blocking.js's window scan
    // and layers.js's/observability.js's per-line checks) ever pointed at
    // this line. Not a regression of either fix — a site neither one was
    // scoped to reach. Confirmed against git history: `git show 85dbb63 --
    // cli/src/rules/transactions.js` touches only the isController gate;
    // `git log -p -- cli/src/rules/transactions.js` shows this loop's
    // `if (!/@Transactional\b/.test(line))` line unchanged since the file's
    // original commit, d79bd46 (2026-05-24).
    const strippedLines = stripCommentsPreservingLines(lines.join('\n')).split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (!/@Transactional\b/.test(strippedLines[i])) continue;

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
