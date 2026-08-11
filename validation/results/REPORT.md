# Public Validation Report

Generated: 2026-08-10T20:08:13.589Z
CLI version: 1.0.3

**Scope note:** this measures CLI stability and reproducibility on real codebases, not detection quality — see docs/validation-contract.md §7. A repo with `healthy: false` (critical findings in the scanned code) is an expected result, not a failed validation run.

## Repos

| Repo | Commit | Status | Files scanned | Critical | Major | Warning | Info | Healthy |
|---|---|---|---|---|---|---|---|---|
| eugenp/tutorials | ccab8a7 | ok | 29141 | 22 | 211 | 2649 | 0 | false |
| spring-projects/spring-petclinic | 88e37c1 | ok | 77 | 0 | 9 | 18 | 0 | true |

## Totals

- Repos: 2/2 ok, 0 unavailable
- Files scanned: 29218
- Findings: 2909 reported (22 critical, 220 major, 2667 warning, 0 info)