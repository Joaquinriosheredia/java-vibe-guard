# Pre-registration — `async-returns-pending-future` (B0 v1) precision on an extended corpus

Committed before any search, selection or run. Frozen after this commit; departures go to
`DEVIATIONS.md` in this directory (original text, new text, what was observed, when).

## Question

What fraction of the findings of `async-returns-pending-future` in real Spring projects
are correct? The validate-public corpus (`validation/repos.json`) contains no instance of
the pattern (0 findings, 25 `@Async` methods reviewed by hand, 2026-10-07), so it cannot
answer this.

## Rule under test

java-vibe-guard branch `phase3/b0-detection-v1`, commit `a0ebd4d` (M1-M8, M2 over M8,
M10). The precision reported is the precision of that commit. If the audit shows a defect,
any fix is a later change; its effect on this corpus is reported as exploratory, never as
the measured precision.

## Corpus selection (fixed before looking at any result)

1. **Search:** GitHub REST code search (`GET /search/code`), query string exactly

   ```
   org.springframework.scheduling.annotation.Async CompletableFuture language:Java
   ```

   The API returns at most 1,000 hits per query, so the query is run in five slices by
   file size, each appended to the string above: `size:<1500`, `size:1500..2999`,
   `size:3000..5999`, `size:6000..11999`, `size:>=12000`. Every page of every slice is
   read (100 per page). The raw hits (repository, path, slice) are saved to
   `search-hits.json`, with `total_count` per slice and the UTC time of the search.
2. **Candidates:** the distinct repositories of all hits.
3. **Exclusions (only these):** forks; `eugenp/tutorials` and
   `spring-projects/spring-petclinic` (already in validate-public); repositories owned by
   `Joaquinriosheredia`. Archived repositories are kept.
4. **Order:** `stargazers_count` (from `GET /repos/{owner}/{repo}`, read at selection
   time) descending; ties by `full_name` ascending.
5. **N = 50:** the first 50 repositories in that order.
6. **Pinned commit:** the SHA of each repository's default branch at selection time
   (`GET /repos/{owner}/{repo}/commits/{default_branch}`). Saved, with the stars and the
   default branch, to `corpus.json`. That file is the corpus; the search is not re-run.
7. A repository that cannot be fetched or scanned is recorded with its error and **not
   replaced**.

Known limits of the selection, stated in the results: code search ranks by relevance and
caps each slice at 1,000 hits, so "the 50 with most stars" means among the repositories
the search returned, not among all of GitHub; the code-search index is not exhaustive.

## Run

For each repository in `corpus.json`: shallow fetch of the pinned commit (the
validate-public `fetch-repo.js`, which checks `HEAD` equals the pinned SHA), then

```
node cli/bin/cli.js <checkout> --rule async-returns-pending-future --json
```

(the CLI as a user runs it: default ignored directories, suppressions and baseline, test
sources included). Output saved per repository to `results/<owner>__<repo>.json`.
`run.mjs` and `select.mjs` are committed before the selection and the run.

## Audit (by hand, every finding, no sampling)

Each finding is classified from the source at the pinned commit:

- **TP** when all of these hold:
  1. the annotation is Spring's `@Async` and applies to the method (method or class level);
  2. the class is a Spring bean that a proxy can intercept: a stereotype annotation
     (`@Component`, `@Service`, `@Repository`, `@Controller`, `@RestController`,
     `@Configuration`), a `@Bean` method returning it, or another registration visible in
     the repository; `@EnableAsync` present somewhere in the repository; proxy mode (no
     `mode = AdviceMode.ASPECTJ`);
  3. the returned future is pending when the method returns, in the sense of the rule:
     its completion depends on work not finished at the `return` (another thread, I/O, a
     callback), so Spring's interceptor would wait in `get()` on the executor thread;
  4. the message's specific claims hold: the deadlock message only for a self-injected
     `@Async` call on the same default executor (no own executor in the module); WARNING
     only with virtual threads enabled as the rule's criterion says.
- **FP** when any of 1-4 is false.
- **Undetermined (U)** when the repository does not let 1-4 be decided (e.g. the bean
  registration or `@EnableAsync` lives outside the repository).

Each finding is recorded in `AUDIT.md` with: location, form (M1-M8, M2/M3 over another
form, M10), TP/FP/U and the reason, and whether it is in `src/test`.

## Metrics

- Findings: total, per form, per repository, main vs test sources.
- **Precision (primary):** TP / (TP + FP + U) — U counted against the rule.
- Precision (secondary): TP / (TP + FP), U excluded.
- Both with a Wilson 95 % interval. Per-repository counts are reported because findings
  may cluster in one repository.

## Outcome → consequences (decided by Joaquín on 2026-10-09, before this pre-registration)

- **At least 20 findings in total:** precision is reported as measured, and the proposal
  is to put the rule in the default set — a breaking change, version 3.0.0. No precision
  threshold was set in that decision: the report gives the number and its interval, and
  Joaquín decides.
- **Fewer than 20 findings:** the rule ships as opt-in (only with `--rule`), outside the
  default set; the README and `--explain` say its precision has not been measured outside
  the fixtures. Version 2.3.0.

Each consequence goes in its own commit / PR; none is applied in the audit commit.
