import { relative, sep } from 'path';
import { moduleRoot, virtualThreadsEnabled, VT_KEY } from './virtual-threads.js';

// async-returns-pending-future (B0 v1). An @Async method that returns a future which
// is still pending holds its executor thread: Spring's AsyncExecutionInterceptor calls
// get() on the returned future ON THE EXECUTOR THREAD (spring-aop 6.1.6), so the
// thread is held until the future completes. Measured in cli/verify/async-pending-future
// (results at 11651ca): the default executor saturates like a blocking call, and the
// nested form (an @Async method returning the future of another @Async method on the
// same executor, through the proxy) starvation-deadlocks.
//
// Design: vibe-guard docs/FASE-3-b0-deteccion-diseno.md, approved 2026-10-06 with M1-M8
// and M10 in v1. Principle: when in doubt, do not report. Only a `return` whose future
// is pending for certain, from what this file shows, is reported:
//   M1 CompletableFuture.supplyAsync/runAsync    M5 HttpClient.sendAsync (java.net.http)
//   M2 a non-async stage over M1, M3-M8          M6 KafkaTemplate.send (Spring Kafka 3.x)
//   M3 an ...Async stage, whatever the origin    M7 new CompletableFuture<>() completed only
//   M4 WebClient ... retrieve() ... toFuture()      in a callback, or never in the method
//   M8 CompletableFuture.allOf(...) with a pending argument
//   M10 self.m() through a self-injected proxy, m @Async in this same class
// Not detected in v1, on purpose (false negatives):
//   - the measured shape P itself (N5): `return downstream.call().thenApply(...)`, where
//     the pending future comes from the body of a method in ANOTHER file;
//   - the nested form between two beans (M9): `return otherBean.asyncMethod()`.
//   Both need cross-file analysis, which is v2. Also not reported: completed futures,
//   self-invocation without the proxy (`this.m()`), parameters and fields, return types
//   Future/ListenableFuture/CompletionStage (not measured), AspectJ mode (not measured).

const RULE = 'async-returns-pending-future';
const RESULTS = 'https://github.com/Joaquinriosheredia/java-vibe-guard/blob/11651ca/cli/verify/async-pending-future/results/criteria.md';
export const SOURCE_SATURATION = `${RESULTS}#L15-L23`;   // (a) saturation, (b) 100 % in the interceptor's get()
export const SOURCE_VIRTUAL_THREADS = `${RESULTS}#L47-L49`;
export const SOURCE_DEADLOCK = `${RESULTS}#L51-L61`;     // (g) HN

const SPRING_ASYNC = 'org.springframework.scheduling.annotation.Async';
const WEB_CLIENT = 'org.springframework.web.reactive.function.client.WebClient';
const HTTP_CLIENT = 'java.net.http.HttpClient';
const KAFKA_TEMPLATE = 'org.springframework.kafka.core.KafkaTemplate';

const M2_STAGES = new Set(['thenApply', 'thenAccept', 'thenRun', 'thenCompose', 'thenCombine', 'handle',
  'whenComplete', 'exceptionally', 'orTimeout', 'completeOnTimeout']);
const ASYNC_STAGES = new Set(['thenApplyAsync', 'thenAcceptAsync', 'thenRunAsync', 'thenComposeAsync',
  'thenCombineAsync', 'thenAcceptBothAsync', 'runAfterBothAsync', 'applyToEitherAsync', 'acceptEitherAsync',
  'runAfterEitherAsync', 'handleAsync', 'whenCompleteAsync', 'exceptionallyAsync', 'exceptionallyComposeAsync']);
const MODIFIERS = new Set(['public', 'protected', 'private', 'static', 'final', 'abstract', 'synchronized',
  'native', 'default', 'strictfp', 'transient', 'volatile', 'sealed', 'non-sealed']);
const KEYWORDS = new Set(['return', 'throw', 'else', 'case', 'new', 'yield', 'assert', 'do']);
const INJECTION = new Set(['Autowired', 'Inject', 'Resource']);
const CONFIG_FILE_RE = /(^|[\\/])application(-[^.\\/]+)?\.(properties|ya?ml)$/;

// ─── Source masking: comments and literal contents become spaces, offsets kept ───

