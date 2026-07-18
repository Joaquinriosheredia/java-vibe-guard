# Inline Suppression Grammar

Normative specification for the `// vibe-guard: ignore ...` inline suppression
comment, as accepted by the java-vibe-guard **CLI**. This document is the
contract an implementation must satisfy — it was written before the CLI
parser existed, specifically so the parser and its test suite can be built
against a fixed spec instead of ad hoc behavior.

Known CLI rule ids at time of writing: `blocking`, `blocking-kafka`, `kafka`,
`layers`, `observability`, `transactions` (see `cli/src/rules/*.js`).

## 1. Canonical regex

```
//\s*vibe-guard\s*:\s*ignore\s+([a-z]+(?:-[a-z]+)*(?:\s*,\s*[a-z]+(?:-[a-z]+)*)*)(?:\s*--\s*(.*))?\s*$
```

Applied per source line (not multi-line). Capture groups:

| Group | Contents | Notes |
|---|---|---|
| 1 | Raw rule id list, e.g. `blocking, kafka` | Comma-separated, not yet split/trimmed/deduped. Rule id token is `[a-z]+(?:-[a-z]+)*` — lowercase words joined by single hyphens, matching this CLI's own rule id shape (`blocking-kafka`, not `VIBE-001`). |
| 2 | Raw justification text, or absent | Everything after the **first** `--` following the rule id list, up to end of line. Greedy — a second `--` inside the text is captured as literal content, not treated as a delimiter. |

The pattern is not anchored at the start of the line (`//` can appear after
real code) but is anchored at the end (`\s*$`), so the directive must be the
last thing on the line.

## 2. Spacing rules

Only **one** space requirement is mandatory: at least one whitespace
character (`\s+`) between `ignore` and the first rule id. Every other gap is
`\s*` — zero or more whitespace, including tabs.

**Valid:**
- `// vibe-guard: ignore blocking`
- `//vibe-guard:ignore blocking` (no spaces around `//`, `vibe-guard`, `:`)
- `// vibe-guard : ignore blocking`
- `// vibe-guard: ignore blocking,kafka`
- `// vibe-guard: ignore blocking , kafka`
- `// vibe-guard: ignore blocking--reason` (no space before `--`)
- `// vibe-guard: ignore blocking   --   reason` (extra spaces everywhere)

**Invalid (does not match — treated as an ordinary comment, see §8):**
- `// vibe-guard: ignoreblocking` — zero spaces between `ignore` and the rule
  id violates the one mandatory `\s+`.
- `// vibe-guard:ignore` with no rule id at all — group 1 is mandatory,
  covered in §8.

## 3. Justification rules

The entire `-- justification` clause is optional. Two cases produce the
**same, indistinguishable result**:

1. No `--` at all: `// vibe-guard: ignore blocking`
2. `--` present but nothing meaningful after it: `// vibe-guard: ignore blocking --`

In both cases `justification` resolves to `null`. There is no point in the
implementation where these two cases are told apart — an empty capture after
`--` is normalized to `null` immediately, so "explicitly empty justification"
and "no justification clause" are the same value downstream. Only non-empty
trailing text produces a non-null `justification`.

## 4. Multiple rule ids

- Rule ids are deduplicated using a `Set` (insertion order preserved). Listing
  the same rule id twice (`ignore blocking,blocking`) produces a single
  logical rule id, not an error.
- There is no artificial limit on how many rule ids may appear in one
  directive. The regex permits unbounded repetition of the
  `(?:\s*,\s*RULE)*` group. In practice the ceiling is the number of rule ids
  the CLI defines (currently 6), but the grammar itself does not enforce
  that number.

## 5. Two directive types, defined by nature

Directives are classified by what precedes the comment marker on their own
line — **not** by a fixed notion of "this line" vs "next line" chosen by the
parser. Whether a directive targets its own line or the next line is a
*consequence* of its type, not an independent parameter.

