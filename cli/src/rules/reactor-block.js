import { stripComments } from './strip-comments.js';
import { mvcOnlyModule } from './web-stack.js';
import { maskJava } from './async-pending-future.js';
import { asyncEnabledInScan } from './enable-async.js';

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
  /(?:public|protected|private)(?:\s+(?:static|final|synchronized|abstract|native))*\s+\S+\s+(\w+)\s*\(/;

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

// Precision (verify/reactor-block, variants A4 and C, pre-registered): two shapes where
// a .block() was measured NOT to stall any Reactor thread. Only `.block()` and only the
// exact measured shapes are skipped; .blockFirst()/.blockLast() and .toFuture().get()
// were not measured there and are still reported.
//   A4 — the call sits in the statement of a Mono/Flux.fromCallable/fromSupplier/
//        fromRunnable that is moved with .subscribeOn(Schedulers.boundedElastic()), and
//        the statement has no publishOn. It blocks a boundedElastic thread, the pool
//        Reactor provides for blocking; the pool still has a capacity (threads / call
//        duration), measured as saturation, not as a Reactor-thread stall.
//   C  — a plain statement (no lambda, method reference, subscribeOn or publishOn) in a
//        @RestController of an MVC-only module (web-stack.js): it runs on the servlet
//        container's worker, not on a Reactor thread.
const ELASTIC_SOURCE_RE = /\b(?:Mono|Flux)\s*\.\s*(?:fromCallable|fromSupplier|fromRunnable)\s*\(/;
const SUBSCRIBE_ON_ELASTIC_RE = /\.\s*subscribeOn\s*\(\s*(?:Schedulers\s*\.\s*)?boundedElastic\s*\(\s*\)\s*\)/;
const PUBLISH_ON_RE = /\.\s*publishOn\s*\(/;
const OFF_CALLER_THREAD_RE = /->|::|\.\s*(?:subscribeOn|publishOn)\s*\(/;
const CONTROLLER_ANNOTATION_RE = /@(?:\w+\.)*RestController\b/;
const MAX_STATEMENT_LINES = 20;

// The statement a line belongs to, comments stripped: back to the previous line that
// ends a statement or opens/closes a block, forward to the line that ends with ';'.
function statementAt(lines, i) {
  const code = k => stripComments(lines[k].trim());
  let start = i;
  while (start > 0 && i - start < MAX_STATEMENT_LINES && !/[;{}]$/.test(code(start - 1))) start--;
  let end = i;
  while (end < lines.length - 1 && end - i < MAX_STATEMENT_LINES && !/;$/.test(code(end))) end++;
  const parts = [];
  for (let k = start; k <= end; k++) parts.push(code(k));
  return parts.join(' ');
}

function measuredSafe(statement, inController, mvcOnly) {
  if (ELASTIC_SOURCE_RE.test(statement) && SUBSCRIBE_ON_ELASTIC_RE.test(statement) && !PUBLISH_ON_RE.test(statement)) return true;
  return inController && mvcOnly && !OFF_CALLER_THREAD_RE.test(statement);
}

// ─── Thread context (2.4.0, Phase 1 (c), design approved 2026-10-14) ─────────────────
// The measured impact (IllegalStateException; the .toFuture().get() deadlock) needs the
// call to run on a Reactor thread. CRITICAL only with evidence of that in this file;
// otherwise WARNING ("unknown thread"), never silence. Excluded only where the same
// method is a Spring context known to run off Reactor threads.
//   (1) inside a lambda (or anonymous class) passed to a Reactor operator: it runs on
//       the thread that emits the signal;
//   (2) a statement of a public method of a @RestController in a module that is not
//       MVC-only (web-stack.js): a WebFlux handler, on the Netty event loop;
//   (3) a statement of a method that takes ServerRequest or ServerWebExchange
//       (HandlerFunction, WebFilter);
//   plus a Mono/Flux.fromCallable/fromSupplier/fromRunnable/defer lambda that is moved
//   with subscribeOn(parallel()/single()), or that is not moved at all inside (2)/(3).
// Any doubt (unparsed shape, other lambda, other scheduler) -> WARNING, never CRITICAL.
const REACTOR_OPERATORS = new Set([
  'map', 'flatMap', 'flatMapMany', 'flatMapIterable', 'flatMapSequential', 'concatMap',
  'concatMapIterable', 'switchMap', 'filter', 'filterWhen', 'handle', 'doOnNext',
  'doOnSuccess', 'doOnEach', 'doOnError', 'doOnComplete', 'doOnTerminate',
  'doAfterTerminate', 'doFinally', 'doOnSubscribe', 'doOnRequest', 'doOnCancel', 'zipWith',
  'zipWhen', 'subscribe', 'onErrorResume', 'onErrorMap', 'onErrorContinue', 'takeWhile',
  'takeUntil', 'skipWhile', 'skipUntil', 'delayUntil', 'reduce', 'scan', 'groupBy',
  'bufferUntil', 'bufferWhile', 'windowUntil', 'windowWhile', 'expand', 'expandDeep',
  'retryWhen', 'repeatWhen',
]);
const REACTOR_SOURCES = new Set(['fromCallable', 'fromSupplier', 'fromRunnable', 'defer']);
// Lambdas that run inline on the caller's thread: java.util.stream, Optional, forEach.
const SYNC_RECEIVER_RE = /\.\s*(?:stream|parallelStream)\s*\(\s*\)|\b(?:Stream|IntStream|LongStream|DoubleStream|Optional|Arrays)\s*\./;
const SUBSCRIBE_ON_RE = /\.\s*subscribeOn\s*\(/;
const SUBSCRIBE_ON_NON_BLOCKING_RE = /\.\s*subscribeOn\s*\(\s*(?:Schedulers\s*\.\s*)?(?:parallel|single)\s*\(\s*\)\s*\)/;
const HANDLER_PARAM_RE = /\b(?:ServerRequest|ServerWebExchange)\s+\w+/;
const PUBLIC_RE = /\bpublic\b/;

// Spring contexts known to run off Reactor threads, recognised in the same method only.
const SPRING_ASYNC_RE = /@(?:org\.springframework\.scheduling\.annotation\.)?Async\b/;
const SPRING_ASYNC_QUALIFIED_RE = /@org\.springframework\.scheduling\.annotation\.Async\b/;
const SPRING_ASYNC_IMPORT_RE = /^\s*import\s+org\.springframework\.scheduling\.annotation\.(?:Async|\*)\s*;/m;
const STARTUP_METHODS = [
  { implementsRe: /\b(?:CommandLineRunner|ApplicationRunner)\b/, name: 'run' },
  { implementsRe: /\b(?:SmartLifecycle|Lifecycle)\b/, name: 'start' },
  { implementsRe: /\bApplicationListener\s*<\s*(?:[\w.]+\.)?(?:ApplicationReadyEvent|ContextRefreshedEvent)\s*>/, name: 'onApplicationEvent' },
];
const EVENT_LISTENER_RE = /@(?:[\w.]+\.)?EventListener\b/;
const READY_EVENT_RE = /\bApplicationReadyEvent\b/;

// Name of the method called by the '(' at p, and whether it is a constructor (`new X(`).
function calleeAt(text, p) {
  const before = text.slice(0, p);
  if (/\bnew\s+[\w.$]+\s*(?:<[^<>()]*>)?\s*$/.test(before)) return { name: null, ctor: true, dot: -1 };
  const m = /(\.\s*)?(?:<[^<>()]*>\s*)?([A-Za-z_$][\w$]*)\s*$/.exec(before);
  if (!m) return { name: null, ctor: false, dot: -1 };
  return { name: m[2], ctor: false, dot: m[1] ? m.index : -1 };
}

// The receiver expression before a '.name(' call: back over balanced brackets to the
// nearest unbalanced '(' or a ';', '{', '}', ',' or '=' at the same depth.
function receiverBefore(text, dot) {
  let depth = 0;
  let k = dot - 1;
  for (; k >= 0; k--) {
    const c = text[k];
    if (c === ')' || c === ']') depth++;
    else if (c === '(' || c === '[') { if (depth === 0) break; depth--; }
    else if (depth === 0 && (c === ';' || c === '{' || c === '}' || c === ',' || c === '=')) break;
  }
  return text.slice(k + 1, dot);
}

// Where does the call that ends `text` run? `text` is the masked method body (comments and
// literals blanked) up to the call. Walks outwards: over balanced () and {}, through
// control blocks and inline (stream/Optional/forEach) lambdas, and stops at the first
// lambda or anonymous class that is an argument of something.
//   { kind: 'statement' }                       the method's own thread
//   { kind: 'operator', name }                  lambda of a Reactor operator
//   { kind: 'source', name }                    lambda of Mono/Flux.fromCallable/...
//   { kind: 'deferred' }                        any other lambda / anonymous class
function threadContext(text) {
  let paren = 0;
  let brace = 0;
  let lambdaHere = false; // the current level is the body of a lambda / anonymous class
  let levelClosed = false; // crossed a ',' or ';' at this level: earlier '->' are siblings
  for (let p = text.length - 1; p >= 0; p--) {
    const c = text[p];
    // Skipping a balanced group: only its own kind of bracket counts inside it.
    if (paren > 0) { if (c === ')') paren++; else if (c === '(') paren--; continue; }
    if (brace > 0) { if (c === '}') brace++; else if (c === '{') brace--; continue; }
    if (c === ')') { paren = 1; continue; }
    if (c === '}') { brace = 1; continue; }
    if (c === ',' || c === ';') { levelClosed = true; continue; }
    if (c === '>' && text[p - 1] === '-') {
      if (!levelClosed) lambdaHere = true;
      p--;
      continue;
    }
    if (c === '{') {
      // Unclosed '{': a block that contains the call.
      const before = text.slice(0, p).trimEnd();
      if (before.endsWith('->')) {
        lambdaHere = true;
        p = before.length - 2; // the loop's p-- continues before the arrow
      } else if (/\bnew\s+[\w.$]+\s*(?:<[^<>()]*>)?\s*\([^()]*\)\s*$/.test(before)) {
        lambdaHere = true; // anonymous class body: its methods run when someone calls them
      } else {
        lambdaHere = false; // control block or method of an anonymous class: same thread
      }
      levelClosed = false;
      continue;
    }
    if (c === '(') {
      // Unclosed '(': the call is in the arguments of this call.
      const callee = calleeAt(text, p);
      if (lambdaHere) {
        if (callee.ctor || !callee.name) return { kind: 'deferred' };
        if (callee.name === 'forEach') { lambdaHere = false; levelClosed = false; continue; }
        if (callee.dot >= 0 && SYNC_RECEIVER_RE.test(receiverBefore(text, callee.dot))) {
          lambdaHere = false; levelClosed = false; continue;
        }
        if (REACTOR_SOURCES.has(callee.name)) return { kind: 'source', name: callee.name };
        if (callee.dot >= 0 && REACTOR_OPERATORS.has(callee.name)) return { kind: 'operator', name: callee.name };
        return { kind: 'deferred' };
      }
      levelClosed = false;
      continue;
    }
  }
  return lambdaHere ? { kind: 'deferred' } : { kind: 'statement' };
}

function springAsync(annotations, src) {
  if (!SPRING_ASYNC_RE.test(annotations)) return false;
  return SPRING_ASYNC_QUALIFIED_RE.test(annotations) || SPRING_ASYNC_IMPORT_RE.test(src);
}

function startupMethod(classHeader, annotations, signature, name) {
  if (STARTUP_METHODS.some(s => s.name === name && s.implementsRe.test(classHeader))) return true;
  return EVENT_LISTENER_RE.test(annotations) && READY_EVENT_RE.test(`${annotations} ${signature}`);
}

// Text from line `from` up to the first line that contains `stop` (inclusive), joined.
function headerFrom(lines, from, stop, max = 10) {
  const parts = [];
  for (let k = from; k < lines.length && k - from < max; k++) {
    parts.push(lines[k]);
    if (lines[k].includes(stop)) break;
  }
  return parts.join(' ');
}

const REMEDY = "compose with .flatMap()/.then() instead, or, if the call must block, run it in Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic()) (a bounded pool: capacity = threads / call duration)";

function criticalMessage(call, where) {
  if (call === 'toFuture().get()') {
    return `Reactive chain '.toFuture().get()' ${where} blocks the calling thread — in a WebFlux handler with WebClient on the server's event loops every such request deadlocked (measured); stay on the reactive pipeline with .flatMap() or .subscribe()`;
  }
  return `Reactive blocking call '.${call}()' ${where} — on a Reactor thread (Netty event loop or Schedulers.parallel() worker) it throws IllegalStateException on every call (measured); ${REMEDY}`;
}

function warningMessage(call) {
  const impact = call === 'toFuture().get()'
    ? "if it runs on the Netty event loop of a WebFlux server whose WebClient shares those event loops, every such request deadlocks (measured)"
    : "if a Reactor thread (Netty event loop, Schedulers.parallel()) runs it, it throws IllegalStateException on every call (measured)";
  return `Blocking call '.${call}' in a Spring bean, on a thread vibe-guard cannot see. Detection: the call exists. Impact: ${impact}; this file shows no evidence that it runs on one. Reproduction: not available for this case. If a Reactor pipeline calls it, ${call === 'toFuture().get()' ? 'stay on the reactive pipeline with .flatMap() or .subscribe()' : REMEDY}`;
}

// Severity and wording for one call, or null when a measured-safe shape applies.
function classify({ call, context, statement, handler }) {
  const name = call === 'toFuture().get()' ? call : `${call}()`;
  if (context.kind === 'operator') {
    return { severity: 'critical', message: criticalMessage(call, `inside a callback (lambda or anonymous class) of the Reactor operator ${context.name}(...), which runs on the thread that emits the signal`) };
  }
  if (context.kind === 'source') {
    const src = `inside Mono/Flux.${context.name}(...)`;
    if (SUBSCRIBE_ON_NON_BLOCKING_RE.test(statement)) {
      return { severity: 'critical', message: criticalMessage(call, `${src} subscribed on a non-blocking Reactor scheduler (parallel/single)`) };
    }
    if (handler && !SUBSCRIBE_ON_RE.test(statement)) {
      return { severity: 'critical', message: criticalMessage(call, `${src} in a WebFlux handler, with no subscribeOn: it runs where the handler's publisher is subscribed, the Netty event loop`) };
    }
    return { severity: 'warning', message: warningMessage(name) };
  }
  if (context.kind === 'statement' && handler) {
    return { severity: 'critical', message: criticalMessage(call, 'in a WebFlux handler, which runs on the Netty event loop') };
  }
  return { severity: 'warning', message: warningMessage(name) };
}

export function checkReactorBlock(fileContexts) {
  const findings = [];
  let asyncEnabled; // computed once, on the first Spring @Async method

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;
    const src = lines.join('\n');
    if (!REACTOR_IMPORT_RE.test(src)) continue;
    const masked = maskJava(src).split('\n');
    let mvcOnly; // computed once per file, only if needed

    let braceDepth = 0;

    let pendingReactive = false;   // saw reactive annotation, awaiting class decl
    let pendingController = false; // saw @RestController, awaiting class decl
    let inReactiveClass = false;
    let inController = false;
    let classHeader = '';
    let classDepth = -1;           // braceDepth when class body opened

    let pendingExcluded = false;   // saw @Test/@PostConstruct, awaiting method decl
    let pendingAnnotations = '';   // annotations since the previous member
    let inMethod = false;
    let inExcludedMethod = false;
    let methodStart = -1;
    let handler = false;           // (2)/(3): a WebFlux handler or filter
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
      if (CONTROLLER_ANNOTATION_RE.test(code)) pendingController = true;
      if (EXCLUDED_METHOD_ANNOTATION_RE.test(code)) pendingExcluded = true;
      if (inReactiveClass && !inMethod) {
        if (code.startsWith('@') || pendingAnnotations) pendingAnnotations += ` ${code}`;
        if (code.endsWith(';') || code.endsWith('}')) pendingAnnotations = '';
      }

      // --- Class entry ---
      if (CLASS_DECL_RE.test(code)) {
        if (pendingReactive) {
          inReactiveClass = true;
          inController = pendingController;
          classHeader = stripComments(headerFrom(lines, i, '{'));
          classDepth = braceDepth;
        }
        pendingReactive = false;
        pendingController = false;
      }

      // --- Method entry (only inside reactive class, not already tracking one) ---
      const methodOpen = inReactiveClass && !inMethod ? METHOD_OPEN_RE.exec(code) : null;
      if (methodOpen) {
        // Abstract/interface method: no body — line ends with ; and contains no {
        const isAbstract = !code.includes('{') && code.endsWith(';');
        if (!isAbstract) {
          const signature = stripComments(headerFrom(masked, i, '{'));
          const annotations = `${pendingAnnotations} ${code}`;
          inMethod = true;
          methodStart = i;
          methodDepth = braceDepth;
          inExcludedMethod = pendingExcluded || MAIN_METHOD_RE.test(code)
            || startupMethod(classHeader, annotations, signature, methodOpen[1])
            || (springAsync(annotations, src) && (asyncEnabled ??= asyncEnabledInScan(fileContexts)));
          if (inController && mvcOnly === undefined) mvcOnly = mvcOnlyModule(filePath);
          handler = HANDLER_PARAM_RE.test(signature)
            || (inController && !mvcOnly && PUBLIC_RE.test(signature.slice(0, signature.indexOf('('))));
        }
        pendingExcluded = false; // always consumed by the method signature
        pendingAnnotations = '';
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
        inController = false;
        classDepth = -1;
      }

      // --- Blocking call detection (code portion only — no comment false positives) ---
      if (!inReactiveClass || !inMethod || inExcludedMethod) continue;

      const calls = [];
      for (const m of code.matchAll(BLOCKING_CALL_RE)) calls.push({ call: m[1], index: m.index });
      const toFuture = TOFUTURE_GET_RE.exec(code);
      if (toFuture) calls.push({ call: 'toFuture().get()', index: toFuture.index });
      if (calls.length === 0) continue;

      // The masked line keeps every column (comments and literals blanked), so the k-th
      // match there is the k-th match in `code` unless a literal contains the pattern.
      const maskedLine = masked[i];
      const maskedHits = [...maskedLine.matchAll(BLOCKING_CALL_RE)].map(m => m.index);
      const maskedFuture = TOFUTURE_GET_RE.exec(maskedLine);
      const before = masked.slice(methodStart, i).join('\n');
      const statement = statementAt(lines, i);
      let k = 0;
      for (const c of calls) {
        if (c.call === 'block') {
          if (measuredSafe(statement, inController, mvcOnly)) { k++; continue; }
        }
        const col = c.call === 'toFuture().get()' ? maskedFuture?.index : maskedHits[k++];
        // A shape the masked text does not show (a literal): no evidence, warning.
        const context = col === undefined
          ? { kind: 'deferred' }
          : threadContext(methodBody(`${before}\n${maskedLine.slice(0, col)}`));
        const { severity, message } = classify({ call: c.call, context, statement, handler });
        findings.push({ severity, rule: 'reactor-block', message, location: `${relativePath}:${i + 1}` });
      }
    }
  }

  return deduplicate(findings);
}

// The method text starts at its signature; the scan must start inside its body, after
// the first '{', so that the parameter list is not read as an enclosing call.
function methodBody(text) {
  return text.slice(text.indexOf('{') + 1);
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
