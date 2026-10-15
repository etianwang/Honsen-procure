# Roadmap and Development Tasks

The authoritative execution order and mandatory per-task DOM testing gate are in [BUILD-TASKS.md](BUILD-TASKS.md). This file remains a compact milestone index.

## Current acceptance and bidirectional task mapping — 2026-10-11

Original milestone objectives below are retained. Their checkboxes concern the complete stated objective, not an implemented subset. The task acceptance register and child items in BUILD-TASKS provide evidence and remaining work; memory.md provides the current handoff. Cross-stage contributions do not redefine milestones or dependencies.

AUTH-1 has a local implementation checkpoint dated 2026-10-13; isolated PostgreSQL testing now passes through WSL2, while real desktop acceptance remains open. No milestone status changes.

The five-stage PR recovery map is in `docs/PR-SPLIT-MAP.md`. Stages 1–3 merged as PRs #9–#11 after CI and diff review. Stage-4 market-direct/receipt candidate has fresh local checks. These code merges do not change AUTH-1 or milestone acceptance until their remaining gates pass.

The 2026-10-13 requisition-history checkpoint adds an authorized regular-route list and closes a confirmed-order cross-project read leak; full history/copy and M2 acceptance remain open.

The follow-up checkpoint adds scoped detail/filtering, a safe copy-to-new-editor path and audited pending withdrawal; M2 remains incomplete because full requisition, execution, formal document and print gates are still open.

The next checkpoint connects the existing trusted approval/comment commands to reopened historical details and audits draft submission; this remains partial M2 work, with no formal issue, attachment ingestion or release acceptance.

Historical pending requisitions now also expose applicant-only withdrawal through the trusted command; M2 remains partial and rejected-order reload/revision is still open.

Existing requisition IDs now retain applicant and authorization-scope identity across draft/revision writes; this closes a cross-project movement path but does not complete M2's formal status and document gates.

The local catalog read path now filters supplier contacts and quotes by live account scope (including grant expiry), while global material names remain shared. Stage 3 also narrows engineer supplier/price Pull by bound country; broader sync and M1/M3 acceptance remain open.

The supplier/material-price Pull repair now withholds cross-country changes from engineers after grant revocation; purchaser all-project visibility remains as specified. Other sync projections/validations keep M3 incomplete.

The 2026-10-15 T04 local organization editor checkpoint and server organization-sync validation checkpoint passed synthetic Rust/DOM and isolated PostgreSQL tests. They do not establish deployed T04 records, complete cloud business-table projection, native multi-client acceptance or M0/M1/M3 completion.

The follow-on T04 tax/exchange server sync validation checkpoint passed schema/permission failure tests and isolated PostgreSQL idempotency/Pull/conflict tests. Tax/rate maintenance UI, deployed data and native cross-device acceptance remain open; milestone statuses do not change.

Project-default Push now also has schema, role and project-identity checks with isolated PostgreSQL replay/Pull/conflict evidence. This closes only a transport validation gap; T04 deployment and milestone acceptance remain open.

The T04 local tax-template maintenance checkpoint adds a trusted read path, administrator create/rename/enable/disable and transactional audit/outbox. Its audit migrations were renumbered 0040–0042 to avoid the separate stage-5 branch's 0032–0036 before integration. Isolated Rust/DOM/PostgreSQL gates passed; later rate/date editing is recorded below, while deployed data, native roles and M0/M1 remain open.

Tax-template rate and effective-date revision is now connected to the same trusted save command and covered by DOM interaction. Project-default tax selection, deployment data, native roles and milestone acceptance remain open.

The T04 exchange-rate history checkpoint adds administrator manual-rate entry with a reason, trusted append-only listing and transactional audit/outbox. Rust, DOM and isolated PostgreSQL regressions passed. Authorized rate sources and deployment data, native acceptance and M0/M1 remain open.

Project defaults now select active global or same-country tax templates; Rust and PostgreSQL master-data writes reject incompatible templates without replacing a saved default. Generic sync compatibility/projection and deployed/native evidence remain open, so milestone status is unchanged.

Generic Push now applies the same project/default-tax compatibility rule, including preexisting REST data and sync tombstones; isolated PostgreSQL replay and rejection tests passed. Server business-table projection, atomic cross-entity conflict handling, deployed/native evidence and milestone acceptance remain open.

The first T04 server business-table projection slice now applies country Push atomically with audit and sync bookkeeping. PostgreSQL create/edit/replay and immutable/duplicate-code rejection passed; remaining master-data entity projections, deployed/native tests and milestone acceptance remain open.

The Honsen market-direct route now enters executing/receiving without RFQ or supplier child and records parent-level partial/final receipts. The status migration preserves old records. Operational actual expenditure and formal HPA/SPO documents remain required, so M2/M3 stay partial.

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

**Status: COMPLETED — not part of OPA-2 completion.** The approved administrator UI and audited offline workflows for dynamic country, project and site records are complete. Departments, teams, suppliers, quotations, materials/categories/units, tax templates and exchange rates were out of scope for this earlier slice. The slice supports creating a future country/project without Seed edits or direct SQL, preserves global materials, retains country-scoped supplier/quotation enforcement, and stops rather than deletes referenced master data.

