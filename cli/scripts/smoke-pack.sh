#!/usr/bin/env bash
# Pack the npm tarball, install it into an empty project and exercise the
# INSTALLED binary — exactly what `npx java-vibe-guard` gives a user. Guards
# against the 1.0.3 failure mode: the published package did not match the
# repo (no --verify, no --format sarif, missing rules) and nothing noticed.
#
#   scripts/smoke-pack.sh [out-dir]   keeps the tested .tgz in out-dir if given
#   SMOKE_VERIFY=1 scripts/smoke-pack.sh   also runs the real --verify VIBE-001
#                                          (needs Docker 24+, Java 17+, Maven)
set -euo pipefail

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

EXPECTED_VERSION="$(node -p "require('$CLI_DIR/package.json').version")"
TARBALL="$(cd "$CLI_DIR" && npm pack --silent --pack-destination "$WORK")"
echo "tarball: $TARBALL ($(stat -c %s "$WORK/$TARBALL") bytes)"
if [[ -n "${1:-}" ]]; then mkdir -p "$1" && cp "$WORK/$TARBALL" "$1/"; fi

# Nothing that only exists in a source checkout may leak into the package.
tar tzf "$WORK/$TARBALL" | grep -qE '^package/(test/|test-fixtures/|verify/.*/target/)' \
  && fail "tarball contains test/, test-fixtures/ or build output"

mkdir "$WORK/project" && cd "$WORK/project"
npm init -y >/dev/null
npm install --no-audit --no-fund --silent "$WORK/$TARBALL"
JVG=(node "$WORK/project/node_modules/java-vibe-guard/bin/cli.js")

# Scan target: a copy of fixtures from the repo (not shipped in the package).
mkdir -p sample/src/main/java/demo
for f in ReactorBlockAsyncDuplicateProbe BlockingFutureGetTruePositive KafkaTruePositive; do
  cp "$CLI_DIR/test-fixtures/$f.java" sample/src/main/java/demo/
done

[[ "$("${JVG[@]}" --version)" == "$EXPECTED_VERSION" ]] || fail "--version is not $EXPECTED_VERSION"
help="$("${JVG[@]}" --help)"
for flag in --verify --explain --format --baseline --rule; do
  grep -q -- "$flag" <<<"$help" || fail "--help does not list $flag"
done
grep -q "Docker" <<<"$help" || fail "--help does not document that --verify needs Docker"

set +e
"${JVG[@]}" sample --format json > scan.json; scan_exit=$?
"${JVG[@]}" sample --format sarif > scan.sarif; sarif_exit=$?
"${JVG[@]}" --explain kafka > /dev/null; explain_exit=$?
"${JVG[@]}" --explain nope > /dev/null 2>&1; explain_bad_exit=$?
verify_bad_out="$("${JVG[@]}" --verify VIBE-999 --no-color 2>&1)"; verify_bad_exit=$?
set -e
[[ $scan_exit -eq 1 ]] || fail "scan exited $scan_exit, expected 1 (criticals present)"
[[ $sarif_exit -eq 1 ]] || fail "--format sarif exited $sarif_exit, expected 1"
[[ $explain_exit -eq 0 ]] || fail "--explain kafka exited $explain_exit"
[[ $explain_bad_exit -eq 2 ]] || fail "--explain with an unknown rule exited $explain_bad_exit, expected 2"
# Exit 2 + "Available: VIBE-001" proves the packaged verify/registry.js is found.
[[ $verify_bad_exit -eq 2 ]] || fail "--verify VIBE-999 exited $verify_bad_exit, expected 2 (registry not packaged?)"
grep -q "Available: VIBE-001" <<<"$verify_bad_out" || fail "--verify registry not found in the package"

node - "$EXPECTED_VERSION" <<'EOF'
const fs = require('fs');
const [version] = process.argv.slice(2);
const json = JSON.parse(fs.readFileSync('scan.json', 'utf8'));
const rules = new Set(json.issues.map(i => i.ruleId));
for (const r of ['reactor-block', 'blocking', 'kafka']) {
  if (!rules.has(r)) throw new Error(`rule ${r} produced no finding — rule missing from the package?`);
}
const dup = json.issues.filter(i => i.location.endsWith('ReactorBlockAsyncDuplicateProbe.java:19'));
if (dup.length !== 1) throw new Error(`Mono.block() must be reported once, got ${dup.length}`);
if (!json.issues.some(i => i.message.startsWith('blocking Future.get()'))) throw new Error('typed Future.get() not detected');
const sarif = JSON.parse(fs.readFileSync('scan.sarif', 'utf8'));
if (sarif.version !== '2.1.0') throw new Error('SARIF version is not 2.1.0');
if (sarif.runs[0].tool.driver.version !== version) throw new Error('SARIF driver.version does not match package.json');
if (sarif.runs[0].results.length !== json.issues.length) throw new Error('SARIF and JSON disagree on the finding count');
EOF

