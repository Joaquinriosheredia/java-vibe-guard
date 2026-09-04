import { stripComments } from './strip-comments.js';

// Shared structural method-body extractor — used by blocking.js (per-line
// pattern scanning within the real body, needs absolute line numbers) and
// observability.js (a single boolean check over the whole body, needs body
// text). See A3.2 (issue #11) design: this replaces blocking.js's old fixed
// 60-line pattern-matching window with the method's REAL structural
// boundaries, and generalizes observability.js's old maskAnnotationArgs()
// (which only ever masked the FIRST parenthesis group) to ALL parenthesis
// groups that precede the real opening brace — closing a latent gap that
// A2 never hit only because the fixtures it was validated against didn't
// happen to stack a second, brace-bearing annotation between the anchor and
// the method (real Spring shape: @KafkaListener(...) @RetryableTopic(include
// = { A.class, B.class }) — see BlockingStackedAnnotationBracesProbe.java).
const DEFAULT_CAP = 60;

export function maskStringLiterals(text) {
  return text.replace(/"(?:[^"\\]|\\.)*"/g, m => ' '.repeat(m.length));
}

// Blanks the CONTENT of one balanced ( ... ) group (the parens themselves
// are kept) starting at `openParenIdx`. Returns { text, end } where `end` is
// the index of the matching ')', or null if the group never closes within
// `text` (caller falls back to best-effort).
function blankParenGroup(text, openParenIdx) {
  let depth = 0;
  for (let k = openParenIdx; k < text.length; k++) {
    if (text[k] === '(') depth++;
    else if (text[k] === ')') {
      depth--;
      if (depth === 0) {
        const masked = text.slice(0, openParenIdx + 1)
          + text.slice(openParenIdx + 1, k).replace(/[^\n]/g, ' ')
          + text.slice(k);
        return { text: masked, end: k };
      }
    }
  }
  return null;
}

// Finds the index of the method's REAL opening brace in `text` (already
// string-literal-masked and comment-stripped). Repeatedly blanks whichever
// parenthesis group comes next — an annotation's own args, a second (third,
// ...) stacked annotation's args, or the method signature's own parameter
// list — until the next unmasked token is a `{` rather than a `(`. That `{`
// is the real body opening: any earlier `{` would necessarily have been
// inside one of the parenthesis groups just blanked (an array-literal
// annotation argument, e.g. `include = { A.class, B.class }`), so it can
// never be mistaken for the body.
//
// Operates on a local copy only — never mutates the `text` the caller holds,
// so the caller's own (string/comment-masked but NOT paren-masked) block
// stays intact for the depth-counting pass below, which must see the real
// body's own parens (e.g. `.join()`) untouched.
function findRealOpenBraceIdx(text) {
  let cursor = 0;
  while (true) {
    const braceIdx = text.indexOf('{', cursor);
    if (braceIdx === -1) return -1; // abstract/interface method — no body
    const parenIdx = text.indexOf('(', cursor);
    if (parenIdx === -1 || braceIdx < parenIdx) return braceIdx;
    const blanked = blankParenGroup(text, parenIdx);
    if (blanked === null) return braceIdx; // unterminated paren — best effort
    text = blanked.text;
    cursor = blanked.end + 1;
  }
}

// Delimits the real body of the method anchored by the annotation (or other
// trigger line) at `lines[startIndex]`. Returns:
//   { startLineIdx, endLineIdx, truncated } — absolute 0-indexed line range,
//     INCLUSIVE of both ends (endLineIdx is the line the closing `}` is on).
//     `truncated: true` means the real closing brace was not found within
//     `cap` lines — endLineIdx is a best-effort bound (see 2.e in the A3.2
//     design: this is a safety cap, not the attribution boundary).
//   null — no body at all (abstract/interface method declaration).
export function extractMethodBodyRange(lines, startIndex, cap = DEFAULT_CAP) {
  const capEnd = Math.min(startIndex + cap, lines.length);
  const windowLines = lines.slice(startIndex, capEnd);

  // Mask string literals BEFORE stripping comments — a `//` inside a string
  // (e.g. a URL like "http://host/path") would otherwise be misread as
  // opening a line comment. Same ordering, same reason, as the original
  // observability.js implementation this replaces.
  let block = windowLines.join('\n');
  block = maskStringLiterals(block);
  block = stripComments(block);

  const openIdx = findRealOpenBraceIdx(block);
  if (openIdx === -1) return null;

  let depth = 0;
  for (let k = openIdx; k < block.length; k++) {
    if (block[k] === '{') depth++;
    else if (block[k] === '}') {
      depth--;
      if (depth === 0) {
        const endLineOffset = block.slice(0, k).split('\n').length - 1;
        return { startLineIdx: startIndex, endLineIdx: startIndex + endLineOffset, truncated: false };
      }
    }
  }
  // Unterminated within the cap — best effort, flagged as truncated so
  // callers can decide whether that matters to them.
  return { startLineIdx: startIndex, endLineIdx: capEnd - 1, truncated: true };
}
