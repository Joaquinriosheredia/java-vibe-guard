# Public Validation Contract (issue #4)

## Summary

Issue #4 found that the README's "Validation" section (17,137 files, 10
repos, 0 false positives) cites figures that no versioned artifact in the
repository can reproduce. `validation/results.md` — the only supporting
document — was never committed, only 1 of its 10 planned repos was
completed, and it validates the **MCP server's** `VIBE-00N` rules, not the
CLI's own rule set (`blocking`, `kafka`, `kafka-send-timeout`, `layers`,
`observability`, `transactions`, `reactor-block`, `blocking-kafka` — 8
rules as of the current catalog).

This document defines the contract for a new `npm run validate-public`
command (in `cli/`) *before* any implementation. It does not implement
anything. Open points are marked as recommendations, not decisions —
confirm them before implementation starts.

---

## 1. Repos in scope

**Already publicly cited:** README's "Found in the Wild" section draws all
3 of its worked examples from `eugenp/tutorials` (~35k stars) — a
monorepo with independent Spring Boot modules covering Kafka
(`spring-kafka`, `spring-kafka-2`), reactive (`spring-reactive-modules`),
and MVC/JHipster code. It's already the CLI's de facto reference project.

**What `validation/results.md` intended to cover:** it is a partial,
uncommitted report for the *MCP engine*, not the CLI. Its repo list
should be read only as "repos someone once thought were representative,"
not as a validated baseline — the report itself says 9 of its 10 rows are
`*Pendiente*`. For the record, it planned:

| # | Repo | Type |
|---|------|------|
| 1 | eugenp/tutorials (spring-kafka) | Kafka — **only one completed** |
| 2 | spring-projects/spring-kafka | Kafka |
| 3 | spring-cloud/spring-cloud-stream-samples | Kafka |
| 4 | hantsy/spring-reactive-sample | WebFlux |
| 5 | eugenp/tutorials (spring-reactive-modules) | WebFlux |
| 6 | macrozheng/mall-swarm (gateway) | WebFlux |
| 7 | macrozheng/mall | JPA |
| 8 | spring-projects/spring-petclinic | MVC |
| 9 | dyc87112/SpringBoot-Learning | MVC |
| 10 | ityouknow/spring-boot-examples | JPA |

**Recommendation:** start with just `eugenp/tutorials` (required, already
cited, diverse submodules in one place) plus `spring-projects/spring-petclinic`
(official Spring sample, small, low-churn — good stability anchor). Treat
the rest of the `results.md` list as a candidate pool for later expansion,
each added deliberately, not inherited wholesale. This mirrors issue #4's
own proposal: "even if it initially covers only a small number of
repositories."

---

## 2. Fixed commits/tags vs. moving branches

| | Pinned commit/tag | Moving branch (e.g. `main` HEAD) |
|---|---|---|
| Reproducibility | Exact — same input, same output, forever | Broken — output can change with no local change |
| Maintenance | Needs a deliberate, occasional "bump" PR | Zero — always current |
| Failure mode | Repo/commit could vanish (force-push, deletion) | Silent drift — a finding-count change could be upstream code changing, not a CLI regression |

**Recommendation:** pin exact commit SHAs (tags where the upstream repo
tags releases, SHA otherwise), stored in a versioned manifest, e.g.
`validation/repos.json`, checked into the repo. Bumping a pin is a
conscious, reviewed change — not something that happens as a side effect
of upstream activity. This directly enables the reproducibility criterion
in §5.

This is a recommendation, not a closed decision — confirm before
implementation.

**Open question — update cadence not yet defined:** this contract
recommends *what* to pin, but not *when* the manifest should be bumped.
At least two triggers are possible and they're not equivalent:

- **Reactive:** bump a repo's pin only when a rule change could plausibly
  affect its findings (i.e. tied to a CLI rule change), so a bump is
  always explainable by a specific diff.
- **Discretionary/periodic:** bump at the maintainer's discretion (e.g.
  a scheduled quarterly refresh) to keep pins from going stale relative
  to upstream, independent of whether any rule changed.