- **Standalone directive**: the line contains *only* the comment — every
  character before `//` is whitespace (or there is no character before it).
  Applies to the **next** line.
- **Inline directive**: the comment trails real code on the same physical
  line — the prefix before `//`, once stripped of whitespace, is non-empty.
  Applies **only to that same line**, and never propagates to any other line.

## 6. Normative resolution algorithm

Resolution is defined **per finding**, not per directive. A finding is
`(ruleId, line)`.

```
Input: finding(ruleId, line)

1. Look up an inline directive on the finding's own line.
2. If that directive's rule ids cover the finding's ruleId, use it — resolved (suppressed).
3. Otherwise, look up a standalone directive whose target is the finding's line
   (i.e. one written on the previous physical line).
4. If that directive's rule ids cover the finding's ruleId, use it — resolved (suppressed).
5. If neither covers the finding's ruleId, the finding remains active (not suppressed).
```

Inline is checked strictly before standalone, regardless of which comment was
physically written first in the file. This is a per-`ruleId` check, not
all-or-nothing per line — two directives on the same target line can each
resolve a different rule id on the same finding line without interfering.

**Worked example** — line N-1 carries a standalone directive, line N carries
its own inline directive, and both target findings on line N:

```java
// vibe-guard: ignore layers -- legacy module boundary
someCall();  // vibe-guard: ignore blocking -- justified async wait
```

- A finding `(ruleId: "layers", line: N)` → step 1 checks the inline
  directive (`blocking` only) — does not cover `layers` — falls through to
  step 3, the standalone directive covers `layers` — **resolved, suppressed**.
- A finding `(ruleId: "blocking", line: N)` → step 1 checks the inline
  directive — covers `blocking` — **resolved, suppressed** at step 2, standalone
  is never consulted for this finding.
- A finding `(ruleId: "kafka", line: N)` → neither directive covers `kafka` —
  step 5 — **remains active**.

## 7. Invalid rule ids

The parser does not validate rule ids against the rule registry
(`blocking`, `blocking-kafka`, `kafka`, `layers`, `observability`,
`transactions`). A directive referencing an id that matches no real rule —
e.g. `// vibe-guard: ignore vibe-999` — parses successfully as a
syntactically valid directive. Since no finding will ever carry that
`ruleId`, the directive simply never resolves anything. This is a **silent
no-op**: no warning, no error, no diagnostic output. The parser's
responsibility is syntax only; it has no dependency on which rule ids
currently exist.

## 8. Malformed comments

`// vibe-guard: ignore` with no rule id following it does not match the
canonical regex at all (group 1 is mandatory, not optional). Such a comment
is indistinguishable from an ordinary code comment — it is not flagged, not
warned about, and does not raise an error. There is no diagnostic channel
for malformed suppression syntax; a typo in a directive fails silently in
exactly the same way an invalid rule id does (§7).

## 9. Current implementation note

This project has two independent rule engines — the CLI (this document) and
the MCP server (`mcp-server/src/main/java/com/vibeguard/mcp/suppression/`) —
each with its own inline suppression parser. They agree on directive syntax
(comment shape, spacing tolerance, justification handling, standalone vs
inline classification) but resolve **conflicting same-line directives**
differently:

- **CLI**: same-line (inline) precedence — inline is always checked before
  standalone, per §6.
- **MCP**: insertion-order precedence — whichever directive was registered
  first while scanning the file top-to-bottom (which in practice means the
  standalone directive from the previous line, since it's encountered first)
  is checked first.

This difference is intentional for now and should be revisited if
suppression semantics are unified across engines.

## 10. Status

This document is the shared normative reference for inline suppression
syntax and resolution semantics across the CLI, the MCP server, and any
future consumer (IDE extensions, pre-commit hooks, etc.). Any implementation
that claims to support java-vibe-guard inline suppressions must produce the
same result as this document specifies for the same input. Divergences must
be documented (see §9), not silent.
