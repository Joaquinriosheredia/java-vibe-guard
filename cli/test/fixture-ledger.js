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
  // 2026-10-09: @Async anchors only when it is Spring's. Fully qualified, no import → 1.
  'BlockingQualifiedSpringAsyncProbe.java':       { blocking: { critical: 1 } },
  'KafkaSendTimeoutTruePositive.java':            { 'kafka-send-timeout': { critical: 2 } },
  'KafkaTruePositive.java':                       { kafka: { warning: 2 } },
  // 0 layers findings. Its observability warning is in OPT_IN_LEDGER (opt-in since 2.4.0).
  'LayersTruePositive.java':                      { layers: { major: 1 } },
  // 0a dedup probe. 2.4.0: reactor-block does not report an @Async method when the tree
  // has @EnableAsync (this whole-tree scan has it), so the Mono.block() is reported once,
  // under blocking (@Async anchor), plus the separate Thread.sleep(): 2 blocking.
  // Was { blocking: 1, reactor-block: 1 } before 2.4.0.
  'ReactorBlockAsyncDuplicateProbe.java':         { blocking: { critical: 2 } },
  // 2.4.0 dedup: @Scheduled .block() kept as blocking CRITICAL (reactor-block WARNING
  // dropped); .block() in an operator callback kept as reactor-block CRITICAL.
  'ReactorBlockScheduledDuplicateProbe.java':     { blocking: { critical: 1 }, 'reactor-block': { critical: 1 } },
  // 2.4.0 (Phase 1 (c), decision of 2026-10-14: "reclassify only if the fixture has no
  // evidence of a Reactor thread"): 4 critical -> 4 warning. The four calls are plain
  // statements of @Service methods; the file shows no operator callback, WebFlux
  // handler, ServerRequest/ServerWebExchange or subscribeOn(parallel()). The rule changed,
  // not the expectation of a test: see DECISIONS.md (2026-10-14) and the CHANGELOG.
  'ReactorBlockTruePositive.java':                { 'reactor-block': { warning: 4 } },
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
  // 2.4.0 thread context (Phase 1 (c)): CRITICAL only with evidence of a Reactor thread.
  //  - MvcService: 1 critical -> 1 warning (approved reclassification: a plain statement of
  //    a @Service, no evidence).
  //  - MvcController: 3 critical -> 1 critical + 2 warnings. Kept: the operator callback
  //    after subscribeOn(parallel()). Warnings: .toFuture().get() and .blockFirst() as
  //    plain statements of an MVC-only handler (the servlet worker, not a Reactor thread).
  //  - ReactiveController: 4 critical -> 2 critical + 2 warnings. Kept: the WebFlux
  //    handler statement and fromCallable on parallel(). Warnings: the fromCallable on
  //    boundedElastic with publishOn, and with .blockFirst(): the callable runs on
  //    boundedElastic, so no evidence of an event-loop or parallel thread.
  //  These two were not in the design's table; approved by Joaquín on 2026-10-14 (vibe-guard
  //  DECISIONS.md, 2026-10-14 (2)): they follow the approved principle, critical only with
  //  evidence of a Reactor thread, against the two measured controls of verify/reactor-block:
  //  variant C (an MVC-only handler runs on the servlet worker, not a Reactor thread) and
  //  variant A4 (a fromCallable moved with subscribeOn(boundedElastic()) runs on
  //  boundedElastic). .toFuture().get()/.blockFirst()/publishOn were not measured in those
  //  shapes, so they are reported, as warnings, and not skipped.
  'reactor-block-precision/both/src/main/java/demo/MixedController.java':        { 'reactor-block': { critical: 1 } },
  'reactor-block-precision/mvc-only/src/main/java/demo/MvcController.java':      { 'reactor-block': { critical: 1, warning: 2 } },
  'reactor-block-precision/mvc-only/src/main/java/demo/MvcService.java':         { 'reactor-block': { warning: 1 } },
  'reactor-block-precision/webflux/src/main/java/demo/ReactiveController.java':  { 'reactor-block': { critical: 2, warning: 2 } },
  // reactor-block thread context (2.4.0): one fixture per CRITICAL path, per exclusion and
  // per unknown-thread shape (comments in each file). blocking.js keeps its own anchors:
  // @Async (AsyncWorker) and @EventListener (StartupEventListener, two methods).
  'reactor-block-context/webflux/src/main/java/demo/OperatorService.java':      { 'reactor-block': { critical: 7, warning: 6 } },
  'reactor-block-context/webflux/src/main/java/demo/HandlerController.java':    { 'reactor-block': { critical: 3, warning: 1 } },
  'reactor-block-context/webflux/src/main/java/demo/RouterHandlers.java':       { 'reactor-block': { critical: 2 } },
  'reactor-block-context/webflux/src/main/java/demo/StartupRunner.java':        { 'reactor-block': { warning: 1 } },
  'reactor-block-context/webflux/src/main/java/demo/StartupLifecycle.java':     { 'reactor-block': { warning: 1 } },
  'reactor-block-context/webflux/src/main/java/demo/StartupReadyListener.java': { 'reactor-block': { warning: 1 } },
  'reactor-block-context/webflux/src/main/java/demo/AsyncWorker.java':          { blocking: { critical: 1 } },
  // test-corpus-2 (FP-ANALYSIS.md, J053): a lone synchronous @EventListener of a start-up
  // event (here ApplicationReadyEvent, in the annotation and as the parameter) blocks only
  // the start-up thread -> blocking WARNING with the reason. Was { blocking: { critical: 2 } }.
  'reactor-block-context/webflux/src/main/java/demo/StartupEventListener.java': { blocking: { warning: 2 } },
  // 0 from async-returns-pending-future (opt-in, see OPT_IN_LEDGER); the join() of n15 is a
  // true positive of blocking.
  'async-pending-future/base/src/main/java/demo/NotMarkedShapes.java':       { blocking: { critical: 1 } },
  // 2.3.0: @Async counts only with @EnableAsync in the scanned tree. This whole-tree scan has
  // it (EnableAsyncConfig.java, enable-async/config/, ...), so the join() is reported; scanned
  // alone, the file gives 0 (contract.test.js, "@EnableAsync in the scanned tree").
  'enable-async/AsyncWork.java':                                              { blocking: { critical: 1 } },
  // Expected to produce zero findings (listed for completeness, not required):
  // BlockingAnomalouslyLongMethodProbe, BlockingFalsePositive,
  // BlockingWindowCommentProbe, BlockingWindowMisattributionProbe (0a: their
  // listeners now carry @RetryableTopic, so kafka.js's DLQ check no longer
  // adds 3 incidental warnings — they produce 0 findings from any rule),
  // BlockingFutureGetFalsePositive, BlockingJcabiAsyncFalsePositive (2026-10-09),
  // CommentMentionGateProbe, KafkaFalsePositive,
  // KafkaSendTimeoutFalsePositive, ObservabilityFalsePositive,
  // ReactorBlockFalsePositive, TransactionsBlockCommentGateProbe,
  // TransactionsFalsePositive, and (2.4.0) reactor-block-context StartupAppRunner,
  // StartupRefreshedListener and AsyncConfig.
};

