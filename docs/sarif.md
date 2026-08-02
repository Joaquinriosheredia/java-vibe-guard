# SARIF Output Contract

Normative specification for the SARIF 2.1.0 document produced by the
java-vibe-guard **CLI**, consumed primarily by GitHub Code Scanning. This
document is the contract an implementation must satisfy — it is written
before the SARIF writer exists, specifically so the writer and its test
suite can be built against a fixed spec instead of ad hoc behavior. Same
role for SARIF output that `docs/suppression-grammar.md` plays for inline
suppression and `docs/baseline.md` plays for the baseline comparator.

## Correction to prior investigation

The research that motivated this document placed `security-severity` at
`rule.defaultConfiguration.properties["security-severity"]`. That location
was verified against GitHub's own SARIF documentation while writing this
contract and is **incorrect** — the schema location table for
`reportingDescriptor` puts it at `rule.properties["security-severity"]`
(a sibling of `defaultConfiguration`, not nested inside it), and the value
must be serialized as a **string** (`"9.5"`), not a JSON number. GitHub's
own documented example:

```json
{
  "id": "R01",
  "properties": {
    "security-severity": "9.8"
  }
}
```

§1 and §7 below use the verified location. If an implementation is ever
built against the original (incorrect) location, GitHub Code Scanning will
silently fail to render the severity band — there is no validation error,
the badge simply defaults to the `level`-derived severity instead. This is
exactly the kind of silent-divergence risk this contract exists to prevent.

## 1. Severity mapping

| CLI severity | SARIF `level` | `security-severity` |
|---|---|---|
| `critical` | `error`   | `"9.5"` |
| `major`    | `error`   | `"7.5"` |
| `warning`  | `warning` | `"5.0"` |
| `info`     | `note`    | `"2.0"` |

Both columns are derived from the finding's existing `severity` field
(`cli/src/rules/*.js`) — no new severity concept is introduced.

**`security-severity` is not a computed score.** It is a fixed value
representative of GitHub's own official band (`>9.0` critical, `7.0–8.9`
high, `4.0–6.9` medium, `≤3.9` low — [GitHub's documented
thresholds](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning)),
chosen once per CLI severity and never varied per finding instance. The
goal is a stable classification across runs, not a precise numeric
estimate of exploitability — the CLI has no model that would justify one.

**`critical` and `major` both collapse to `level: "error"`** — SARIF's
`level` enum has exactly four values (`error`, `warning`, `note`, `none`),
none of which distinguishes "critical" from "major". `security-severity`
is the *only* field in the SARIF output that preserves this distinction:
`9.5` lands in GitHub's "critical" band, `7.5` in "high" — two different
bands, even though both results carry `level: "error"`. A consumer that
only reads `level` cannot tell them apart; a consumer that reads
`security-severity` (as GitHub Code Scanning does) can.

`level` is set per-result (point above). `security-severity` is set per
**rule id** at `rule.properties["security-severity"]` (§6) — see the note
in §6 on rule ids whose findings span more than one CLI severity.

## 2. `artifactLocation.uri`

Always the finding's `relativePath` (the same string `scanner.js` already
computes via `relative(absPath, filePath)`), with POSIX separators (`/`),
relative to the project root, **without** a `file://` prefix:

```json
"artifactLocation": { "uri": "src/main/java/com/example/kafka/KafkaConsumerService.java" }
```

No alternative is valid:

- **No absolute paths** — they leak the scanning machine's filesystem
  layout into the report and break portability between CI and local runs.
- **No `file://` prefix** — SARIF's `artifactLocation.uri` is a URI
  reference resolved relative to the run/repo root; GitHub Code Scanning's
  fingerprinting keys off `ruleId` + this URI staying stable across runs
  (already the reasoning behind the existing `relativePath` fix — see
  memory of the relativePath collision fix, `4286808`). An absolute or
  `file://`-prefixed URI is not stable across machines and would defeat
  that fingerprinting.
- **No backslashes on Windows** — `relativePath` must already be
  POSIX-separated before it reaches the SARIF writer; the writer does not
  do its own separator normalization, it trusts the value it's given.

## 3. `region`

Present **only** when the finding has a real line — i.e. its `location`
matches `relativePath:line` (the `LOCATION` regex already used by
`suppression.js`, `/^(.*):(\d+)$/`).

```json
"region": { "startLine": 42 }
```

- `startLine` is exactly the line number already present in the finding's
  `location` string — no recomputation, no re-parsing beyond splitting on
  the last `:`.
- **No `endLine`, no `endColumn`.** A `region` with only `startLine` is
  interpreted by SARIF consumers as spanning the entire line — that
  already covers the normal case (one finding, one line) without
  synthesizing column offsets the CLI does not actually compute today.

## 4. File-level findings (no line)

