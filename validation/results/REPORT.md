# Public Validation Report

Generated: 2026-10-03T20:15:38.010Z
CLI version: 2.0.0

**Scope note:** this measures CLI stability and reproducibility on real codebases, not detection quality — see docs/validation-contract.md §7. A repo with `healthy: false` (critical findings in the scanned code) is an expected result, not a failed validation run.

## Repos

| Repo | Commit | Status | Files scanned | Critical | Major | Warning | Info | Healthy |
|---|---|---|---|---|---|---|---|---|
| eugenp/tutorials | ccab8a7 | ok | 29141 | 20 | 211 | 2598 | 0 | false |
| spring-projects/spring-petclinic | 88e37c1 | ok | 77 | 0 | 9 | 18 | 0 | true |

## Totals

- Repos: 2/2 ok, 0 unavailable
- Files scanned: 29218
- Findings: 2856 reported (20 critical, 220 major, 2616 warning, 0 info)