// Opt-in rules (not in the default set, 2.3.0): expected findings of `--rule <id>` on the
// same whole directory. async-returns-pending-future (B0 v1, design approved 2026-10-06):
// M1-M8 and M10 reported; M9 (nested form between two beans) and N5 (the measured shape P)
// are v2 and stay 0 here on purpose (OrderService, PnNotProvable, VtService.m9, CeService.m9).
// M2 over M8 (allOf(...).thenApply(...)) reported since 2026-10-09: 8 -> 9. Opt-in since
// 2.3.0 (b0-corpus audit: 7 findings < 20), so these moved out of FIXTURE_LEDGER: 67 -> 53
// (54 with enable-async/AsyncWork.java, added the same day).
// observability: opt-in since 2.4.0 (noise: 3,856 warnings in YunaiV/ruoyi-vue-pro, vibe-guard
// audit trial of 2026-10-12). Its 3 warnings moved out of FIXTURE_LEDGER unchanged: 54 -> 51.
// The LayersFalsePositive warning is a true positive of observability.js: getUsers() has no
// logging (0 layers findings there).
export const OPT_IN_LEDGER = {
  observability: {
    'LayersFalsePositive.java':       { observability: { warning: 1 } },
    'LayersTruePositive.java':        { observability: { warning: 1 } },
    'ObservabilityTruePositive.java': { observability: { warning: 1 } },
    // 2.4.0 reactor-block context fixture: its three @GetMapping handlers have no logging.
    'reactor-block-context/webflux/src/main/java/demo/HandlerController.java': { observability: { warning: 3 } },
  },
  'async-returns-pending-future': {
    'async-pending-future/base/src/main/java/demo/ReportService.java':         { 'async-returns-pending-future': { critical: 9 } },
    'async-pending-future/base/src/main/java/demo/SelfInjectedService.java':   { 'async-returns-pending-future': { critical: 2 } },
    'async-pending-future/virtual-threads/src/main/java/demo/VtService.java':  { 'async-returns-pending-future': { warning: 2 } },
    'async-pending-future/custom-executor/src/main/java/demo/CeService.java':  { 'async-returns-pending-future': { critical: 1 } },
    'enable-async/AsyncWork.java':                                              { 'async-returns-pending-future': { critical: 1 } },
  },
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
