# V1 unified integration baseline

Date: 2026-10-20

## Scope and lineage

This document records an integration candidate only. It does not close, alter, or
override any formal hold, QA status, release gate, or task status.

| Item                       | Evidence                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream baseline checked  | `origin/main` = `5139cc8f7d5a70cddb80b3ce5665100a316c9656` (`feat: Honsen market execution and parent receipts (#12)`)                      |
| Production backbone        | `b190a82cf528fcd654b268abba3de6f139b42dee` (`feat(sync): resolve draft purchase order conflicts`)                                           |
| Ancestry                   | `origin/main` is an ancestor of `b190a82`; divergence was `0 107`, so the production backbone was fast-forwarded without a merge conflict.  |
| Candidate branch           | `codex/v1-unified-baseline`                                                                                                                 |
| Production integration tip | `4fc0a370e52943a3d768b8fab2b6c117b1c99ef6`: 107 backbone commits plus the branch-local G2 audit-document integration.                       |
| G2 status audit source     | `0bc5a9b65a72b168496622c64d1a1c543b9f110b`; its content was cherry-picked as `4fc0a37` because its original parent was not in the backbone. |

The branch was created in the isolated worktree
`C:/Users/This PC/.codex/worktrees/v1-unified-baseline/Honsen materials` from
the then-current `origin/main`. No branch was rewritten, pushed, merged into
`main`, or deleted.

## What is implemented and integrated

The fast-forward imported the existing production backbone, including the
following evidence-bearing slices. “Integrated” here means reachable from this
candidate; it does not mean independently accepted or release-ready.

| Slice                                             | Production source                                            | Integration status | Verification status                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G2 formal-order Pull snapshots                    | `6e0a2a61fdf0967d75dc5edec3eed5e350056ef5`                   | Integrated         | Historical independent QA is `ff7bff6f421cb71448deff017bba7a8f0485070a`; the preserved scope is six formal-order header fields and ten owner-line snapshot fields. |
| G3 permanent-outbox classification                | `35b9f60c0b9c5df0d4283649455f1a7d5d991631`                   | Integrated         | Covered by fresh Rust core tests and historical independent QA `9e6c6457de755a2afc3c81dda0391dc1664da67b`.                                                         |
| G4 draft purchase-order conflict resolver         | `b190a82cf528fcd654b268abba3de6f139b42dee`                   | Integrated         | Candidate only; independent Native QA at `1ec046fc8bebbb89e4c48164c61a3237300405fb` remains `QA_BLOCKED`, described below.                                         |
| FIX2/G1 session-origin safeguards                 | `13b22ffe8aa294535f9036eda32d7cfc81f6481f` and its ancestors | Integrated         | Fresh Rust and browser fixture coverage ran; formal G1 status is unchanged.                                                                                        |
| RFQ lifecycle and server projection               | `b1905dc`, `0c763f9`, `48f6794`                              | Integrated         | Browser regression ran; final formal acceptance is unchanged.                                                                                                      |
| Receipt/payment expenditure slice                 | `e781b98`                                                    | Integrated         | It is the same production patch as divergent branch commit `cbc129a`; no additional cherry-pick is needed.                                                         |
| Formal issue registry and server trust boundaries | `8e20a48`, `4b7dd54`                                         | Integrated         | `4b7dd54` is the same production patch as divergent `43a6410`; formal hold remains unchanged.                                                                      |

## Integration result

The backbone was integrated by one `git merge --ff-only b190a82`, not by a
series of duplicate cherry-picks. The operation had **no conflicts**. The only
additional commit is `4fc0a37`, which carries the G2 status-audit evidence and
does not change production code.

The required Honsen Toolbox sources were read before integration. The integrated
range does not modify installer, updater, release, or Toolbox-contract files.
The existing Toolbox integration-gap list therefore remains unchanged; this
baseline does not claim to close it.

## Current verification

Fresh checks were run at candidate HEAD unless noted otherwise.

