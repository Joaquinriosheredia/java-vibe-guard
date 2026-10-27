# java-vibe-guard — Anti-Vibe-Coding Defense Stack

> **Community edition, frozen at 3.0.0: no new features.**

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-available-blue?logo=github-actions)](https://github.com/Joaquinriosheredia/java-vibe-guard/actions)

💬 [Feedback, false positives & rule requests](https://github.com/Joaquinriosheredia/java-vibe-guard/discussions)

A multi-layer defense system against vibe coding anti-patterns in Java/Spring Boot projects. Combines static analysis and MCP-native tooling to catch production bugs that compile cleanly and fail under load.

## Quick Start

**Prerequisites:** Node.js 18+ for scanning. `--verify` needs more (below).

### CLI
```bash
npx java-vibe-guard ./your-spring-project
```

### Runtime verification (`--verify`)

Reproduces a VIBE rule's anti-pattern in a live environment and confirms the phenomenon is observable.

**Usage** (java-vibe-guard 2.0.0 or later):
```bash
npx java-vibe-guard --verify VIBE-001
```

> **`--verify` hangs in 2.2.0 with Maven 3.10; update to 2.2.1.** In 2.2.0, `--verify VIBE-001` can wait forever without an error on its first run (when the Postgres image is not cached yet) if the `mvn` on `PATH` is 3.10.x. 2.2.1 fixes it and stops a run that exceeds 5 minutes ([details](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/master/cli/verify/vibe-001/HANG-2.2.0.md)).

Requires Docker 24+, Java 21+ (the bundled app compiles with `release 21`), Maven on `PATH`, and 512 MB of free memory. The environment pre-check (`testcontainers-doctor`) ships as a dependency — nothing to install globally.

### GitHub Actions (CI)
```yaml
- uses: Joaquinriosheredia/java-vibe-guard@v3
  with:
    path: '.'
    fail-on: 'critical'
```

Fails the build on CRITICAL findings. Zero configuration required. `@v3` (3.0.0) changes the `transactions` message, which is a baseline key, and can report new `blocking` findings for a fully qualified Spring `@Scheduled`; `@v2` stays on 2.4.0 — see [CHANGELOG](CHANGELOG.md#300). `@v2` added two default CRITICAL rules over `@v1` — see [CHANGELOG](CHANGELOG.md#200).

### MCP Server (Claude Code)
1. Download `java-vibe-guard-mcp-2.0.0.jar` from the [v2.0.0 release](https://github.com/Joaquinriosheredia/java-vibe-guard/releases/tag/v2.0.0) (verify with `sha256sum -c java-vibe-guard-mcp-2.0.0.jar.sha256`)
2. `claude mcp add java-vibe-guard -s user -- java -jar /path/to/java-vibe-guard-mcp-2.0.0.jar`

Requires Java 21+

## Structure

```
java-vibe-guard/
├── cli/          # Node.js static analyzer (npm package)
└── mcp-server/   # Spring Boot MCP server for Claude Code integration
```

---

## Active Rules — MCP Server (VIBE-001 to VIBE-007)

**7 rules · 148 tests**

| Code | Rule | Description |
|------|------|-------------|
| VIBE-001 | `TransactionalAsyncRule` | `.get()` / `.join()` / `.block()` / `.blockFirst()` / `.blockLast()` inside `@Transactional` (any receiver: no type check, so `Optional.get()` or `Map.get()` also match) can exhaust the DB connection pool |
| VIBE-002 | `ReactorBlockingCallRule` | `.block()` / `.blockFirst()` / `.toFuture().get()` in a reactive `@RestController`, `@Service` or `@Component` |
| VIBE-003 | `JpaNPlusOneRule` | Single-entity repository call (`findById`, `save`, `delete`) inside a loop or stream lambda |
| VIBE-004 | `VirtualThreadsMisuseRule` | Only in files with explicit virtual-thread usage: `synchronized`, or blocking I/O inside it, pins the carrier (CRITICAL); `ThreadLocal` creation, or `Thread.sleep()` in an `@Async` method (MAJOR) |
| VIBE-005 | `ConnectionPoolStarvationRule` | Blocking external call (HTTP, sleep, file I/O, `Future.get()`) inside `@Transactional` (CRITICAL). Also a MAJOR for `@Transactional` in a `@RestController`, whose message is wrong (see *Found in the Wild*) |
| VIBE-006 | `KafkaRebalanceHazardRule` | `@KafkaListener` without explicit `groupId`, or blocking call inside listener thread |
| VIBE-007 | `MdcContextLeakRule` | `MDC.put()` in `@Async` / `@Scheduled` without `MDC.clear()` leaks context across thread reuse |

All rules use an explicit annotation gate (no inference). Six of them strip comments and string literals before matching (`codeOnly()`); VIBE-001 does not. **Known limit, all 7 rules:** a method without an explicit `public`/`protected`/`private` modifier (package-private) is never scanned ([`validation/results.md`](validation/results.md), "METHOD_OPEN sistémico"). The MCP server has no precision measurement.

---

## Why These Rules Exist

Each rule's evidence is graded with the same criterion as the CLI output: it counts only if it reproduces **the rule's own mechanism**. There are two grades:

- **Reproduced:** `npx java-vibe-guard --verify VIBE-001` runs the anti-pattern in a live Spring Boot + PostgreSQL app and checks three observations: HikariCP pool utilization ≥ 95 %, requests waiting for a connection, and p95 latency ≥ 800 ms. It runs in CI on every change to the verifier ([`vibe-001-verify.yml`](.github/workflows/vibe-001-verify.yml)).
- **Documented mechanism, no benchmark of our own:** the failure mode is documented by the framework or platform, but this project has not measured it. Lab figures that measure a *different* mechanism are not cited as evidence.

| Rule | Evidence |
|------|----------|
| VIBE-001 `TransactionalAsyncRule` | Reproduced — `--verify VIBE-001` |
| VIBE-002 `ReactorBlockingCallRule` | Measured for `.block()` on a Reactor thread, `Schedulers.parallel()` worker or Netty event loop (fails fast, see below); measured deadlock for `.toFuture().get()` on the event loop (see below) |
| VIBE-003 `JpaNPlusOneRule` | Documented mechanism, no benchmark of our own |
| VIBE-004 `VirtualThreadsMisuseRule` | Documented mechanism, no benchmark of our own |
| VIBE-005 `ConnectionPoolStarvationRule` | Reproduced — `--verify VIBE-001` (same mechanism) |
| VIBE-006 `KafkaRebalanceHazardRule` | Documented mechanism, no benchmark of our own |
| VIBE-007 `MdcContextLeakRule` | Documented mechanism, no benchmark of our own |

---

### VIBE-001 — `TransactionalAsyncRule`

**Detects:** `.get()` / `.join()` / `.block()` / `.blockFirst()` / `.blockLast()` inside `@Transactional`, on any receiver — the method holds its HikariCP connection until the external call resolves, so concurrent requests exhaust the pool.

**Evidence:** Reproduced by `--verify VIBE-001` (see above): a `@Transactional` method saves a row and then waits on a `CompletableFuture`, holding the connection for the whole wait ([`cli/verify/vibe-001/`](cli/verify/vibe-001/)).

---

### VIBE-002 — `ReactorBlockingCallRule`

**Detects:** `.block()` / `.blockFirst()` / `.toFuture().get()` in a reactive `@RestController`, `@Service` or `@Component`.

**Evidence:** measured by the CLI's pre-registered `reactor-block` experiment ([`cli/verify/reactor-block/`](cli/verify/reactor-block/), [criteria](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c934bd7/cli/verify/reactor-block/results/criteria.md#L32-L46)) for `.block()` on a `Schedulers.parallel()` worker: it does **not** pin the worker. Reactor throws `IllegalStateException` ("block()/blockFirst()/blockLast() are blocking, which is not supported in thread parallel-N") on every call, so 100 % of the requests through that path failed with HTTP 500 at every load measured, not only under load. It is still a defect, of a different kind: it fails as soon as the path runs, tests included. Measured on Spring Boot 3.2.5, reactor-core 3.6.5 and reactor-netty 1.1.18.

The same holds on the **Netty event loop** (`.block()` in a WebFlux handler), measured by a pre-registered replication ([`cli/verify/reactor-block/replication/`](cli/verify/reactor-block/replication/), [criteria](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/1052498/cli/verify/reactor-block/replication/results/criteria.md#L15-L25)). It does not hold the event loop: 100 % of the requests through that path failed with HTTP 500 and an `IllegalStateException` naming the `reactor-http-epoll-N` thread, at 10, 50 and 400 requests/s. The count was made on the load generator alone, with no cross-process clock alignment. The first experiment's event-loop result did not meet its criterion because of a clock artifact, and stays exploratory.

`.toFuture().get()` in a WebFlux handler, with the WebClient on the server's event loops (Spring Boot's default shared resources), **deadlocks every request**. Measured by the same replication ([criteria](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/1052498/cli/verify/reactor-block/replication/results/criteria.md#L27-L48)), at 10, 50 and 400 requests/s, in 15/15 runs:
- 0 responses succeeded;
- the downstream did not receive a single request: the request never left the app.

When all 4 event loops were held (every run at 400 requests/s), the rest of the server stopped too.

The pre-registered minimum for the same deadlock with event loops still free was met exactly at its threshold. In 3 of 15 runs, 2 of the 4 loops were held while requests on new connections that block nothing were still served.

This hypothesis was formulated from the first experiment's data and then tested in the pre-registered replication. Measured on Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18 (native epoll) and OpenJDK 21. A WebClient with its own `LoopResources` was not measured.

---

### VIBE-003 — `JpaNPlusOneRule`

**Detects:** Repository calls (`findById`, `save`, `delete`) inside a loop or stream lambda — each iteration issues a separate SQL round trip, producing N database queries for a collection of N elements.

**Evidence:** Documented mechanism, no benchmark of our own. One query per element is the N+1 pattern described in the Hibernate/JPA documentation. This project has not benchmarked it.

---

### VIBE-004 — `VirtualThreadsMisuseRule`

**Detects:** in files with explicit virtual-thread usage, `synchronized` (CRITICAL, also blocking I/O inside it), and `ThreadLocal` creation or `Thread.sleep()` in an `@Async` method (MAJOR) — `synchronized` pins the virtual thread to its carrier platform thread for the duration of the block (JEP 444), negating the scheduling benefit of virtual threads.

**Evidence:** Documented mechanism, no benchmark of our own. Pinning is documented in JEP 444. Lab 01 in Java-Production-Labs compares virtual threads with a fixed platform pool; it does not measure pinning, so it is not cited here.

---

### VIBE-005 — `ConnectionPoolStarvationRule`

**Detects:** Blocking external call (HTTP, sleep, file I/O, `Future.get()`) inside `@Transactional` — holds a HikariCP connection open during the blocking operation, reducing available pool slots and accelerating exhaustion under concurrent load.

**Evidence:** Reproduced by `--verify VIBE-001`: the verifier's `@Transactional` method blocks while holding its connection, which is this rule's mechanism too.

**Known wrong message:** the rule also emits a MAJOR, "`@Transactional` in `@RestController` holds DB connection open during HTTP response serialization". That mechanism is technically incorrect (see *Found in the Wild* below); the published jar 2.0.0 still prints it.

---

### VIBE-006 — `KafkaRebalanceHazardRule`

**Detects:** `@KafkaListener` without explicit `groupId`, or a blocking call inside a listener thread. **Scope:** the rule flags the blocking call itself as a risk signal — it does not read `max.poll.interval.ms` from configuration and does not evaluate whether the actual blocking duration would exceed it. A finding confirms the pattern is present, not that a rebalance will occur.

**Evidence (blocking call):** measured with the CLI's pre-registered `blocking-kafka` experiment ([results](https://github.com/Joaquinriosheredia/java-vibe-guard/blob/a6f32ef/cli/verify/blocking-kafka/results/criteria.md)). The damage appears only when `max.poll.records × time per record > max.poll.interval.ms`; with the defaults (500 records, 300 s), that means more than 600 ms per record. Above that threshold, in an accelerated setup with `max.poll.interval.ms` lowered to 10 s, the group entered a reprocessing loop: 0 records/s committed, and each record was delivered ~10 times. Below it, the same blocking call caused no measured damage. Measured on kafka-clients 3.6.2 with the classic protocol and eager rebalancing; the cooperative protocol and KIP-848 were not measured. The missing-`groupId` check remains a documented mechanism. Lab 08 is not evidence for this rule: it is a Kafka Streams app with no `@KafkaListener`, and its blocking `send().get()` runs on an HTTP thread (evidence for the CLI's `kafka-send-timeout` rule instead).

---

### VIBE-007 — `MdcContextLeakRule`

**Detects:** `MDC.put()` in `@Async` / `@Scheduled` without `MDC.clear()` — leaks request-scoped diagnostic context (request ID, customer ID, trace ID) across thread reuse in a shared thread pool, contaminating unrelated log lines in subsequent requests.

**Evidence:** Documented mechanism, no benchmark of our own. MDC is thread-local (SLF4J documentation), so values survive into the next task on a reused pool thread unless cleared.

---

## The Problem

Vibe coding produces code that compiles, passes mocked unit tests, and fails in production under real load. LLMs generate syntactically plausible patterns that violate architectural invariants only visible at runtime — blocking calls inside transactions, direct cross-layer access, missing observability. No single tool catches all of them because they operate at different points in the development cycle.

---

## Two Engines

### CLI (`cli/`)

**When it acts:** after code exists, before or after commit, integrable into CI.

**Mechanism:** Node.js tool that recursively scans a Java/Spring Boot project applying static analysis rules based on regex patterns and context heuristics. Default rules detect: blocking calls in `@Async`/`@Scheduled`/`@EventListener` and `@KafkaListener` methods (`blocking`, `blocking-kafka`), `.block()` and similar in Reactor code (`reactor-block`), `send().get()` with no timeout on `KafkaTemplate` (`kafka-send-timeout`), `@Transactional` misuse (`transactions`), direct Controller→Repository or Controller→Kafka access (`layers`) and Kafka configuration gaps (`kafka`). `observability` (endpoints without structured logging) and `async-returns-pending-future` are opt-in (`--rule`). Each finding includes file, line, severity, and explanation of why it's a production anti-pattern.

**What it adds:** it checks the code, not what the author or an LLM said about it: a blocking `.get()` is reported whatever the stated intent. Also works as an audit tool on pre-existing or legacy code.

**Limitation:** textual analysis, not full AST. Doesn't understand real control flow or object types. Can produce false positives with coincidental naming, and cannot reason about anti-patterns that only emerge from the composition of multiple methods.

```bash
npx java-vibe-guard ./path/to/project
npx java-vibe-guard ./path/to/project --ignore target,build

# From a clone of this repository
cd cli && npm ci
node bin/cli.js ./path/to/project
```

#### GitHub Action

Add to any Java project's workflow — no installation required:

```yaml
- name: java-vibe-guard
  uses: Joaquinriosheredia/java-vibe-guard@v3
  with:
    path: '.'            # directory to scan (default: .)
    fail-on: 'critical'  # fail step on CRITICAL findings (default)
```

Full options:

```yaml
- id: guard
  uses: Joaquinriosheredia/java-vibe-guard@v3
  with:
    path: '.'
    rule: ''             # blank = default set (async-returns-pending-future and observability are opt-in: name them here); or: blocking | blocking-kafka | kafka | kafka-send-timeout | layers | transactions | observability | reactor-block | async-returns-pending-future
    ignore: 'labs,demo'  # comma-separated dirs to skip
    fail-on: 'critical'  # critical | never
    upload-report: 'true'  # attach JSON report as artifact
    sarif: 'false'          # generate a SARIF report and upload it to GitHub Code Scanning (opt-in)

  # Outputs available in subsequent steps:
  #   ${{ steps.guard.outputs.critical }}
  #   ${{ steps.guard.outputs.major }}
  #   ${{ steps.guard.outputs.warning }}
  #   ${{ steps.guard.outputs.healthy }}
  #   ${{ steps.guard.outputs.report-json }}
  #   ${{ steps.guard.outputs.report-sarif }}  # only set when sarif: 'true'
```

The action writes a markdown table to the GitHub Actions summary panel and uploads the full JSON report as a workflow artifact (30-day retention). When `sarif: 'true'`, it also generates a SARIF 2.1.0 report and uploads it directly to GitHub Code Scanning via `github/codeql-action/upload-sarif` (available since `@v1.1.0`; not on `@v1`).

---

### MCP Server (`mcp-server/`)

**When it acts:** during active Claude Code workflow, as a tool available in context.

**Mechanism:** MCP (Model Context Protocol) server implemented in Spring Boot that exposes `analyzeProject` as a native Claude Code tool. When Claude generates code for a project, it can invoke the analysis directly as part of its reasoning — before declaring the task complete, after a refactor, or when the user requests it. The result (files analyzed, issues by severity, exact line and diagnostic message) enters Claude's context and can inform the next action.

**What it adds over the CLI:** closes the feedback loop within the same session. Instead of manually running the CLI and pasting the output, Claude can analyze, see the results, fix, and re-analyze in a single conversation. Also serves as a validation signal Claude can use to confirm that a change it just made didn't introduce new anti-patterns.

**Limitation:** same as the CLI, inheriting its static analysis constraints. Also depends on Claude deciding to invoke the tool — it is not an automatic barrier.

```bash
# Build
cd mcp-server
mvn package -DskipTests

# Register in Claude Code (user scope — available in all projects)
claude mcp add java-vibe-guard -s user -- java -jar "$(pwd)/target/java-vibe-guard-mcp-2.0.0.jar"
```

---

## How They Act as a Pipeline

```
[User request]
       │
       ▼
┌─────────────────────────────┐
│   Claude generates code     │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   MCP server                │  ← "Is the generated code safe?"
│   In-session feedback loop  │     Analyze → fix → re-analyze
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   CLI in CI                 │  ← "Is the full repo clean?"
│   Pre-merge gate            │     Blocks on unresolved findings
└─────────────────────────────┘
```

The two engines overlap in purpose but not in mechanism, and they fail in different ways: the MCP may not be invoked, and either may miss a pattern. Several anti-patterns are covered by only one of them (table below).

---

## What Each Engine Covers

| Anti-pattern | Engine that reports it |
|---|---|
| `.get()`/`.block()` blocking inside `@Transactional` | MCP only (VIBE-001, VIBE-005) |
| Blocking call inside `@KafkaListener` | CLI + MCP (cli `blocking-kafka` + VIBE-006) |
| Kafka `send().get()` with no timeout argument | CLI only (cli `kafka-send-timeout`) |
| `.block()`/`.blockFirst()`/`.blockLast()`/`.toFuture().get()` in a Reactor chain inside an `@Service`/`@RestController`/`@Component` class, in any method other than `@Test`/`@PostConstruct`/`main()` | CLI + MCP (cli `reactor-block` + VIBE-002) |
| `@Async` method returning a `CompletableFuture` that one file proves still pending (not yet: the pending future built in another bean, or the deadlock between two beans) | CLI only (cli `async-returns-pending-future`, opt-in: `--rule`) |
| Controller accessing repository directly | CLI only (cli `layers`) |
| Endpoint without structured logging | CLI only (cli `observability`, opt-in: `--rule`) |
| Re-check after a change, for the 7 MCP patterns only | MCP (re-analysis in the session) |
| The CLI patterns in existing or legacy code | CLI (CI audit) |


---

## Stack Evaluation

What makes it solid is not the sophistication of any individual layer, but that the pipeline operates at zero marginal cost per analysis: the MCP is a tool call within the session, the CLI is executable in any CI without licenses. The total system cost is zero. The only real cost is not having it: production code with anti-patterns that only fail under load.

---

## Validation

- **148 tests**, 0 false positives on the curated fixtures — MCP's unit test suite (`mvn test` in `mcp-server/`).
- CLI `validate-public` pipeline run on **2 real-world Spring Boot repositories**,
  pinned to fixed commits (see [`validation/repos.json`](validation/repos.json)):
  - [`eugenp/tutorials`](https://github.com/eugenp/tutorials) @ `ccab8a7` — 29,141 files scanned
  - [`spring-projects/spring-petclinic`](https://github.com/spring-projects/spring-petclinic) @ `88e37c1` — 77 files scanned
  - **29,218 files scanned in total.**
- CLI version `2.0.0` (run 2026-10-03), **not re-run since**: from 2.1.0 to 3.0.0 the default
  rules changed (for example `observability` left the default set, `reactor-block` became
  WARNING when the thread is unknown, and `transactions` ignores string literals), so 3.0.0
  would report different numbers. Both repository validations
  completed successfully: **2,856 findings** reported — 20 critical,
  220 major, 2,616 warning (`eugenp/tutorials`: 20 / 211 / 2,598;
  `spring-petclinic`: 0 / 9 / 18). Source:
  [`validation/results/summary.json`](validation/results/summary.json)
  and [`REPORT.md`](validation/results/REPORT.md).
- Reproducibility: commit c45d16c reports that the pipeline was run twice against the same
  pinned commits with identical JSON artifacts (except the fields excluded by
  docs/validation-contract.md §5). The second run's artifacts are not versioned.
- These are findings reported, not confirmed bugs: no precision audit has
  been run on them.
- **Pre-registered precision measurement: test-corpus-2** (2.4.0, 75 Spring Boot repositories,
  every one of the 58 CRITICAL reviewed). Precision **0.6724** (Wilson 95 % 0.5442–0.7792),
  below the 90 % target: **criterion 1 NOT MET**. FP/1000 = 0.18, so criterion 2 was met.
  The author's audit of the AI review also declared that review NOT RELIABLE. Source:
  [vibe-guard-evaluation `test-corpus-2/METRICS.md`](https://github.com/Joaquinriosheredia/vibe-guard-evaluation/blob/65f57e4/test-corpus-2/METRICS.md).
  3.0.0 was fixed against those findings, so test-corpus-2 does not measure 3.0.0. That is
  test-corpus-3, pre-registered before the fixes. The previous run (CLI 1.0.3, 2,909 findings) is
  replaced; the rule set changed in 2.0.0.

## Found in the Wild

All three "Found in the Wild" candidates investigated so far were retracted after contextual audit against the pinned commit — checked for real callers, real test coverage, and (for the case below) the technical accuracy of the mechanism the rule claims to detect. None currently stands as valid field evidence for its rule; see below for why each was retracted.

- `FileContentSearchService.java` (`spring-reactive-modules/spring-reactive-4/.../service/`, `eugenp/tutorials`) — a `.block()` call flagged as VIBE-002 evidence — is one method in a six-method side-by-side comparison of correct and incorrect Reactor blocking patterns, built for a Baeldung tutorial article (route prefix `bael7724`). Its own integration test (`FileSearchAPIIntegrationTest.givenAFileNameAndASearchTerm_whenParallelThreadPoolAPIIsHit_thenReturnAServerError`) asserts that the flagged endpoint *should* return a 5xx error — the "failure" is the documented, intended teaching outcome, not a bug.
- `ConsumerSimulator.java` (`spring-kafka-2/.../monitoring/simulation/`, `eugenp/tutorials`) — a `Thread.sleep()` inside a `@KafkaListener` flagged as VIBE-006 evidence — is an intentional Kafka lag simulator: `Thread.sleep(10L)` is the mechanism that deliberately creates consumer lag for a companion `LagAnalyzerService` to detect and display. Both `monitor.consumer.simulate` and `monitor.producer.simulate` default to `true` in the module's `application.properties`, confirming the module is designed to run as a demonstration.
- `AuthorityResource.java` (`jhipster-8-modules/jhipster-8-monolithic/.../web/rest/`, `eugenp/tutorials`) — `@Transactional` on a `@RestController` class, flagged as VIBE-005 evidence — was retracted for a different reason than the two findings above. The `@Transactional` annotation is real, unmodified JHipster-generated scaffolding (confirmed against the pinned commit and the JHipster README), not demo/tutorial code — so this is not a "there's no `@Transactional` here" retraction. It is retracted because the mechanism the README attributed to it was technically incorrect: Spring's `TransactionInterceptor` commits the transaction and releases the JDBC connection synchronously, inside the same method invocation that wraps the controller call, *before* control returns to Spring MVC's return-value handling — `HttpMessageConverter`/Jackson serialization only begins after that invocation has already completed (`TransactionAspectSupport.invokeWithinTransaction`, `JpaTransactionManager.doCleanupAfterCompletion`, `ServletInvocableHandlerMethod.invokeAndHandle` — Spring Framework source). The project also runs with `spring.jpa.open-in-view=false`, ruling out Open Session In View as an alternate path to the same claimed effect. The connection being held open *during a blocking call inside the transactional method body* remains a valid, real mechanism (that's what `ConnectionPoolStarvationRule` detects as CRITICAL, per its rule definition above; its MAJOR message for `@Transactional` on a `@RestController` still states the incorrect mechanism) — what does not hold is the claim that the connection stays open through HTTP serialization *after* the method returns.

No replacement examples were added — the goal is honest evidence, not a fixed count of findings.
