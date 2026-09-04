import { stripComments } from './strip-comments.js';
import { extractMethodBodyRange, maskStringLiterals } from './method-body.js';

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

// A3.2 (issue #11) design decision: this used to be observability.js's own
// copy of the body-extraction logic, with its own maskAnnotationArgs() that
// only ever blanked the FIRST parenthesis group before the body's opening
// brace. blocking.js needed the same core logic (mask strings/comments, find
// the real `{`, depth-count to the matching `}`) but ALSO needed to handle
// multiple stacked annotations with brace-bearing args between the anchor
// and the method (e.g. @KafkaListener(...) @RetryableTopic(include = {
// A.class, B.class })) — a case this file's own MAPPING_RES annotations
// don't realistically hit stacked with another brace-bearing annotation, but
// which is real Spring Kafka usage. Rather than let blocking.js duplicate
// (and diverge from) this logic, the boundary-finding core was promoted to
// method-body.js's extractMethodBodyRange(), generalized to mask ALL
// parenthesis groups that precede the real `{`, and both rules now call it.
// This file only re-derives the masked body TEXT (extractMethodBodyRange()
// returns a line range, not text — blocking.js needs the range for absolute
// per-line locations; this rule only needs a body string to run LOG_RES
// against).
function extractMethodBody(lines, startIndex) {
  const range = extractMethodBodyRange(lines, startIndex, 60);
  if (range === null) return null; // abstract/interface method — no body at all

  let block = lines.slice(range.startLineIdx, range.endLineIdx + 1).join('\n');
  block = maskStringLiterals(block);
  block = stripComments(block);
  return block;
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