# 2.1.0: blocking → WARNING for @Async when the module's base config enables virtual
# threads (virtual-threads.js must be in the package); the profile-only module stays CRITICAL.
cp -r "$CLI_DIR/test-fixtures/virtual-threads/base-enabled" vt-on
cp -r "$CLI_DIR/test-fixtures/virtual-threads/profile-only" vt-profile
for m in vt-on vt-profile; do
  "${JVG[@]}" "$m" --rule blocking --format json > "$m.json" || true
done
node - <<'EOF'
const fs = require('fs');
const find = (m) => JSON.parse(fs.readFileSync(`${m}.json`, 'utf8')).issues
  .find(i => i.location === 'src/main/java/demo/AsyncService.java:9');
const on = find('vt-on'), profile = find('vt-profile');
if (on?.severity !== 'warning' || !on.message.includes('verify/blocking variant D')) throw new Error(`virtual threads in the base config: expected WARNING citing variant D, got ${JSON.stringify(on)}`);
if (profile?.severity !== 'critical') throw new Error(`virtual threads only in a profile: expected CRITICAL, got ${JSON.stringify(profile)}`);
EOF

# 2.2.0: reactor-block on the installed package, with the measured variants of
# verify/reactor-block (web-stack.js must be in the package). WebFlux module: .block() on
# the event loop (A1) and on a parallel worker (A2) and .toFuture().get() (A3) are reported;
# the boundedElastic form (A4) is not. MVC-only module: the @RestController .block() (C) is not.
RB="$CLI_DIR/verify/reactor-block/app/src/main/java/com/javavibeguard/reactorblock"
mkdir -p rb-webflux/src/main/java/demo rb-mvc/src/main/java/demo
printf '<project><dependencies><dependency><artifactId>spring-boot-starter-webflux</artifactId></dependency></dependencies></project>\n' > rb-webflux/pom.xml
printf '<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>\n' > rb-mvc/pom.xml
cp "$RB"/VariantA1Controller.java "$RB"/VariantA2Controller.java "$RB"/VariantA3Controller.java "$RB"/VariantA4Controller.java rb-webflux/src/main/java/demo/
cp "$RB"/VariantCController.java rb-mvc/src/main/java/demo/
for m in rb-webflux rb-mvc; do
  "${JVG[@]}" "$m" --rule reactor-block --format json > "$m.json" || true
done
node - <<'EOF'
const fs = require('fs');
const issues = m => JSON.parse(fs.readFileSync(`${m}.json`, 'utf8')).issues;
const wf = issues('rb-webflux'), mvc = issues('rb-mvc');
const at = f => wf.filter(i => i.location.startsWith(`src/main/java/demo/${f}:`));
if (at('VariantA1Controller.java').length !== 1 || !/Netty event loop/.test(at('VariantA1Controller.java')[0].message)) throw new Error(`event-loop .block() (A1): expected 1 finding naming the event loop, got ${JSON.stringify(at('VariantA1Controller.java'))}`);
if (at('VariantA2Controller.java').length !== 1 || !/IllegalStateException/.test(at('VariantA2Controller.java')[0].message)) throw new Error(`parallel .block() (A2): expected 1 finding, got ${JSON.stringify(at('VariantA2Controller.java'))}`);
if (at('VariantA3Controller.java').length !== 1 || !/deadlocked/.test(at('VariantA3Controller.java')[0].message)) throw new Error(`.toFuture().get() (A3): expected 1 finding citing the deadlock, got ${JSON.stringify(at('VariantA3Controller.java'))}`);
if (at('VariantA4Controller.java').length !== 0) throw new Error(`boundedElastic form (A4): expected no finding, got ${JSON.stringify(at('VariantA4Controller.java'))}`);
if (mvc.length !== 0) throw new Error(`MVC-only @RestController .block() (C): expected no finding, got ${JSON.stringify(mvc)}`);
EOF

if [[ "${SMOKE_VERIFY:-0}" == "1" ]]; then
  echo "running the real --verify VIBE-001 from the installed package…"
  "${JVG[@]}" --verify VIBE-001 --no-color || fail "--verify VIBE-001 failed from the installed package"
  [[ ! -e "$WORK/project/node_modules/java-vibe-guard/verify/vibe-001/app/target" ]] \
    || fail "--verify wrote build output inside the installed package"
fi

echo "SMOKE OK: $TARBALL installed in a clean project — version, help, scan, SARIF, explain, verify registry, virtual-threads severity, reactor-block measured shapes$([[ "${SMOKE_VERIFY:-0}" == "1" ]] && echo ', full --verify VIBE-001')"