These have different implications: reactive bumps keep every pin change
traceable to a cause, but let repos drift arbitrarily far from upstream
HEAD over time; periodic bumps keep repos current but can introduce
finding-count changes unrelated to any CLI change, which then need to be
triaged as "expected drift" vs. "regression." **This must be decided
before implementation** — it's not implicit in "pin commits."

---

## 3. Artifacts produced

Two layers, both under `validation/` (which already exists, currently
holding only the stale untracked `results.md` — its fate, keep vs.
replace, is a separate decision for implementation time):

- **Raw, per-repo:** one JSON file per external repo, full CLI output
  (`--format json`) plus run metadata (repo, pinned commit, CLI version,
  timestamp, exit code, wall-clock time). Suggested path:
  `validation/results/<repo-slug>.json`.
- **Aggregated summary:** one file combining all repos — totals, per-repo
  breakdown, and the pinned-commit manifest used for that run. Suggested
  path: `validation/summary.json` (machine-readable) with a short
  human-readable `validation/REPORT.md` generated from it.

Both are generated artifacts (reproducible from the manifest + CLI), so
whether they're committed to git or produced fresh in CI on demand is an
implementation-time call, not part of this contract.

---

## 4. What goes in the README vs. stays internal

**Scope of this section: only the "Validation" section** (the
`102 tests` / `17,137 files` / `0 false positives` block that issue #4
is about) — the aggregate, generated-by-this-command numbers. This is
distinct from README's separate **"Found in the Wild"** section, which
already publishes individual, hand-curated findings (full code snippets,
manual "why it fails under load" analysis) picked and written by a human,
not emitted by `validate-public`. That section is unaffected by this
contract: it's not aggregate data, it's not generated by this command,
and it doesn't carry the reproducibility claim §5 defines. The two
should not be conflated — this contract governs the former only.

**README "Validation" section (stable, low-cardinality, about the CLI's
behavior):**
- Number of repos validated + total files scanned.
- The pinned commits/tags used (or a link to the manifest), so the claim
  is independently checkable.
- CLI version the numbers correspond to.
- A stability statement: e.g. "runs cleanly on N real-world Spring Boot
  codebases — zero crashes, zero non-deterministic runs" (see §5).

**Internal artifact only (detail, high-cardinality, would go stale fast
in prose):**
- Per-rule, per-repo finding counts and severities.
- TP/FP/uncertain classifications (these require manual review per §7 and
  are explicitly not what this process measures).
- Timing/performance data.

This split exists because issue #4's root complaint was exactly a
detail-level number ("0 false positives") published in the "Validation"
section without a reproducible source or clear scope. Aggregate,
CLI-behavior metrics belong there; anything requiring manual judgment
call stays in the artifact. Again: this has no bearing on "Found in the
Wild," which stays exactly as it works today.

---

## 5. Definition of "reproducible" (acceptance criterion)

Given the same `java-vibe-guard` commit and the same pinned commits/tags
for every external repo, `npm run validate-public` **must produce
identical numbers** on every run, on any machine.

**Acceptance criterion:** running the command twice against the same
inputs produces byte-identical JSON artifacts (§3), modulo an explicitly
excluded set of fields (timestamp, wall-clock duration). Any other diff
between two runs is a bug. This should be checkable in CI by running the
command twice and diffing normalized output.

---

## 6. External repo unavailable or changed drastically

Because commits are pinned (§2), an upstream repo being archived does not
by itself break anything — the pinned SHA is still fetchable as long as
it isn't garbage-collected. Distinct failure modes to handle explicitly:

- **Repo/commit unreachable** (deleted, made private, rewritten history
  that drops the pinned SHA): the run must not crash entirely — that repo
  is marked unavailable in the summary artifact, the rest of the run
  completes, and the command exits non-zero to surface the problem.
- **Repo archived but pinned commit still fetchable:** no special
  handling needed: the pin is exactly what protects against this.
- **License change upstream:** does not retroactively affect a commit
  already fetched for read-only static analysis, but if a maintainer
  objects or a repo is dropped for licensing reasons, remove it from the
  manifest and note why in the manifest/changelog — don't silently drop
  it.

