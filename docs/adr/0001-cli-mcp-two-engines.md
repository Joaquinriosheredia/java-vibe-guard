# ADR 0001 — CLI and MCP Server as two separate detection engines

STATUS: DRAFT

This document consolidates facts already verified during the project's
development. It does not select an architecture and does not make a
recommendation. Where evidence was insufficient to support a claim, the
claim is not included, or is explicitly marked as unverified.

> **Verification note (added while drafting this ADR).** Direct
> inspection of `mcp-server/pom.xml`, `mcp-server/src/main/java/com/vibeguard/mcp/dto/FileContent.java`,
> `mcp-server/src/main/java/com/vibeguard/mcp/engine/VibeGuardEngine.java`,
> and `README.md` (all cited in full in §2 and §3) confirmed that
> `mcp-server/` does not use JavaParser and does not build an AST, and
> shares the CLI's fundamental static-analysis limitations. This
> corrects a working premise about the MCP server's capabilities that
> had been carried earlier in this project's design discussion. Only
> claims verifiable directly from this repository's code and documents
> are treated as fact in this document.

---

## 1. Context

The repository currently ships two independent static-analysis engines
for the same problem space (Java/Spring Boot "vibe coding" anti-patterns):

- **CLI** (`cli/`) — JavaScript, regex/line-heuristic based. Packaged as
  an npm binary (`cli/package.json`, `bin: { "java-vibe-guard":
  "bin/cli.js" }`) and wrapped in a GitHub Action (`action.yml`, repo
  root) with `path`, `rule`, and SARIF/Code-Scanning inputs. Its own
  description (`cli/package.json`): *"Static analyzer that detects vibe
  coding patterns in Java/Spring Boot projects."*

- **MCP Server** (`mcp-server/`) — Java/Spring Boot, packaged as a Spring
  AI MCP server (`pom.xml`: `org.springframework.ai:spring-ai-starter-mcp-server`).
  It exposes a single tool, `analyzeProject`, to MCP clients
  (`mcp-server/src/main/java/com/vibeguard/mcp/tools/VibeGuardMcpTools.java:22-40`).
  Its `pom.xml` description: *"MCP server exposing Java/Spring Boot
  vibe-coding anti-pattern detection as Claude Code tools."*

These two distribution shapes — CI-pipeline binary/Action vs.
agent-invoked MCP tool — are each confirmed by the files cited above.
No further claim is made here about *why* they were originally split
into two codebases (no design document or commit was found that states
this explicitly); the distinction above is limited to what each engine's
own packaging demonstrates about its intended consumption mode.

---

## 2. Verified facts

### CLI