export function maskJava(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  const blank = ch => (ch === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out.push(' '); i++; }
    } else if (c === '/' && d === '*') {
      out.push('  '); i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(blank(src[i])); i++; }
      if (i < n) { out.push('  '); i += 2; }
    } else if (c === '"' && src.startsWith('"""', i)) {
      out.push('"""'); i += 3;
      while (i < n && !src.startsWith('"""', i)) {
        if (src[i] === '\\' && i + 1 < n) { out.push(' ', blank(src[i + 1])); i += 2; continue; }
        out.push(blank(src[i])); i++;
      }
      if (i < n) { out.push('"""'); i += 3; }
    } else if (c === '"' || c === "'") {
      out.push(c); i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) { out.push('  '); i += 2; continue; }
        out.push(' '); i++;
      }
      if (i < n && src[i] === c) { out.push(c); i++; }
    } else {
      out.push(c); i++;
    }
  }
  return out.join('');
}

function braceMatches(m) {
  const match = new Map();
  const stack = [];
  for (let i = 0; i < m.length; i++) {
    if (m[i] === '{') stack.push(i);
    else if (m[i] === '}' && stack.length) match.set(stack.pop(), i);
  }
  return match;
}

// Index of the bracket closing the one opened at `open` ((, <, [), or -1.
function closing(text, open) {
  const pairs = { '(': ')', '<': '>', '[': ']' };
  const o = text[open];
  const c = pairs[o];
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === o) depth++;
    else if (text[k] === c && --depth === 0) return k;
  }
  return -1;
}

// Splits on `sepChar` at depth 0 of (), [], {}.
function splitTopLevel(text, sepChar) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === sepChar && depth === 0) { parts.push(text.slice(start, k)); start = k + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

// ─── Declarations: annotations + modifiers + the rest ───

// `masked` and `original` are the same slice of the masked / original source.
function parseModifiers(masked, original) {
  const annotations = [];
  const modifiers = new Set();
  let k = 0;
  for (;;) {
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] === '@' && !masked.startsWith('@interface', k)) {
      const nm = /^@\s*([\w$.]+)/.exec(masked.slice(k));
      if (!nm) break;
      k += nm[0].length;
      let j = k;
      while (j < masked.length && /\s/.test(masked[j])) j++;
      let args = null;
      if (masked[j] === '(') {
        const end = closing(masked, j);
        if (end === -1) break;
        args = original.slice(j + 1, end);
        k = end + 1;
      }
      annotations.push({ name: nm[1], args });
      continue;
    }
    const word = /^[\w-]+/.exec(masked.slice(k));
    if (word && MODIFIERS.has(word[0])) { modifiers.add(word[0]); k += word[0].length; continue; }
    break;
  }
  return { annotations, modifiers, rest: masked.slice(k).trim() };
}

// Reads a type at the start of `text`: Name, a.b.Name, generics, arrays.
function readType(text) {
  const nm = /^[\w$]+(?:\s*\.\s*[\w$]+)*/.exec(text);
  if (!nm) return null;
  let k = nm[0].length;
  let j = k;
  while (j < text.length && /\s/.test(text[j])) j++;
  if (text[j] === '<') {
    const end = closing(text, j);
    if (end === -1) return null;
    k = end + 1;
  }
  for (;;) {
    const arr = /^\s*\[\s*\]/.exec(text.slice(k));
    if (!arr) break;
    k += arr[0].length;
  }
  return { type: text.slice(0, k).replace(/\s+/g, ''), base: nm[0].replace(/\s+/g, '').split('.').pop(), qualified: nm[0].replace(/\s+/g, ''), length: k };
}

function parseParams(text) {
  if (text.trim() === '') return [];
  return splitTopLevel(text, ',').map(p => {
    const { rest } = parseModifiers(p, p);
    const t = readType(rest);
    if (!t) return null;
    const name = /^\s*(?:\.\.\.)?\s*([\w$]+)/.exec(rest.slice(t.length));
    return name ? { name: name[1], type: t } : null;
  }).filter(Boolean);
}

