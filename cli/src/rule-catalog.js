// Shared rule catalog — one object, three consumers (sarif.js's `rules`
// array, --explain, and the Evidence lines reporter.js prints under CRITICAL
// findings).
//
// evidence (0a, 2.0.0) — a rule may only cite evidence that measures ITS OWN
// mechanism: kind 'measured' lists versioned lab result files (pinned to the
// commit of the result, with the line range) and what they measured; kind
// 'mechanism' means the failure mode is documented but no benchmark of ours
// reproduces it. Never cite a figure from a lab that measured something else
// (1.x printed Lab #04 pool figures under `blocking` that exist in no result
// file, and Lab #08 under `blocking-kafka`, whose README retracts it). Content is curated by hand from reading each rule's
// implementation in cli/src/rules/*.js, not extracted from any existing
// document (there is no README section that covers the CLI's rule ids —
// README.md's "Why These Rules Exist" documents the MCP server's unrelated
// VIBE-001..007 Java rules instead).
//
// severities lists every distinct severity that rule id's findings.push(...)
// call sites can produce, highest-first (critical > major > warning > info,
// same rank sarif.js's SEVERITY_RANK and reporter.js's SEVERITY_ORDER use).
// Hand-maintained: if cli/src/rules/*.js ever changes what severity a rule
// id emits, this array must be updated here too — nothing enforces the two
// staying in sync automatically. Evidence for the eight values below:
//   - blocking: 'critical', and 'warning' for a call whose only anchor is @Async
//     in a module whose base configuration enables virtual threads
//     (blocking.js mergeByCall, virtual-threads.js; measured: verify/blocking
//     variant D). blocking-kafka: always 'critical' (same call site).
//   - kafka: always 'warning' (kafka.js:22,51,62,80 — all four call sites).
//   - kafka-send-timeout: always 'critical' (kafka.js:154, single call
//     site). New rule, evidence: Java-Production-Labs SagaOrderService.java:45
//     (commit 01cee18) and StreamController.java:53 (commit dcb0358).
//   - layers: always 'major' (layers.js:28,38).
//   - observability: always 'warning' (observability.js:54).
//   - reactor-block: always 'critical' (reactor-block.js, two findings.push
//     call sites, both 'critical'). New rule — faithful CLI port of the MCP
//     server's VIBE-002 (ReactorBlockingCallRule.java), plus a Reactor-import
//     file gate the Java original doesn't have. Motivating case: README.md
//     "Found in the Wild" Finding 2, FileContentSearchService.java
//     (eugenp/tutorials), .block() inside .map() on a Schedulers.parallel()
//     worker — a shape blocking.js does not detect (no @Scheduled/@Async/
//     @EventListener/@KafkaListener annotation present). Measured in
//     verify/reactor-block: that shape throws IllegalStateException on every
//     call instead of holding the worker.
//   - transactions: 'critical' (transactions.js:35) and 'major'
//     (transactions.js:23) — the only mixed-severity rule id today.
export const RULE_CATALOG = {
  blocking: {
    short: 'Blocking calls detected inside asynchronous execution contexts.',
    full: 'Detects Thread.sleep(), .join(), .block()/.blockFirst()/.blockLast() and Future.get() inside methods annotated @Async, @Scheduled or @EventListener (@KafkaListener is reported as blocking-kafka). Blocking there pins a thread of the executor/scheduler pool and can exhaust it under load. Future.get() is only matched on a receiver this same file declares with a Future type (Future, CompletableFuture, ListenableFuture, ...) or on CompletableFuture.xxxAsync(...).get(); a bare .get() is not, to avoid Optional.get()/Map.get() false positives, so Futures declared in another file are not detected. Timed get(timeout, unit) is not flagged. A call under several anchors is reported once, naming all of them. Severity is critical, except WARNING for a call whose only anchor is @Async when the module\'s base application.properties / application.yml sets spring.threads.virtual.enabled=true and no other config file or profile sets it otherwise (measured: with virtual threads the default @Async executor did not saturate). Set only in a profile, by a placeholder, or not determinable: critical.',
    severities: ['critical', 'warning'],
    evidence: {
      kind: 'measured',
      results: [
        {
          lab: 'java-vibe-guard verify/blocking — @Async',
          // Pre-registered experiment (PREREGISTRATION.md at a809b2c), results at c4e5ddd:
          // all criteria (a)-(e) met. Capacity and queue growth only: latencies grow with
          // the window (unbounded queue), so no absolute latency is quoted.
          text: "on Spring Boot's default @Async executor (8 platform threads, unbounded queue), a call that holds the thread caps throughput at threads / call duration: 39.9-40.0 tasks/s with 8 threads, 79.8 with 16. Above that the queue grows at (load - capacity) and 98-99.5% of latency is queue wait; the same call without holding the thread did not queue. With virtual threads enabled (spring.threads.virtual.enabled=true) the executor did not saturate",
          source: 'https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c4e5ddd/cli/verify/blocking/results/criteria.md#L7-L38',
        },
      ],
      // Not measured: same mechanism, other pools.
      mechanism: { scope: '@Scheduled, @EventListener', text: 'the call holds a thread of the scheduler / event pool for its whole duration; under load the pool saturates' },
    },
  },
  'blocking-kafka': {
    short: 'Blocking calls detected inside @KafkaListener methods.',
    full: 'Detects blocking calls inside @KafkaListener-annotated methods, which delays offset commits and can trigger a consumer group rebalance under broker latency or failure.',
    severities: ['critical'],
    evidence: {
      kind: 'measured',
      results: [
        {
          lab: 'java-vibe-guard verify/blocking-kafka — @KafkaListener',
          // Pre-registered experiment (PREREGISTRATION.md at 8cb235b), results at a6f32ef:
          // criteria (0), (a)-(h) met; deviations 1-2 in DEVIATIONS.md. The threshold is given
          // in general form; the 10 s max.poll.interval.ms of the runs is an accelerated setup.
          text: 'the damage appears only when max.poll.records x time per record > max.poll.interval.ms (with the defaults, 500 records and 300 s: more than 600 ms per record). Above it, in an accelerated setup (max.poll.interval.ms lowered to 10 s), the consumer left the group on every batch, every offset commit failed and the group entered a reprocessing loop: 0 records/s committed, each record delivered ~10 times. Below it, the same blocking call caused no measured damage: no rebalances, no duplicates, throughput = consumers / time per record. Measured on kafka-clients 3.6.2, classic group protocol with eager rebalancing, spring-kafka AckMode BATCH; the cooperative protocol, KIP-848 and AckMode RECORD were not measured',
          source: 'https://github.com/Joaquinriosheredia/java-vibe-guard/blob/a6f32ef/cli/verify/blocking-kafka/results/criteria.md#L7-L47',
        },
      ],
    },
  },
  kafka: {
    short: 'Kafka listener, consumer group, and Zookeeper configuration issues.',
    full: 'Flags Kafka usage issues: Zookeeper-based configuration deprecated in Kafka 3.x, @KafkaListener without an explicit groupId, listeners without retry/DLQ handling, and consumer configuration missing group.id.',
    severities: ['warning'],
    evidence: { kind: 'mechanism', text: 'without groupId each restart may join a new group and reprocess; without @RetryableTopic/DLQ a failing record is retried or dropped with no dead-letter path' },
  },
  'kafka-send-timeout': {
    short: 'Kafka send() result consumed with an unbounded blocking get().',
    full: 'Detects a `.send(...).get()` chain with no timeout argument, in a file that imports KafkaTemplate or org.springframework.kafka — `.get(timeout, TimeUnit)` calls with an explicit timeout argument are not matched. An unbounded .get() blocks the calling thread indefinitely if the broker is slow or unavailable, risking thread-pool exhaustion under sustained failure — the same shape as Java-Production-Labs SagaOrderService.java and StreamController.java before they were fixed to use .get(timeout, TimeUnit).',
    severities: ['critical'],
    evidence: {
      kind: 'measured',
      results: [
        {
          lab: 'Java Production Lab #05 — Saga',
          // Benchmark 727f42c (2026-05-15) ran before 01cee18 (2026-06-06) added a timeout:
          // it measured the untimed send().get() this rule detects.
          text: 'Kafka stopped mid-load: 35 of 50 requests failed (HTTP 000 timeouts while blocked on send().get(), or HTTP 500)',
          source: 'https://github.com/Joaquinriosheredia/Java-Production-Labs/blob/727f42c/05_saga_pattern/benchmark/results/summary.md#L53-L67',
        },
        {
          lab: 'Java Production Lab #08 — Kafka Streams',
          // Benchmark 3e60592 (2026-05-21) ran before dcb0358 (2026-06-06) added a timeout.
          text: 'Kafka stopped during load: 24 of 40 requests failed or timed out (60%); probe request hung until the 15 s client timeout',
          source: 'https://github.com/Joaquinriosheredia/Java-Production-Labs/blob/3e60592/08_kafka_streams/benchmark/results/summary.md#L64-L86',
        },
      ],
    },
  },
  layers: {
    short: 'Architectural layering violations.',
    full: 'Detects a Controller calling a Repository directly, bypassing the Service layer, eroding the transactional and validation boundary the layered architecture is meant to enforce.',
    severities: ['major'],
    evidence: { kind: 'mechanism', text: 'the Service layer\'s transactional, validation and caching boundary is bypassed' },
  },
  observability: {
    short: 'Missing structured logging on request-handling endpoints.',
    full: 'Detects endpoints that lack structured logging, reducing the ability to trace and diagnose request behavior in production.',
    severities: ['warning'],
    evidence: { kind: 'mechanism', text: 'requests through the endpoint leave no structured log line to trace in production' },
  },
  'reactor-block': {
    short: 'Reactive blocking call (.block()/.blockFirst()/.blockLast()/.toFuture().get()) inside a Spring bean.',
    full: 'Detects .block(), .blockFirst(), .blockLast(), or .toFuture().get() inside a class annotated @RestController, @Service, or @Component, in a file that imports reactor.core.publisher — the CLI port of the MCP server\'s VIBE-002 (ReactorBlockingCallRule). Excludes @Test, @PostConstruct, and main() methods. Measured for .block() on a Reactor thread, both on a Schedulers.parallel() worker (README "Found in the Wild" Finding 2 shape, FileContentSearchService.java, eugenp/tutorials) and on the Netty event loop (a WebFlux handler): it does not pin the thread; Reactor throws IllegalStateException on every call, so every request through that path fails (HTTP 500) at any load, as soon as the path runs (tests that run it fail too). Measured for .toFuture().get() in a WebFlux handler, with the WebClient on the server\'s event loops (Spring Boot\'s default): every such request deadlocks (no response, never sent downstream; 15/15 runs); once all event loops are held, the rest of the server stops too (cli/verify/reactor-block/replication). Not reported (measured not to stall any Reactor thread, same experiment, variants A4 and C): a .block() inside Mono/Flux.fromCallable/fromSupplier/fromRunnable moved with .subscribeOn(Schedulers.boundedElastic()) and no publishOn (a bounded pool, whose capacity is threads / call duration), and a plain .block() statement in a @RestController of a module whose build file declares Spring MVC and not WebFlux (it runs on the servlet worker). .blockFirst()/.blockLast()/.toFuture().get() in those shapes are still reported.',
    severities: ['critical'],
    evidence: {
      kind: 'measured',
      results: [
        {
          lab: 'java-vibe-guard verify/reactor-block — .block() on Schedulers.parallel()',
          // Pre-registered experiment (PREREGISTRATION.md at 51fde79), results at c934bd7:
          // variant A2 met H2 (criterion (d) at every load), (0), (e)-B and (f) met. A1 (event
          // loop) and A3 (.toFuture().get()) fit neither hypothesis as pre-registered, so they
          // keep the documented mechanism below (DEVIATIONS.md 4 for A1).
          text: 'a .block() on a Schedulers.parallel() worker (the README "Found in the Wild" Finding 2 shape: .block() inside .map() after subscribeOn(Schedulers.parallel())) does not hold the thread: Reactor throws IllegalStateException ("block()/blockFirst()/blockLast() are blocking, which is not supported in thread parallel-N") on every call, so 100% of the requests through that path failed with HTTP 500 at every load measured (10, 50 and 400 requests/s), not only under load; the workers were not held (0-0.9% of their samples inside blockingGet) and other work on them was not delayed. Measured on Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18',
          source: 'https://github.com/Joaquinriosheredia/java-vibe-guard/blob/c934bd7/cli/verify/reactor-block/results/criteria.md#L32-L46',
        },
        {
          lab: 'java-vibe-guard verify/reactor-block replication — .block() on the Netty event loop',
          // Pre-registered replication (replication/PREREGISTRATION.md at f606904), results at
          // 1052498: A1 met H2 at every load, counted on the generator alone (no cross-process
          // clock alignment); (0), (e)-B and (f) met. The first experiment's A1 data stay
          // exploratory (#20, DEVIATIONS.md 4).
          text: 'a .block() on the Netty event loop (in a WebFlux handler) does not hold the event loop either: Reactor throws IllegalStateException ("block()/blockFirst()/blockLast() are blocking, which is not supported in thread reactor-http-epoll-N") on every call, so 100% of the requests through that path failed with HTTP 500 at every load measured (10, 50 and 400 requests/s); the event loops were not held (0-0.6% of their samples inside blockingGet) and other requests on them were not delayed. Measured on Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18 (native epoll)',
          source: 'https://github.com/Joaquinriosheredia/java-vibe-guard/blob/1052498/cli/verify/reactor-block/replication/results/criteria.md#L15-L25',
        },
        {
          lab: 'java-vibe-guard verify/reactor-block replication — .toFuture().get() on the Netty event loop',
          // Pre-registered replication, results at 1052498: A3 met H3 (H3a, H3b, H3c; H3c at its
          // threshold, 3 of 15 runs), (0), (e)-B and (f) met. H3 was formulated from #20's data,
          // as the pre-registration states.
          text: 'a .toFuture().get() in a WebFlux handler, with the WebClient on the server\'s event loops (Spring Boot\'s default shared resources), deadlocked every request: in 15/15 runs (10, 50 and 400 requests/s) 0 responses succeeded and the downstream did not receive a single request - the request never left the app. When all 4 event loops were held (every run at 400 requests/s), the rest of the server stopped too. The pre-registered minimum for the same deadlock with event loops still free was met exactly at its threshold (3/15 runs with 2 of 4 loops held while requests that block nothing on new connections were still served). Measured on Spring Boot 3.2.5, reactor-core 3.6.5, reactor-netty 1.1.18 (native epoll), OpenJDK 21; a WebClient with its own LoopResources was not measured',
          source: 'https://github.com/Joaquinriosheredia/java-vibe-guard/blob/1052498/cli/verify/reactor-block/replication/results/criteria.md#L27-L48',
        },
      ],
    },
  },
  transactions: {
    short: '@Transactional placed on a Controller method, or combined with @Async.',
    full: 'Detects two @Transactional misuses, per transactions.js: (1) @Transactional on a method inside a class annotated @RestController or @Controller — the transaction boundary belongs in the Service layer instead; and (2) @Transactional and @Async annotated near the same method — Spring\'s proxy-based transaction propagation does not carry over onto the @Async-dispatched thread, so the transaction silently does not apply there.',
    severities: ['critical', 'major'],
    evidence: { kind: 'mechanism', text: 'Spring\'s proxy-based transaction does not propagate to the @Async thread; on a Controller the transaction boundary sits in the web layer' },
  },
};
