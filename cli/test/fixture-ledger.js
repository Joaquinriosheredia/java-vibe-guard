// Expected findings per fixture in cli/test-fixtures/, scanned as a whole
// directory with no vibeguard.config.json — the single source of truth for
// contract.test.js (Test 19), sarif-cli.test.js and baseline-cli.test.js.
//
// Why this exists: those three suites used to hardcode their own totals. They
// drifted (17 vs 28) when the A3.x probes were added and only contract.test.js
// was updated — and CI only ran contract.test.js, so nobody saw it.
//
// Rules for changing this file (0a): an entry may only change together with
// the fixture or rule change that justifies it, and the note says why. A
// *FalsePositive / *Probe fixture asserted to produce 0 findings for the rule
// it targets must keep 0 for that rule — if it starts firing, fix the rule or
// record it as a known false positive in the fixture header; never raise the
// number here to make a test pass. Findings from OTHER rules on a fixture are
// listed when they are true positives of that other rule (noted below).
//
// Shape: { '<path relative to test-fixtures/>': { '<ruleId>': { <severity>: count } } }
// A fixture missing from this map is expected to produce zero findings.
export const FIXTURE_LEDGER = {
  'BlockingAsyncEventListenerTruePositive.java': { blocking: { critical: 2 } }, // @Async + @EventListener anchors
  'BlockingDoubleAnchorProbe.java':               { blocking: { critical: 1 } }, // 0a: two anchors, one call → one finding naming both
  'BlockingFutureGetTruePositive.java':           { blocking: { critical: 4 } }, // 0a: typed Future.get() (local, field, var, chained)
  'BlockingModifiersGenericsThrowsProbe.java':    { blocking: { critical: 1 } },
  'BlockingMultiLineAnnotationProbe.java':        { blocking: { critical: 1 } },
  'BlockingNestedAnonClassProbe.java':            { blocking: { critical: 1 } },
  'BlockingStackedAnnotationBracesProbe.java':    { 'blocking-kafka': { critical: 1 } },
  'BlockingTruePositive.java':                    { blocking: { critical: 1 } },
  'KafkaBlockingProbe.java':                      { 'blocking-kafka': { critical: 1 } },
  'KafkaSendTimeoutTruePositive.java':            { 'kafka-send-timeout': { critical: 2 } },
  'KafkaTruePositive.java':                       { kafka: { warning: 2 } },
  // 0 layers findings; the observability warning is a true positive of
  // observability.js: getUsers() has no logging.
  'LayersFalsePositive.java':                     { observability: { warning: 1 } },
  'LayersTruePositive.java':                      { layers: { major: 1 }, observability: { warning: 1 } },
  'ObservabilityTruePositive.java':               { observability: { warning: 1 } },
  // 0a dedup: Mono.block() reported once (reactor-block, not also blocking);
  // the blocking finding is the separate Thread.sleep() on the next line.
  'ReactorBlockAsyncDuplicateProbe.java':         { blocking: { critical: 1 }, 'reactor-block': { critical: 1 } },
  'ReactorBlockTruePositive.java':                { 'reactor-block': { critical: 4 } },
  'TransactionsTruePositive.java':                { transactions: { critical: 1 } },
  'nested/module-a/OrderService.java':            { transactions: { critical: 1 } },
  'nested/module-b/OrderService.java':            { transactions: { critical: 1 } },
  // Phase 2 (2026-10-04): `blocking` → WARNING only for an @Async-only call in a module
  // whose base application.properties / application.yml sets
  // spring.threads.virtual.enabled=true and nothing else sets it otherwise.
  'virtual-threads/base-enabled/src/main/java/demo/AsyncService.java':     { blocking: { warning: 1 } },
  'virtual-threads/base-enabled-yml/src/main/java/demo/AsyncService.java': { blocking: { warning: 1 } },
  // Same enabled module: @Scheduled and @Async + @Scheduled stay CRITICAL (not
  // measured); blocking-kafka unchanged; the kafka DLQ warning is a true positive.
  'virtual-threads/base-enabled/src/main/java/demo/ScheduledJob.java':     { blocking: { critical: 2 }, 'blocking-kafka': { critical: 1 }, kafka: { warning: 1 } },
  // Conservative cases: stay CRITICAL.
  'virtual-threads/profile-only/src/main/java/demo/AsyncService.java':                  { blocking: { critical: 1 } },
  'virtual-threads/profile-document/src/main/java/demo/AsyncService.java':              { blocking: { critical: 1 } },
  'virtual-threads/disabled/src/main/java/demo/AsyncService.java':                      { blocking: { critical: 1 } },
  'virtual-threads/absent/src/main/java/demo/AsyncService.java':                        { blocking: { critical: 1 } },
  'virtual-threads/base-enabled-profile-disabled/src/main/java/demo/AsyncService.java': { blocking: { critical: 1 } },
  'virtual-threads/placeholder/src/main/java/demo/AsyncService.java':                   { blocking: { critical: 1 } },
  // reactor-block precision (verify/reactor-block A4 and C): measured-safe .block() shapes
  // skipped, every other call reported (see the comments in each fixture).
  'reactor-block-precision/both/src/main/java/demo/MixedController.java':        { 'reactor-block': { critical: 1 } },
  'reactor-block-precision/mvc-only/src/main/java/demo/MvcController.java':      { 'reactor-block': { critical: 3 } },
  'reactor-block-precision/mvc-only/src/main/java/demo/MvcService.java':         { 'reactor-block': { critical: 1 } },
  'reactor-block-precision/webflux/src/main/java/demo/ReactiveController.java':  { 'reactor-block': { critical: 4 } },
  // async-returns-pending-future (B0 v1, design approved 2026-10-06): M1-M8 and M10
  // reported; M9 (nested form between two beans) and N5 (the measured shape P) are v2 and
  // stay 0 here on purpose (OrderService, PnNotProvable, VtService.m9, CeService.m9).
  'async-pending-future/base/src/main/java/demo/ReportService.java':         { 'async-returns-pending-future': { critical: 8 } },
  'async-pending-future/base/src/main/java/demo/SelfInjectedService.java':   { 'async-returns-pending-future': { critical: 2 } },
  // 0 from async-returns-pending-future; the join() of n15 is a true positive of blocking.
  'async-pending-future/base/src/main/java/demo/NotMarkedShapes.java':       { blocking: { critical: 1 } },
  'async-pending-future/virtual-threads/src/main/java/demo/VtService.java':  { 'async-returns-pending-future': { warning: 2 } },
  'async-pending-future/custom-executor/src/main/java/demo/CeService.java':  { 'async-returns-pending-future': { critical: 1 } },
  // Expected to produce zero findings (listed for completeness, not required):
  // BlockingAnomalouslyLongMethodProbe, BlockingFalsePositive,
  // BlockingWindowCommentProbe, BlockingWindowMisattributionProbe (0a: their
  // listeners now carry @RetryableTopic, so kafka.js's DLQ check no longer
  // adds 3 incidental warnings — they produce 0 findings from any rule),
  // BlockingFutureGetFalsePositive, CommentMentionGateProbe, KafkaFalsePositive,
  // KafkaSendTimeoutFalsePositive, ObservabilityFalsePositive,
  // ReactorBlockFalsePositive, TransactionsBlockCommentGateProbe,
  // TransactionsFalsePositive.
};

