import { readFileSync } from 'fs';
import { join } from 'path';
import { moduleRoot } from './virtual-threads.js';

// Is the module a Java file belongs to an MVC-only (servlet) Spring app? Used by
// reactor-block.js: the pre-registered verify/reactor-block experiment (variant C)
// measured that a .block() in a @RestController handler of an MVC app holds a Tomcat
// worker, not a Reactor thread, and stalls no Reactor thread.
//
// Conservative: true only when the module's build file declares Spring MVC
// (spring-boot-starter-web or spring-webmvc) and does NOT declare WebFlux
// (spring-boot-starter-webflux or spring-webflux). Both present (Boot would pick MVC,
// but a property can switch it), neither, no build file, or no module root: false,
// and the finding stays.
const BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
const MVC_RE = /\b(?:spring-boot-starter-web|spring-webmvc)\b(?!-|flux)/;
const WEBFLUX_RE = /\b(?:spring-boot-starter-webflux|spring-webflux)\b/;

export function mvcOnlyModule(javaFile) {
  const root = moduleRoot(javaFile);
  if (!root) return false;
  let text = '';
  for (const name of BUILD_FILES) {
    try {
      text += readFileSync(join(root, name), 'utf8') + '\n';
    } catch {
      // not this build tool
    }
  }
  return MVC_RE.test(text) && !WEBFLUX_RE.test(text);
}
