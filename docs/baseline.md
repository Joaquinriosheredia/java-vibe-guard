# Baseline Contract

Normative specification for `vibeguard-baseline.json`, as accepted by the
java-vibe-guard **CLI**. This document is the contract an implementation
must satisfy — it is written before the baseline comparator exists,
specifically so the comparator and its test suite can be built against a
fixed spec instead of ad hoc behavior. Same role for baseline that
`docs/suppression-grammar.md` plays for inline suppression.

## 1. Purpose

A baseline lets a project adopt java-vibe-guard against an existing
codebase without having to fix every finding on day one: findings that
already exist at baseline-creation time are treated as accepted debt and
are not reported (and do not fail the exit code); only findings that are
*new* relative to the baseline are reported. The baseline must survive
ordinary, unrelated edits to the file (reformatting, adding an import,
inserting a blank line above the finding) without spuriously un-baselining
existing debt — see §2 for how bucket identity is chosen to satisfy this.

## 2. Bucket identity

A **bucket** is identified by the triple:

```
(ruleId, relativePath, message)
```

Equality is exact string equality on all three fields — case-sensitive,
no normalization, no trimming beyond what the finding already contains.
Two findings belong to the same bucket if and only if all three fields
are identical.

**The line number is explicitly excluded from bucket identity.** A
finding's `location` (`relativePath:line`, or bare `relativePath` for
file-level findings per `suppression.js`'s `LOCATION` regex) contributes
only its `relativePath` to the bucket key — the `:line` suffix, if any, is
discarded before bucketing.

This is a deliberate trade-off, not an oversight:

- **Why not include the line**: several rules emit a fully generic,
  non-parameterized message per instance — e.g. `observability.js`
  produces the literal string `'Endpoint without structured logging'` for
  *every* under-logged endpoint in a controller. A controller with 5 such
  endpoints, then reformatted (one blank line added above the class),
  shifts every finding's line number by one. A line-inclusive identity
  would un-baseline all 5 on a purely cosmetic edit — the opposite of
  what a baseline is for.
- **Consequence of excluding it**: a bucket can legitimately contain more
  than one finding (see the observability example above — 5 findings, 1
  bucket). The comparison algorithm (§3–§4) is defined around counts
  *per bucket*, not per finding, specifically to accommodate this.
- **Known limitation this creates**: if a bucket holds N findings and a
  developer fixes one instance while introducing a new, unrelated
  instance that happens to land in the same bucket (same rule, same
  file, same message) in the same change, the count stays at N and the
  swap goes undetected — the new instance is silently treated as
  baseline. This is a narrow, low-severity blind spot, accepted in
  exchange for not flooding false positives on every reformat. (Prior art
  for this exact trade-off: PHPStan and Psalm baselines key on
  `{message, path, count}` without a line number, for the same reason.)
- **Corollary limitation**: bucket identity includes the message text
  verbatim. If a rule's message template is edited (wording change,
  typo fix, added detail), every existing baseline entry keyed to the old
  wording stops matching and its findings reappear as "new" until the
  baseline is regenerated. This is symmetric to the line-shift trade-off,
  just on a different axis (message stability instead of position
  stability), and is an accepted consequence of the same design choice.

