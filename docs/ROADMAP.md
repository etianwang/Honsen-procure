# Roadmap and Development Tasks

The authoritative execution order and mandatory per-task DOM testing gate are in [BUILD-TASKS.md](BUILD-TASKS.md). This file remains a compact milestone index.

## Current acceptance and bidirectional task mapping — 2026-10-11

Original milestone objectives below are retained. Their checkboxes concern the complete stated objective, not an implemented subset. The task acceptance register and child items in BUILD-TASKS provide evidence and remaining work; memory.md provides the current handoff. Cross-stage contributions do not redefine milestones or dependencies.

| Milestone | Acceptance      | Contributing tasks (reverse mapping is in BUILD-TASKS) | Outstanding acceptance                                                                                                                                                                                                                                                                      |
| --------- | --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | [ ] IN PROGRESS | T00, T01, T02, T03, T04, T05                           | Authorized initial master-data records are BLOCKED pending deployment account/setup authority. T02-A PostgreSQL migration/sync-store integration and the repaired CI local gate passed, but T02-B/C and an authorized remote CI run remain open. M0 is not ready for full stage acceptance. |
| M1        | [ ] IN PROGRESS | T02, T03, T04, T05, T13                                | Close PostgreSQL/account and actual master-data acceptance; retain administration hardening. Local catalog slice is accepted, not the whole milestone.                                                                                                                                      |
| M2        | [ ] IN PROGRESS | T01, T06, T07, T08, T09, T11, T12, T14                 | Production order/allocation/RFQ routing, numbering, full receiving/archival, bilingual PDF/printing/export and final snapshot/Windows acceptance.                                                                                                                                           |
| M3        | [ ] IN PROGRESS | T02, T03, T08, T10, T11, T14                           | T02-A PostgreSQL migration/sync-store evidence is retained; complete account/session PostgreSQL acceptance, safe entity projection, desktop startup/retry/WebSocket/revocation and multi-device offline/reconnect acceptance remain open.                                                   |
| M4        | [ ] BLOCKED     | T09, T11, T12, T13, T14, T15                           | Release identity approval blocks T15; remaining attachment, export, backup/localization/performance, print/accessibility and Windows acceptance have not passed.                                                                                                                            |

Accepted tasks: **T00, T01, T03, T05, T06, T07**. Partial tasks: **T02, T04, T08, T09, T10**. Not started: **T11–T14**. Blocked: **T15**. Partial tasks remain unchecked even where some historical gates passed.

Evidence is committed code at `077b064`, committed tests and historical executed results recorded by the prior audit and memory.md. That recorded gate includes 31 JavaScript tests, 11 Rust tests and 16 Playwright tests. On 2026-10-11, the two PostgreSQL integration suites formerly skipped locally passed against a disposable Docker PostgreSQL 16 container; this accepts T02-A only. The CI repair then passed a fresh local gate with desktop 2, server 17 (including both PostgreSQL suites), shared 14 and 16 Playwright tests. Counts are not a successful remote CI result: the workflow is awaiting an authorized push. The uncommitted Rust draft is not included in accepted evidence and prevents treating historical passing results as verification of the current worktree.

## Milestone 0 — Foundation

- [x] React desktop visual shell: 首页 and 材料库总览, including four supplier quote cards and client-side role visibility test
- [x] Monorepo workspace, shared Zod/money contracts, server package placeholder and CI quality gates
- [x] Tauri-ready host boundary and design tokens (release/bundle identity intentionally deferred)
- [x] Versioned SQLite authentication migration, secure offline verifier cache and Rust/Tauri authorization boundary
- [x] SQLite material/supplier/price repositories, square material-image crop and trusted local catalog commands
- [ ] Authorized initial master-data deployment records (requires the deployment account; codes are intentionally never migration seeds)
- [ ] CI formatting/lint/typecheck/test/build and Playwright DOM gate (local repair verified; successful remote run awaiting authorized push)

M0 item tracking (all seven original objectives, in order):