| Check                                                                          | Result                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`           | PASS                               | 84 passed, 0 failed. This includes formal Pull, structured-outbox, migration, login/authorization, and draft-conflict core coverage.                                                                                                                                                                                                                                                                                                                             |
| `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`          | PASS                               | No Rust formatting drift.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `npm run typecheck`                                                            | PASS                               | Desktop, server, and shared packages passed.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Targeted server tests without PostgreSQL                                       | PASS                               | 29 passed, 9 skipped because `TEST_DATABASE_URL` was absent in that run.                                                                                                                                                                                                                                                                                                                                                                                         |
| `npm run lint`                                                                 | PASS with one pre-existing warning | React `set-state-in-effect` warning in `apps/desktop/src/App.tsx`.                                                                                                                                                                                                                                                                                                                                                                                               |
| `npm run build`                                                                | PASS                               | Desktop, server, and shared production builds passed; Vite reports the existing >500 kB chunk-size warning.                                                                                                                                                                                                                                                                                                                                                      |
| `npm run e2e -- tests/e2e/navigation.spec.ts tests/e2e/sync-lifecycle.spec.ts` | PASS                               | 36 Chromium DOM tests passed, including login/CAPTCHA/offline lock, role boundaries, purchase/receipt flows, and push-before-Pull lifecycle fixtures.                                                                                                                                                                                                                                                                                                            |
| `npm run format:check`                                                         | FAIL                               | Seven existing formatting differences: `App.tsx`, `SyncConflictPanel.tsx`, three native-server scripts, the T08/T10 forensics document, and the imported G2 verification document. No pre-existing production file was reformatted during this integration.                                                                                                                                                                                                      |
| PostgreSQL migration/store/G1 integration tests                                | INCONCLUSIVE                       | A fresh container authenticated successfully, then another process issued an administrator shutdown during the suite. Before shutdown: 37 passed, 2 failed due to shutdown, 5 skipped; the two other files could not start. The Compose project name `honsenmaterials` is shared across worktrees, so no further retry or cleanup was performed to avoid interfering with another session. This is not evidence of a product defect or a passing database suite. |

## G4 Native QA status

The latest G4 Native QA worktree was inspected read-only:

- Worktree: `E:/Project/honsen-t10d-g4-qa`
- QA head: `1ec046fc8bebbb89e4c48164c61a3237300405fb`
- Branch: `codex/qa-t10d-g4-b190a82`
- Status: `QA_BLOCKED`; it also has local QA changes that were deliberately not
  integrated.

Its latest successful smoke evidence covers draft `use_server` and
`replace_draft`, replay without duplicate events, base-v2/server-v3 convergence,
audit/reason fields, role checks, revoked sessions, empty-reason rejection,
duplicate Pull, and profile restart. It does **not** provide a true executable
case for a cancelled/formally-issued or otherwise non-draft divergent order, nor
the resolver transaction-failure boundary. Accordingly, G4 is implemented and
integrated, partially verified, and **not releasable/closable**. This document
does not change G1, T10, T10-SEC-001, P1, or any Formal hold.

## Review of divergent F-family work

The relevant divergent branches were compared against `b190a82` before any
additional integration was considered.

| Divergent candidate                  | Finding                                                                                                                                                                      | Decision                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `7b408de` T04 parent acceptance      | Its country/tax synchronization patches are already represented by equivalent patches in the backbone.                                                                       | Do not cherry-pick. Its task-record changes are not imported.    |
| `cbc129a` T09 receipt/payment        | `cbc129a` and `e781b98` have identical production patches.                                                                                                                   | Already integrated; do not duplicate.                            |
| `43a6410` T08/T10 formal integration | Its formal trust-boundary patch is identical to `4b7dd54` in the backbone.                                                                                                   | Already integrated; do not duplicate.                            |
| `41cc003` RFQ lifecycle              | Lifecycle, validation, and remote-history production patches are represented by `b1905dc`, `0c763f9`, and `48f6794`.                                                         | Already integrated; do not duplicate.                            |
| `031ad67` runtime sync               | Contains a later conflict-provenance patch not in the backbone; a related alternative exists at `fbdb14b`. Its acceptance boundary is still tied to open G1/T10 formal work. | Do not integrate without a scoped correctness/acceptance review. |

## Release assessment and next work

This candidate is a reproducible integration baseline, **not a release
candidate**. It is implemented and integrated at the production integration tip
above; it is only partly
verified and is not releasable while the following remain open:

1. G4 needs the missing non-draft conflict and transaction-failure acceptance
   evidence (or an approved, safe test-control mechanism). The existing formal
   status remains `QA_BLOCKED`.
2. G1, T10, T10-SEC-001, P1, and Formal holds remain exactly as recorded by
   their owning evidence.
3. PostgreSQL migration/store/G1 integration needs a dedicated, non-shared
   Compose project or an uncontended test window; the interrupted run cannot be
   accepted.
4. The existing formatting gate must be reconciled before a quality-gated
   release claim.

The next V1 slice should be **G4 non-draft order-conflict safety verification
and, only if it exposes a real gap, the smallest resolver repair**. It is the
closest unresolved boundary to a data-integrity release blocker, has an existing
production candidate, and should begin by obtaining isolated Native/fixture
control rather than reimplementing draft conflict handling. Its minimum
acceptance is executable proof that formally-issued/cancelled divergent orders
cannot be overwritten, that a resolver write failure rolls back atomically, and
that replay remains idempotent. No formal status changes follow from this
recommendation alone.
