import { stripComments } from './strip-comments.js';

// Faithful port of mcp-server's VIBE-002 (ReactorBlockingCallRule.java) —
// same brace-depth state machine, same class/method anchors, same excluded
// methods. Unlike blocking.js (anchored to @Scheduled/@Async/@EventListener/
// @KafkaListener method annotations), this rule's anchor is a CLASS-level
// annotation that must stay in scope across every method in the class, not
// just a fixed line-window after the annotation — hence the brace-depth
// tracking instead of blocking.js's window approach.

// Ancla de clase (heredada de VIBE-002): @RestController, @Service, or
// @Component. Supports the fully-qualified form too
// (@org.springframework.web.bind.annotation.RestController).
const REACTIVE_CLASS_ANNOTATION_RE = /@(?:\w+\.)*(?:RestController|Service|Component)\b/;
const CLASS_DECL_RE = /\bclass\s+\w+/;

// Method-level exclusions (heredado de VIBE-002): @Test, @PostConstruct,
// and main() are safe contexts where a single blocking call is acceptable
// (test assertions, one-time startup init, the process entry point).
const EXCLUDED_METHOD_ANNOTATION_RE = /@(?:\w+\.)*(?:Test|PostConstruct)\b/;
const MAIN_METHOD_RE = /public\s+static\s+void\s+main\s*\(/;

// Handles optional modifiers between visibility and return type: static,
// final, synchronized, etc. — same as VIBE-002's METHOD_OPEN.
const METHOD_OPEN_RE =
  /(?:public|protected|private)(?:\s+(?:static|final|synchronized|abstract|native))*\s+\S+\s+\w+\s*\(/;

// Leading dot guarantees this is a method call, not a variable named "block".
const BLOCKING_CALL_RE = /\.\s*(block|blockFirst|blockLast)\s*\(/g;

// .toFuture().get() on a single line — the canonical reactive-to-blocking
// escape hatch. Evaluated only after the Reactor-import gate below; this is
// intentionally NOT a general Future.get() detector (that ambiguity is
// exactly why blocking.js never added one — see blocking.js:8-11).
const TOFUTURE_GET_RE = /\.toFuture\s*\(\s*\)\s*\.get\s*\(/;

// NEW gate, not present in VIBE-002: the file must contain an explicit or
// wildcard import of reactor.core.publisher. Without it, a class-level
// @Service/@RestController/@Component anchor alone is too weak in this
// type-unaware regex engine — a `.block()`/`.blockFirst()`/`.blockLast()`
// call on some unrelated, non-Reactor API inside any Spring bean would
// otherwise be flagged. This is the one deliberate difference from the MCP
// original; it trades a small accepted false-negative (Reactor used via a
// static import or a bare `Publisher<T>` type, with no direct
// reactor.core.publisher import in the file) for removing a whole class of
// false positives the original didn't have to worry about running inside a
// Java-only, single-file MCP tool call.
const REACTOR_IMPORT_RE = /^\s*import\s+reactor\.core\.publisher\.(?:\*|\w+)\s*;/m;

export function checkReactorBlock(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;
    if (!REACTOR_IMPORT_RE.test(lines.join('\n'))) continue;

    let braceDepth = 0;

    let pendingReactive = false;   // saw reactive annotation, awaiting class decl
    let inReactiveClass = false;
    let classDepth = -1;           // braceDepth when class body opened

    let pendingExcluded = false;   // saw @Test/@PostConstruct, awaiting method decl
    let inMethod = false;
    let inExcludedMethod = false;
    let methodDepth = -1;          // braceDepth when method signature was seen

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Strip comments to avoid matching annotations/patterns inside them —
      // reuses the shared stripComments() helper (kafka.js, transactions.js)
      // instead of VIBE-002's ad hoc "//"-only line stripper.
      const code = stripComments(trimmed);

      // --- Annotation tracking (code portion only, not comment text) ---
      if (REACTIVE_CLASS_ANNOTATION_RE.test(code)) pendingReactive = true;
      if (EXCLUDED_METHOD_ANNOTATION_RE.test(code)) pendingExcluded = true;

      // --- Class entry ---
      if (CLASS_DECL_RE.test(code)) {
        if (pendingReactive) {
          inReactiveClass = true;
          classDepth = braceDepth;
        }
        pendingReactive = false;
      }

      // --- Method entry (only inside reactive class, not already tracking one) ---
      if (inReactiveClass && !inMethod && METHOD_OPEN_RE.test(code)) {
        // Abstract/interface method: no body — line ends with ; and contains no {
        const isAbstract = !code.includes('{') && code.endsWith(';');
        if (!isAbstract) {
          inMethod = true;
          inExcludedMethod = pendingExcluded || MAIN_METHOD_RE.test(code);
          methodDepth = braceDepth;
        }
        pendingExcluded = false; // always consumed by the method signature
      }

      // --- Brace counting (whole raw line, including string literals) ---
      for (const c of line) {
        if (c === '{') braceDepth++;
        else if (c === '}') braceDepth--;
      }

      // --- Method exit ---
      if (inMethod && braceDepth <= methodDepth && trimmed.includes('}')) {
        inMethod = false;
        inExcludedMethod = false;
        methodDepth = -1;
      }

      // --- Class exit ---
      if (inReactiveClass && braceDepth <= classDepth && trimmed.includes('}')) {
        inReactiveClass = false;
        classDepth = -1;
      }

      // --- Blocking call detection (code portion only — no comment false positives) ---
      if (!inReactiveClass || !inMethod || inExcludedMethod) continue;

      for (const m of code.matchAll(BLOCKING_CALL_RE)) {
        findings.push({
          severity: 'critical',
          rule: 'reactor-block',
          message: `Reactive blocking call '.${m[1]}()' inside Spring bean — pins a thread under load; use reactive composition (.flatMap, .map, .then) instead`,
          location: `${relativePath}:${i + 1}`,
        });
      }

      if (TOFUTURE_GET_RE.test(code)) {
        findings.push({
          severity: 'critical',
          rule: 'reactor-block',
          message: "Reactive chain '.toFuture().get()' blocks the calling thread — stay on the reactive pipeline with .flatMap() or .subscribe()",
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
