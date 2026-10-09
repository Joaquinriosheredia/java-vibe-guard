# Audit — `async-returns-pending-future` on the extended corpus

Pre-registration: `PREREGISTRATION.md` (`bcc691c`, 2026-10-09 18:20 +02:00). Scripts
`d6928f3` (18:20); search hits and pinned corpus `cd85e78` (18:58), before the run. Rule
code: `cli/` identical to `a0ebd4d` (checked with `git diff a0ebd4d cd85e78 -- cli/`).
No departure from the pre-registration (no `DEVIATIONS.md`).

## Selection and run

| | |
|---|---|
| Search | 5 size slices; `total_count` 109 / 2,784 / 3,168 / 3,256 / 2,944; 4,734 hits read (API cap 1,000 per slice) |
| Candidates | 3,040 repositories; 3,039 eligible (the 1 excluded: `eugenp/tutorials`, already in validate-public; no fork, none inaccessible) |
| Corpus | the 50 with most stars (60,285 → 114), pinned in `corpus.json` |
| Run | 50/50 fetched and scanned, 0 errors; 102,974 files |
| Findings | **7**, in 4 repositories; all CRITICAL, all form **M1**, all in main sources |

## Every finding, by hand

| # | Location (pinned commit) | Form | Verdict | Reason |
|---|---|---|---|---|
| 1 | `Bytedesk/bytedesk@1a8d18f` `modules/kbase/…/llm_website/service/WebsiteCrawlerService.java:82` | M1 `supplyAsync(…, crawlExecutor)` | **TP** | Spring `@Async`; `@Service`; `@EnableAsync` (`core/config/AsyncExecutorConfig.java:32`), proxy mode; the future is a whole site crawl on another executor, pending at the return. Severity note below |
| 2 | `cBioPortal/cbioportal@60bca6b` `src/main/java/org/cbioportal/legacy/service/util/CoExpressionAsyncMethods.java:60` | M1 `supplyAsync(() -> coExpression)` | **TP** | Spring `@Async`; `@Component`, injected into `CoExpressionServiceImpl` (through the proxy); `@EnableAsync` (`application/AsyncConfig.java:15`), platform-thread pool unless virtual threads are on. Pending at the return (submitted to the common pool). Impact note below |
| 3 | `nysenate/OpenLegislation@f672f9c` `src/main/java/gov/nysenate/openleg/common/util/AsyncUtils.java:19` | M1 `runAsync(runnable, executor)` | **TP** | Spring `@Async`; `@Service`; `@EnableAsync` (`config/WebApplicationConfig.java:35`). `executor` is `openlegAsync`, **the same pool** `getAsyncExecutor()` gives `@Async` (`ApplicationConfig.java:82`, 8 core threads, unbounded queue): the outer task waits in `get()` for an inner task queued on its own pool — the nested form HN measured as a starvation deadlock. `ElasticBillSearchService.java:114` calls it in a loop. The rule reports only the saturation message (it cannot see the executor identity): the message understates, it does not overstate |
| 4 | `osmandapp/OsmAnd-tools@5ce78b6` `java-tools/OsmAndServer/…/search/SearchTestService.java:239` | M1 | **FP** | No `@EnableAsync` anywhere in the repository (`Application.java` has `@EnableScheduling` only; no `AsyncConfigurer`, no `<task:annotation-driven>`): `@Async` is inert, no interceptor calls `get()`. Criterion 2 fails |
| 5 | same file `:817` | M1 | **FP** | same |
| 6 | same file `:839` | M1 | **FP** | same |
| 7 | same file `:916` | M1 | **FP** | same |

U (undetermined): 0.

## Metrics

| | Value | Wilson 95 % |
|---|---|---|
| Findings | 7 (TP 3, FP 4, U 0) | |
| Precision, primary TP / (TP + FP + U) | **3/7 = 43 %** | 16 %–75 % |
| Precision, secondary TP / (TP + FP) | 3/7 = 43 % | 16 %–75 % |

Per repository: Bytedesk 1 (TP), cBioPortal 1 (TP), OpenLegislation 1 (TP),
OsmAnd-tools 4 (FP). The four FPs are one cause in one file.

**Decision rule:** 7 < 20 → the pre-registered consequence is the opt-in branch
(only with `--rule`, outside the default set; README and `--explain` say precision is not
measured outside the fixtures; 2.3.0). With n = 7 the interval is too wide to be a
published precision figure.

## Notes (not part of the pre-registered metric)

- **Severity, finding 1:** the app's `@Async` executor is
  `Executors.newVirtualThreadPerTaskExecutor()` (`AsyncExecutorConfig.getAsyncExecutor()`),
  and the starter sets `spring.threads.virtual.enabled=true`. The experiment measured no
  saturation with virtual threads (criterion f), so CRITICAL overstates; WARNING would fit.
  The rule's criterion looks only at the finding's module (`modules/kbase`, no config),
  so by the pre-registered criterion 4 it is a TP. Under a stricter reading (severity must
  match the app's real executor), precision would be 2/7 (8 %–64 %).
- **Impact, finding 2:** the supplier only returns an already computed object; the
  executor thread is held in `get()` for that trivial task. The shape is the rule's, the
  practical effect is negligible. Under a reading that requires a non-trivial wait, 1/7.
- **Cause of the FPs, exploratory:** the rule does not check that `@EnableAsync` (or
  `<task:annotation-driven>`) exists in the scanned tree. Adding that check would remove
  findings 4-7; that is a post-hoc fix and its effect here is not a measured precision.
- **Coverage:** 50 repositories with Spring `@Async` and `CompletableFuture` in the same
  file produced 7 findings; the corpus does not measure false negatives (N5 and M9 are
  out of v1 by design).