| Item                                                | Actual status | Task/evidence and remaining acceptance                                                                                                                    |
| --------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Visual shell                                    | COMPLETED     | T00/T05 shell, navigation, four-quote and read-only DOM evidence.                                                                                         |
| 2 — Workspace/contracts/server placeholder/CI setup | COMPLETED     | T00/T01 committed workspace and pipeline configuration; the setup objective does not imply successful PostgreSQL CI execution.                            |
| 3 — Host boundary/design tokens                     | COMPLETED     | T00/T03 local Tauri foundation; release identity remains intentionally deferred.                                                                          |
| 4 — SQLite authentication/trusted boundary          | COMPLETED     | T03 migrations, offline verifier and Rust/DOM evidence.                                                                                                   |
| 5 — Local catalog/crop/trusted commands             | COMPLETED     | T05 SQLite repositories and material/supplier/price/crop tests.                                                                                           |
| 6 — Authorized actual initial records               | BLOCKED       | T04-A; approved code mapping exists, authorized deployment records do not.                                                                                |
| 7 — CI and DOM execution gate                       | IN PROGRESS   | The repaired quality workflow passed locally with PostgreSQL integration and 16 DOM tests; T02-B/C and a verifiable successful remote CI run remain open. |

## Milestone 1 — Local catalog and protected backend

- [ ] Admin password setup/unlock/lock and rate limiting in Rust boundary
- [x] Material and supplier CRUD
- [x] Supplier-specific manual prices and price history
- [x] Search and validation
- [ ] Unit/integration tests

## Milestone 2 — Offline ordering

- [ ] Two-column prescription-style order screen
- [ ] Cart, quantity, overrides, exact totals
- [ ] Order draft, confirmation, history, copy/reprint
- [ ] A4 bilingual PDF and printing
- [ ] Snapshot integrity tests

## Milestone 3 — Cloud sync

- [ ] PostgreSQL schema + transactional change log
- [ ] Account-session authentication, scoped synchronization and one-online-session enforcement
- [ ] SQLite transactional outbox
- [ ] Push idempotency, version checks, conflict records
- [ ] Pull cursor, retries, connectivity status
- [ ] Multi-device chaos tests

## Milestone 4 — Hardening and release

- [ ] Windows installer (Inno Setup or MSI) and update strategy compatible with the Honsen Toolbox contract
- [ ] Honsen Toolbox contract: approved identity, manifest, Runner, registry and E2E acceptance
- [ ] Data export/backup/restore
- [ ] Performance with 10k+ catalog entries
- [ ] Multi-page print QA and accessibility
- [ ] User acceptance testing and release checklist

## Progress ownership and dependency constraints

- ROADMAP owns milestone progress; BUILD-TASKS owns task dependencies, acceptance evidence and child checkboxes; memory.md owns the current state, blockers and next action. Update all three after each fully accepted task, without marking partial work complete.
- Original M1 admin-password setup/unlock/lock wording is retained. Implementation must follow the confirmed per-user account model; it does not authorize a new shared-password bypass.
- Existing downstream implementation does not close T02/T04 prerequisites. Retain original dependencies and resolve T08 final numbering ↔ T10 synchronization and T09 archival ↔ T11 service acceptance tensions by explicit approval, not by reducing either task's scope.
- T08 formal-number and T09 archival links are cross-task integration-verification checkpoints, not new reverse scheduling edges. BUILD-TASKS records a proposed local-readiness → downstream integration → final-acceptance boundary for approval; readiness is not completion. No circular full-completion waiting or unapproved dependency rewrite is permitted.

## Current next-task recommendation

Close T02-B/C original login/role gates after accepted disposable PostgreSQL T02-A, then T04 authorized initial-record acceptance. Approve the cross-task acceptance-boundary plan and close remaining T08/T09 prerequisites before resuming T10. See independently tracked child tasks in BUILD-TASKS. No new feature implementation is authorized by this progress update.

## Original foundation instruction (retained; not current progress)

Implement Milestone 0 only. Do not scaffold sync, PDF, installer or update machinery until architecture/contracts and migrations are reviewed.