Periodic verification that pinned commits are still fetchable is useful
but is a separate concern from the validation run itself (could be a
scheduled check) — out of scope for this contract.

---

## 7. Scope — what this measures and what it does not

**Measures:**
- CLI stability on real, unmodified production codebases (does it run to
  completion without crashing, on code it wasn't written against).
- Reproducibility of findings for fixed inputs (§5).
- Compatibility across CLI versions — do finding counts on the same
  pinned repo change unexpectedly between releases, signaling an
  unintended regression.

**Does NOT measure:**
- Absolute precision/recall of the detector (would require ground-truth
  labeling of every finding across every repo — not what this process
  does).
- Coverage of the rule catalog (how many real anti-patterns exist vs. how
  many rules exist).
- Detection quality in any benchmark sense.

This section exists so "public validation" doesn't get reinterpreted a
year from now as a quality/accuracy benchmark it was never designed to
be. Any claim about detection precision needs separate, explicitly
labeled manual review (as `validation/results.md` attempted, and as
issue #4 flagged, without a reproducible process behind it).

---

## 8. When does `validate-public` run

Everything above defines what the command produces. It says nothing yet
about who or what triggers it — and that gap is exactly how issue #4
happened: `validation/results.md` was a technically reasonable process
that nobody ever finished or re-ran, and stale numbers made it into the
README anyway. A contract that doesn't say *when* this runs has the same
failure mode built back in.

**Trigger — three non-equivalent options:**

- **Purely manual:** someone runs `npm run validate-public` by hand and
  updates the README as a separate, deliberate step. Cheapest to build,
  but identical in shape to what already failed once.
- **CI, on a schedule** (e.g. weekly/monthly cron): runs unattended,
  catches drift between CLI releases and pinned repos without depending
  on anyone remembering. Needs somewhere to surface results (a job
  summary, an issue auto-filed on failure) or it's just as invisible as
  manual.
- **CI, on release:** runs as a gate before a version is published to
  npm. Ties validation to the moment the README's claims are actually
  read by new users (the release/publish step), instead of an arbitrary
  calendar cadence.

**If manual is chosen:** this contract needs a named owner and a stated
cadence (e.g. "run before every README claim update, and at least once
per minor release") — otherwise "manual" silently degrades to "never,"
which is the exact failure this contract exists to prevent. What happens
if months pass with no run also needs an answer: does the README get a
staleness disclaimer (e.g. "as of commit X"), or is stale-but-unflagged
data acceptable? It shouldn't be, given issue #4.

**If CI is chosen:** whether a broken reproducibility check (§5) fails
the build or only logs a warning changes what the guarantee is worth. A
warning-only check has the same silent-decay risk as manual with no
owner — nothing forces anyone to look at it. A hard CI failure is the
stronger guarantee but blocks unrelated work (e.g. a release) on a
validation-repo problem that may be entirely external (see §6).

**Recommendation:** CI on a schedule (catches drift without blocking
unrelated releases) with a hard failure specifically for reproducibility
breaks (§5) — a same-inputs-different-output result is always a CLI bug,
never an acceptable warning. Repo-unavailability failures (§6) should not
fail the build the same way, since those can be external and
out-of-project-control.

This is a recommendation, not a closed decision — confirm before
implementation, same as the rest of this contract.

---

## Open points requiring confirmation before implementation

1. Final repo list beyond `eugenp/tutorials` + `spring-petclinic` (§1).
2. Pinned commits vs. branches (§2) — recommended, not decided.
3. Fate of the existing untracked `validation/results.md` (§3).
4. Exact README wording/placement replacing the current "Validation"
   section (does not touch "Found in the Wild" — see §4).
5. Manifest update cadence: reactive (tied to rule changes) vs.
   discretionary/periodic (§2) — currently undefined.
6. Trigger for `validate-public` itself: manual (with named owner +
   cadence) vs. CI on schedule vs. CI on release, and whether a
   reproducibility break (§5) hard-fails CI or only warns (§8).