function classifyHeader(maskedHeader, originalHeader) {
  const { annotations, modifiers, rest } = parseModifiers(maskedHeader, originalHeader);
  const cls = /^(class|interface|enum|record|@interface)\s+([\w$]+)/.exec(rest);
  if (cls) return { kind: 'class', classKind: cls[1], name: cls[2], annotations, modifiers, rest };
  let text = rest;
  if (text.startsWith('<')) {
    const end = closing(text, 0);
    if (end === -1) return { kind: 'other' };
    text = text.slice(end + 1).trim();
  }
  const t = readType(text);
  if (!t) return { kind: 'other' };
  let after = text.slice(t.length).trim();
  let name;
  let returnType = t;
  if (after.startsWith('(')) {
    name = t.base; returnType = null;                       // constructor
  } else {
    const nm = /^([\w$]+)\s*/.exec(after);
    if (!nm) return { kind: 'other' };
    name = nm[1];
    after = after.slice(nm[0].length);
  }
  if (!after.startsWith('(')) return { kind: 'other' };
  const end = closing(after, 0);
  if (end === -1) return { kind: 'other' };
  const tail = after.slice(end + 1).trim();
  if (tail !== '' && !/^throws\s+[\w$.,<>?\s]+$/.test(tail)) return { kind: 'other' };
  return { kind: 'method', name, returnType, params: parseParams(after.slice(1, end)), annotations, modifiers };
}

function parseField(maskedStmt, originalStmt) {
  const { annotations, modifiers, rest } = parseModifiers(maskedStmt, originalStmt);
  const t = readType(rest);
  if (!t) return null;
  const nm = /^\s*([\w$]+)\s*(=([\s\S]*))?$/.exec(rest.slice(t.length));
  if (!nm) return null;
  return { name: nm[1], type: t, init: nm[3] === undefined ? null : nm[3].trim(), annotations, modifiers };
}

// Members of the class body between `start` and `end` (exclusive).
function parseClassBody(file, start, end, outer) {
  const { m, src, match } = file;
  const members = { fields: [], methods: [], classes: [] };
  let headerStart = start;
  let paren = 0;
  for (let i = start; i < end; i++) {
    const c = m[i];
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === ';' && paren === 0) {
      const f = parseField(m.slice(headerStart, i), src.slice(headerStart, i));
      if (f) members.fields.push(f);
      headerStart = i + 1;
    } else if (c === '{') {
      const close = match.get(i);
      if (close === undefined) return members;
      if (paren > 0) { i = close; continue; }
      const h = classifyHeader(m.slice(headerStart, i), src.slice(headerStart, i));
      if (h.kind === 'class') {
        members.classes.push(parseClass(file, h, i, close, outer));
        headerStart = close + 1;
      } else if (h.kind === 'method') {
        members.methods.push({ ...h, open: i, close });
        headerStart = close + 1;
      } else if (/^\s*(static\s*)?$/.test(m.slice(headerStart, i))) {
        headerStart = close + 1;                            // initializer block
      }
      i = close;
    }
  }
  return members;
}

function parseClass(file, header, open, close, outer) {
  const cls = { ...header, open, close, outer };
  Object.assign(cls, parseClassBody(file, open + 1, close, cls));
  return cls;
}

function parseFile(src) {
  const m = maskJava(src);
  const file = { src, m, match: braceMatches(m), imports: new Set() };
  for (const im of m.matchAll(/^\s*import\s+(?:static\s+)?([\w$.]+(?:\.\*)?)\s*;/gm)) file.imports.add(im[1]);
  file.top = parseClassBody(file, 0, m.length, null);
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  file.lineOf = offset => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  return file;
}

function* allClasses(members) {
  for (const c of members.classes) {
    yield c;
    yield* allClasses(c);
  }
}

// Is the annotation / type `simple` (or its qualified name) the one at `qualified`?
function resolves(file, name, qualified) {
  if (name === qualified) return true;
  const simple = qualified.split('.').pop();
  if (name !== simple) return false;
  const pkg = qualified.slice(0, qualified.lastIndexOf('.'));
  return file.imports.has(qualified) || file.imports.has(`${pkg}.*`);
}

// '' for @Async without a value; the literal for @Async("x") / @Async(value = "x");
// a non-literal value is kept as-is so it never equals another one.
function asyncValue(file, annotations) {
  const a = annotations.find(x => resolves(file, x.name, SPRING_ASYNC));
  if (!a) return null;
  if (a.args === null || a.args.trim() === '') return '';
  const lit = /^\s*(?:value\s*=\s*)?"([^"]*)"\s*$/.exec(a.args);
  return lit ? lit[1] : `?${a.args.trim()}`;
}

