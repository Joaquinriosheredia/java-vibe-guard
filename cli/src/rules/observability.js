import { stripComments } from './strip-comments.js';

const MAPPING_RES = [
  /@GetMapping\b/,
  /@PostMapping\b/,
  /@PutMapping\b/,
  /@DeleteMapping\b/,
  /@PatchMapping\b/,
  /@RequestMapping\b/,
];

const LOG_RES = [
  /\blog\s*\.\s*(info|warn|error|debug|trace)\s*\(/i,
  /\blogger\s*\.\s*(info|warn|error|debug|trace)\s*\(/i,
  /\bLOG\s*\.\s*(info|warn|error|debug|trace)\s*\(/,
  /\bLOGGER\s*\.\s*(info|warn|error|debug|trace)\s*\(/,
  /log\.at(Info|Warn|Error|Debug)\b/,
];

// checkObservability()'s per-method body extraction (used below) used to
// count every `{`/`}` character on each physical line as a structural
// method-body brace. That's wrong in two shapes this rule's own mapping
// annotations trigger routinely: (1) a URL path variable embedded in a
// string literal, e.g. @GetMapping("/items/{id}") — extremely common in
// REST APIs — carries a balanced {} that isn't code at all; (2) an
// annotation argument that is itself an array literal, e.g.
// @RequestMapping(method = { RequestMethod.GET, RequestMethod.POST }),
// whose braces are real Java syntax but belong to the annotation, not the
// method. Either shape could close the body scan before ever reaching the
// real method, reporting "no logging" without ever having looked at a
// method body.
//
// Issue #9 (commit 85dbb63) did touch this file, but only the file-level
// Controller gate a few lines below (see "Issue #9" comment on `content`)
// — its own commit message states explicitly: "layers.js / observability.js:
// the file-level Controller gate ... now strips comments before both regex
// tests. Per-line finding checks are untouched — same accepted scope
// boundary as blocking.js's window scan." The body-extraction logic below
// is exactly one of those untouched "per-line finding checks" — #9 never
// evaluated it, correct or not, and never claimed it was correct (contrast
// kafka.js's checkKafkaSendTimeout(), which #9 DID review and explicitly
// declared "already correct"). This is not a missing-stripComments()
// defect of the kind #9 fixed elsewhere — the annotation anchor
// (MAPPING_RES, below) and the file-level Controller gate are both
// untouched and correct as-is.
//
// Fix: build the scan window (same 60-line cap as before) as one
// comment-and-string-masked block, blank out the mapping annotation's own
// argument-list parens (so an array-literal argument becomes invisible to
// the brace count exactly like an ordinary string already is), then take
// the method body as the first remaining balanced `{ ... }` span. The
// reported finding location is still always the annotation's own line —
// this only changes how the body TEXT used for the logging check is found.
function maskStringLiterals(text) {
  return text.replace(/"(?:[^"\\]|\\.)*"/g, m => ' '.repeat(m.length));
}

function maskAnnotationArgs(text) {
  const open = text.indexOf('(');
  if (open === -1) return text;
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === '(') depth++;
    else if (text[k] === ')') {
      depth--;
      if (depth === 0) {
        const inner = text.slice(open + 1, k);
        return text.slice(0, open + 1) + inner.replace(/[^\n]/g, ' ') + text.slice(k);
      }
    }
  }
  return text; // unterminated within the text given — leave as-is
}

function extractMethodBody(lines, startIndex) {
  const windowLines = lines.slice(startIndex, Math.min(startIndex + 60, lines.length));
  // Mask string literals BEFORE stripping comments, not after: stripComments()
  // doesn't know about string literals either, and a `//` inside one (e.g. a
  // URL like "http://host/path") would otherwise be misread as opening a line
  // comment, truncating real code after it (confirmed empirically: it ate the
  // closing `)` of a WebClient.create("http://...") call in a real
  // eugenp/tutorials file, which then made a later string literal look
  // unterminated and desynced every mask after it). Masking first removes the
  // `//` along with the rest of the string before stripComments ever sees it.
  let block = windowLines.join('\n');
  block = maskStringLiterals(block);
  block = stripComments(block);
  block = maskAnnotationArgs(block);

  const openIdx = block.indexOf('{');
  if (openIdx === -1) return null; // abstract/interface method — no body at all

  let depth = 0;
  for (let k = openIdx; k < block.length; k++) {
    if (block[k] === '{') depth++;
    else if (block[k] === '}') {
      depth--;
      if (depth === 0) return block.slice(openIdx, k + 1);
    }
  }
  return block.slice(openIdx); // unterminated within the 60-line window — best effort
}

export function checkObservability(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    // Issue #9: strip comments before the file-level gate — a comment merely
    // mentioning "@RestController"/"@Controller" must not open detection for
    // a file that isn't really a controller. The per-line loop below (using
    // raw `line`) is unaffected — out of scope.
    const content = stripComments(lines.join('\n'));
    if (!/@RestController\b/.test(content) && !/@Controller\b/.test(content)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (!MAPPING_RES.some(re => re.test(line))) continue;

      const body = extractMethodBody(lines, i);
      // Skip if method is abstract / interface (no braces found at all)
      if (body === null) continue;

      const hasLogging = LOG_RES.some(re => re.test(body));
      if (!hasLogging) {
        findings.push({
          severity: 'warning',
          rule: 'observability',
          message: 'Endpoint without structured logging',
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
