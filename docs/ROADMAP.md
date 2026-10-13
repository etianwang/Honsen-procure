# Roadmap and Development Tasks

The authoritative execution order and mandatory per-task DOM testing gate are in [BUILD-TASKS.md](BUILD-TASKS.md). This file remains a compact milestone index.

## Current acceptance and bidirectional task mapping — 2026-10-11

Original milestone objectives below are retained. Their checkboxes concern the complete stated objective, not an implemented subset. The task acceptance register and child items in BUILD-TASKS provide evidence and remaining work; memory.md provides the current handoff. Cross-stage contributions do not redefine milestones or dependencies.

AUTH-1 has a local implementation checkpoint dated 2026-10-13; isolated PostgreSQL testing now passes through WSL2, while real desktop acceptance remains open. No milestone status changes.

The five-stage PR recovery map is in `docs/PR-SPLIT-MAP.md`. Stage-1 authorization was rebuilt on `main` and independently checked; a code PR or merge does not change AUTH-1 or milestone acceptance until the remaining native-desktop gates pass.

| Milestone | Acceptance      | Contributing tasks (reverse mapping is in BUILD-TASKS) | Outstanding acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | [ ] IN PROGRESS | T00, T01, T02, T03, T04, T05                           | Authorized initial master-data records are BLOCKED pending deployment account/setup authority. T02-A/B/C and the repaired CI local/remote gate passed; M0 is not ready for full stage acceptance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M1        | [ ] IN PROGRESS | T02, T03, T04, T05, T13                                | Close PostgreSQL/account and actual master-data acceptance; retain administration hardening. Local catalog slice is accepted, not the whole milestone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M2        | [ ] IN PROGRESS | T01, T06, T07, T08, T09, T11, T12, T14                 | T08-A's regular confirmed-parent execution route is accepted; OPA-1 has a local trusted owner pricing core and OPA-2 has local draft-mode persistence, pricing, file-SQLite approval/revision/outbox evidence, regular-route DOM recovery/rejection/resubmission evidence and internal audit display. A real Tauri host, login page and isolated test profile are available, but actual desktop multi-account smoke remains unexecuted; owner formal issue/printing, Honsen market or supplier execution, lightweight payment/receipt evidence, full receiving/archival, bilingual PDF/printing/export and final snapshot/Windows acceptance remain. Owner preview/PDF redaction remains OPA-4 after OPA-3/T12 dependencies. |
| M3        | [ ] IN PROGRESS | T02, T03, T08, T10, T11, T14                           | T02 account/session PostgreSQL and login/DOM acceptance is complete. Safe entity projection, immutable formally-issued number/quote snapshots, desktop startup/retry/WebSocket/revocation and multi-device offline/reconnect acceptance remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M4        | [ ] BLOCKED     | T09, T11, T12, T13, T14, T15                           | Approved identity no longer blocks T15, but T14 and all installer/Runner/manifest/registry/release acceptance remain unimplemented; attachment, export, backup/localization/performance, print/accessibility and Windows acceptance have not passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Accepted tasks: **T00, T01, T02, T03, T05, T06, T07**. Partial tasks: **T04, T08, T09, T10**. Not started: **T11–T14**. Blocked: **T15**. Partial tasks remain unchecked even where some historical gates passed.

Evidence is committed code and dated records in `memory.md`. On 2026-10-11, the disposable PostgreSQL suites, account-session/provisioning integration tests, workspace gate, Rust tests and 16 Playwright tests passed. T02's accepted changes were subsequently merged through PR #4 (`1e69896`) and PR #5 (`e3f7035`); this does not complete M0/M1/M3 as a whole.

## Milestone 0 — Foundation

- [x] React desktop visual shell: 首页 and 材料库总览, including four supplier quote cards and client-side role visibility test
- [x] Monorepo workspace, shared Zod/money contracts, server package placeholder and CI quality gates
- [x] Tauri-ready host boundary and design tokens (release/bundle identity intentionally deferred)
- [x] Versioned SQLite authentication migration, secure offline verifier cache and Rust/Tauri authorization boundary
- [x] SQLite material/supplier/price repositories, square material-image crop and trusted local catalog commands
- [ ] Authorized initial master-data deployment records (requires a deployment account, verified backup and explicit non-destructive unified Seed execution; no production import has occurred)
- [ ] CI formatting/lint/typecheck/test/build and Playwright DOM gate (local repair verified; successful remote run awaiting authorized push)

M0 item tracking (all seven original objectives, in order):

| Item                                                | Actual status | Task/evidence and remaining acceptance                                                                                                                                                                                       |
| --------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Visual shell                                    | COMPLETED     | T00/T05 shell, navigation, four-quote and read-only DOM evidence.                                                                                                                                                            |
| 2 — Workspace/contracts/server placeholder/CI setup | COMPLETED     | T00/T01 committed workspace and pipeline configuration; the setup objective does not imply successful PostgreSQL CI execution.                                                                                               |
| 3 — Host boundary/design tokens                     | COMPLETED     | T00/T03 local Tauri foundation; release identity remains intentionally deferred.                                                                                                                                             |
| 4 — SQLite authentication/trusted boundary          | COMPLETED     | T03 migrations, offline verifier and Rust/DOM evidence.                                                                                                                                                                      |
| 5 — Local catalog/crop/trusted commands             | COMPLETED     | T05 SQLite repositories and material/supplier/price/crop tests.                                                                                                                                                              |
| 6 — Authorized actual initial records               | BLOCKED       | T04-A; approved code mapping exists, authorized deployment records do not.                                                                                                                                                   |
| 7 — CI and DOM execution gate                       | IN PROGRESS   | The repaired quality workflow passed locally with PostgreSQL integration and 16 DOM tests; T02-B/C are accepted and merged. The remaining M0 acceptance is the authorized initial-record deployment, not a reopening of T02. |

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
- Existing downstream implementation does not close T02/T04 prerequisites. Retain original dependencies. T08 owns local owner quote/markup/formal-issue behavior; T10 owns server idempotency, collision/conflict and non-rewrite verification; T09 archival still requires T11. This boundary does not reduce either task's scope.
- Owner-mode formal issue freezes local UUID, formal number and quote/markup/final-price snapshots. Catalog price changes/revocation and synchronization cannot silently rewrite them. BUILD-TASKS owns the corresponding acceptance tests; readiness is not completion.

## Current next-task recommendation

Obtain authority for T04 authorized initial-record acceptance, then complete the remaining T08/T09 prerequisites before T10 final acceptance. See independently tracked child tasks in BUILD-TASKS. No new feature implementation is authorized by this progress update.

## Approved / planned: Admin Master Data Management

**Status: COMPLETED — not part of OPA-2 completion.** The approved administrator UI and audited offline workflows for dynamic country, project and site records are complete. Departments, teams, suppliers, quotations, materials/categories/units, tax templates and exchange rates remain out of scope. The slice supports creating a future country/project without Seed edits or direct SQL, preserves global materials, retains country-scoped supplier/quotation enforcement, and stops rather than deletes referenced master data.

## Original foundation instruction (retained; not current progress)

Implement Milestone 0 only. Do not scaffold sync, PDF, installer or update machinery until architecture/contracts and migrations are reviewed.