// ─── The method body: top-level returns, locals ───

// Offsets of the `return` keywords of the method itself: not inside a lambda block,
// an anonymous class or a local class (N16).
function methodReturns(m, method, match) {
  const offsets = [];
  let headerStart = method.open + 1;
  for (let i = method.open + 1; i < method.close; i++) {
    const c = m[i];
    if (c === '{') {
      const h = m.slice(headerStart, i);
      const nested = /->\s*$/.test(h)
        || /\bnew\s+[\w$.]+\s*(?:<[^;{}]*>)?\s*\([^;{}]*\)\s*$/.test(h)
        || /(?<![\w$.])(?:class|interface|enum|record)\s+[\w$]+/.test(h);
      if (nested) { i = match.get(i) ?? i; continue; }
      headerStart = i + 1;
    } else if (c === '}' || c === ';') {
      headerStart = i + 1;
    } else if (c === 'r' && m.startsWith('return', i) && !/[\w$]/.test(m[i - 1]) && !/[\w$]/.test(m[i + 6] ?? '')) {
      offsets.push(i);
    }
  }
  return offsets;
}

function expressionAfter(m, from) {
  let depth = 0;
  for (let k = from; k < m.length; k++) {
    const ch = m[k];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) return m.slice(from, k);
  }
  return null;
}

const tokenRe = name => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');

// The initializer of a local declared once and never reassigned in the method, or null.
function singleAssignment(ctx, name) {
  const body = ctx.body;
  const esc = name.replace(/\$/g, '\\$');
  const decl = new RegExp(`(?:^|[;{}(]|\\n)\\s*(?:final\\s+)?(?:var|[\\w$.]+\\s*(?:<[^;=(){}]*>)?(?:\\s*\\[\\s*\\])*)\\s+${esc}\\s*=(?!=)`, 'g');
  const decls = [...body.matchAll(decl)];
  if (decls.length !== 1) return null;
  const assigns = [...body.matchAll(new RegExp(`(?<![\\w$.])${esc}\\s*(?:[-+*/%&|^]|<<|>>>?)?=(?!=)`, 'g'))];
  if (assigns.length !== 1) return null;
  if (ctx.method.params.some(p => p.name === name)) return null;
  const at = decls[0].index + decls[0][0].length;
  const init = expressionAfter(body, at);
  return init === null ? null : { init: init.trim(), declEnd: at };
}

