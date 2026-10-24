# java-vibe-guard

> Static analyzer for Java/Spring Boot code that compiles, passes its tests, and fails in production under load — patterns that are common in AI-generated code.

[![npm version](https://img.shields.io/npm/v/java-vibe-guard?color=blue)](https://www.npmjs.com/package/java-vibe-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> **3.0.0 (major):** fixes of the test-corpus-2 false positives. `transactions` no longer matches text inside string, char or text-block literals, nor an `@interface`, and its message is reworded (**a baseline entry for it no longer matches**). `blocking`: `@Scheduled` anchors only when it is Spring's, now also when fully qualified (**new findings possible**), and a lone synchronous `@EventListener` of a start-up event is WARNING. Action: `@v3`. See the [CHANGELOG](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/CHANGELOG.md#300).
>
> **2.4.0:** `reactor-block` is CRITICAL only when the file shows the call can run on a Reactor thread (a Reactor operator callback, a WebFlux handler, `subscribeOn(parallel())`); otherwise it is a WARNING, because the thread is unknown. Startup hooks and `@Async` (with `@EnableAsync`) are not reported. `observability` is opt-in (`--rule observability`). New `--skip-rule <ids>`. `kafka-send-timeout` no longer says "indefinitely". No finding becomes more severe. See the [CHANGELOG](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/CHANGELOG.md#240).
>
> **2.3.0:** new rule `async-returns-pending-future`, **opt-in** (only with `--rule async-returns-pending-future`; not in the default set): its precision is not conclusively measured. `@Async` now counts, in `blocking` and in the new rule, only when the scanned tree has `@EnableAsync` (or `<task:annotation-driven/>`): without it `@Async` does nothing. Fewer findings only. See the [CHANGELOG](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/CHANGELOG.md#230).
>
> **2.2.0:** `reactor-block` evidence is measured. `.block()` on a Reactor thread (event loop or `Schedulers.parallel()`) fails fast with `IllegalStateException`; it does not hold the thread. `.toFuture().get()` with WebClient on the server's event loops deadlocks every request. Two `.block()` shapes measured not to stall Reactor are no longer reported. No finding becomes more severe. See the [CHANGELOG](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/CHANGELOG.md#220).
>
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
| **blocking** | 🔴 CRITICAL | `Thread.sleep()`, `.join()`, `.block()`/`.blockFirst()`/`.blockLast()` and `Future.get()` inside `@Async` (Spring's, with `@EnableAsync` in the scanned tree), `@Scheduled` (Spring's) or `@EventListener` methods (see [Future.get()](#futureget) below). A lone synchronous `@EventListener` of a start-up event is WARNING |
| **blocking-kafka** | 🔴 CRITICAL | The same blocking calls inside a `@KafkaListener` method |
| **reactor-block** | 🔴 CRITICAL / ⚠️ WARNING | `.block()` / `.blockFirst()` / `.blockLast()` / `.toFuture().get()` in a `@RestController`/`@Service`/`@Component` that imports `reactor.core.publisher`. CRITICAL only when the file shows it can run on a Reactor thread (a Reactor operator callback, a WebFlux handler, a `ServerRequest`/`ServerWebExchange` method, `subscribeOn(parallel())`); otherwise WARNING: the thread is unknown. Startup hooks and `@Async` (with `@EnableAsync`) are not reported |
| **async-returns-pending-future** (opt-in) | 🔴 CRITICAL | Only with `--rule async-returns-pending-future`. An `@Async` method returning a `CompletableFuture` that this file shows to be still pending (`supplyAsync`, `…Async` stages, `WebClient…toFuture()`, `HttpClient.sendAsync`, `KafkaTemplate.send`, …) — see [below](#async-returns-pending-future) for what it does not detect yet |
| **kafka-send-timeout** | 🔴 CRITICAL | `.send(...).get()` with no timeout in a file that uses `KafkaTemplate` |
| **transactions** | 🔴 CRITICAL / 🟡 MAJOR | `@Transactional` + `@Async` on the same method (CRITICAL; text inside string, char and text-block literals and an `@interface` declaration are not matched) · `@Transactional` on a Controller method (MAJOR) |
| **layers** | 🟡 MAJOR | A Controller using a `*Repository` or `KafkaTemplate` directly |
| **kafka** | ⚠️ WARNING | Zookeeper in docker-compose · `@KafkaListener` without `groupId` · no `@RetryableTopic` or DLQ · Kafka config (`.properties`/`.yml`) without a consumer `group.id` |
| **observability** (opt-in) | ⚠️ WARNING | Only with `--rule observability` (not in the default set since 2.4.0: too noisy). Endpoint methods with no structured logging (`log.info`, `log.warn`, …) |

`java-vibe-guard --explain <rule>` prints the full description of any rule.

**`@EnableAsync`.** Without `@EnableAsync` (or `<task:annotation-driven/>`) Spring does not intercept `@Async`: the method runs on the caller's thread. So `blocking` (for its `@Async` anchor) and `async-returns-pending-future` report `@Async` only when the scanned tree contains one of them, in any file or module. One outside the tree (in a jar, another repository, or when you scan a single module) is not seen, and those `@Async` methods are not reported. `@Scheduled`, `@EventListener` and `@KafkaListener` do not depend on it.

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

**Anchors that do not hold a Spring pool** (test-corpus-2, vibe-guard-evaluation `test-corpus-2/FP-ANALYSIS.md`):
- `@Scheduled` anchors only when it is Spring's: an import of `org.springframework.scheduling.annotation.Scheduled` (or `.*`), or the fully qualified annotation — the same test as `@Async`. Quarkus' `io.quarkus.scheduler.Scheduled` runs blocking methods on a worker pool.
- A synchronous `@EventListener` (no `@Async`/`@Scheduled` stacked) whose event — in the annotation's arguments or the signature — is one Spring Boot publishes once at start-up (`ApplicationStartingEvent`, `ApplicationEnvironmentPreparedEvent`, `ApplicationContextInitializedEvent`, `ApplicationPreparedEvent`, `ApplicationStartedEvent`, `ApplicationReadyEvent`, `ContextRefreshedEvent`, `(Servlet|Reactive)WebServerInitializedEvent`) is **WARNING**, with the reason in the message: it blocks only the start-up thread.

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

### async-returns-pending-future

**Opt-in.** It runs only with `--rule async-returns-pending-future` and is not part of the default scan. **Precision not conclusively measured:** 3/7 true positives (43 %, Wilson 95 % CI 16–75 %) in a pre-registered corpus of 50 repositories; n is too small ([audit](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/validation/b0-corpus/AUDIT.md)).

Spring's `@Async` interceptor calls `get()` on the future the method returns, **on the executor thread**. A future that is still pending holds that thread until it completes, so the default executor saturates like a blocking call; and an `@Async` method that returns the future of another `@Async` method on the same executor, through the proxy, starvation-deadlocks. Both measured in the pre-registered experiment [`verify/async-pending-future`](verify/async-pending-future/) (Spring Boot 3.2.5 / Framework 6.1.6, proxy mode, `CompletableFuture`, default executor).

The rule reports only what one file proves to be pending: `CompletableFuture.supplyAsync`/`runAsync`, a non-async stage on one of those, any `…Async` stage, `WebClient…retrieve()…toFuture()`, `java.net.http.HttpClient.sendAsync`, `KafkaTemplate.send`, a `new CompletableFuture<>()` completed only in a callback, `allOf` with a pending argument, and `self.m()` through a self-injected proxy (reported as the deadlock when the executor is the default one and virtual threads are off). WARNING instead of CRITICAL when the module's base configuration enables virtual threads.

**What this version does not detect, and why.** It looks at one file at a time, so it misses:
- **the measured shape itself:** `return downstream.call().thenApply(...)`, where the pending future comes from the body of a method in another bean;
- **the deadlock between two beans:** `return otherBean.asyncMethod()`.

Both need analysis across files, planned for a later version. Until then they are false negatives. It also does not report completed futures (`completedFuture`), `this.m()` (no proxy: it runs inline), parameters or fields, `Future`/`ListenableFuture`/`CompletionStage` return types and the AspectJ mode (not measured).

**Other limits.**
- Virtual threads are recognized only through `spring.threads.virtual.enabled=true` in the module's base config. An own executor that uses virtual threads (for example an `AsyncConfigurer` returning `Executors.newVirtualThreadPerTaskExecutor()`) is not detected, so the finding can say CRITICAL where WARNING would fit.
- When the future is built with `supplyAsync`/`runAsync` on the **same pool** that runs the `@Async` method, the outer task waits for an inner task queued on its own pool: the measured starvation deadlock. The rule cannot see which executor that is and reports the saturation message, which understates the risk.

When a reactive `.block()` matches both `blocking` and `reactor-block` on the same line, only `reactor-block` is reported. A call inside a method with several anchors (e.g. `@Async` + `@Scheduled`) is reported once: `Thread.sleep() detected in method annotated @Async, @Scheduled`.

---

## Example output

Real output of `npx java-vibe-guard@2.4.0 . --no-color` on [java-vibe-guard-demo](https://github.com/Joaquinriosheredia/java-vibe-guard-demo) at `cf6a1a0`:

```

java-vibe-guard — vibe coding detector for Java/Spring Boot
Scanning: .  (4 files)

❌ CRITICAL: Thread.sleep() detected in @KafkaListener method → src/main/java/demo/KafkaConsumerBug.java:9
  Evidence (measured, java-vibe-guard verify/blocking-kafka — @KafkaListener): the damage appears only when max.poll.records x time per record > max.poll.interval.ms (with the defaults, 500 records and 300 s: more than 600 ms per record). Above it, in an accelerated setup (max.poll.interval.ms lowered to 10 s), the consumer left the group on every batch, every offset commit failed and the group entered a reprocessing loop: 0 records/s committed, each record delivered ~10 times. Below it, the same blocking call caused no measured damage: no rebalances, no duplicates, throughput = consumers / time per record. Measured on kafka-clients 3.6.2, classic group protocol with eager rebalancing, spring-kafka AckMode BATCH; the cooperative protocol, KIP-848 and AckMode RECORD were not measured
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/a6f32ef/cli/verify/blocking-kafka/results/criteria.md#L7-L47
❌ CRITICAL: blocking Future.get() detected in @Async method → src/main/java/demo/OrderService.java:22
  Evidence (measured, java-vibe-guard verify/blocking — @Async): on Spring Boot's default @Async executor (8 platform threads, unbounded queue), a call that holds the thread caps throughput at threads / call duration: 39.9-40.0 tasks/s with 8 threads, 79.8 with 16. Above that the queue grows at (load - capacity) and 98-99.5% of latency is queue wait; the same call without holding the thread did not queue. With virtual threads enabled (spring.threads.virtual.enabled=true) the executor did not saturate
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c4e5ddd/cli/verify/blocking/results/criteria.md#L7-L38
  Evidence (@Scheduled, @EventListener): documented mechanism, no benchmark of our own — the call holds a thread of the scheduler / event pool for its whole duration; under load the pool saturates
❌ CRITICAL: blocking .block() detected in @Async method → src/main/java/demo/ReactiveController.java:14
  Evidence (measured, java-vibe-guard verify/blocking — @Async): on Spring Boot's default @Async executor (8 platform threads, unbounded queue), a call that holds the thread caps throughput at threads / call duration: 39.9-40.0 tasks/s with 8 threads, 79.8 with 16. Above that the queue grows at (load - capacity) and 98-99.5% of latency is queue wait; the same call without holding the thread did not queue. With virtual threads enabled (spring.threads.virtual.enabled=true) the executor did not saturate
  Source: https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c4e5ddd/cli/verify/blocking/results/criteria.md#L7-L38
  Evidence (@Scheduled, @EventListener): documented mechanism, no benchmark of our own — the call holds a thread of the scheduler / event pool for its whole duration; under load the pool saturates
⚠️  WARNING: @KafkaListener without explicit groupId → src/main/java/demo/KafkaConsumerBug.java:7
⚠️  WARNING: @KafkaListener without @RetryableTopic or DLQ — failed messages will be lost → src/main/java/demo/KafkaConsumerBug.java:7

──────────────────────────────────────────────────────────────
📊 Summary: 3 critical · 2 warnings
──────────────────────────────────────────────────────────────

🚨 3 CRITICAL issue(s) found — fix before deploying to production.
```

### Evidence

Each CRITICAL finding prints the evidence behind its rule. A rule only cites evidence that measures its own mechanism:

- **Measured** — `blocking` (for `@Async`), `blocking-kafka`, `reactor-block` and `async-returns-pending-future` cite this repository's pre-registered experiments under `cli/verify/`; `kafka-send-timeout` cites two [Java-Production-Labs](https://github.com/Joaquinriosheredia/Java-Production-Labs) fault-injection runs (Lab 05, Lab 08) in which an untimed `send().get()` blocked request threads while Kafka was down. Each line links to the versioned result file, pinned to the commit of the result.
- **Documented mechanism, no benchmark of our own** — every other rule, and `blocking` for `@Scheduled`/`@EventListener`. The output says so instead of borrowing a figure from a benchmark that measured something else.

---

## CLI options

Output of `java-vibe-guard --help` (2.4.0):

```
Usage: java-vibe-guard [options] [path]

Static analyzer that detects vibe coding patterns in Java/Spring Boot projects

Arguments:
  path               Path to Java/Spring Boot project to analyze

Options:
  -V, --version      output the version number
  --verify <rule>    Verify a VIBE rule is reproducible in your environment
                     (e.g. VIBE-001). Requires Docker (24+), Java 17+ and Maven
                     on PATH; runs a bundled Spring Boot app against a Postgres
                     container (~1 min)
  --explain <rule>   Print curated information about a rule id (e.g. kafka,
                     blocking-kafka) — no project scan
  --format <format>  Output format (choices: "text", "json", "sarif", default:
                     "text")
  --json             Output results as JSON (compatibility alias for --format
                     json)
  --rule <name>      Run only one rule: blocking | blocking-kafka | kafka |
                     kafka-send-timeout | layers | observability |
                     reactor-block | async-returns-pending-future |
                     transactions (async-returns-pending-future and
                     observability run only when named here)
  --skip-rule <ids>  Comma-separated rule ids whose findings are not reported
                     (e.g. kafka,layers)
  --ignore <dirs>    Comma-separated directories to exclude (e.g.
                     labs,demos,test)
  --verbose          List suppressed findings with their rule, location,
                     suppressedBy, and justification
  --baseline         Write/regenerate vibeguard-baseline.json from the current
                     scan and exit (no report, no exit code by criticals)
  --no-color         Disable colored output
  -h, --help         display help for command
```

### Skipping rules

```bash
java-vibe-guard . --skip-rule kafka,layers
```

Findings of the named rules are not reported, in any format, and do not count for the exit code. `--rule X --skip-rule X` is an error. Skipping `reactor-block` reports a reactive `.block()` under `blocking` instead, the same as `--rule blocking`. Opt-in rules (`observability`, `async-returns-pending-future`) are not in the default scan, so skipping them there changes nothing.

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

> **`--verify` hangs in 2.2.0 with Maven 3.10; update to 2.2.1.** In 2.2.0, `--verify VIBE-001` can wait forever without an error on its first run (when the Postgres image is not cached yet) if the `mvn` on `PATH` is 3.10.x. 2.2.1 fixes it and stops a run that exceeds 5 minutes ([details](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/cli/verify/vibe-001/HANG-2.2.0.md)).

**Requires Docker 24+, Java 21+ (the bundled app compiles with `release 21`; the pre-check and `--help` still say 17), Maven on `PATH`** and 512 MB of free memory. The environment pre-check ([testcontainers-doctor](https://www.npmjs.com/package/testcontainers-doctor)) ships as a dependency — nothing to install globally.

- Available today: `VIBE-001` only.
- It reproduces a canonical scenario; it does **not** run your project's code.
- Exit codes: `0` reproduced · `1` not reproduced · `2` environment or setup error / unknown rule.

---

## CI integration

GitHub Action (recommended — JSON artifact, step summary, optional SARIF upload):

```yaml
- uses: Joaquinriosheredia/java-vibe-guard@v3
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
| Scan error (path not found, no Java/config files, unknown `--rule` or `--skip-rule`, `--rule X --skip-rule X`) | `1` |
| `--explain` / `--verify` with an unknown rule | `2` |

Note that `1` covers both "critical findings" and "scan error".

### JSON output (`--format json`)

```jsonc
{
  "timestamp": "2026-10-03T03:00:00.000Z",
  "projectPath": ".",
  "filesScanned": 4,
  "summary": { "critical": 3, "major": 0, "warning": 2, "info": 0,
               "reported": 5, "suppressed": 0, "total": 5 },
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
| CLI (this package) / GitHub Action | 9 rule ids (above) | Regex / line-based | CI/CD, quick scans |
| MCP server | VIBE-001…007 | Line-based (Java), no AST | Claude Code integration |

The two engines use different rule ids and do not detect exactly the same things. Python: [python-vibe-guard](https://github.com/Joaquinriosheredia/python-vibe-guard).

---

## License

MIT