File-level findings (no `:line` suffix — see
`suppression.js`'s handling of `LOCATION.exec` returning no match) bucket
identically to line-numbered findings: their `relativePath` is used as-is,
there being no line to strip in the first place.

## 3. Ordering within a bucket

When a bucket's current-scan count (`M`) exceeds its baseline count (`N`),
§4 needs a deterministic way to decide *which* `N` of the `M` findings are
"baseline" and which `M - N` are "new". This order must be fixed by an
explicit comparator — never assumed from the order in which rules
happened to run, since rule execution order is an implementation detail
of `scanner.js`'s `RULES` array, not a property of the findings
themselves.

The comparator, applied to the findings within one bucket:

1. **Primary key — line ascending.** The line number is parsed from each
   finding's `location` the same way `suppression.js` does (`LOCATION =
   /^(.*):(\d+)$/`). A file-level finding (no match — no line) sorts
   before every line-numbered finding in the same bucket, as if its line
   were `0`.
2. **Secondary key — stable, input-array order.** If two findings in the
   same bucket resolve to the same line (only possible if the same rule
   emits more than one finding for the same exact line, or two
   file-level findings share a bucket), their relative order is
   whatever order they already had in the findings array passed into the
   comparison — i.e. the sort must be a **stable sort**, and no
   additional tiebreaker field is introduced. Discovery order across
   rules is preserved only as an incidental consequence of stability, not
   because it is consulted directly.

## 4. Comparison algorithm

Inputs: `baselineCount = N` (from the loaded `vibeguard-baseline.json`
bucket, or `0` if the bucket has no baseline entry) and `currentCount =
M` (the number of current-scan findings in that bucket, computed per §7 —
suppressed findings never enter this count).

```
For each bucket (grouped per §2) among the current scan's findings:
  N = baseline count for this bucket key, or 0 if absent
  M = number of current findings in this bucket

  sort the bucket's M findings per §3

  if M <= N:
    all M findings are "baseline" — not reported, do not affect exit code
    (0 new findings from this bucket)
  else (M > N):
    the first N findings (post-sort) are "baseline"
    the remaining (M - N) findings are "new" — reported, can fail the
    exit code under the same severity rules as an unsuppressed finding

Bucket keys present only in the baseline (N > 0, M = 0, e.g. the finding
was fixed) contribute nothing — 0 baseline, 0 new; this is the M <= N
case with M = 0.

Bucket keys present only in the current scan (N = 0) fall under M > N
with N = 0: all M findings are new — the standard case of a
never-before-seen violation.
```

**Acceptance examples** (normative — a comparator implementation must
reproduce both):

| Baseline count (N) | Current count (M) | Baseline (suppressed) | New (reported) |
|---|---|---|---|
| 2 | 4 | 2 | 2 |
| 4 | 2 | 2 | 0 |

- `N=2, M=4`: the first 2 findings post-sort are baseline; the remaining
  2 are new.
- `N=4, M=2`: both current findings are `M <= N`, so both are baseline;
  0 new. (The 2 "missing" baseline entries simply correspond to findings
  that no longer exist — e.g. fixed — and are not reported as anything.)

## 5. File format

`vibeguard-baseline.json`, at the root of the scanned project:

```json
{
  "version": 1,
  "generatedAt": "2026-07-18T20:00:00.000Z",
  "buckets": [
    { "ruleId": "observability", "relativePath": "src/main/java/com/example/UserController.java", "message": "Endpoint without structured logging", "count": 3 }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `version` | integer, must be `1` | See §6 — any other value is treated as malformed. Reserved for future format changes. |
| `generatedAt` | ISO 8601 string | Informational only (audit/debugging) — not read or compared by the algorithm in §4. |
| `buckets` | array | One entry per non-zero bucket at generation time. |
| `buckets[].ruleId` | string | Matches a finding's `rule` field verbatim. Not validated against the rule registry (same non-validating stance as `suppression-grammar.md` §7 for inline directive rule ids) — an entry referencing a rule id that no longer exists is simply a bucket nothing will ever match again. |
| `buckets[].relativePath` | string | As produced by `scanner.js`'s `relative(absPath, filePath)` — forward-slash-separated, matching the same string form used in `location`. |
| `buckets[].message` | string | Exact, verbatim finding message. |
| `buckets[].count` | integer ≥ 0 | The bucket's `N`. |

## 6. Defensive loading

Loading `vibeguard-baseline.json` must never break a scan, mirroring
`config.js`'s `loadConfig` behavior for `vibeguard.config.json`:

- **File absent**: no baseline is applied — equivalent to every bucket
  having `N = 0`. Behavior is identical to today's CLI (no baseline
  feature at all): every non-suppressed finding is reported.
- **File present but invalid JSON**: same fallback as absent — parse
  failure is not fatal, scan proceeds with no baseline applied.
- **`version` missing or not exactly `1`**: treated the same as invalid
  JSON — no baseline applied. (There is deliberately no attempt to
  interpret or migrate an unrecognized version in this contract; a future
  version bump defines its own rules.)
- **`buckets` missing or not an array**: treated as an empty bucket list
  (no baseline entries), not as a fatal error — same permissive stance
  `config.js` takes for a missing/non-array `ignore`/`exclude`.
- **Individual malformed bucket entries**: an entry is **discarded
  individually** (not treated as invalidating the whole file) if any of
  the following hold: `ruleId`, `relativePath`, or `message` is not a
  string; `count` is not an integer; `count` is negative. Well-formed
  entries in the same file are still loaded.
- **Duplicate bucket keys** in the `buckets` array (same
  `ruleId`+`relativePath`+`message` appearing more than once): last entry
  wins. (There is no legitimate reason for a generated baseline to
  contain duplicates — this rule only governs hand-edited or corrupted
  files, defensively.)

None of these conditions raise an error, print a warning, or change the
process exit code by themselves — they only affect how many baseline
buckets are available to §4's comparison.

## 7. Creation

`--baseline` — a boolean flag on the main `java-vibe-guard [path]`
command, following the same mode-switch pattern `--verify <rule>` already
establishes in `bin/cli.js`'s `if (opts.verify) { ... } else if (...) {
...} else { ... }` branching (no subcommand is introduced).

When `--baseline` is present:

1. The project at `projectPath` is scanned exactly as a normal run would
   be (`collectFiles` → rules → `applySuppressions`), through the same
   pipeline described in §9.
2. The resulting non-suppressed findings are grouped into buckets per
   §2, and each bucket's count is taken as `N` for that entry.
3. `vibeguard-baseline.json` is written to the root of `projectPath` in
   the format from §5, with `generatedAt` set to the current time.
4. The command **terminates there** — it does not run the normal
   text/JSON report, and does not evaluate an exit code the way a normal
   scan would (baseline creation is not itself a pass/fail check).

Creation is always explicit — there is no automatic generation of
`vibeguard-baseline.json` under any circumstance.

`--baseline` siempre regenera el archivo completo a partir del estado
actual del proyecto. Si `vibeguard-baseline.json` ya existe, se reemplaza
íntegramente sin confirmación ni fusión. El baseline es un artefacto
generado, no un fichero pensado para edición manual.

## 8. Consumption

Automatic — if `vibeguard-baseline.json` exists at the root of the
scanned project, it is loaded and applied on every normal scan with no
additional flag required, the same way `vibeguard.config.json` is
consulted automatically today. There is no `--use-baseline`-style opt-in;
the file's mere presence is the signal, exactly as for the config file.

## 9. Interaction with the suppression pipeline

Full pipeline order, baseline taking the last position:

```
1. exclude (vibeguard.config.json)  — file never scanned, never produces a finding
2. inline / standalone / config.ignore (applySuppressions) — finding produced,
   decorated with suppressed: true/false
3. baseline (this document)          — evaluated ONLY over findings where
                                        suppressed === false
```

A finding already suppressed by any of inline, standalone, or
`config.ignore` is **not counted toward its bucket at all**, in either
direction:

- **At creation time**: a suppressed finding does not contribute to the
  `count` written for its bucket in `vibeguard-baseline.json`. Baselines
  only capture debt that suppression didn't already resolve.
- **At consumption time**: a suppressed finding is excluded from the
  current-scan bucket count (`M`) used in §4. It was already resolved by
  an earlier layer; the baseline layer has nothing left to decide about
  it.

This means a finding is classified by exactly one mechanism — inline,
standalone, config, or baseline — never more than one, and the earlier
layers in the pipeline always take precedence by virtue of running
first and removing the finding from the pool the later layer sees.

## 10. Non-goals for this contract

- No mechanism to reactivate/override a baseline entry from inline or
  standalone comments — the same closed-world stance
  `suppression-grammar.md` takes for `config.ignore` overrides. A
  baselined finding stays baselined until the baseline file is
  regenerated or edited by hand.
- No merge/diff tooling for baseline files, no partial regeneration
  (e.g. "only update entries for file X"), no CLI flag to customize the
  baseline file's name or location — it is always
  `vibeguard-baseline.json` at the project root, matching
  `vibeguard.config.json`'s convention.
- No handling for file renames — a renamed file's findings bucket under
  a new `relativePath` and will appear as entirely new debt, exactly as a
  rename affects `config.json`'s `exclude` patterns today. Not addressed
  here.

## 11. Status

This document is the normative reference for the baseline bucket
identity, ordering, comparison algorithm, file format, and pipeline
position, to be implemented in a future `cli/src/baseline.js` (or
equivalent) and exercised by a contract test suite the same way
`docs/suppression-grammar.md` is exercised by `contract.test.js`. No
comparator implementation exists yet — this document precedes it.