function declaredType(ctx, name, fieldsOnly = false) {
  if (!fieldsOnly) {
    const p = ctx.method.params.find(x => x.name === name);
    if (p) return p.type.qualified;
    const esc = name.replace(/\$/g, '\\$');
    const local = [...ctx.body.matchAll(new RegExp(`(?:^|[;{}(]|\\n)\\s*(?:final\\s+)?([\\w$.]+)\\s*(?:<[^;=(){}]*>)?\\s+${esc}\\s*[=;:]`, 'g'))]
      .find(x => !KEYWORDS.has(x[1]));
    if (local) {
      if (local[1] !== 'var') return local[1];
      const a = singleAssignment(ctx, name);
      if (!a) return null;
      if (/^WebClient\s*\.\s*(?:create|builder)\s*\(/.test(a.init)) return 'WebClient';
      if (/^HttpClient\s*\.\s*(?:newHttpClient|newBuilder)\s*\(/.test(a.init)) return 'HttpClient';
      return null;
    }
  }
  for (let c = ctx.cls; c; c = c.outer) {
    const f = c.fields.find(x => x.name === name);
    if (f) return f.type.qualified;
  }
  return null;
}

// ─── Shapes ───

function parseChain(expr) {
  let e = expr.replace(/\s+/g, ' ').trim().replace(/\.\s*<[^<>()]*>\s*/g, '.');
  if (e === '') return null;
  const segs = [];
  for (const raw of splitTopLevel(e, '.')) {
    const s = raw.trim();
    let mm;
    if (/^[\w$]+$/.test(s)) { segs.push({ ident: s }); continue; }
    if ((mm = /^new ([\w$]+)\s*(<[^()]*>)?\s*\(/.exec(s)) && closing(s, mm[0].length - 1) === s.length - 1) {
      segs.push({ newOf: mm[1], args: s.slice(mm[0].length, -1) });
      continue;
    }
    if ((mm = /^([\w$]+)\s*\(/.exec(s)) && closing(s, mm[0].length - 1) === s.length - 1) {
      segs.push({ call: mm[1], args: s.slice(mm[0].length, -1) });
      continue;
    }
    return null;                                            // ternary, cast, operator, array...
  }
  while (segs.length > 1 && segs[0].ident && ['java', 'util', 'concurrent', 'this'].includes(segs[0].ident)) {
    if (segs[0].ident === 'this' && !(segs[1].ident)) return null;   // this.m(): self-invocation (N3)
    segs.shift();
  }
  return segs;
}

const render = segs => segs.map(s => (s.ident ?? (s.newOf ? `new ${s.newOf}<>(...)` : `${s.call}(${s.args.trim() ? '...' : ''})`))).join('.');

function isNewCompletableFuture(init) {
  const segs = parseChain(init);
  return segs !== null && segs.length === 1 && segs[0].newOf === 'CompletableFuture' && segs[0].args.trim() === '';
}

// M7: every use of local `name` in the method is its declaration, a return, or at most
// one completion in a callback (`f::complete`, `v -> f.complete(v)`).
function completedOnlyInCallback(ctx, name, declEnd) {
  const body = ctx.body;
  let callbacks = 0;
  for (const occ of body.matchAll(tokenRe(name))) {
    const at = occ.index;
    const before = body.slice(Math.max(0, at - 200), at);
    const after = body.slice(at + name.length);
    if (/(?:final\s+)?(?:var|[\w$.]+\s*(?:<[^;=(){}]*>)?)\s+$/.test(before) && /^\s*=/.test(after) && at < declEnd) continue;
    if (/\breturn\s+$/.test(before) && /^\s*;/.test(after)) continue;
    if (/^\s*::\s*complete(?:Exceptionally)?(?![\w$])/.test(after)) { callbacks++; continue; }
    if (/(?:[\w$]+|\([^()]*\))\s*->\s*$/.test(before) && /^\s*\.\s*complete(?:Exceptionally)?\s*\(/.test(after)) { callbacks++; continue; }
    return false;                                           // completed synchronously (N2), passed on, ...
  }
  return callbacks <= 1;
}

// { form, shape } when `expr` is a future pending for certain, else null.
function pendingShape(ctx, expr, depth = 0) {
  if (depth > 4) return null;
  const segs = parseChain(expr);
  if (!segs || segs.length === 0) return null;
  const file = ctx.file;

  if (segs.length === 1 && segs[0].ident) {
    const a = singleAssignment(ctx, segs[0].ident);
    if (!a) return null;
    if (isNewCompletableFuture(a.init)) {
      return completedOnlyInCallback(ctx, segs[0].ident, a.declEnd)
        ? { form: 'M7', shape: 'new CompletableFuture<>() completed only in a callback' } : null;
    }
    return pendingShape(ctx, a.init, depth + 1);
  }

  let pending = false;
  let form = null;
  let i = 1;
  const head = segs[0];
  if (head.ident === 'CompletableFuture' && segs[1]?.call) {
    i = 2;
    if (segs[1].call === 'supplyAsync' || segs[1].call === 'runAsync') { pending = true; form = 'M1'; }
    if (segs[1].call === 'allOf') {
      const args = splitTopLevel(segs[1].args, ',');
      if (args.some(arg => pendingShape(ctx, arg, depth + 1))) { pending = true; form = 'M8'; }
    }
  } else if (head.ident) {
    const type = declaredType(ctx, head.ident);
    const base = type ? type.split('.').pop() : null;
    const typeIs = q => type !== null && base === q.split('.').pop() && (type === q || resolves(file, base, q));
    if (typeIs(WEB_CLIENT)) {
      const end = segs.findIndex(s => s.call === 'toFuture');
      const fetched = segs.slice(1, end).some(s => s.call === 'retrieve' || s.call === 'exchangeToMono');
      if (end === -1 || !fetched) return null;
      pending = true; form = 'M4'; i = end + 1;
    } else if (typeIs(HTTP_CLIENT) && segs[1]?.call === 'sendAsync') {
      pending = true; form = 'M5'; i = 2;
    } else if (typeIs(KAFKA_TEMPLATE) && segs[1]?.call === 'send') {
      pending = true; form = 'M6'; i = 2;
    } else {
      const a = singleAssignment(ctx, head.ident);
      const origin = a ? pendingShape(ctx, a.init, depth + 1) : null;
      if (origin) { pending = true; form = origin.form; }
    }
  }

  for (; i < segs.length; i++) {
    const s = segs[i];
    if (!s.call) return null;
    if (ASYNC_STAGES.has(s.call)) { pending = true; form = 'M3'; continue; }
    if (M2_STAGES.has(s.call) && pending) { form = form === 'M3' ? 'M3' : 'M2'; continue; }
    pending = false; form = null;
  }
  return pending ? { form, shape: render(segs) } : null;
}

// ─── M10: self-injection ───

function asyncMethodsNamed(file, cls, name, arity) {
  const classValue = asyncValue(file, cls.annotations);
  const same = cls.methods.filter(x => x.name === name && x.returnType && x.params.length === arity);
  if (same.length === 0) return null;
  const values = [];
  for (const x of same) {
    const v = asyncValue(file, x.annotations) ?? classValue;
    if (v === null || !x.modifiers.has('public') || x.modifiers.has('final') || x.modifiers.has('static')) return null;
    values.push(v);
  }
  return values.every(v => v === values[0]) ? values[0] : null;
}

function selfInjected(file, cls, fieldName) {
  const f = cls.fields.find(x => x.name === fieldName);
  if (!f || f.type.base !== cls.name || f.init !== null || f.modifiers.has('static')) return false;
  const inClass = file.m.slice(cls.open, cls.close);
  if (new RegExp(`(?<![\\w$])${fieldName}\\s*=\\s*new\\b`).test(inClass)) return false;
  if (f.annotations.some(a => INJECTION.has(a.name.split('.').pop()))) return true;
  return cls.methods.some(c => c.returnType === null && c.params.some(p =>
    p.type.base === cls.name
    && new RegExp(`(?:this\\s*\\.\\s*)?(?<![\\w$.])${fieldName}\\s*=\\s*${p.name}\\s*;`).test(file.m.slice(c.open, c.close))));
}

function selfInjectionCall(ctx, expr, depth = 0) {
  let segs = parseChain(expr);
  if (!segs) return null;
  if (segs.length === 1 && segs[0].ident && depth === 0) {
    const a = singleAssignment(ctx, segs[0].ident);
    return a ? selfInjectionCall(ctx, a.init, 1) : null;
  }
  if (segs.length !== 2 || !segs[0].ident || !segs[1].call) return null;
  if (!selfInjected(ctx.file, ctx.cls, segs[0].ident)) return null;
  const arity = segs[1].args.trim() === '' ? 0 : splitTopLevel(segs[1].args, ',').length;
  const value = asyncMethodsNamed(ctx.file, ctx.cls, segs[1].call, arity);
  return value === null ? null : { field: segs[0].ident, method: segs[1].call, value };
}

// ─── Module facts (the module of a file: nearest pom.xml / build.gradle(.kts)) ───

function makeModuleIndex(fileContexts) {
  const dirRoot = new Map();
  const rootOf = filePath => {
    const dir = filePath.slice(0, filePath.lastIndexOf(sep));
    if (!dirRoot.has(dir)) dirRoot.set(dir, moduleRoot(filePath));
    return dirRoot.get(dir);
  };
  const facts = new Map();
  return {
    rootOf,
    facts(root) {
      if (facts.has(root)) return facts.get(root);
      let aspectj = false;
      let customExecutor = false;
      for (const ctx of fileContexts) {
        if (root !== null && !ctx.filePath.startsWith(root + sep)) continue;
        if (rootOf(ctx.filePath) !== root) continue;
        const text = ctx.lines.join('\n');
        if (ctx.filePath.endsWith('.java')) {
          const m = maskJava(text);
          if (/@\s*(?:[\w$]+\.)*EnableAsync\s*\([^)]*\bASPECTJ\b/.test(m)) aspectj = true;
          if (/\b(?:implements|extends)\b[^{]*\bAsyncConfigurer(?:Support)?\b/.test(m)) customExecutor = true;
          if (/@\s*(?:[\w$]+\.)*Bean\b/.test(m) && /\b[\w$]*Executor(?:Service)?\s*(?:<[^<>;{}()]*>)?\s+[\w$]+\s*\(/.test(m)) customExecutor = true;
        } else if (CONFIG_FILE_RE.test(ctx.filePath)) {
          if (/spring\.task\.execution|^\s*execution\s*:/m.test(text)) customExecutor = true;
        }
      }
      const f = { aspectj, customExecutor };
      facts.set(root, f);
      return f;
    },
  };
}

// ─── Messages ───

function hMessage(shape) {
  return `@Async method returns a future that is still pending (${shape}): Spring's interceptor calls get() on it `
    + `on the executor thread, so the thread is held until it completes — the default executor saturates like a `
    + `blocking call (measured: ${SOURCE_SATURATION})`;
}

function pnMessage(owner, method) {
  return `@Async method returns the future of @Async ${owner}.${method}() on the same default executor, through `
    + `the proxy: each outer task holds its thread in get() waiting for an inner task queued behind it — starvation `
    + `deadlock: once every executor thread holds an outer task, nothing completes (measured: 0 completions at `
    + `20-120 tasks/s on 8 threads, none deadlocked at 10/s: ${SOURCE_DEADLOCK})`;
}

function vtSuffix(vt) {
  return ` — WARNING, not CRITICAL: ${VT_KEY}=true in ${relative(vt.root, vt.file)}, and with virtual threads enabled `
    + `the default @Async executor did not saturate (measured: ${SOURCE_VIRTUAL_THREADS})`;
}

// ─── Rule ───

export function checkAsyncPendingFuture(fileContexts) {
  const findings = [];
  const modules = makeModuleIndex(fileContexts);

  for (const fc of fileContexts) {
    const { filePath, lines, relativePath } = fc;
    if (!filePath.endsWith('.java')) continue;
    const src = lines.join('\n');
    if (!/@\s*(?:[\w$]+\.)*Async\b/.test(src) || !src.includes('CompletableFuture')) continue;
    const file = parseFile(src);

    for (const cls of allClasses(file.top)) {
      if (cls.classKind !== 'class' || cls.modifiers.has('final')) continue;
      const classValue = asyncValue(file, cls.annotations);
      for (const method of cls.methods) {
        const value = asyncValue(file, method.annotations) ?? classValue;
        if (value === null || !method.returnType) continue;
        const rt = method.returnType;
        if (!(rt.qualified === 'CompletableFuture' || rt.qualified === 'java.util.concurrent.CompletableFuture')) continue;
        if (['private', 'static', 'final'].some(x => method.modifiers.has(x))) continue;   // not intercepted by the proxy

        const root = modules.rootOf(filePath);
        const facts = modules.facts(root);
        if (facts.aspectj) continue;                                                       // N11
        const ctx = { file, cls, method, body: file.m.slice(method.open + 1, method.close) };

        for (const at of methodReturns(file.m, method, file.match)) {
          const expr = expressionAfter(file.m, at + 'return'.length);
          if (expr === null) continue;
          const location = `${relativePath}:${file.lineOf(at)}`;
          const vt = virtualThreadsEnabled(filePath);

          const self = selfInjectionCall(ctx, expr);
          if (self) {
            if (vt.enabled) {
              findings.push({ severity: 'warning', rule: RULE, message: hMessage(`${self.field}.${self.method}(), @Async through the proxy`) + vtSuffix(vt), location });
            } else if (value === '' && self.value === '' && !facts.customExecutor) {
              findings.push({ severity: 'critical', rule: RULE, message: pnMessage(cls.name, self.method), location });
            } else {
              findings.push({ severity: 'critical', rule: RULE, message: hMessage(`${self.field}.${self.method}(), @Async through the proxy`), location });
            }
            continue;
          }

          const pending = pendingShape(ctx, expr);
          if (!pending) continue;
          findings.push(vt.enabled
            ? { severity: 'warning', rule: RULE, message: hMessage(pending.shape) + vtSuffix(vt), location }
            : { severity: 'critical', rule: RULE, message: hMessage(pending.shape), location });
        }
      }
    }
  }
  return findings;
}
