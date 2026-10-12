import { maskJava } from './async-pending-future.js';

// Without @EnableAsync (or <task:annotation-driven/>) Spring registers no async
// interceptor: @Async is inert, the method runs inline on the caller's thread, and
// neither the executor that blocking measured nor the get() that
// async-returns-pending-future measured exists. Both rules therefore anchor on @Async
// only when the scanned tree enables it somewhere.
//
// The whole scanned tree, not the finding's module: the configuration usually lives in
// another module of the same application (Bytedesk: @EnableAsync in core/, the finding in
// modules/kbase/). Cause: the b0-corpus audit (validation/b0-corpus/AUDIT.md), where all 4
// false positives were @Async in a repository with no @EnableAsync (OsmAnd-tools).
// Limit, accepted: an @EnableAsync outside the scanned tree (a jar, another repository, a
// scan of one module only) is not seen, and those @Async methods are not reported.

const ENABLE_ASYNC = 'org.springframework.scheduling.annotation.EnableAsync';
const ENABLE_ASYNC_RE = /@\s*((?:[\w$]+\s*\.\s*)*)EnableAsync\b/g;
const IMPORT_RE = /^\s*import\s+org\.springframework\.scheduling\.annotation\.(?:EnableAsync|\*)\s*;/m;
const TASK_NS = 'http://www.springframework.org/schema/task';

function javaEnablesAsync(src) {
  if (!src.includes('EnableAsync')) return false;
  const m = maskJava(src);
  for (const hit of m.matchAll(ENABLE_ASYNC_RE)) {
    const qualifier = hit[1].replace(/\s+/g, '');
    if (qualifier === '') { if (IMPORT_RE.test(m)) return true; }
    else if (`${qualifier}EnableAsync` === ENABLE_ASYNC) return true;
  }
  return false;
}

// <task:annotation-driven/> with the prefix bound to Spring's task namespace (not
// <mvc:annotation-driven/> or <tx:annotation-driven/>), or unprefixed under it as default.
function xmlEnablesAsync(src) {
  if (!src.includes(TASK_NS) || !src.includes('annotation-driven')) return false;
  const xml = src.replace(/<!--[\s\S]*?-->/g, '');
  const ns = TASK_NS.replace(/[.\/]/g, '\\$&');
  for (const b of xml.matchAll(new RegExp(`\\bxmlns(?::([\\w.-]+))?\\s*=\\s*["']${ns}["']`, 'g'))) {
    const tag = b[1] ? `${b[1].replace(/\./g, '\\.')}:annotation-driven` : 'annotation-driven';
    if (new RegExp(`<\\s*${tag}[\\s/>]`).test(xml)) return true;
  }
  return false;
}

export function asyncEnabledInScan(fileContexts) {
  for (const { filePath, lines } of fileContexts) {
    const isJava = filePath.endsWith('.java');
    if (!isJava && !filePath.endsWith('.xml')) continue;
    const src = lines.join('\n');
    if (isJava ? javaEnablesAsync(src) : xmlEnablesAsync(src)) return true;
  }
  return false;
}