Some findings have no single line to anchor to — e.g. `kafka.js`'s
"Kafka config without consumer group.id" check, which inspects an entire
`.properties`/`.yml` file for the *absence* of a setting
(`cli/src/rules/kafka.js:79-89`, `location: relativePath` — no `:line`
suffix, and the source already carries a comment anticipating this exact
SARIF split). For these, `physicalLocation` carries **only**
`artifactLocation`, with no `region` key at all:

```json
{
  "ruleId": "kafka",
  "level": "warning",
  "message": { "text": "Kafka config without consumer group.id" },
  "locations": [
    {
      "physicalLocation": {
        "artifactLocation": { "uri": "src/main/resources/application.yml" }
      }
    }
  ]
}
```

This is a location at the level of the whole artifact, not a line inside
it — semantically distinct from "line 1", and SARIF supports the
distinction natively (§8 explains why the writer must not invent a line).

## 5. Filtering — SARIF is generated from `visibleFindings` only

The `results` array contains **only** findings that are:

1. **Not suppressed** — not resolved by an inline, standalone, or
   `config.ignore` directive (`suppressed === false`, per
   `docs/suppression-grammar.md`).
2. **Not baseline-matched** — not classified as pre-existing debt by an
   active `vibeguard-baseline.json` (`baselined === false`, per
   `docs/baseline.md` §4, when a baseline is loaded; if no baseline file
   is present, every finding trivially satisfies this).

Concretely: `const visibleFindings = findings.filter(f => !f.suppressed
&& !f.baselined)`. This mirrors the `visibleFindings` naming already used
by `reporter.js`, but is **not** the same filter reporter.js currently
applies — `reporter.js`'s `visibleFindings` (and `scanner.js`'s exit-code
check) today filter only on `!f.suppressed`, not on `!f.baselined`. The
SARIF writer must not reuse that helper as-is; it needs the two-condition
filter above. (This also means the current text/JSON/exit-code path has a
latent gap where baselined findings aren't excluded from the exit code or
report — worth a look, but out of scope for this document.)

**SARIF's native `result.suppressions` field is never used**, for either
suppression or baseline: GitHub Code Scanning does not honor
`result.suppressions` — a result marked there still surfaces as an open
alert. The only mechanism this CLI uses to hide a finding from SARIF
output is *not emitting a `result` for it at all*. A suppressed or
baselined finding simply does not appear in the `results` array — there
is no SARIF-native trace of it (no `suppressions` object, no
`baselineState`, nothing).

## 6. `rules` array (`reportingDescriptor`)

One entry per distinct rule id that appears among `visibleFindings` in
the current run. Known rule ids today (`cli/src/rules/*.js`): `blocking`,
`blocking-kafka`, `kafka`, `kafka-send-timeout`, `layers`, `observability`,
`reactor-block`, `transactions` (the same eight enumerated in
`docs/suppression-grammar.md` §0/§7).

| Field | Value |
|---|---|
| `id` | The rule id string exactly as it appears in `finding.rule` (e.g. `"kafka"`). |
| `name` | Same string as `id`. The CLI has no separate human-readable rule name today distinct from the id; inventing one here would be exactly the kind of synthesized data §8 forbids. |
| `shortDescription.text` | A concise, one-line statement of what the rule detects. |
| `fullDescription.text` | A longer explanation. Where the rule already has prose in the README's "Why These Rules Exist" section, that prose is the source — not a new, independently-drifting description. |
| `helpUri` | See below — always the repo README, never per-rule. |
| `defaultConfiguration.level` | See "Mixed-severity rule ids" below. |
| `properties.security-severity` | Per §1/§7 — string value, at the rule level, sibling of `defaultConfiguration` (not nested inside it — see the correction at the top of this document). |

**`helpUri` always points at the repository's main README** —
`https://github.com/Joaquinriosheredia/java-vibe-guard#readme` — the same
URL for every rule id, never a distinct URL per `ruleId`. A granular,
per-rule help page (one URL per rule id) is a deliberate future
improvement, out of scope for v1 (§9) — if the CLI later migrates rule
documentation into `docs/`, that is a deliberate contract change to this
document, not an implicit decision made by this implementation.

**Mixed-severity rule ids.** Rule ids are not 1:1 with a single CLI
severity — `transactions` (`cli/src/rules/transactions.js`) emits both
`major` (line 21) and `critical` (line 33) findings depending on which
pattern matched. This forces a **hard split between rule-level and
result-level severity**, because SARIF itself draws that line — one is a
property of the `reportingDescriptor` (the rule), the other of each
individual `result` (the finding) — and this contract must not blur it:

- **Rule-level metadata — `rule.defaultConfiguration.level` and
  `rule.properties["security-severity"]`.** Both live on the
  `reportingDescriptor`, which is emitted **once per rule id**, not once
  per finding. There is structurally no way to give `transactions` two
  different `defaultConfiguration.level` values, so a single
  representative value must be chosen. **Resolution: the highest severity
  emitted by that rule id among the current run's `visibleFindings`
  wins**, using the same ordering `reporter.js`'s `SEVERITY_ORDER` already
  defines (`critical` > `major` > `warning` > `info`). This is a real,
  unavoidable limitation of the SARIF/GitHub rule-metadata model, not a
  design choice the CLI is free to skip — GitHub reads
  `security-severity` from the rule object, not from each result, so
  *some* single value is mandatory here.
- **Result-level fields — `result.level` (§1) and, if ever emitted,
  `result.properties["security-severity"]` (GitHub does not read this,
  but nothing here forbids adding it for other consumers).** These
  **always reflect the individual finding's own real severity**, computed
  independently per §1's mapping table, never the rule id's maximum. A
  `major` finding from `transactions` must show `level: "error"` derived
  from its own `major` severity (§1: `major` → `error`) — the fact that
  some *other* `transactions` finding in the same run is `critical` has
  no bearing on it. In this particular case `major` and `critical` both
  map to `level: "error"` anyway (§1), so the distinction is invisible at
  the `level` field for this rule specifically — but the principle holds
  regardless: a rule id emitting `warning` and `critical` findings in the
  same run must never show `level: "warning"` findings as `level: "error"`
  just because the rule's `defaultConfiguration.level` resolved to
  `error`. The two levels of severity are computed independently; only
  the rule-metadata one is a lossy per-run summary.

No information is lost at the result level — only the descriptor's single
"default" value is a summary rather than an exhaustive fact.

## 7. Document structure

```json
{
  "version": "2.1.0",
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "java-vibe-guard",
          "version": "1.0.3",
          "informationUri": "https://github.com/Joaquinriosheredia/java-vibe-guard",
          "rules": [
            {
              "id": "kafka",
              "name": "kafka",
              "shortDescription": { "text": "Kafka configuration and listener anti-patterns." },
              "fullDescription": { "text": "..." },
              "helpUri": "https://github.com/Joaquinriosheredia/java-vibe-guard#readme",
              "defaultConfiguration": { "level": "warning" },
              "properties": { "security-severity": "5.0" }
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "kafka",
          "level": "warning",
          "message": { "text": "Kafka config without consumer group.id" },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "src/main/resources/application.yml" }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

- `version`: literal string `"2.1.0"`.
- `$schema`: literal string
  `https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json`.
- `tool.driver.name`: literal `"java-vibe-guard"`.
- `tool.driver.version`: read from `cli/package.json`'s `version` field at
  run time — never hardcoded independently of that file, so the two never
  drift apart.
- `tool.driver.informationUri`: the repo root URL, `https://github.com/Joaquinriosheredia/java-vibe-guard`.
- `tool.driver.rules`: per §6.
- A single `run` in `runs`. No multi-run output in v1 (see `category` in §9).

## 8. Guiding principle — do not invent data

If a finding has no line, no `region` is generated (§3–§4). If a SARIF
property would require information the CLI does not actually compute
today, it is **omitted**, not synthesized. This is why v1 never emits
`endLine`, `endColumn`, or `baselineState` — these are all data points the
CLI has no precise, real value for, and a fabricated placeholder would be
worse than absence: a consumer trusting a synthesized `endColumn` could
highlight the wrong span, whereas an absent `region` field is correctly
interpreted as "the whole line" (§3) or "the whole artifact" (§4).

## 9. Deferred decisions (out of scope for v1)

- **`baselineState`** — SARIF defines this result property natively
  (`new` / `unchanged` / `updated` / `absent`); it is not emitted in v1.
  Integrating the CLI's own baseline concept (`docs/baseline.md`) with
  SARIF's native one is future work — v1 keeps baseline filtering
  entirely upstream of SARIF generation (§5) instead.
- **`category`** — reserved for when a single CLI invocation produces
  more than one SARIF-emitting run (e.g. if `mcp-server` also starts
  generating its own SARIF output). Not needed while the CLI is the only
  producer.
- **Per-rule `helpUri`** — one help page per `ruleId` instead of the
  single shared README link (§6). Deliberately deferred, not an oversight.
- **`fixes`, `codeFlows`, `relatedLocations`** — none of the CLI's rules
  currently compute a suggested fix, a data/control-flow path, or a
  secondary related location. Out of scope until a rule actually produces
  that data.
- **Any other GitHub-specific SARIF property** not required for a
  Code Scanning upload to render correctly (e.g. `partialFingerprints`
  beyond what GitHub computes itself from `ruleId` + `artifactLocation.uri`).

## 10. Status

This document is the normative reference for SARIF generation in the
CLI. Any change to this contract — a new field, a changed severity
mapping, a relocated `security-severity` property — must update this
document **first**, exactly as `docs/baseline.md` and
`docs/suppression-grammar.md` require for their respective contracts. No
SARIF writer implementation exists yet; this document precedes it.
