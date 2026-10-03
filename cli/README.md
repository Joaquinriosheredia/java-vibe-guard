# java-vibe-guard

> Static analyzer for Java/Spring Boot code that compiles, passes its tests, and fails in production under load — patterns that are common in AI-generated code.

[![npm version](https://img.shields.io/npm/v/java-vibe-guard?color=blue)](https://www.npmjs.com/package/java-vibe-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> **2.0.0 is a major release:** two CRITICAL rules run by default that 1.0.3 did not have (`reactor-block`, `kafka-send-timeout`), and `blocking` changed how it matches `.get()`. A CI that was green on 1.0.3 can turn red. See the [CHANGELOG](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/CHANGELOG.md#200).

---

## Quick start

```bash
# No install needed
npx java-vibe-guard ./my-spring-project

# Or install globally
npm install -g java-vibe-guard
java-vibe-guard ./my-spring-project
```

Requires Node.js 18+. Scanning needs nothing else; `--verify` needs more (see below).

---

## What it detects

| Rule | Severity | Pattern |
|------|----------|---------|
| **blocking** | 🔴 CRITICAL | `Thread.sleep()`, `.join()`, `.block()`/`.blockFirst()`/`.blockLast()` and `Future.get()` inside `@Async`, `@Scheduled` or `@EventListener` methods (see [Future.get()](#futureget) below) |
| **blocking-kafka** | 🔴 CRITICAL | The same blocking calls inside a `@KafkaListener` method |
| **reactor-block** | 🔴 CRITICAL | `.block()` / `.blockFirst()` / `.blockLast()` / `.toFuture().get()` in a `@RestController`/`@Service`/`@Component` that imports `reactor.core.publisher` |
| **kafka-send-timeout** | 🔴 CRITICAL | `.send(...).get()` with no timeout in a file that uses `KafkaTemplate` |
| **transactions** | 🔴 CRITICAL / 🟡 MAJOR | `@Transactional` + `@Async` on the same method (CRITICAL) · `@Transactional` on a Controller method (MAJOR) |
| **layers** | 🟡 MAJOR | A Controller using a `*Repository` or `KafkaTemplate` directly |
| **kafka** | ⚠️ WARNING | Zookeeper in docker-compose · `@KafkaListener` without `groupId` · no `@RetryableTopic` or DLQ |
| **observability** | ⚠️ WARNING | Endpoint methods with no structured logging (`log.info`, `log.warn`, …) |

`java-vibe-guard --explain <rule>` prints the full description of any rule.

### Future.get()

`blocking` flags `.get()` **only on a receiver that the same file declares with a Future type** — a field, parameter or local of type `Future`, `CompletableFuture`, `ListenableFuture`, `ScheduledFuture`, `FutureTask` … (raw or generic), or `var x = CompletableFuture.…` — plus `CompletableFuture.xxxAsync(...).get()` chains.

- A bare `.get()` is not matched: without type resolution it would also flag `Optional.get()` and `Map.get()` (issue #5).
- **Known gap:** a Future declared in another file (e.g. returned by a method of another class and never stored in a typed variable here) is not detected.
- `get(timeout, unit)` is not flagged — a bounded wait is the recommended fix.
- 1.0.3 flagged every `.get()`; 2.0.0 flags fewer, more precise ones.

When a reactive `.block()` matches both `blocking` and `reactor-block` on the same line, only `reactor-block` is reported. A call inside a method with several anchors (e.g. `@Async` + `@Scheduled`) is reported once: `Thread.sleep() detected in method annotated @Async, @Scheduled`.

---

## Example output

Real output of 2.0.0 on [java-vibe-guard-demo](https://github.com/Joaquinriosheredia/java-vibe-guard-demo):

```
java-vibe-guard — vibe coding detector for Java/Spring Boot
Scanning: .  (3 files)

❌ CRITICAL: Thread.sleep() detected in @KafkaListener method → src/main/java/demo/KafkaConsumerBug.java:9
  Evidence: documented mechanism, no benchmark of our own — a blocking call delays the consumer's next poll(); past max.poll.interval.ms the group coordinator considers the consumer dead and rebalances the group (Kafka consumer docs)
❌ CRITICAL: blocking Future.get() detected in @Async method → src/main/java/demo/OrderService.java:22
  Evidence: documented mechanism, no benchmark of our own — the call holds a thread of the @Async executor / @Scheduled scheduler / event pool for its whole duration; under load the pool saturates
❌ CRITICAL: Reactive blocking call '.block()' inside Spring bean — pins a thread under load; use reactive composition (.flatMap, .map, .then) instead → src/main/java/demo/ReactiveController.java:14
  Evidence: documented mechanism, no benchmark of our own — blocking pins a Reactor thread (Netty event loop or Schedulers.parallel() worker) for the whole I/O wait; with few such threads, throughput collapses under load
⚠️  WARNING: @KafkaListener without explicit groupId → src/main/java/demo/KafkaConsumerBug.java:7
⚠️  WARNING: @KafkaListener without @RetryableTopic or DLQ — failed messages will be lost → src/main/java/demo/KafkaConsumerBug.java:7
⚠️  WARNING: Endpoint without structured logging → src/main/java/demo/ReactiveController.java:11

──────────────────────────────────────────────────────────────
📊 Summary: 3 critical · 3 warnings
──────────────────────────────────────────────────────────────

🚨 3 CRITICAL issue(s) found — fix before deploying to production.
```

### Evidence

Each CRITICAL finding prints the evidence behind its rule. A rule only cites evidence that measures its own mechanism:

- **Measured** — `kafka-send-timeout` cites two [Java-Production-Labs](https://github.com/Joaquinriosheredia/Java-Production-Labs) fault-injection runs (Lab 05, Lab 08) in which an untimed `send().get()` blocked request threads while Kafka was down; each line links to the versioned result file, pinned to the commit of the result.
- **Documented mechanism, no benchmark of our own** — every other rule today. The output says so instead of borrowing a figure from a benchmark that measured something else.

---

## CLI options

```
Usage: java-vibe-guard [options] [path]

Options:
  -V, --version      output the version number
  --verify <rule>    Verify a VIBE rule is reproducible in your environment (e.g. VIBE-001).
                     Requires Docker (24+), Java 17+ and Maven on PATH
  --explain <rule>   Print curated information about a rule id — no project scan
  --format <format>  Output format: text (default) | json | sarif
  --json             Alias for --format json
  --rule <name>      Run only one rule: blocking | blocking-kafka | kafka | kafka-send-timeout |
                     layers | observability | reactor-block | transactions
  --ignore <dirs>    Comma-separated directories to exclude (e.g. labs,demos,test)
  --verbose          List suppressed findings with their rule, location and justification
  --baseline         Write/regenerate vibeguard-baseline.json from the current scan and exit
  --no-color         Disable colored output
  -h, --help         display help for command
```

### Excluding directories

```bash
java-vibe-guard . --ignore labs,demos,test
```

> **Educational projects:** `controller→repository` findings in lab or tutorial code are often intentional simplifications. Use `--ignore` to keep CI signal on production code.

### Suppressions and baseline

- Inline: `// vibe-guard: ignore <rule>` on (or above) the flagged line; `vibeguard.config.json` for project-wide excludes.
- `--baseline` snapshots the current findings into `vibeguard-baseline.json`. When that file exists, later scans report only findings that are not in it — adopt the tool on an existing codebase and fail only on new problems.
- Suppressed and baselined findings never fail the build. `--verbose` lists the suppressed ones.

Full grammar: [docs/suppression-grammar.md](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/docs/suppression-grammar.md) · [docs/baseline.md](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/docs/baseline.md).

---

## `--verify` — reproduce the failure

```bash
npx java-vibe-guard --verify VIBE-001
```

Runs a bundled Spring Boot app (HikariCP pool of 5, `@Transactional` method holding its connection during an async wait) against a Postgres container, sends 20 concurrent requests, and checks that the pool saturates, requests queue for connections, and p95 latency rises above 800 ms. Takes about a minute (longer the first time, while Maven and the Postgres image download).

**Requires Docker 24+, Java 17+, Maven on `PATH`** and 512 MB of free memory. The environment pre-check ([testcontainers-doctor](https://www.npmjs.com/package/testcontainers-doctor)) ships as a dependency — nothing to install globally.

- Available today: `VIBE-001` only.
- It reproduces a canonical scenario; it does **not** run your project's code.
- Exit codes: `0` reproduced · `1` not reproduced · `2` environment or setup error / unknown rule.

---

## CI integration

GitHub Action (recommended — JSON artifact, step summary, optional SARIF upload):

```yaml
- uses: Joaquinriosheredia/java-vibe-guard@v2
  with:
    path: '.'
    fail-on: 'critical'   # critical | never
    sarif: 'true'         # upload to GitHub Code Scanning
```

Or call the CLI directly:

```yaml
- name: java-vibe-guard
  run: npx java-vibe-guard@2 . --format sarif > vibe-guard.sarif
```

### Exit codes

| Condition | Exit code |
|-----------|-----------|
| At least one visible `critical` finding | `1` |
| Only `major` / `warning` findings, or none | `0` |
| Scan error (path not found, no Java/config files, unknown `--rule`) | `1` |
| `--explain` / `--verify` with an unknown rule | `2` |

Note that `1` covers both "critical findings" and "scan error".

### JSON output (`--format json`)

```jsonc
{
  "timestamp": "2026-10-03T03:00:00.000Z",
  "projectPath": ".",
  "filesScanned": 3,
  "summary": { "critical": 3, "major": 0, "warning": 3, "info": 0,
               "reported": 6, "suppressed": 0, "total": 6 },
  "healthy": false,                     // true when critical === 0
  "issues": [
    {
      "severity": "critical",           // critical | major | warning | info
      "ruleId":   "blocking",           // any id from the rules table
      "message":  "blocking Future.get() detected in @Async method",
      "location": "src/main/java/demo/OrderService.java:22"   // path relative to the scan root : line
    }
  ]
}
```

### SARIF (`--format sarif`)

SARIF 2.1.0 on stdout, one `run`, ready for `github/codeql-action/upload-sarif`. Severity → `level`: critical and major → `error`, warning → `warning`, info → `note`; each rule also carries a `security-severity` (9.5 / 7.5 / 5.0 / 2.0). Suppressed and baselined findings are excluded. Spec: [docs/sarif.md](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/docs/sarif.md).

---

## Ecosystem

This package is one of two independent Java engines in the [java-vibe-guard](https://github.com/Joaquinriosheredia/java-vibe-guard) repository:

| Tool | Rules | Engine | Use case |
|------|-------|--------|----------|
| CLI (this package) / GitHub Action | 8 rule ids (above) | Regex / line-based | CI/CD, quick scans |
| MCP server | VIBE-001…007 | Line-based (Java), no AST | Claude Code integration |

The two engines use different rule ids and do not detect exactly the same things. Python: [python-vibe-guard](https://github.com/Joaquinriosheredia/python-vibe-guard).

---

## License

MIT
