# java-vibe-guard

> Static analyzer for Java/Spring Boot code that compiles, passes its tests, and fails in production under load — patterns that are common in AI-generated code.

[![npm version](https://img.shields.io/npm/v/java-vibe-guard?color=blue)](https://www.npmjs.com/package/java-vibe-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> **2.1.0:** measured evidence for `blocking` (`@Async`) and `blocking-kafka`, and `blocking` under `@Async` is WARNING instead of CRITICAL when the module's base config enables virtual threads. No finding becomes more severe. See the [CHANGELOG](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/CHANGELOG.md#210).
>
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

### Evidence for `blocking`

Measured for **`@Async`** with a pre-registered experiment ([`verify/blocking`](verify/blocking/), design committed before any run, all criteria met; [results](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c4e5ddd/cli/verify/blocking/results/criteria.md)):

- **Condition:** Spring Boot's default `@Async` executor — 8 platform threads, unbounded queue (what `@Async` gets when nothing is configured).
- A call that holds the thread caps throughput at **threads / call duration**: 39.9–40.0 tasks/s with 8 threads, 79.8 with 16.
- Above that, the queue grows at **(load − capacity)** and 98–99.5 % of latency is time in the queue. The same call without holding the thread did not queue.
- **With virtual threads enabled** (`spring.threads.virtual.enabled=true`) the executor did not saturate.
- No absolute latencies are quoted: with an unbounded queue they grow with how long the overload lasts.

`@Scheduled` and `@EventListener` were not measured: documented mechanism, no benchmark of our own.

**Severity with virtual threads.** A blocking call whose only anchor is `@Async` is reported as **WARNING** instead of CRITICAL when the module's base configuration enables virtual threads. The measured reason is variant D of the same experiment: with `spring.threads.virtual.enabled=true`, the default `@Async` executor did not saturate. The finding says why it was lowered and cites variant D. The check is conservative, so a severity is never lowered by mistake:

- **WARNING** only if `spring.threads.virtual.enabled=true` (literal) appears in the base `application.properties` or `application.yml` of the module the file belongs to (the nearest `pom.xml` / `build.gradle`; the file must be under `src/main/java`), and no other config file, profile or profile document sets it to anything else.
- **Stays CRITICAL** when the key is only in a profile (`application-prod.yml`, an `on-profile` document), set to `false`, absent, a placeholder (`${…}`), overridden by a profile, or the module cannot be determined. A flag set only by an environment variable or on the command line is not visible to a static scan, so it stays CRITICAL too.
- `@Scheduled` and `@EventListener` (not measured), and a call under `@Async` plus one of them, stay CRITICAL. `blocking-kafka` is unchanged.

### Evidence for `blocking-kafka`

Measured with a pre-registered experiment ([`verify/blocking-kafka`](verify/blocking-kafka/), design committed before any run, all criteria met; [results](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/a6f32ef/cli/verify/blocking-kafka/results/criteria.md)):

- **Threshold, general form:** `max.poll.records × time per record > max.poll.interval.ms`. With the Kafka defaults (500 records, 300 s) that is **more than 600 ms per record**.
- **Above it** (accelerated setup, `max.poll.interval.ms` lowered to 10 s): the consumer left the group on every batch and every offset commit failed. The group entered a **reprocessing loop**: 0 records/s committed, each record delivered ~10 times.
- **Below it, the same blocking call caused no measured damage**: no rebalances and no duplicates, with throughput at consumers / time per record. This held with a batch of 1 and with a higher `max.poll.interval.ms`.
- **Limits:** measured on kafka-clients 3.6.2 (Kafka 3.6 broker), the classic consumer group protocol with eager rebalancing (range assignor), and spring-kafka's default AckMode BATCH. Not measured: the cooperative protocol, the KIP-848 consumer group protocol, AckMode RECORD, static membership and virtual-thread listeners.

The rule flags the blocking call; it does not read `max.poll.records` or `max.poll.interval.ms`, so a finding means the pattern is present, not that the threshold is crossed.

`reactor-block` does not report two `.block()` shapes that the pre-registered experiment ([`verify/reactor-block`](verify/reactor-block/), variants A4 and C) measured not to stall any Reactor thread:
- `.block()` inside `Mono`/`Flux.fromCallable` / `fromSupplier` / `fromRunnable` moved with `.subscribeOn(Schedulers.boundedElastic())`, with no `publishOn` in the statement. It blocks a `boundedElastic` thread, the pool Reactor provides for blocking. That pool still has a capacity (threads / call duration), and the experiment saturated it above that.
- A plain `.block()` statement (no lambda, method reference, `subscribeOn` or `publishOn`) in a `@RestController` of a module whose build file declares Spring MVC and not WebFlux. It runs on the servlet container's worker.

`.blockFirst()`, `.blockLast()`, `.toFuture().get()`, `@Service`/`@Component` classes and modules with both stacks are still reported: they were not measured in those shapes.

When a reactive `.block()` matches both `blocking` and `reactor-block` on the same line, only `reactor-block` is reported. A call inside a method with several anchors (e.g. `@Async` + `@Scheduled`) is reported once: `Thread.sleep() detected in method annotated @Async, @Scheduled`.

---

## Example output

Real output of 2.1.0 (only the `blocking` and `blocking-kafka` evidence lines differ from 2.0.0) on [java-vibe-guard-demo](https://github.com/Joaquinriosheredia/java-vibe-guard-demo):

```

java-vibe-guard — vibe coding detector for Java/Spring Boot
Scanning: .  (3 files)

❌ CRITICAL: Thread.sleep() detected in @KafkaListener method → src/main/java/demo/KafkaConsumerBug.java:9
  Evidence (measured, java-vibe-guard verify/blocking-kafka — @KafkaListener): the damage appears only when max.poll.records x time per record > max.poll.interval.ms (with the defaults, 500 records and 300 s: more than 600 ms per record). Above it, in an accelerated setup (max.poll.interval.ms lowered to 10 s), the consumer left the group on every batch, every offset commit failed and the group entered a reprocessing loop: 0 records/s committed, each record delivered ~10 times. Below it, the same blocking call caused no measured damage: no rebalances, no duplicates, throughput = consumers / time per record. Measured on kafka-clients 3.6.2, classic group protocol with eager rebalancing, spring-kafka AckMode BATCH; the cooperative protocol, KIP-848 and AckMode RECORD were not measured
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/a6f32ef/cli/verify/blocking-kafka/results/criteria.md#L7-L47
❌ CRITICAL: blocking Future.get() detected in @Async method → src/main/java/demo/OrderService.java:22
  Evidence (measured, java-vibe-guard verify/blocking — @Async): on Spring Boot's default @Async executor (8 platform threads, unbounded queue), a call that holds the thread caps throughput at threads / call duration: 39.9-40.0 tasks/s with 8 threads, 79.8 with 16. Above that the queue grows at (load - capacity) and 98-99.5% of latency is queue wait; the same call without holding the thread did not queue. With virtual threads enabled (spring.threads.virtual.enabled=true) the executor did not saturate
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c4e5ddd/cli/verify/blocking/results/criteria.md#L7-L38
  Evidence (@Scheduled, @EventListener): documented mechanism, no benchmark of our own — the call holds a thread of the scheduler / event pool for its whole duration; under load the pool saturates
❌ CRITICAL: Reactive blocking call '.block()' inside Spring bean — on a Reactor thread (Netty event loop or Schedulers.parallel() worker) it throws IllegalStateException on every call (measured); compose with .flatMap()/.then() instead, or, if the call must block, run it in Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic()) (a bounded pool: capacity = threads / call duration) → src/main/java/demo/ReactiveController.java:14
  Evidence (measured, java-vibe-guard verify/reactor-block — .block() on Schedulers.parallel()): a .block() on a Schedulers.parallel() worker (the README "Found in the Wild" Finding 2 shape: .block() inside .map() after subscribeOn(Schedulers.parallel())) does not hold the thread: Reactor throws IllegalStateException ("block()/blockFirst()/blockLast() are blocking, which is not supported in thread parallel-N") on every call, so 100% of the requests through that path failed with HTTP 500 at every load measured (10, 50 and 400 requests/s), not only under load; the workers were not held (0-0.9% of their samples inside blockingGet) and other work on them was not delayed. Measured on Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c934bd7/cli/verify/reactor-block/results/criteria.md#L32-L46
  Evidence (measured, java-vibe-guard verify/reactor-block replication — .block() on the Netty event loop): a .block() on the Netty event loop (in a WebFlux handler) does not hold the event loop either: Reactor throws IllegalStateException ("block()/blockFirst()/blockLast() are blocking, which is not supported in thread reactor-http-epoll-N") on every call, so 100% of the requests through that path failed with HTTP 500 at every load measured (10, 50 and 400 requests/s); the event loops were not held (0-0.6% of their samples inside blockingGet) and other requests on them were not delayed. Measured on Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18 (native epoll)
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/1052498/cli/verify/reactor-block/replication/results/criteria.md#L15-L25
  Evidence (measured, java-vibe-guard verify/reactor-block replication — .toFuture().get() on the Netty event loop): a .toFuture().get() in a WebFlux handler, with the WebClient on the server's event loops (Spring Boot's default shared resources), deadlocked every request: in 15/15 runs (10, 50 and 400 requests/s) 0 responses succeeded and the downstream did not receive a single request - the request never left the app. When all 4 event loops were held (every run at 400 requests/s), the rest of the server stopped too. The pre-registered minimum for the same deadlock with event loops still free was met exactly at its threshold (3/15 runs with 2 of 4 loops held while requests that block nothing on new connections were still served). Measured on Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18 (native epoll), OpenJDK 21; a WebClient with its own LoopResources was not measured
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/1052498/cli/verify/reactor-block/replication/results/criteria.md#L27-L48
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
