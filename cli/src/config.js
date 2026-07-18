// Project-level config loader for vibeguard.config.json.
//
// {
//   "ignore": ["rule-id", ...],   // suppressed globally, no inline comment needed
//   "exclude": ["glob/**", ...]   // files/dirs excluded from the scan entirely
// }
//
// Missing file or malformed JSON is not fatal — the scan proceeds with an
// empty config, mirroring the MCP server's SuppressionConfigLoader.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_FILE_NAME = 'vibeguard.config.json';

export function loadConfig(projectRoot) {
  const configPath = join(projectRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return { ignore: [], exclude: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return {
      ignore: Array.isArray(parsed?.ignore) ? parsed.ignore : [],
      exclude: Array.isArray(parsed?.exclude) ? parsed.exclude : [],
    };
  } catch {
    return { ignore: [], exclude: [] };
  }
}

// Ported from mcp-server's GlobMatcher.java to keep glob semantics identical
// across both engines: `**` matches any sequence including `/`, `*` matches
// any sequence except `/`.
function globToRegExp(glob) {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '.';
      i += 1;
    } else if ('\\.[]{}()+-^$|'.includes(c)) {
      out += '\\' + c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

// Compiles exclude patterns once and returns a matcher for relative paths,
// rather than recompiling every pattern for every file.
export function makeExcludeMatcher(excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) return () => false;
  const patterns = excludePatterns.map(globToRegExp);
  return relativePath => {
    const normalized = relativePath.replace(/\\/g, '/');
    return patterns.some(re => re.test(normalized));
  };
}
