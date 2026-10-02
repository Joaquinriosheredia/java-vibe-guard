import { stripComments } from './strip-comments.js';
import { extractMethodBodyRange } from './method-body.js';

const ASYNC_ANNOTATIONS = [
  { re: /@Scheduled\b/,    name: '@Scheduled' },
  { re: /@KafkaListener\b/, name: '@KafkaListener' },
  { re: /@Async\b/,        name: '@Async' },
  { re: /@EventListener\b/, name: '@EventListener' },
];

// A bare `.get()` is NOT a pattern here — it can't tell a blocking
// Future.get() from Optional.get()/Map.get() without type resolution (issue
// #5). Future.get() is instead matched per receiver name, only for names this
// same file declares with a Future type — see futureReceiverNames() below.
const BLOCKING_PATTERNS = [
  { re: /\.\s*join\s*\(\s*\)/,          name: 'blocking .join()' },
  { re: /\.\s*block\s*\(\s*\)/,         name: 'blocking .block()' },
  { re: /\.\s*blockFirst\s*\(/,         name: 'blocking .blockFirst()' },
  { re: /\.\s*blockLast\s*\(/,          name: 'blocking .blockLast()' },
  { re: /Thread\s*\.\s*sleep\s*\(/,     name: 'Thread.sleep()' },
];

// A field, parameter or local declared with one of these types, e.g.
//   CompletableFuture<Order> future = ...      Future<?> f,      Future pending;
// (raw or generic, optionally fully qualified). The declared name is what
// `.get()` must be called on to count as a blocking Future.get().
const FUTURE_DECLARATION_RE =
  /\b(?:java\.util\.concurrent\.)?(?:Completable|Listenable|Scheduled|Runnable)?Future(?:Task)?\b\s*(?:<(?:[^<>;=(){}]|<(?:[^<>;=(){}]|<[^<>;=(){}]*>)*>)*>)?\s+([A-Za-z_$][\w$]*)\s*[=;,)]/g;
// `var name = CompletableFuture.supplyAsync(...)` etc. — inferred type, but
// unambiguous from the factory call.
const FUTURE_VAR_RE = /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*CompletableFuture\s*\./g;
// `CompletableFuture.supplyAsync(...).get()` chained on one line, no receiver name.
const CHAINED_FUTURE_GET_RE = /\bCompletableFuture\s*\.\s*\w+\s*\(.*\)\s*\.\s*get\s*\(\s*\)/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Names declared anywhere in the file with a Future type. File-wide (not just
// the annotated method) so fields and constructor-injected futures count too.
// Only the untimed `.get()` is matched: `.get(timeout, unit)` is bounded and
// is what the rule's own fix advice points to (same split as
// kafka-send-timeout).
export function futureReceiverNames(lines) {
  const names = new Set();
  for (const line of lines) {
    const code = stripComments(line);
    for (const re of [FUTURE_DECLARATION_RE, FUTURE_VAR_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code)) !== null) names.add(m[1]);
    }
  }
  return names;
}

function futureGetPatterns(lines) {
  const patterns = [...futureReceiverNames(lines)].map(name => ({
    re: new RegExp(`(?<![\\w$.])${escapeRegExp(name)}\\s*\\.\\s*get\\s*\\(\\s*\\)`),
    name: 'blocking Future.get()',
  }));
  patterns.push({ re: CHAINED_FUTURE_GET_RE, name: 'blocking Future.get()' });
  return patterns;
}

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

    const patterns = [...BLOCKING_PATTERNS, ...futureGetPatterns(lines)];

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
        for (const { re, name } of patterns) {
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
