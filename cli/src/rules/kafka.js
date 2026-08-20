import { stripComments } from './strip-comments.js';

const ZOOKEEPER_IMAGE_RES = [
  /confluentinc\/cp-zookeeper/i,
  /bitnami\/zookeeper/i,
  /wurstmeister\/zookeeper/i,
  /zookeeper\s*:/,
];

export function checkKafka(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    // --- YAML: Zookeeper detection ---
    if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('#')) continue;
        for (const re of ZOOKEEPER_IMAGE_RES) {
          if (re.test(lines[i])) {
            findings.push({
              severity: 'warning',
              rule: 'kafka',
              message: 'Kafka using Zookeeper (deprecated in Kafka 3.x — migrate to KRaft)',
              location: `${relativePath}:${i + 1}`,
            });
            break;
          }
        }
      }
      continue;
    }

    // --- Java files ---
    if (!filePath.endsWith('.java')) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Issue #9: strip comments before the anchor test — a comment merely
      // mentioning "@KafkaListener" must not open detection here.
      if (!/@KafkaListener\b/.test(stripComments(line))) continue;

      // Collect the full annotation (may span multiple lines). Each line is
      // stripped INDIVIDUALLY before concatenation — stripComments() expects
      // newline-joined input for its multiline "//" removal, but this block
      // is space-joined (`+ ' '` below), so stripping the final concatenation
      // would delete real code past the first "//" on any earlier line
      // (verified empirically while designing this fix). ctx below is
      // newline-joined instead, so it's stripped as a whole block there.
      let annotationBlock = '';
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        annotationBlock += stripComments(lines[j]) + ' ';
        if (lines[j].includes(')')) break;
      }

      // Missing groupId
      if (!/groupId\s*=|group\.id/.test(annotationBlock)) {
        findings.push({
          severity: 'warning',
          rule: 'kafka',
          message: '@KafkaListener without explicit groupId',
          location: `${relativePath}:${i + 1}`,
        });
      }

      // No retry / DLQ strategy in surrounding context. ctx is newline-joined
      // (unlike annotationBlock above), so stripping the whole block is safe
      // here — same pattern transactions.js already uses for its own ctx.
      const ctx = lines.slice(Math.max(0, i - 3), Math.min(i + 6, lines.length)).join('\n');
      const ctxNoComments = stripComments(ctx);
      if (!/@RetryableTopic\b/.test(ctxNoComments) && !/@DltHandler\b/.test(ctxNoComments)) {
        findings.push({
          severity: 'warning',
          rule: 'kafka',
          message: '@KafkaListener without @RetryableTopic or DLQ — failed messages will be lost',
          location: `${relativePath}:${i + 1}`,
        });
      }
    }
  }

  // --- Properties/yml: Kafka config without group.id ---
  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.properties') && !filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) continue;
    const content = lines.join('\n');
    if (
      /spring\.kafka|kafka\.bootstrap|bootstrap-servers/i.test(content) &&
      !/group[.-]id/i.test(content)
    ) {
      findings.push({
        severity: 'warning',
        rule: 'kafka',
        message: 'Kafka config without consumer group.id',
        // File-level finding, not line-level: this check inspects the whole
        // config file for the presence of settings, with no single line to
        // anchor to. location intentionally omits ":line" — SARIF itself
        // distinguishes region-level vs artifact-level results, so this
        // split is semantically correct and reusable when SARIF output lands.
        location: relativePath,
      });
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

// kafka-send-timeout — evidence: Java-Production-Labs SagaOrderService.java:45
// (commit 01cee18) and StreamController.java:53 (commit dcb0358), both
// `<kafkaTemplate>.send(...).get()` with no timeout, blocking the calling
// thread indefinitely when the broker is slow/unavailable. Lab 08's benchmark
// (already cited in this repo's README) measured a 60% request failure rate
// under this exact pattern during a broker outage.
//
// Scope gate: only applied to files with evidence of being Kafka-like
// (KafkaTemplate or org.springframework.kafka import) — deliberately not a
// bare "any .send(...).get()" rule. Without this gate, the same chain shape
// (EmailService.send(msg).get(), an HTTP client's .send(req).get(), etc.) is
// indistinguishable from the Kafka case without receiver-type resolution,
// which this regex engine doesn't have.
const KAFKA_LIKE_RE = /\bKafkaTemplate\b|org\.springframework\.kafka/;

// Requires .send(...) and .get() on the SAME line (after comment stripping),
// with .get() taking no arguments — .get(timeout, TimeUnit) is intentionally
// not matched. `.*` between the two calls (rather than a non-nesting
// `[^)]*`) is deliberate: real send() calls often nest their own parens in
// the payload, e.g. `kafka.send(topic, saved.getId().toString(), payload)`
// (the actual SagaOrderService.java:45 shape) — a `[^)]*` argument matcher
// would stop at the first `)` and never reach the trailing `.get()`.
//
// Accepted false negatives (same class of limitation blocking.js:8-11
// documents for Future.get()/CompletableFuture.get()):
//   - .send(...) and .get() split across multiple lines are not detected —
//     this line-based engine has no reliable window strategy here that
//     wouldn't also risk matching an unrelated .get() call elsewhere in the
//     method.
//   - .get() reached through an intermediate variable
//     (Future<X> f = kafkaTemplate.send(...); f.get();) is not detected —
//     confirming `f`'s declared type is a Future requires type resolution
//     this regex-based engine doesn't have.
const SEND_GET_NO_TIMEOUT_RE = /\.send\s*\(.*\)\s*\.\s*get\s*\(\s*\)/;

// checkKafkaSendTimeout() needs to see whether a physical line sits inside a
// /* ... */ block comment that OPENED on an earlier line — something the
// shared stripComments() helper can't tell it, because that helper only
// strips a block comment when both delimiters land on the text it's given,
// and this function calls it one physical line at a time (so its location
// still lines up with i+1). A JavaDoc/block comment whose opening `/*` is on
// one line and closing `*/` on another leaves the lines in between
// completely unstripped, so text merely documented inside them (e.g. a
// JavaDoc example showing the exact anti-pattern this rule targets) reads as
// real code. Issue #9 (commit 85dbb63) reviewed this function and left it
// untouched, explicitly judging it "already correct" — accurately, for the
// only case the regression fixture exercised at the time (a single-line //
// comment). #9 never tested the multi-line block-comment case; this is the
// same class of defect #9 fixed elsewhere, just a corner #9's own test
// coverage didn't reach in this rule. Kept local to this function (not
// promoted into strip-comments.js) so blocking.js/layers.js/observability.js/
// transactions.js — already stabilized by #9 — are untouched.
//
// Single forward pass over the file's lines, tracking whether we're inside
// an unclosed block comment. Blanks out `//` comments, same-line `/* */`
// comments, and any span covered by a block comment that carries over from
// a previous line — without deleting characters outside comments or
// collapsing lines, so `lines.length` and each index's line number are
// preserved exactly (a naive whole-file stripComments(lines.join('\n')) would
// swallow the newlines inside a multi-line block comment and desync every
// finding's location after it).
function stripBlockCommentsAcrossLines(lines) {
  const result = [];
  let inBlock = false;
  for (const raw of lines) {
    let out = '';
    let idx = 0;
    while (idx < raw.length) {
      if (inBlock) {
        const close = raw.indexOf('*/', idx);
        if (close === -1) {
          idx = raw.length;
        } else {
          idx = close + 2;
          inBlock = false;
        }
        continue;
      }
      const blockOpen = raw.indexOf('/*', idx);
      const lineComment = raw.indexOf('//', idx);
      if (lineComment !== -1 && (blockOpen === -1 || lineComment < blockOpen)) {
        out += raw.slice(idx, lineComment);
        break;
      }
      if (blockOpen === -1) {
        out += raw.slice(idx);
        break;
      }
      out += raw.slice(idx, blockOpen);
      const blockClose = raw.indexOf('*/', blockOpen + 2);
      if (blockClose === -1) {
        inBlock = true;
        break;
      }
      idx = blockClose + 2;
    }
    result.push(out);
  }
  return result;
}

export function checkKafkaSendTimeout(fileContexts) {
  const findings = [];

  for (const { filePath, lines, relativePath } of fileContexts) {
    if (!filePath.endsWith('.java')) continue;

    const content = lines.join('\n');
    if (!KAFKA_LIKE_RE.test(content)) continue;

    const strippedLines = stripBlockCommentsAcrossLines(lines);
    for (let i = 0; i < lines.length; i++) {
      if (SEND_GET_NO_TIMEOUT_RE.test(strippedLines[i])) {
        findings.push({
          severity: 'critical',
          rule: 'kafka-send-timeout',
          message: 'Kafka send().get() without timeout — blocks the calling thread indefinitely if the broker is slow or unavailable; use .get(timeout, TimeUnit) or handle the future asynchronously',
          location: `${relativePath}:${i + 1}`,
        });
      }
    }
  }

  return deduplicate(findings);
}
