# V1 unified integration closure

Date: 2026-10-20

## Frozen baseline

| Item                              | Result                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integration branch                | `codex/v1-unified-baseline`                                                                                                                            |
| Upstream rechecked                | `origin/main` = `5139cc8f7d5a70cddb80b3ce5665100a316c9656`                                                                                             |
| Production integration ancestry   | `b190a82` is a fast-forward descendant of `origin/main`; the initial integration had no merge conflict.                                                |
| Pre-closure integrated tip        | `02f7cc0ab84de175e0861c978ab02d9659db09b0`                                                                                                             |
| Closure formatting commit         | `a1faaf6ff97493baf2992592a08d2db0f47b78f8`                                                                                                             |
| Worktree state before this report | No tracked or normal untracked files. Ignored items were only local environment/configuration, dependency directories, build output, and test reports. |

No SQLite database, EXE, certificate, cache, log, or Native-QA artifact is
tracked by this branch. The isolated PostgreSQL project used below was removed
with its volumes after the attempt.

This closure does not change the formal status of G1, T10, T10-SEC-001, P1, or
the Formal hold.

## Integrated scope

The candidate contains the existing accepted/implemented backbone: FIX2/G1
session-origin work, G2 formal-order Pull snapshots, G3 structured permanent
outbox failures, T10-D/G4 draft-order conflict candidate, RFQ lifecycle and
projection, formal issue trust boundaries, T09 expenditure recording, and the
supporting master-data and authenticated-sync changes. The detailed SHA map is
in [V1-UNIFIED-INTEGRATION-BASELINE.md](V1-UNIFIED-INTEGRATION-BASELINE.md).

G2 (`6e0a2a6`, independent QA `ff7bff6`) and G3 (`35b9f60`, independent QA
`9e6c645`) are completed only within their signed boundaries. They are not
backlog development items and must not be redeveloped as part of the next V1
slice.

## Verification ledger

| Boundary                                 | Evidence                                                                                                                                                                                             | Status                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Rust desktop core                        | Candidate baseline: 84 passed, 0 failed.                                                                                                                                                             | VERIFIED for that exact baseline before this formatting-only closure commit. |
| Playwright                               | `navigation.spec.ts` and `sync-lifecycle.spec.ts`: 36 passed.                                                                                                                                        | VERIFIED for that exact baseline.                                            |
| Server targeted tests without PostgreSQL | 29 passed, 9 PostgreSQL-dependent tests skipped.                                                                                                                                                     | VERIFIED within its non-PostgreSQL boundary.                                 |
| TypeScript typecheck                     | Desktop, server and shared packages passed.                                                                                                                                                          | VERIFIED for the baseline.                                                   |
| Production build                         | Desktop, server and shared packages passed.                                                                                                                                                          | VERIFIED for the baseline.                                                   |
| Formatting                               | The seven reported deviations were formatted in `a1faaf6`; fresh `npm run format:check` passed.                                                                                                      | VERIFIED at the closure tip's parent.                                        |
| PostgreSQL server integration            | Fresh isolated attempt with project `honsen-v1-integration-20261020` and port `54331` was interrupted by a PostgreSQL fast shutdown. The run ended 69 passed, 14 failed due to shutdown, 21 skipped. | NOT VERIFIED; not a product-test PASS or a product-defect verdict.           |
| G4 Native acceptance                     | Latest recorded QA head `1ec046f` has evidence for draft `use_server`/`replace_draft`, replay, authorization and restart.                                                                            | QA_BLOCKED; see below.                                                       |

The formatting change is semantic-free. No release-quality claim transfers a
test result across a different source SHA; the table preserves the exact scope
of reused evidence.

## Outstanding G4 and database gaps

The current records do not establish a final PASS for the requested G4 gaps:

| Gap                                                                      | Current conclusion                                                                                                        | Release impact                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GAP-01: real two-device draft conflict convergence                       | Draft paths have Native evidence, but this does not prove every order state.                                              | QA_GAP, not a closure.                                                                 |
| GAP-02: cancelled/formally-issued or otherwise non-draft divergent order | The trusted command rejects these states before mutation, but no completed real-EXE acceptance proof is recorded.         | QA_GAP; retain immutable cancel/close-plus-revision protection.                        |
| GAP-03: resolver transaction-failure rollback                            | No accepted Native evidence proves every resolver-write failure rolls back atomically.                                    | QA_GAP; do not claim G4 PASS.                                                          |
| PostgreSQL integration suite                                             | Two attempts, including a uniquely named/ported Compose project, were interrupted by a PostgreSQL administrator shutdown. | RELEASE_BLOCKER for an integration/release claim until an uncontended run is retained. |

No new Harness or G4 implementation was committed in this closure. The
uncommitted exploratory Native work in a separate G4 worktree is outside this
branch and is not evidence for this candidate.

## Status distinction

| State         | Meaning at closure                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| IMPLEMENTED   | The backbone contains the listed production slices.                                                             |
| INTEGRATED    | The slices are reachable from `codex/v1-unified-baseline`; no duplicate F-family production patch was imported. |
| VERIFIED      | Only the exact commands/SHA boundaries in the ledger have evidence.                                             |
| RELEASE_READY | No. Open formal gates, unresolved G4 QA gaps, and the interrupted PostgreSQL suite prevent this classification. |

## PR readiness

- `main` has no configured GitHub branch-protection rule (API returned 404).
- The repository CI workflow runs formatting, lint, typecheck, test, build and
  E2E. Formatting now passes locally; the last CI success is for `origin/main`
  `5139cc8`, not this candidate.
- The branch is `0 110` ahead/behind relative to `origin/main` before this
  report commit: it has no missing upstream commits and contains 110 commits.
- Formal holds do not mechanically forbid opening a review PR, but they forbid
  presenting the branch as release-ready or closing their parent tasks.

**PR status: PR_BLOCKED for merge/release readiness.** A review PR could be
opened after explicit push/PR authorization, but it must retain the PostgreSQL
and G4 blockers and wait for CI. It is not recommended to request merge while
those gates are unresolved.

Recommended PR title:

```text
feat(v1): unify offline procurement and sync delivery baseline
```

Recommended PR description:

```markdown
## Scope

- Fast-forward integration of the existing V1 production backbone.
- Includes FIX2, G2 formal Pull, G3 structured outbox handling, draft order
  conflict candidate, RFQ/formal/order-sync and receipt/expenditure slices.
- Adds integration evidence and a formatting-only CI gate repair.

## Verification

- Rust core: 84 passed.
- Targeted Playwright: 36 passed.
- Targeted server (without PostgreSQL): 29 passed, 9 skipped.
- Typecheck and production build passed.
- Format check now passes.

## Known blockers

- PostgreSQL suite was interrupted by database fast shutdown; no PASS claimed.
- G4 remains QA_BLOCKED for non-draft conflict and transaction rollback proof.
- G1, T10, T10-SEC-001, P1 and Formal holds remain open.

## Merge recommendation

Do not merge as a release-ready baseline until CI passes and the named release
blockers are explicitly resolved or dispositioned by their owning gates.
```

Recommended merge strategy, once authorized and gates pass: **squash merge**,
so `main` receives one auditable baseline change while preserving the detailed
local integration history on the task branch.

## Remaining work and next V1 slice

Can defer to V1.1 only if formally approved: bundle-size optimization, the
existing React lint warning cleanup, and non-critical test-harness ergonomics.
They are not current release blockers.

The next V1 development slice is **G4's bounded non-draft conflict safety
acceptance/repair**, starting with an isolated, approved test-control path. It
must prove that issued/cancelled orders cannot be overwritten and that a
resolver write failure rolls back the whole local transaction; only a reproduced
production gap authorizes a production repair. This recommendation does not
reopen G2 or G3 and does not alter any formal hold.
