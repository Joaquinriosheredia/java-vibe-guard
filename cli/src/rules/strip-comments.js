// Shared by transactions.js and kafka.js — strips line (//...) and block
// (/*...*/) comments so annotation/call text mentioned inside a comment
// isn't mistaken for real code. Originally defined locally in
// transactions.js; extracted here so kafka.js's kafka-send-timeout check
// can reuse the exact same mechanism instead of reimplementing it.
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