export function ledgerTotals(ledger = FIXTURE_LEDGER) {
  const totals = { critical: 0, major: 0, warning: 0, info: 0, total: 0 };
  for (const byRule of Object.values(ledger)) {
    for (const bySeverity of Object.values(byRule)) {
      for (const [severity, count] of Object.entries(bySeverity)) {
        totals[severity] += count;
        totals.total += count;
      }
    }
  }
  return totals;
}

// Same shape as FIXTURE_LEDGER, built from a --json report of test-fixtures/.
// issue.location is "<relative path>:<line>", relative to the scanned dir.
export function breakdownFromJson(json) {
  const out = {};
  for (const { location, ruleId, severity } of json.issues) {
    const file = location.replace(/:\d+$/, '');
    out[file] ??= {};
    out[file][ruleId] ??= {};
    out[file][ruleId][severity] = (out[file][ruleId][severity] ?? 0) + 1;
  }
  return out;
}

// Human-readable differences between the ledger and an actual breakdown
// (empty array = exact match, per fixture, per rule, per severity).
export function diffAgainstLedger(actual, ledger = FIXTURE_LEDGER) {
  const lines = [];
  const files = new Set([...Object.keys(ledger), ...Object.keys(actual)]);
  for (const file of [...files].sort()) {
    const rules = new Set([...Object.keys(ledger[file] ?? {}), ...Object.keys(actual[file] ?? {})]);
    for (const rule of rules) {
      const severities = new Set([
        ...Object.keys(ledger[file]?.[rule] ?? {}),
        ...Object.keys(actual[file]?.[rule] ?? {}),
      ]);
      for (const severity of severities) {
        const want = ledger[file]?.[rule]?.[severity] ?? 0;
        const got = actual[file]?.[rule]?.[severity] ?? 0;
        if (want !== got) lines.push(`${file} ${rule}/${severity}: expected ${want}, got ${got}`);
      }
    }
  }
  return lines;
}
