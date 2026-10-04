import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, relative } from 'path';

// Does the module a Java file belongs to run Spring Boot with virtual threads
// (spring.threads.virtual.enabled=true)? Used by blocking.js to report a blocking
// call in an @Async method as WARNING instead of CRITICAL: the pre-registered
// verify/blocking experiment measured that, with virtual threads enabled, the
// default @Async executor did not saturate (variant D).
//
// Conservative on purpose (decision 2026-10-04): the answer is `true` only when it
// can be read unambiguously from the module's base configuration. Anything else —
// no module root, file outside src/main/java, the key only in a profile, any file
// or profile setting it to a value other than a literal true, a placeholder — keeps
// the finding CRITICAL. A severity is never lowered by mistake; a real
// virtual-thread project may still get CRITICAL (e.g. the flag set by an
// environment variable or on the command line, which a static scan cannot see).

export const VT_KEY = 'spring.threads.virtual.enabled';
const MODULE_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
const CONFIG_FILE_RE = /^application(-[^.]+)?\.(properties|ya?ml)$/;

const normalizeKey = key => key.toLowerCase().replace(/[-_]/g, '');
const NORMALIZED_VT_KEY = normalizeKey(VT_KEY);
const PROFILE_KEYS = ['spring.config.activate.on-profile', 'spring.profiles'].map(normalizeKey);

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

// Documents of a .properties file (Spring Boot splits on `#---` / `!---`), as
// [{ normalizedKey: value }].
function parseProperties(text) {
  const docs = [{}];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '#---' || line === '!---') { docs.push({}); continue; }
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (m) docs[docs.length - 1][normalizeKey(m[1])] = unquote(m[2]);
  }
  return docs;
}

// Documents of a YAML file, block mappings only (nested or dotted keys), as
// [{ normalizedKey: value }]. Lists, flow style and anchors are not resolved; a
// key this parser cannot read simply does not count as `true`.
function parseYaml(text) {
  const docs = [{}];
  let stack = [];
  for (const raw of text.split('\n')) {
    if (/^---\s*(#.*)?$/.test(raw)) { docs.push({}); stack = []; continue; }
    if (/^\s*(#.*)?$/.test(raw) || /^\s*-/.test(raw)) continue;
    const m = /^(\s*)([^:#\s][^:#]*?)\s*:(?:\s+(.*))?$/.exec(raw);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const value = (m[3] ?? '').replace(/\s+#.*$/, '');
    const path = [...stack.map(s => s.key), m[2]].join('.');
    if (value.trim() === '') stack.push({ indent, key: m[2] });
    else docs[docs.length - 1][normalizeKey(path)] = unquote(value);
  }
  return docs;
}

function moduleRoot(javaFile) {
  for (let dir = dirname(javaFile); ; dir = dirname(dir)) {
    if (MODULE_MARKERS.some(marker => existsSync(join(dir, marker)))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

// Every assignment of the key in the module's Spring Boot config locations:
// classpath root and classpath config/ (src/main/resources), and the module
// directory and its config/ (Spring's file: locations when run from there).
function assignments(root) {
  const found = [];
  for (const dir of [join(root, 'src/main/resources'), join(root, 'src/main/resources/config'), root, join(root, 'config')]) {
    let names = [];
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      const m = CONFIG_FILE_RE.exec(name);
      if (!m) continue;
      let text;
      try { text = readFileSync(join(dir, name), 'utf8'); } catch { continue; }
      const docs = m[2] === 'properties' ? parseProperties(text) : parseYaml(text);
      for (const doc of docs) {
        if (!(NORMALIZED_VT_KEY in doc)) continue;
        const profileDoc = PROFILE_KEYS.some(k => k in doc);
        found.push({ file: join(dir, name), profile: Boolean(m[1]) || profileDoc, value: doc[NORMALIZED_VT_KEY] });
      }
    }
  }
  return found;
}

const cache = new Map();

// { enabled: true, file } when the base configuration sets the key to a literal
// true and nothing else in the module sets it to anything else; otherwise
// { enabled: false }.
export function virtualThreadsEnabled(javaFile) {
  const root = moduleRoot(javaFile);
  if (root === null) return { enabled: false };
  const inMain = relative(join(root, 'src/main/java'), javaFile);
  if (inMain.startsWith('..') || isAbsolute(inMain)) return { enabled: false };
  if (!cache.has(root)) {
    const all = assignments(root);
    const base = all.find(a => !a.profile && /^true$/i.test(a.value));
    const other = all.some(a => !/^true$/i.test(a.value));
    cache.set(root, base && !other ? { enabled: true, file: base.file, root } : { enabled: false });
  }
  return cache.get(root);
}
