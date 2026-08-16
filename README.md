# java-vibe-guard — Anti-Vibe-Coding Defense Stack

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-available-blue?logo=github-actions)](https://github.com/Joaquinriosheredia/java-vibe-guard/actions)

💬 [Feedback, false positives & rule requests](https://github.com/Joaquinriosheredia/java-vibe-guard/discussions)

![java-vibe-guard demo](https://raw.githubusercontent.com/Joaquinriosheredia/java-vibe-guard/master/demo-screenshot.png)

A multi-layer defense system against vibe coding anti-patterns in Java/Spring Boot projects. Combines static analysis and MCP-native tooling to catch production bugs that compile cleanly and fail under load.

## Quick Start

**Prerequisites:** node, jq, git

### CLI
```bash
npx java-vibe-guard ./your-spring-project
```

### Runtime verification (`--verify`)

Reproduces a VIBE rule's anti-pattern in a live environment and confirms the phenomenon is observable.

**Additional prerequisite:** `testcontainers-doctor` must be installed globally (used for environment pre-check):
```bash
npm install -g testcontainers-doctor
```

**Usage:**
```bash
npx java-vibe-guard --verify VIBE-001
```

Requires Docker 24+, Java 17+, and 512 MB of free memory.

### GitHub Actions (CI)
```yaml
- uses: Joaquinriosheredia/java-vibe-guard@v1.1.0
  with:
    path: '.'
    fail-on: 'critical'
```

Fails the build on CRITICAL findings. Zero configuration required.

### MCP Server (Claude Code)
1. Download java-vibe-guard-mcp-0.1.0.jar from releases
2. `claude mcp add java-vibe-guard -s user -- java -jar /path/to/java-vibe-guard-mcp-0.1.0.jar`

Requires Java 21+

## Structure

```
java-vibe-guard/
├── cli/          # Node.js static analyzer (npm package)
└── mcp-server/   # Spring Boot MCP server for Claude Code integration
```

---

## Active Rules — MCP Server (VIBE-001 to VIBE-007)

**7 rules · 143 tests**

| Code | Rule | Description |
|------|------|-------------|
| VIBE-001 | `TransactionalAsyncRule` | `.get()` / `.block()` inside `@Transactional` exhausts the DB connection pool |
| VIBE-002 | `ReactorBlockingCallRule` | `.block()` / `.blockFirst()` / `.toFuture().get()` in reactive `@RestController` or `@Service` |
| VIBE-003 | `JpaNPlusOneRule` | Single-entity repository call (`findById`, `save`, `delete`) inside a loop or stream lambda |
| VIBE-004 | `VirtualThreadsMisuseRule` | `synchronized` or `ThreadLocal` in Virtual Threads context pins the carrier platform thread |
| VIBE-005 | `ConnectionPoolStarvationRule` | Blocking external call (HTTP, sleep, file I/O, `Future.get()`) inside `@Transactional` |
| VIBE-006 | `KafkaRebalanceHazardRule` | `@KafkaListener` without explicit `groupId`, or blocking call inside listener thread |
| VIBE-007 | `MdcContextLeakRule` | `MDC.put()` in `@Async` / `@Scheduled` without `MDC.clear()` leaks context across thread reuse |

All rules share the same design principles: explicit annotation gate (no inference), `codeOnly()` stripping to prevent matches in comments and string literals, and precision over coverage — when in doubt, the rule does not flag.

---

## Why These Rules Exist

Each rule was designed around a failure mode observed in [Java-Production-Labs](https://github.com/Joaquinriosheredia/Java-Production-Labs) — a benchmark suite of 10 Spring Boot labs exercised under real load and fault injection. Rules without a direct lab observation are marked *theoretical* and will be promoted to *observed* once empirical evidence is collected.

---

### VIBE-001 — `TransactionalAsyncRule`

**Detects:** `.get()` / `.block()` inside `@Transactional` — a Kafka or HTTP send that holds the DB write lock open until the external call resolves, risking connection pool exhaustion and silent event loss on broker failure.

**Observed in:** [Lab 04 — Transactional Outbox Pattern](https://github.com/Joaquinriosheredia/Java-Production-Labs/tree/main/04_outbox_kafka)

**Evidence:** The `@Transactional pollAndPublish()` poller held a DB write lock during each Kafka send batch. A chaos run revealed that when `send()` partially committed before a failure, events were silently marked `FAILED` and never retried — `findPendingEvents()` only queried `status = 'PENDING'`, making FAILED events permanently invisible to the poller. Five events were confirmed permanently undeliverable in the optimization run before the bug was fixed.

---

### VIBE-002 — `ReactorBlockingCallRule`

**Detects:** `.block()` / `.blockFirst()` / `.toFuture().get()` in a reactive `@RestController` or `@Service` — pins a thread from `Schedulers.parallel()` (fixed-size, CPU-core-count pool) for the full duration of the I/O operation, which can stall all reactive pipeline scheduling.

**Observed in:** *Theoretical* — no direct Java-Production-Labs lab covers Project Reactor. A confirmed wild-code instance is documented in the [Found in the Wild](#found-in-the-wild) section below (eugenp/tutorials, `spring-reactive-4`).

**Evidence:** Theoretical until a reactive lab is added. The wild-code case shows `.block()` on `Schedulers.parallel()` exhausting all available scheduler threads under concurrent load.

---

### VIBE-003 — `JpaNPlusOneRule`

**Detects:** Repository calls (`findById`, `save`, `delete`) inside a loop or stream lambda — each iteration issues a separate SQL round trip, producing N database queries for a collection of N elements.

**Observed in:** [Lab 07 — PostgreSQL Tuning](https://github.com/Joaquinriosheredia/Java-Production-Labs/tree/main/07_postgres_tuning)

**Evidence:** Benchmark observed ~23× query time degradation when queries ran without a partial index on a 100K-row table (~285ms sequential scan vs. ~12ms index scan against 5% selective rows). N+1 patterns that issue per-entity queries amplify this cost linearly with collection size — each unindexed lookup triggers a full sequential scan at the same ~285ms baseline.

---

### VIBE-004 — `VirtualThreadsMisuseRule`

**Detects:** `synchronized` or `ThreadLocal` usage in a Virtual Threads context — both constructs pin the carrier platform thread for the duration of the synchronized block or scoped access, negating the scheduling benefit of virtual threads and reproducing platform-thread contention.

**Observed in:** [Lab 01 — Virtual Threads](https://github.com/Joaquinriosheredia/Java-Production-Labs/tree/main/01_virtual_threads)

**Evidence:** Benchmark measured 7.4× throughput gain (1,058 req/s vs. 142 req/s) and 12× lower median latency (103ms vs. 1,280ms) with a virtual thread executor versus a fixed platform thread pool of 20 under 200 concurrent VUs. Code using `synchronized` inside virtual thread context reverts to platform-thread pinning behavior, suppressing the throughput gains demonstrated in this lab.

---

### VIBE-005 — `ConnectionPoolStarvationRule`

**Detects:** Blocking external call (HTTP, sleep, file I/O, `Future.get()`) inside `@Transactional` — holds a HikariCP connection open during the blocking operation, reducing available pool slots and accelerating exhaustion under concurrent load.

**Observed in:** [Lab 05 — Saga Pattern](https://github.com/Joaquinriosheredia/Java-Production-Labs/tree/main/05_saga_pattern)

**Evidence:** `kafka.send().get()` inside `@Transactional startSaga()` observed to block HTTP threads when Kafka was unreachable — 60% of requests failed or timed out (35 of 50) during a simulated broker outage, while the actuator health endpoint continued reporting `UP`. The dual-write race condition produced 71.8% of orders permanently stuck in `STARTED` state with no recovery path, confirming that blocking sends inside transactions create both availability and consistency failures simultaneously.

---

### VIBE-006 — `KafkaRebalanceHazardRule`

**Detects:** `@KafkaListener` without explicit `groupId`, or a blocking call inside a listener thread — delays offset commit, risks exceeding `max.poll.interval.ms`, and can trigger a consumer group rebalance that halts partition processing across the entire group.

**Observed in:** [Lab 08 — Kafka Streams](https://github.com/Joaquinriosheredia/Java-Production-Labs/tree/main/08_kafka_streams)

**Evidence:** Synchronous `kafkaTemplate.send(...).get()` on the message-processing path caused 60% request failure rate and observed latency of 15,000ms during broker fault injection. Critically, Spring Actuator reported `UP` and Streams state reported `RUNNING` throughout the outage — a confirmed false-positive health signal that would suppress alerting while the service was effectively non-functional for new message delivery.

---

### VIBE-007 — `MdcContextLeakRule`

**Detects:** `MDC.put()` in `@Async` / `@Scheduled` without `MDC.clear()` — leaks request-scoped diagnostic context (request ID, customer ID, trace ID) across thread reuse in a shared thread pool, contaminating unrelated log lines in subsequent requests.

**Observed in:** *Theoretical* — no Java-Production-Labs lab directly benchmarks MDC propagation failures.

**Evidence:** No verified production case from Java-Production-Labs yet. Rule retained as a defensive best practice based on the documented risk of thread-pool reuse corrupting MDC context across `@Async`/`@Scheduled` executions, pending a real-world incident to confirm it in the wild.

---

## The Problem

Vibe coding produces code that compiles, passes mocked unit tests, and fails in production under real load. LLMs generate syntactically plausible patterns that violate architectural invariants only visible at runtime — blocking calls inside transactions, direct cross-layer access, missing observability. No single tool catches all of them because they operate at different points in the development cycle.

---

## Two Layers

### Layer 2 — java-vibe-guard CLI (`cli/`)

**When it acts:** after code exists, before or after commit, integrable into CI.

**Mechanism:** Node.js tool that recursively scans a Java/Spring Boot project applying static analysis rules based on regex patterns and context heuristics. Current rules detect: blocking calls in async annotations (`@Async`, `@KafkaListener`), direct Controller→Repository or Controller→Kafka access (layer violation), endpoints without structured logging. Each finding includes file, line, severity, and explanation of why it's a production anti-pattern.

**What it eliminates:** the gap between what the LLM declares and what it generates. An LLM can pass the architecture gate saying "I'll handle this asynchronously" and then generate a blocking `.get()` in the same method. The CLI detects it independently of intent. Also works as an audit tool on pre-existing or legacy code.

**Limitation:** textual analysis, not full AST. Doesn't understand real control flow or object types. Can produce false positives with coincidental naming, and cannot reason about anti-patterns that only emerge from the composition of multiple methods.

```bash
cd cli
npx java-vibe-guard ./path/to/project
npx java-vibe-guard ./path/to/project --ignore target,build
```

#### GitHub Action

Add to any Java project's workflow — no installation required:

```yaml
- name: java-vibe-guard
  uses: Joaquinriosheredia/java-vibe-guard@v1.1.0
  with:
    path: '.'            # directory to scan (default: .)
    fail-on: 'critical'  # fail step on CRITICAL findings (default)
```

Full options:

```yaml
- uses: Joaquinriosheredia/java-vibe-guard@v1.1.0
  with:
    path: '.'
    rule: ''             # blank = all rules; or: blocking | blocking-kafka | kafka | kafka-send-timeout | layers | transactions | observability | reactor-block
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

The action writes a markdown table to the GitHub Actions summary panel and uploads the full JSON report as a workflow artifact (30-day retention). When `sarif: 'true'`, it also generates a SARIF 2.1.0 report and uploads it directly to GitHub Code Scanning via `github/codeql-action/upload-sarif` (requires `@v1.1.0` or later — not available on `@v1`).

---

### Layer 3 — java-vibe-guard MCP Server (`mcp-server/`)

**When it acts:** during active Claude Code workflow, as a tool available in context.

**Mechanism:** MCP (Model Context Protocol) server implemented in Spring Boot that exposes `analyzeProject` as a native Claude Code tool. When Claude generates code for a project, it can invoke the analysis directly as part of its reasoning — before declaring the task complete, after a refactor, or when the user requests it. The result (files analyzed, issues by severity, exact line and diagnostic message) enters Claude's context and can inform the next action.

**What it adds over the CLI:** closes the feedback loop within the same session. Instead of manually running the CLI and pasting the output, Claude can analyze, see the results, fix, and re-analyze in a single conversation. Also serves as a validation signal Claude can use to confirm that a change it just made didn't introduce new anti-patterns.

**Limitation:** same as the CLI, inheriting its static analysis constraints. Also depends on Claude deciding to invoke the tool — it is not an automatic barrier.

```bash
# Build
cd mcp-server
mvn package -DskipTests

# Register in Claude Code (user scope — available in all projects)
claude mcp add java-vibe-guard -s user -- java -jar mcp-server/target/java-vibe-guard-mcp-1.0.0-SNAPSHOT.jar
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
│   LAYER 3: MCP server       │  ← "Is the generated code safe?"
│   In-session feedback loop  │     Analyze → fix → re-analyze
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   LAYER 2: CLI in CI        │  ← "Is the full repo clean?"
│   Pre-merge gate            │     Blocks on unresolved findings
└─────────────────────────────┘
```

The two layers are deliberately redundant in purpose but not in mechanism. The redundancy is correct because each layer has a different failure vector: the MCP may not be invoked, the CLI may have false negatives. None fail simultaneously against the same type of error.

---

## What They Eliminate Together

| Anti-pattern | Layer that catches it |
|---|---|
| `.get()`/`.block()` blocking inside `@Transactional` | Layer 3 only (VIBE-001, VIBE-005) |
| Blocking call inside `@KafkaListener` | Layers 2 + 3 (cli `blocking-kafka` + VIBE-006) |
| Kafka `send().get()` with no timeout argument | Layer 2 only (cli `kafka-send-timeout`) |
| `.block()`/`.blockFirst()`/`.blockLast()`/`.toFuture().get()` in a Reactor chain inside an `@Service`/`@RestController`/`@Component` class, in any method other than `@Test`/`@PostConstruct`/`main()` | Layers 2 + 3 (cli `reactor-block` + VIBE-002) |
| Controller accessing repository directly | Layer 2 only (cli `layers`) |
| Endpoint without structured logging | Layer 2 only (cli `observability`) |
| Generated code the LLM declares correct but isn't | Layer 3 (immediate feedback) |
| Regression introduced by refactoring | Layer 3 (post-change re-analysis) |
| Technical debt in untouched legacy code | Layer 2 (CI audit) |


---

## Stack Evaluation

What makes it solid is not the sophistication of any individual layer, but that the pipeline operates at zero marginal cost per analysis: the MCP is a tool call within the session, the CLI is executable in any CI without licenses. The total system cost is zero. The only real cost is not having it: production code with anti-patterns that only fail under load.

---

## Validation

- **143 tests**, 0 false positives — MCP's curated unit test suite (`mvn test` in `mcp-server/`).
- CLI `validate-public` pipeline run on **2 real-world Spring Boot repositories**,
  pinned to fixed commits (see [`validation/repos.json`](validation/repos.json)):
  - [`eugenp/tutorials`](https://github.com/eugenp/tutorials) @ `ccab8a7` — 29,141 files scanned
  - [`spring-projects/spring-petclinic`](https://github.com/spring-projects/spring-petclinic) @ `88e37c1` — 77 files scanned
  - **29,218 files scanned in total.**
- Both repository validations completed successfully. Reproducibility was
  verified by running the pipeline twice against the same pinned commits:
  the resulting JSON artifacts were byte-identical except for the four
  run-specific fields excluded by docs/validation-contract.md §5.
- CLI version `1.0.3`. Per-rule/per-repo finding counts (2,909 findings
  reported in this run) are not reproduced here — see the generated
  artifact (`validation/results/summary.json`) for the detailed breakdown.

## Found in the Wild

All three "Found in the Wild" candidates investigated so far were retracted after contextual audit against the pinned commit — checked for real callers, real test coverage, and (for the case below) the technical accuracy of the mechanism the rule claims to detect. None currently stands as valid field evidence for its rule; see below for why each was retracted.

- `FileContentSearchService.java` (`spring-reactive-modules/spring-reactive-4/.../service/`, `eugenp/tutorials`) — a `.block()` call flagged as VIBE-002 evidence — is one method in a six-method side-by-side comparison of correct and incorrect Reactor blocking patterns, built for a Baeldung tutorial article (route prefix `bael7724`). Its own integration test (`FileSearchAPIIntegrationTest.givenAFileNameAndASearchTerm_whenParallelThreadPoolAPIIsHit_thenReturnAServerError`) asserts that the flagged endpoint *should* return a 5xx error — the "failure" is the documented, intended teaching outcome, not a bug.
- `ConsumerSimulator.java` (`spring-kafka-2/.../monitoring/simulation/`, `eugenp/tutorials`) — a `Thread.sleep()` inside a `@KafkaListener` flagged as VIBE-006 evidence — is an intentional Kafka lag simulator: `Thread.sleep(10L)` is the mechanism that deliberately creates consumer lag for a companion `LagAnalyzerService` to detect and display. Both `monitor.consumer.simulate` and `monitor.producer.simulate` default to `true` in the module's `application.properties`, confirming the module is designed to run as a demonstration.
- `AuthorityResource.java` (`jhipster-8-modules/jhipster-8-monolithic/.../web/rest/`, `eugenp/tutorials`) — `@Transactional` on a `@RestController` class, flagged as VIBE-005 evidence — was retracted for a different reason than the two findings above. The `@Transactional` annotation is real, unmodified JHipster-generated scaffolding (confirmed against the pinned commit and the JHipster README), not demo/tutorial code — so this is not a "there's no `@Transactional` here" retraction. It is retracted because the mechanism the README attributed to it was technically incorrect: Spring's `TransactionInterceptor` commits the transaction and releases the JDBC connection synchronously, inside the same method invocation that wraps the controller call, *before* control returns to Spring MVC's return-value handling — `HttpMessageConverter`/Jackson serialization only begins after that invocation has already completed (`TransactionAspectSupport.invokeWithinTransaction`, `JpaTransactionManager.doCleanupAfterCompletion`, `ServletInvocableHandlerMethod.invokeAndHandle` — Spring Framework source). The project also runs with `spring.jpa.open-in-view=false`, ruling out Open Session In View as an alternate path to the same claimed effect. The connection being held open *during a blocking call inside the transactional method body* remains a valid, real mechanism (that's what `ConnectionPoolStarvationRule` actually detects, per its rule definition above) — what does not hold is the claim that the connection stays open through HTTP serialization *after* the method returns.

No replacement examples were added — the goal is honest evidence, not a fixed count of findings.