**Confirmed limitations** (established across this session's investigations):

- **No type resolution.** `cli/src/rules/blocking.js:8-10` states this
  directly in a code comment: *"Future.get()/CompletableFuture.get() are
  intentionally NOT detected — distinguishing a blocking Future.get()
  from a non-blocking Optional.get()/Map.get()/etc. requires receiver
  type resolution, which this regex-based engine doesn't have."*
  This is not a design opinion — it was forced by a real false positive
  (Issue #5, see §3).
- **No data-flow analysis.** No rule in `cli/src/rules/*.js` tracks
  values across assignments or method boundaries; every rule matches
  regex patterns against raw lines or a fixed-size line window
  (e.g. `blocking.js:38`, a ±60-line window from an annotation).
- **No interprocedural analysis.** Each rule operates strictly within a
  single file's line array (`fileContexts` passed per file); no call
  graph or cross-method state is built anywhere in `cli/src/`.

**Concrete cases that demonstrated these limits:**

- **Future.get() vs Optional.get()** — `cli/src/rules/blocking.js:8-10`
  (comment) and Issue #5 (*"blocking: Optional.get() reported as
  blocking call"*, closed; fixed by commit `7a18298`, "fix(cli): narrow
  blocking detection to unambiguous blocking calls" — GitHub issue
  timeline confirms this commit is linked to Issue #5).
- **Java-Production-Labs investigation** — confirmed, during this
  session, that the CLI's regex engine cannot distinguish annotation
  context from comment context without explicit comment-stripping
  (`cli/src/rules/strip-comments.js`), and that rule matching is
  bounded by fixed line windows rather than actual method/block
  boundaries.
- **Found in the Wild investigation** — confirmed, during this session,
  by reading `cli/src/rules/blocking.js:1-6`, that the CLI's blocking-call
  detection is anchored to four specific annotations
  (`@Scheduled`, `@KafkaListener`, `@Async`, `@EventListener`) and does
  not fire on a `.block()` call inside an unannotated reactive method
  chain (the exact shape of the wild-code Finding 2, VIBE-002,
  `eugenp/tutorials` `spring-reactive-4`) — a direct, code-level
  demonstration of the "no interprocedural/contextual analysis beyond
  the annotation anchor" limitation.

### MCP Server

**Verified capabilities (cited to code):**

- The MCP server's rules are **regex/line-heuristic based, not
  AST-based** — the same paradigm as the CLI, implemented in Java
  instead of JavaScript. Evidence:
  - `mcp-server/pom.xml` declares no JavaParser (or any other Java
    source-parsing library) dependency. A repository-wide search
    (`grep -rn "javaparser\|JavaParser\|CompilationUnit"
    mcp-server/src/main/java/`) returned zero matches.
  - `mcp-server/src/main/java/com/vibeguard/mcp/dto/FileContent.java:7-11`
    — the record passed to every rule holds only `path`, `content`,
    `lines` (`content.lines().toList()`), and `lineCount`. No AST, no
    `CompilationUnit`, no symbol table.
  - `mcp-server/src/main/java/com/vibeguard/mcp/rules/Rule.java:9` —
    the `analyze(FileContent file)` signature confirms rules receive
    only text, never a parsed tree.
  - All 8 rule implementations under `mcp-server/src/main/java/com/vibeguard/mcp/rules/`
    import `java.util.regex.Pattern` (verified: `grep -L
    "java.util.regex.Pattern" mcp-server/src/main/java/com/vibeguard/mcp/rules/*.java`
    returns only `Rule.java`, the interface itself). Inspected directly:
    `MdcContextLeakRule.java` (manual brace-depth counting to delimit
    method boundaries, `Pattern`-based annotation/MDC matching),
    `JpaNPlusOneRule.java`, and `ReactorBlockingCallRule.java` — all
    three use `Pattern`/`Matcher` against `FileContent.lines()`, with
    no parse tree at any point.
- **No cross-file state in the engine.** `mcp-server/src/main/java/com/vibeguard/mcp/engine/VibeGuardEngine.java:39-58`
  — `scan()` walks all `.java` files, and for each file independently
  builds a `FileContent` and runs every `Rule.analyze(fc)` against it.
  No shared symbol table, project model, or cross-file accumulator is
  constructed at any point in this loop.
- **Single exposed tool, directory-scoped.** `VibeGuardMcpTools.java:22-40`
  — `analyzeProject(projectPath, verbose)` calls `engine.scan(projectPath)`
  and returns the aggregated `AnalysisResult`. This is a directory scan
  composed of independent per-file rule runs (per the point above), not
  a project-wide semantic analysis.
- **This is independently corroborated by the project's own README.**
  `README.md:223` (Layer 3 — MCP Server section) states: *"Limitation:
  same as the CLI, inheriting its static analysis constraints."* This
  matches the code-level finding above and is not something inferred
  by this ADR — it is an existing, pre-written statement in the
  repository.

**Plausible but not implemented** (the framework could support this;
no evidence it exists today):

- Because the MCP server is a Spring Boot Java application, it could in
  principle add a real parser (e.g. JavaParser) or a cross-file symbol
  table without changing the external `Rule`/`FileContent` contract —
  but no such code exists in the inspected source tree.
- `cli/src/rules/blocking.js:11` references *"the pending CLI/MCP
  architecture ADR"* (i.e., this document) when explaining why the CLI
  doesn't resolve receiver types — this comment reflects an expectation
  at the time it was written, not a verified capability of the MCP
  server. No code in `mcp-server/` was found that performs receiver
  type resolution.

**Not verified** (insufficient evidence to assert, in either direction):

- Type resolution / symbol solving — not found in the inspected code;
  not verified as present or absent beyond the rule files directly
  inspected (`MdcContextLeakRule`, `JpaNPlusOneRule`,
  `ReactorBlockingCallRule` — all confirmed regex-based; the remaining
  five rules — `TransactionalAsyncRule`, `VirtualThreadsMisuseRule`,
  `ConnectionPoolStarvationRule`, `KafkaRebalanceHazardRule`,
  `Rule.java` itself — were confirmed only via the repository-wide
  `Pattern` import / JavaParser-absence greps above, not read line by
  line).
- Data-flow / taint tracking — no evidence found; the presence of an
  AST alone (which itself is not present, per above) would not have
  implied this either.
- Interprocedural / cross-file symbol resolution — contradicted by the
  per-file independent loop in `VibeGuardEngine.java` (see above); not
  merely "unverified" but actively counter-evidenced by the engine's
  own control flow.

---

## 3. Accumulated evidence

**Issue #5** — *"blocking: Optional.get() reported as blocking call"* (CLOSED).
What was learned: the CLI's original `.get()` regex matched any
receiver, producing a false positive on `Optional.get()`. Implication:
confirmed, with a real reproduction (`cli/test-fixtures/BlockingFalsePositive.java`),
that the CLI's regex engine cannot distinguish call receivers without
type information — the root cause behind the "no type resolution"
limitation recorded in §2. Reference: Issue #5, fixed by commit
`7a18298` ("fix(cli): narrow blocking detection to unambiguous blocking
calls").

**Issue #7** — *"--rule does not accept blocking-kafka although it is a
valid CLI rule id"* (CLOSED). What was learned: the CLI's rule-id list
was duplicated across multiple consumers (`--rule` validator, SARIF
output, docs) without a single source of truth, so a rule id valid in
one surface was rejected in another. Implication: cross-surface drift
between independently maintained rule-id lists is a demonstrated,
recurring failure mode in this codebase (the same class of drift is
referenced again in the `kafka-send-timeout` commit message, see
below). Reference: Issue #7, fixed by commit `446f82e` ("fix(cli):
--rule now filters findings by exact ruleId, derives valid ids from
rule-catalog.js (fixes #7)").

**kafka-send-timeout** — new CLI rule (commit `d29adea`, "feat(cli): add
kafka-send-timeout rule for unbounded send().get() calls"). What was
learned: this rule's evidence citation (commit message) points to
Java-Production-Labs bugs #2/#3 (`SagaOrderService.java` commit
`01cee18`, `StreamController.java` commit `dcb0358`) — i.e., it was
added with a direct, cited real-world case, in contrast to VIBE-007's
original (incorrect) citation. Implication: the commit message itself
states that adding this rule required consolidating `stripComments()`
into a shared module (`cli/src/rules/strip-comments.js`) and updating
every consumer of the rule-id list "to stay in sync... the same class
of cross-surface drift that caused issue #7" — confirming the drift
risk from Issue #7 recurs each time a rule id is added. Reference:
commit `d29adea`.

**Java-Production-Labs investigation (7 rules, VIBE-001–VIBE-007)** —
per `README.md` (`## Active Rules — MCP Server`, `## Why These Rules
Exist`, and each VIBE-00X section), 5 of the 7 MCP rules (VIBE-001,
VIBE-003, VIBE-004, VIBE-005, VIBE-006) cite a specific
Java-Production-Labs lab with a benchmarked failure mode (e.g. VIBE-004:
7.4× throughput gain measured, README lines ~120-122). VIBE-002 and
(prior to Issue #8) VIBE-007 are/were marked *"Theoretical"* — no direct
lab observation. Implication: the majority of the MCP rule set has a
documented empirical basis in this repository; two rules did not, and
one of those two (VIBE-007) was additionally found to cite the wrong
commit as evidence (see Issue #8). Reference: `README.md` VIBE-001
through VIBE-007 sections.

**Issue #8** — *"VIBE-007 cites wrong commit as evidence — actual bug is
a distinct MDC pattern"* (CLOSED). What was learned: VIBE-007's README
evidence cited commit `3aa5448` (an MDC log-injection/CWE-117 fix in
`OrderController`/`SagaController`), which does not demonstrate the
`@Async`/`@Scheduled` + missing `MDC.clear()` pattern VIBE-007 actually
detects. A dedicated investigation into `Java-Production-Labs`'s commit
history (this session, immediately preceding this issue — the audit
described in the bullet above is what surfaced this discrepancy) found
no commit adding `MDC.clear()` to an `@Async`/`@Scheduled` method that
previously lacked it — the repository's only `@Scheduled` method
(`OutboxPublisher.pollAndPublish()`) has never contained MDC code in
any commit. Implication: VIBE-007 currently has no verified field case
in `Java-Production-Labs`. Reference: Issue #8, fixed by commit
`9de9be8` ("docs: correct VIBE-007 evidence after Java-Production-Labs
audit (fixes #8)"), which replaced the citation with an explicit "no
verified production case" statement and left the rule's *Theoretical*
status marker unchanged (it was already correctly set).

**Found in the Wild investigation** (`eugenp/tutorials`) — three
findings are documented in `README.md` (`## Found in the Wild`,
Findings 1–3), each with file, line, and rule id (VIBE-005, VIBE-002,
VIBE-006). After Issue #8 was fixed and pushed, this session
cross-checked those three findings against the CLI's current rule
implementations (not against the `eugenp/tutorials` repository itself,
which is not available locally) and showed that Findings 1 and 3's
patterns are matched by the CLI's `transactions` and `blocking-kafka`
rules respectively, while Finding 2's pattern (`.block()` on an
unannotated reactive chain) is not matched by any current CLI rule,
because `blocking.js`'s search is anchored to four specific annotations
that Finding 2's method does not carry. No new rule candidate was
confirmed as warranted from this investigation — repeated-occurrence
evidence in the wild repository could not be gathered without local
access to it. Reference: `README.md` `## Found in the Wild`; this
session's investigation (no issue number filed).

**MCP capabilities verification** (this session, most recent — part of
drafting and then reviewing this ADR). Direct inspection of
`mcp-server/pom.xml` (no JavaParser/parsing-library dependency),
`FileContent.java:7-11` (text-only record, no AST type),
`VibeGuardEngine.java:39-58` (per-file independent rule execution, no
cross-file state), and `README.md:223` (*"same as the CLI, inheriting
its static analysis constraints"*) confirmed that the MCP server does
not use JavaParser or build an AST, and shares the CLI's core
static-analysis limitations recorded in §2. Implication: this corrects
a working premise — that the MCP server's Java/Spring implementation
implied AST-based, type-resolving analysis — that had been carried
earlier in this project's design discussion. Reference: this document,
§2 (MCP Server); no separate issue or commit exists for this
verification, since it was performed directly from the code and docs
cited above during this ADR's drafting and review.

---

## 4. Architectural options

No option is selected or recommended below. Each lists only advantages,
disadvantages, risks, and open questions.

### Option A — Keep two separate engines

- **Advantages:** Each engine stays scoped to its actual consumption
  mode (CI/Action binary vs. MCP tool) without a shared-abstraction
  migration cost; no coordinated release process needed to touch both.
- **Disadvantages:** The cross-surface drift pattern already observed
  within a single engine (Issue #7, and recurring per the
  `kafka-send-timeout` commit message) exists *between* the two engines
  too — e.g., VIBE-XXX ids (MCP) and CLI rule ids (`kafka`,
  `kafka-send-timeout`, etc.) are already two separate, unsynchronized
  identifier spaces (confirmed: `cli/src/rule-catalog.js:1-6` states in
  a comment that there is no README section covering the CLI's rule
  ids, and that VIBE-001..007 in `README.md` documents "the MCP
  server's unrelated... rules").
- **Risks:** Rule logic (e.g. a blocking-call pattern) can silently
  diverge between the two regex implementations (JS vs. Java) since
  nothing enforces parity.
- **Open questions:** Is divergence between the two rule sets currently
  tracked or measured anywhere? No evidence of such tracking was found.

### Option B — Progressive convergence

- **Advantages:** Not evaluated here — no implementation exists to
  assess.
- **Disadvantages:** Not evaluated here.
- **Risks:** Not evaluated here.
- **Open questions:** Convergence toward what shared layer (shared rule
  definitions? shared identifier catalog? one engine calling the
  other?) is undefined at this stage — no design work on this exists in
  the repository.

### Option C — Other approach

- **Advantages:** Not evaluated here.
- **Disadvantages:** Not evaluated here.
- **Risks:** Not evaluated here.
- **Open questions:** No alternative approach has been proposed or
  documented anywhere in the repository as of this ADR.

---

## 5. Open questions

- Should there be a single, unified VIBE-XXX catalog shared by both
  engines, or should CLI and MCP rule identifiers remain separate
  namespaces?
- Should some rules be MCP-exclusive for reasons other than analysis
  capability — e.g. interaction model (agent-invoked, single-session
  feedback loop per `README.md:219-221`) vs. CI-gate (`action.yml`) —
  given that §2 found no verified capability difference between the
  two engines (both are regex/line-heuristic, single-file, per-file
  independent)?
- If any shared metadata (rule id, description, evidence citation)
  is to exist between engines, what would keep it in sync, given that
  Issue #7 and the `kafka-send-timeout` commit both demonstrate that
  *unsynchronized* duplication is the default failure mode in this
  codebase?
- What user experience is intended across the two engines — same rule
  firing identically in CI (CLI/Action) and in an interactive agent
  session (MCP), or deliberately different scopes per surface?
- Does the MCP server's current single-tool, per-file-independent
  design (§2) reflect an intentional scope boundary, or is project-wide
  analysis (cross-file) an unaddressed gap?
- The MCP server is commonly framed (outside this repository's own
  docs — see §2, `README.md:223` states the opposite explicitly) as
  using JavaParser/AST. No such framing was found written anywhere in
  this repository. Where does that expectation come from, and is it
  still a target for the MCP server, or should it be dropped?

---

Decision
---------
Pending.
