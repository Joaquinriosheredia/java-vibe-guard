// Shared rule catalog — one object, two consumers (sarif.js's `rules` array
// and --explain). Content is curated by hand from reading each rule's
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
// staying in sync automatically. Evidence for the seven values below:
//   - blocking / blocking-kafka: always 'critical' (blocking.js:49, one
//     shared findings.push call site for both rule ids).
//   - kafka: always 'warning' (kafka.js:22,51,62,80 — all four call sites).
//   - kafka-send-timeout: always 'critical' (kafka.js:154, single call
//     site). New rule, evidence: Java-Production-Labs SagaOrderService.java:45
//     (commit 01cee18) and StreamController.java:53 (commit dcb0358).
//   - layers: always 'major' (layers.js:28,38).
//   - observability: always 'warning' (observability.js:54).
//   - transactions: 'critical' (transactions.js:35) and 'major'
//     (transactions.js:23) — the only mixed-severity rule id today.
export const RULE_CATALOG = {
  blocking: {
    short: 'Blocking calls detected inside asynchronous execution contexts.',
    full: 'Detects blocking calls (Thread.sleep, .get(), blocking I/O) inside @Async-annotated methods, which negates the concurrency benefit of asynchronous execution and can exhaust the underlying executor thread pool under load.',
    severities: ['critical'],
  },
  'blocking-kafka': {
    short: 'Blocking calls detected inside @KafkaListener methods.',
    full: 'Detects blocking calls inside @KafkaListener-annotated methods, which delays offset commits and can trigger a consumer group rebalance under broker latency or failure.',
    severities: ['critical'],
  },
  kafka: {
    short: 'Kafka configuration and listener anti-patterns.',
    full: 'Flags Kafka usage issues: Zookeeper-based configuration deprecated in Kafka 3.x, @KafkaListener without an explicit groupId, listeners without retry/DLQ handling, and consumer configuration missing group.id.',
    severities: ['warning'],
  },
  'kafka-send-timeout': {
    short: 'Kafka send() result consumed with an unbounded blocking get().',
    full: 'Detects a `.send(...).get()` chain with no timeout argument, in a file that imports KafkaTemplate or org.springframework.kafka. An unbounded .get() blocks the calling thread indefinitely if the broker is slow or unavailable, risking thread-pool exhaustion under sustained failure — the same shape as Java-Production-Labs SagaOrderService.java and StreamController.java before they were fixed to use .get(timeout, TimeUnit).',
    severities: ['critical'],
  },
  layers: {
    short: 'Architectural layering violations.',
    full: 'Detects a Controller calling a Repository directly, bypassing the Service layer, eroding the transactional and validation boundary the layered architecture is meant to enforce.',
    severities: ['major'],
  },
  observability: {
    short: 'Missing structured logging on request-handling endpoints.',
    full: 'Detects endpoints that lack structured logging, reducing the ability to trace and diagnose request behavior in production.',
    severities: ['warning'],
  },
  transactions: {
    short: 'Transactional-boundary and rollback anti-patterns.',
    full: 'Detects @Transactional methods with missing rollback configuration or blocking calls made while holding a database transaction open, either of which can exhaust the connection pool or cause silent data loss under failure.',
    severities: ['critical', 'major'],
  },
};
