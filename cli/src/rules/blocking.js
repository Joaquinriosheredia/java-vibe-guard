import { stripComments } from './strip-comments.js';
import { extractMethodBodyRange } from './method-body.js';

const ASYNC_ANNOTATIONS = [
  { re: /@Scheduled\b/,    name: '@Scheduled' },
  { re: /@KafkaListener\b/, name: '@KafkaListener' },
  { re: /@Async\b/,        name: '@Async' },
  { re: /@EventListener\b/, name: '@EventListener' },
];

// Future.get()/CompletableFuture.get() are intentionally NOT detected —
// distinguishing a blocking Future.get() from a non-blocking Optional.get()/
// Map.get()/etc. requires receiver type resolution, which this regex-based
// engine doesn't have. See issue #5 and the pending CLI/MCP architecture ADR.
const BLOCKING_PATTERNS = [
  { re: /\.\s*join\s*\(\s*\)/,          name: 'blocking .join()' },
  { re: /\.\s*block\s*\(\s*\)/,         name: 'blocking .block()' },
  { re: /\.\s*blockFirst\s*\(/,         name: 'blocking .blockFirst()' },
  { re: /\.\s*blockLast\s*\(/,          name: 'blocking .blockLast()' },
  { re: /Thread\s*\.\s*sleep\s*\(/,     name: 'Thread.sleep()' },
];

export function checkBlocking(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    // Collect positions of async annotations
    const annotatedPositions = [];
    for (let i = 0; i < lines.length; i++) {
      // Issue #9: strip comments before the anchor test — a comment merely
      // mentioning "@Scheduled"/"@KafkaListener"/etc. (e.g. explaining what a
      // fixture does NOT contain) must not open a detection window.
      const code = stripComments(lines[i]);
      for (const { re, name } of ASYNC_ANNOTATIONS) {
        if (re.test(code)) {
          annotatedPositions.push({ lineIdx: i, annotationName: name });
          break;
        }
      }
    }
    if (annotatedPositions.length === 0) continue;

    for (const { lineIdx, annotationName } of annotatedPositions) {
      // A3.2 (issue #11): the fixed 60-line window used to scan past the
      // annotated method's real closing brace into whatever came next,
      // misattributing a blocking call in a later, unannotated method to
      // this annotation (see BlockingWindowMisattributionProbe.java's
      // history). extractMethodBodyRange() replaces it with the method's
      // real structural boundary — the "stop at the next annotation"
      // heuristic this loop used to rely on as a partial mitigation is gone,
      // superseded by the real boundary. The 60-line cap is still passed
      // through, but now only as a safety bound on how far the boundary
      // search itself goes (see method-body.js), not as the attribution
      // limit.
      const range = extractMethodBodyRange(lines, lineIdx, 60);
      if (range === null) continue; // abstract/interface method — no body to scan

      for (let i = range.startLineIdx + 1; i <= range.endLineIdx; i++) {
        // Issue #11 / A3.1: strip comments before the BLOCKING_PATTERNS test
        // — a comment merely mentioning a blocking call name inside an
        // otherwise-safe method must not fire. Unchanged by A3.2.
        const windowCode = stripComments(lines[i]);
        for (const { re, name } of BLOCKING_PATTERNS) {
          if (re.test(windowCode)) {
            findings.push({
              severity: 'critical',
              rule: annotationName === '@KafkaListener' ? 'blocking-kafka' : 'blocking',
              message: `${name} detected in ${annotationName} method`,
              location: `${relativePath}:${i + 1}`,
            });
          }
        }
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
