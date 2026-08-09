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

**Default behavior:** each manifest entry represents the repository root.
An optional `path` field is reserved for future use if a repository
cannot reasonably be validated from its root (for example, due to
repository layout or excessive unrelated content). This field is
intentionally omitted from the initial schema until a real use case is
demonstrated.

---

## 2. Fixed commits/tags vs. moving branches

| | Pinned commit/tag | Moving branch (e.g. `main` HEAD) |
|---|---|---|
| Reproducibility | Exact — same input, same output, forever | Broken — output can change with no local change |
| Maintenance | Needs a deliberate, occasional "bump" PR | Zero — always current |
| Failure mode | Repo/commit could vanish (force-push, deletion) | Silent drift — a finding-count change could be upstream code changing, not a CLI regression |

**Decision (final):** the manifest pins an exact commit SHA per repo —
never a branch, and never a tag name stored as-is (a tag reference can be
re-pointed upstream; if a release tag is used to *select* a commit, the
manifest stores the SHA that tag resolved to at selection time, not the
tag). This is stored in a versioned manifest, `validation/repos.json`,
checked into the repo. Bumping a pin is a conscious, reviewed change —
not something that happens as a side effect of upstream activity. This
directly enables the reproducibility criterion in §5.

**Updating a pinned commit is a deliberate validation event, not
routine maintenance.** A commit is only updated after rerunning the
public validation and reviewing the resulting metrics.

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
excluded set of fields — **exactly three, by nature, never normalized**
because they measure the run itself, not its content:
- `timestamp` (top-level, run-repo.js's own run metadata)
- `durationMs` (top-level, wall-clock time)
- `scan.timestamp` (nested — the CLI's own `--format json` output stamps
  its own timestamp independently; same reason as the top-level one)

Any other diff between two runs is a bug. This should be checkable in CI
by running the command twice and diffing normalized output.

**Two further non-determinism sources exist in the underlying scan
output, but neither is handled by exclusion — both are resolved by
active normalization inside `run-repo.js`, so the persisted artifact is
reproducible at the source, not just "ignored when diffing":**

- **`scan.projectPath`:** the CLI is invoked with `checkoutPath`, a fresh
  `mkdtemp` path fetch-repo.js never reuses (§4.5) — different on every
  run by construction. `run-repo.js` overwrites this field with the
  stable manifest slug (the `repo` value, e.g. `"eugenp/tutorials"`)
  before returning its result.
- **`scan.issues[]` order:** `collectFiles()`
  (`cli/src/scanner.js:60-75`) does not sort directory entries
  ([issue #10](https://github.com/Joaquinriosheredia/java-vibe-guard/issues/10),
  filed, open, intentionally **not** fixed by this contract or by
  `run-repo.js` — the root cause is shared by every CLI entry point, not
  specific to validation). Two independent checkouts of the identical
  commit can therefore yield `issues[]` in different array order, purely
  from filesystem/OS directory-entry ordering. `run-repo.js` sorts
  `scan.issues[]` deterministically as a post-processing step over the
  JSON it receives from the CLI subprocess — a boundary normalization,
  not a `collectFiles()`/`scanner.js` fix — by `(ruleId, location,
  message)`, plain code-unit string comparison (never locale-aware
  collation, which is itself not guaranteed identical across machines).
  This key was verified against the real, current rule implementations
  (`cli/src/rules/*.js`) to be collision-free: every rule deduplicates
  its own findings by `(location, message)` before returning, and each
  rule's `message` text is hardcoded, rule-specific prose that cannot
  coincide with another rule's message at the same location — so no
  additional tiebreaker is needed today. This is a property of the
  current rule set, not a structural guarantee independent of it.

With these two normalizations, the raw per-repo artifact (§3) is
byte-identical across independent checkouts of the same pinned commit —
not merely "identical modulo known-volatile fields." `issue #10` remains
open and unfixed in `collectFiles()` itself; only its effect on this
specific artifact is neutralized, at the `run-repo.js` boundary.

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

## 9. `fetch-repo.js` — input validation and Git execution contract

**Status: resolved (2026-08-08).** This closes the last open point of the
`fetch-repo.js` module design (the `{repo, commit}` → checkout module
described but not yet implemented — no code exists for it yet). It fixes
the exact validation regexes and the Git-invocation safety rules that
implementation must follow.

### 9.1 Input validation

**`commit`**
- Must match exactly 40 lowercase hexadecimal characters.
- Regex: `/^[0-9a-f]{40}$/`
- Anything else — wrong length, uppercase hex, non-hex characters — is
  `invalid-input`. Uppercase SHAs are rejected even though they identify
  the same commit, because §2 above commits `repos.json` to storing
  pinned SHAs in one canonical form; accepting case variants would let
  two manifest entries reference the "same" commit in different textual
  forms, silently.

Accepted:
- `ccab8a758d1f1f5043f897548f85a74f88d904fb` (the pinned `eugenp/tutorials`
  SHA already in `repos.json`)

Rejected (`invalid-input`):
- `ccab8a758d1f1f5043f897548f85a74f88d904f` — 39 chars, one short
- `ccab8a758d1f1f5043f897548f85a74f88d904fbb` — 41 chars, one long
- `CCAB8A758D1F1F5043F897548F85A74F88D904FB` — uppercase
- `ccab8a758d1f1f5043f897548f85a74f88d904fg` — contains `g`, non-hex

**`repo`**
- Must match exactly `owner/name`.
- `owner` and `name` each: characters from `[A-Za-z0-9.-]` only, must
  start and end with `[A-Za-z0-9]` (never `.` or `-` at either edge).
- Exactly one `/` separating them.
- Regex:
  `/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/`

The regex is a pure allowlist — it enumerates the characters permitted,
rather than blocking specific dangerous ones. A blocklist has to name
every dangerous character (space, backslash, control characters, `:`,
`@`, a second `/`, …) and stays correct only as long as none is missed;
an allowlist restricted to `[A-Za-z0-9.-]` plus one literal `/` makes
every one of those impossible by construction, including ones not
explicitly considered. It also makes a leading `-` in either component
impossible (both components are anchored to start with `[A-Za-z0-9]`),
which is the specific defense against option injection this section
requires.

Accepted:
- `eugenp/tutorials`
- `spring-projects/spring-petclinic`
- `a/b` — single-character owner/name; the regex's optional inner group
  correctly allows this

Rejected (`invalid-input`):
- `eugenp` — no `/`
- `eugenp/foo/tutorials` — a second `/` (not part of either component's
  allowed charset)
- `-eugenp/tutorials` — starts with `-`
- `eugenp/-tutorials` — `name` starts with `-` (same defense, extended to
  both components, not just the whole string)
- `eugenp /tutorials`, `eugenp/tutorials ` — contains a space
- `eugenp!/tutorials`, `eugenp/tutorials;rm` — characters outside
  `[A-Za-z0-9.-]`
- `https://github.com/eugenp/tutorials` — colon and extra `/` outside the
  allowed shape
- `eugenp\tutorials` — backslash, not in the allowed charset

Both regexes are anchored (`^…$`), matched against the whole string, and
use no nested/overlapping quantifiers — no catastrophic-backtracking
(ReDoS) risk from adversarial input length.

No maximum length is enforced, and GitHub's own naming rules (owner ≤39
chars, no consecutive hyphens, etc.) are not replicated. This validation
exists to make the value **safe to hand to a subprocess**, not to fully
validate it as a real GitHub identifier. A syntactically-safe but
nonexistent `owner/name` is caught downstream as `repo-not-found` when
Git actually tries to reach it — an already-designed failure path, not a
gap.

### 9.2 Git execution contract

- Every Git invocation uses `spawnSync('git', [...argsArray], opts)` with
  arguments passed as an array. `shell: true` is never passed, and no
  Git invocation goes through `exec`/`execSync` or any API that
  assembles a single command string.
- No value derived from `repo` or `commit` is ever concatenated into a
  string that is itself interpreted as a shell command or as a single
  Git argument containing multiple tokens — always separate array
  elements, never string interpolation.
- `repo` and `commit` are validated against §9.1 **before** any Git
  argument array is constructed. If either fails validation, the
  function returns `{status:'error', errorType:'invalid-input', ...}`
  immediately — no subprocess is spawned.
- `--` (end-of-options) is used as defense-in-depth wherever a Git
  subcommand's option parser accepts it unambiguously — on top of, not
  instead of, §9.1's allowlist, which remains the primary control:

| Step | Command | `--` used? | Why |
|---|---|---|---|
| 1 | `git init <checkoutDir>` | no | `<checkoutDir>` is generated internally (`mkdtempSync`), never derived from `repo`/`commit` — nothing to protect |
| 2 | `git remote add -- origin <url>` | yes | `<url>` is built from the validated `repo`; `--` separates `remote add`'s options from its two positional arguments (name, url) |
| 3 | `git fetch --depth 1 -- origin <commit>` | yes | `<commit>` is the validated SHA; `--` separates `fetch`'s options from the repository/refspec positional arguments |
| 4 | `git checkout FETCH_HEAD` | **no, deliberately** | `FETCH_HEAD` is a fixed literal, not derived from input — nothing to protect. Prepending `--` here would also be wrong: for `checkout`, `--` changes an argument's meaning from "revision" to "pathspec," breaking the command instead of hardening it |

Step 4 is also why this design checks out `FETCH_HEAD` rather than the
raw `commit` SHA directly: it removes the one Git call where an
attacker-influenceable value would otherwise sit in the one position
where `--` cannot safely be added.

**Resolved (2026-08-08):** whether `git remote add` and `git fetch`
actually honor `--` as documented (`parse-options`-style end-of-options)
was verified empirically against Git 2.43.0, the version this project
runs against, in an isolated scratch directory (no clone of any repo in
`repos.json`):
- `git remote add -- origin <url>` — exit 0, remote created as `origin`
  (not `--`).
- `git fetch --depth 1 -- origin <sha>` — exit 0, `FETCH_HEAD` resolves
  exactly to the requested SHA.
- Both produced identical results to the equivalent commands without
  `--`, confirming `--` is purely additive here and does not change
  behavior on this Git version.

No further verification action is required before implementation.

### 9.3 Contract tests for §9.1 (design only — not yet implemented)

No network, no subprocess involved — these assert only what §9.1's two
regexes accept or reject, so they run as part of the fast, offline unit
suite alongside the rest of `fetch-repo.js`'s planned tests.

| # | Input | Field | Expected |
|---|---|---|---|
| 1 | `ccab8a758d1f1f5043f897548f85a74f88d904fb` | `commit` | valid |
| 2 | `ccab8a758d1f1f5043f897548f85a74f88d904f` (39 chars) | `commit` | `invalid-input` — too short |
| 3 | `ccab8a758d1f1f5043f897548f85a74f88d904fbb` (41 chars) | `commit` | `invalid-input` — too long |
| 4 | `ccab8a758d1f1f5043f897548f85a74f88d904fg` (contains `g`) | `commit` | `invalid-input` — non-hex character |
| 5 | `eugenp/tutorials` | `repo` | valid |
| 6 | `eugenp` | `repo` | `invalid-input` — no `/` |
| 7 | `eugenp/foo/tutorials` | `repo` | `invalid-input` — multiple `/` |
| 8 | `-eugenp/tutorials` | `repo` | `invalid-input` — starts with `-` |
| 9 | `eugenp /tutorials` | `repo` | `invalid-input` — contains a space |
| 10 | `eugenp!/tutorials` | `repo` | `invalid-input` — character outside `[A-Za-z0-9.-]` |
| 11 | `https://github.com/eugenp/tutorials` | `repo` | `invalid-input` — full URL, not `owner/name` |

Two cases beyond the requested list, added to fully exercise the "must
also *end* with `[A-Za-z0-9]`" half of the rule (not just "must start
with"), which is otherwise untested by the list above:

| # | Input | Field | Expected |
|---|---|---|---|
| 12 | `eugenp/tutorials-` | `repo` | `invalid-input` — `name` ends with `-` |
| 13 | `eugenp./tutorials` | `repo` | `invalid-input` — `owner` ends with `.` |

Each case also implicitly asserts the corresponding no-subprocess-spawned
behavior already specified in the `fetch-repo.js` API design: validation
happens before any `git` argument array is built, so an `invalid-input`
result must be producible with `git` entirely absent from `PATH` (i.e.
these tests need no working Git installation to pass).

---

## Open points requiring confirmation before implementation

1. Final repo list beyond `eugenp/tutorials` + `spring-petclinic` (§1).
2. Fate of the existing untracked `validation/results.md` (§3).
3. Exact README wording/placement replacing the current "Validation"
   section (does not touch "Found in the Wild" — see §4).
4. Manifest update cadence: reactive (tied to rule changes) vs.
   discretionary/periodic (§2) — currently undefined.
5. Trigger for `validate-public` itself: manual (with named owner +
   cadence) vs. CI on schedule vs. CI on release, and whether a
   reproducibility break (§5) hard-fails CI or only warns (§8).

**Resolved:** pinned commits vs. moving branches (§2) — closed 2026-08-04.
The manifest pins exact commit SHAs only; see the "Decision (final)"
paragraph in §2.