The 2026-10-15 T04 isolated local unit-management slice subsequently added trusted read, editor and unit audit migration with synthetic Rust/DOM evidence. It does not accept T04-A/B/C, online synchronization, real desktop roles or authorized deployment records. T04, M0 and M1 remain unchecked. Functional completion stays ahead of non-blocking visual/UI polish; blocked controls, errors and accessibility still require immediate repair when they prevent a workflow.

The next isolated T04 local slice adds department/team administrator workflows, active-parent validation and preserved audit history. Its Rust, disposable PostgreSQL and Playwright gates pass, but remote projection and actual deployment/desktop acceptance remain open. This does not alter the T04 dependency or milestone checkboxes.

The 2026-10-15 country and project Push slices now project validated master records into their PostgreSQL business tables atomically with sync and audit. Disposable PostgreSQL tests cover replay, missing-country retry, immutable codes and referenced-project country-change refusal. They do not close the remaining master-data projections, authorized deployment records, native desktop acceptance, T04/T10 or M0/M1/M3.

The site Push slice now also projects into the PostgreSQL `sites` business table, with missing-project retry, replay, code-collision and conflict checks. Full isolated workspace tests and the existing site-creation Playwright DOM gate passed on 2026-10-15. Organization/unit/tax/rate/default projection, deployment and native acceptance remain open; milestone checkboxes are unchanged.

The 2026-10-15 department Push slice projects validated departments into the PostgreSQL business table atomically with audit and sync. The disposable database gate includes replay, duplicate-code partial-batch rejection and version-conflict retention; the existing department/team DOM gate also passed. Team/unit/tax/rate/default projection and deployment/native acceptance remain open; no parent task or milestone status changed.

The team Push slice now projects into the PostgreSQL `teams` table and aligns REST and sync writes on the active-department requirement. Isolated PostgreSQL tests cover dependency failure, retry, replay and conflict preservation; the department/team DOM gate passed. Unit/tax/rate/default projection, deployment and native acceptance remain open; milestone status is unchanged.

The unit Push slice now projects validated unit changes into PostgreSQL `units` atomically with audit/sync. Test-first isolated PostgreSQL coverage includes replay, code collision, rollback after audit failure, canonical values and a REST-edit conflict guard that prevents stale Push overwrite. REST-originated changes still need Pull publication/resolution under T10; tax, exchange-rate and project-default business projection, authorized deployment and native evidence remain open. T04/T10 and milestone checkboxes are unchanged.

The tax-template Push slice now projects validated tax templates into PostgreSQL `tax_templates` with audit/sync in one transaction. Isolated PostgreSQL tests cover country dependencies, replay, rollback, REST-edit and concurrent-create conflicts, change-log reconciliation and a resolved retry; the existing tax-editor DOM gate passed. Proactive REST-to-Pull publication, exchange-rate/project-default business projection, deployment records and native multi-client evidence remain open. T04/T10 and milestone checkboxes remain unchanged.

The exchange-rate Push slice now projects immutable rate history into PostgreSQL `exchange_rates` atomically with audit/sync. A discovered REST row wins same-ID conflicts, and accepted/discovered change-log payloads carry the complete camelCase fields required by Rust Pull. Disposable PostgreSQL tests cover replay, independent batch acceptance, audit rollback and concurrent REST insertion; existing Rust master-data Pull and exchange-rate DOM gates passed. Proactive REST-to-Pull publication, legacy sync-only repair, project-default business projection, deployment and native multi-client evidence remain open; T04/T10 and milestones stay unchecked.

The project-default Push slice now projects validated defaults into PostgreSQL `project_print_defaults` atomically with audit/sync, including optional contact and a prior-schema-preserving nullable-column migration. It checks current project/tax business state, retains and publishes REST values on stale or legacy-version conflicts, and permits a resolved retry. Disposable PostgreSQL, Rust, focused DOM and workspace gates passed; proactive REST-originated Pull, authorized deployment, native two-client/role acceptance and T04/T10 parent gates remain open. Milestone checkboxes are unchanged.

The project-default REST-to-Pull reliability slice now publishes each authorized online save transactionally with its business row and audit; it also prevents that REST log sequence from overtaking an earlier uncommitted log writer. A clean second client can obtain the new version by cursor Pull without provoking a Push conflict. Isolated PostgreSQL coverage includes repeated saves, late publication failure rollback/retry, stale Push retention, legacy divergence and concurrent log ordering; full workspace, Rust and Playwright DOM gates passed. The pre-existing Push-vs-Push cursor race, other REST master-data types, actual deployment, native two-client/role acceptance and T04/T10 parent gates remain open. Milestone checkboxes are unchanged.

## Original foundation instruction (retained; not current progress)

Implement Milestone 0 only. Do not scaffold sync, PDF, installer or update machinery until architecture/contracts and migrations are reviewed.
