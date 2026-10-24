import { stripComments } from './strip-comments.js';

const CONTROLLER_RES = [/@RestController\b/, /@Controller\b/];

// Second matching site fixed after issue #9, not by it: the per-line @Transactional trigger
// below reads a masked copy of the file whose lines line up 1:1 with `lines` (a multi-line
// /* ... */ must not shift the reported location). Until test-corpus-2 that copy blanked
// only comments (stripCommentsPreservingLines); maskCommentsAndLiterals() below also
// blanks string, char and text-block literals.

// test-corpus-2 (FP-ANALYSIS.md, J003-J013, J055): `@Transactional`/`@Async` matched inside
// string literals — ArchUnit rule descriptions and violation messages, an enum description.
// One pass over the file that blanks comments AND string, char and text-block literals,
// keeping every '\n' so lines still line up 1:1 with `lines`. A single scanner, because the
// two interact: a `//` inside a string is not a comment, and a quote inside a comment does
// not open a string.
export function maskCommentsAndLiterals(text) {
  let out = '';
  let i = 0;
  const blank = (span) => span.replace(/[^\n]/g, ' ');
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    let end = -1;
    if (c === '/' && next === '/') {
      end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
    } else if (c === '/' && next === '*') {
      end = text.indexOf('*/', i + 2);
      end = end === -1 ? text.length : end + 2;
    } else if (c === '"' && text.startsWith('"""', i)) {
      end = text.indexOf('"""', i + 3);
      end = end === -1 ? text.length : end + 3;
    } else if (c === '"' || c === "'") {
      end = i + 1;
      while (end < text.length && text[end] !== c && text[end] !== '\n') end += text[end] === '\\' ? 2 : 1;
      end = Math.min(end + 1, text.length);
    }
    if (end === -1) {
      out += c;
      i++;
    } else {
      out += blank(text.slice(i, end));
      i = end;
    }
  }
  return out;
}

// test-corpus-2 (J054): @Async + @Transactional on an `@interface` declare a composed
// annotation (Spring Modulith's @ApplicationModuleListener), not a proxied method. The
// declaration that follows the annotation at masked[i] is read up to its `{` or `;`, with
// the annotations' own argument lists blanked (`@Target({ ... })` has braces).
function annotatesAnnotationType(masked, i) {
  let chunk = masked.slice(i, i + 15).join('\n');
  let prev;
  do {
    prev = chunk;
    chunk = chunk.replace(/\([^()]*\)/g, m => ' '.repeat(m.length));
  } while (chunk !== prev);
  const decl = chunk.split(/[{;]/)[0];
  return /@\s*interface\b/.test(decl);
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
    const strippedLines = maskCommentsAndLiterals(lines.join('\n')).split('\n');

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
      const ctx = strippedLines.slice(Math.max(0, i - 3), Math.min(i + 5, lines.length)).join('\n');
      if (/@Async\b/.test(ctx) && !annotatesAnnotationType(strippedLines, i)) {
        findings.push({
          severity: 'critical',
          rule: 'transactions',
          // test-corpus-2: the old text ("transaction will NOT propagate to async thread")
          // was overstated in 48 of 48 reviews — the method's own transaction does run on
          // the async thread; what it never joins is the caller's.
          message: '@Transactional + @Async on the same method — it runs in its own new transaction on the async '
            + "executor thread, never in the caller's: a caller rollback does not undo it, and it cannot see the "
            + "caller's uncommitted changes",
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
