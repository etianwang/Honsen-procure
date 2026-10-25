# Roadmap and Development Tasks

The 2026-10-25 Agent C correction keeps optional COS disabled in the deployment template until configured. Release regressions passed 4/4; independent recheck and original M4/T14/T15 live gates remain open. Pending legacy `www` service/manual changes are excluded; RC protected controller remains authoritative. See `memory.md` for source and preserved dirty paths.

The authoritative execution order and mandatory per-task DOM testing gate are in [BUILD-TASKS.md](BUILD-TASKS.md). This file remains a compact milestone index.

2026-10-25 Agent A: PR #19 immutable-payment conflict reconciliation has builder code and focused PostgreSQL/SQLite/production-route DOM evidence, including canonical voucher-target recovery. [Scope and evidence](planning/PR19-PAYMENT-CONFLICT-CLOSURE.md). Independent recheck, exact-head CI and installed Windows two-client payment/COS acceptance remain open. This round did not rerun native login; the 2026-10-24 credential-storage failure below is historical evidence, not a fresh diagnosis. No parent, security/Formal hold or milestone is closed.

2026-10-24 PR #19: HEIC conversion and real COS source/derivative verification are implemented; unified-baseline conflicts are resolved with additive payment compatibility. Actual two-client Windows payment/COS acceptance remains BLOCKED_ENV (system credential storage). [Handoff](T09-T11-RELEASE-HANDOFF.md). No parent or milestone is closed.

## Current delivery path — 2026-10-19

2026-10-24: home demo orders/projects and fixed counts are replaced by authorized saved-history reads, parent-order state counts and separate-currency integer totals, with refresh/error recovery. Bounded desktop unit/DOM/build and existing trusted-history tests pass; no parent or milestone closure. HPA/SPO, formal exports, complete localization and retention acceptance remain required.

2026-10-23: PR #17's historical reference contract P1 has a bounded implementation and PostgreSQL→SQLite builder proof. [Evidence](reviews/PR17-REFERENCE-CONTRACT-REPAIR.md); this does not replace the original independent failure verdict until targeted independent recheck passes. Draft and Windows EXE online-relogin production-release hold remain unchanged.

2026-10-22: a T05 supplier-country editor repair is under independent recheck; no parent or milestone status changes. See the latest `memory.md` handoff.

2026-10-23: PR #17's two confirmed P1 repairs now have production implementations and PostgreSQL 16/SQLite builder evidence: durable authorization history replay and complete catalog validation with audited historical recovery. See [repair evidence](reviews/PR17-SYNC-P1-REPAIR.md). Independent recheck of these two defects remains required; PR #17 stays Draft. Real Windows EXE online re-login after revocation is still a mandatory V1 production-release security hold, not a passed QA item. All original parent/milestone gates remain open as previously recorded.

M0–M4 and their original objectives below are preserved; dated progress paragraphs are historical checkpoints, not additional queues. The [current delivery register](BUILD-TASKS.md#current-delivery-register--2026-10-19) owns remaining-task status and G1–G10 mappings; the [v1.0 closure plan](planning/V1-DELIVERY-CLOSURE-PLAN.md) is a short navigation index, not another task master.

**Current local integration:** the containing checkpoint merges QA HEAD `ff7bff6f421cb71448deff017bba7a8f0485070a` with management `e5e46362e51966d3fb3da1e040c42f866ff0a40e`; it already inherits FIX2 `13b22ff` and G2 `6e0a2a6`. No production change or repeated cherry-pick; current test evidence is in [memory](../memory.md). The source-branch descriptions below are historical. FIX2/G2/NATIVE-008 CLOSED and G1/T10/T10-SEC-001/P1/Formal hold OPEN remain unchanged; no merge into main or new development is authorized.

- Documentation starts at `50378dd` (H), not the separate unmerged FIX2 candidate `13b22ff` (F). Historical independent QA `b0a6069` failed `85d0565`; F's builder run supported READY_FOR_RECHECK only. Subsequent independent **`native-smoke-20261019115437`** plus fresh-context QA code/evidence signoff gives **PASS / G1-QA-001 CLOSED on F** for the bounded management401 defect. [QA report](agent-coordination/QA_REPORT.md) records exact session/request matching and limits. G1 production conflict UI lifecycle remains open; no candidate implementation is merged/accepted as H/main.
- NATIVE-008 remains CLOSED within `03f432a`/`be20d76` evidence. T10, T10-SEC-001, original P1 and Formal hold remain OPEN. No milestone checkbox changes this round.
- Nine original task IDs remain unclosed: T04/T08/T09/T10/T11/T12/T13/T14/T15. Eight require development; T14 is final acceptance evidence, not a duplicate development task. Seven historical foundation acceptances remain bounded to their evidence; account TOTP/governance, live home queues and category maintenance are not proven by foundation acceptance.
- FIX2 on F and the approved16-field T10-A/G2 scope on6e0a2a6 are independently CLOSED. Fresh G2 Rust12+3 and real `native-smoke-20261019145156` prove different-actor issue→Push→second EXE Pull→restart→empty replay; exact16 values survive current quote changes. This is not all T10-A/E or parent acceptance. Next candidate work is existing G3 only after user ordering; no automatic development. File/print/backup and other v1.0 requirements remain in original tasks.
- Obtain actual T04 deployment authority, legacy-data recovery policy and release decisions separately. Preserve the T09-C/T11 dependency-cycle records; the proposed metadata/file-service/joint-proof boundary awaits approval. An unrelated final gate does not prohibit safe independent implementation.

Execution rule: **IMPLEMENT → TARGETED TEST → INDEPENDENT RECHECK → CLOSE**; one bounded task per turn, relevant tests and valid evidence reuse, no automatic NATIVE expansion or v1.0 scope reduction. Printing, three languages, receiving, payments, backups and Windows distribution remain required.

### T10-A/G2 implementation handoff — 2026-10-19

**Later independent acceptance supersedes this handoff's READY/next-QA status:** G2 CLOSED on6e0a2a6, fresh `native-smoke-20261019145156` and12+3 focused regressions; [signoff](BUILD-TASKS.md#t10-a--g2-independent-acceptance--2026-10-19--closed). Original milestones/parents stay unchecked/OPEN; no automatic G3 execution. The following paragraph remains the dated implementation checkpoint, not the current acceptance verdict.

Production parent `13b22ff`, management checkpoint `25a56af`; independent development branch `codex/t10-g2-formal-pull`. The containing local implementation commit is **READY_FOR_RECHECK**, not G2 CLOSED. The 6 formal header and 10 owner-line fields now persist through validated Pull, approved/confirmed progression, immutable replay and atomic cursor rollback using existing columns/triggers. Scoped Rust G2 tests12/12 and existing projection/cursor regressions3/3 pass; gates, evidence and skips are in `memory.md` and the [G2 implementation handoff](BUILD-TASKS.md#t10-a--g2-implementation-checkpoint--2026-10-19--ready_for_recheck). This supersedes the earlier “no G2 code” checkpoint/next-development wording only. Next action is independent G2 QA, then stop for user ordering; no new child automatically begins. All milestone checkboxes, other v1.0 scope and holds above remain unchanged.

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

The Honsen market-direct route now enters executing/receiving without RFQ or supplier child and records parent-level partial/final receipts. The status migration preserves old records. The normal execution UI now reads exact SQLite-derived ordered/received/remaining line quantities after each receipt. Operational actual expenditure and formal HPA/SPO documents remain required, so M2/M3 stay partial.
The 2026-10-15 T04 local organization editor checkpoint and server organization-sync validation checkpoint passed synthetic Rust/DOM and isolated PostgreSQL tests. They do not establish deployed T04 records, complete cloud business-table projection, native multi-client acceptance or M0/M1/M3 completion.

The follow-on T04 tax/exchange server sync validation checkpoint passed schema/permission failure tests and isolated PostgreSQL idempotency/Pull/conflict tests. Tax/rate maintenance UI, deployed data and native cross-device acceptance remain open; milestone statuses do not change.

Project-default Push now also has schema, role and project-identity checks with isolated PostgreSQL replay/Pull/conflict evidence. This closes only a transport validation gap; T04 deployment and milestone acceptance remain open.

The T04 local tax-template maintenance checkpoint adds a trusted read path, administrator create/rename/enable/disable and transactional audit/outbox. Its audit migrations were renumbered 0040–0042 to avoid the separate stage-5 branch's 0032–0036 before integration. Isolated Rust/DOM/PostgreSQL gates passed; later rate/date editing is recorded below, while deployed data, native roles and M0/M1 remain open.

Tax-template rate and effective-date revision is now connected to the same trusted save command and covered by DOM interaction. Project-default tax selection, deployment data, native roles and milestone acceptance remain open.

The T04 exchange-rate history checkpoint adds administrator manual-rate entry with a reason, trusted append-only listing and transactional audit/outbox. Rust, DOM and isolated PostgreSQL regressions passed. Authorized rate sources and deployment data, native acceptance and M0/M1 remain open.

Project defaults now select active global or same-country tax templates; Rust and PostgreSQL master-data writes reject incompatible templates without replacing a saved default. Generic sync compatibility/projection and deployed/native evidence remain open, so milestone status is unchanged.

Generic Push now applies the same project/default-tax compatibility rule, including preexisting REST data and sync tombstones; isolated PostgreSQL replay and rejection tests passed. Server business-table projection, atomic cross-entity conflict handling, deployed/native evidence and milestone acceptance remain open.

The first T04 server business-table projection slice now applies country Push atomically with audit and sync bookkeeping. PostgreSQL create/edit/replay and immutable/duplicate-code rejection passed; remaining master-data entity projections, deployed/native tests and milestone acceptance remain open.

The 2026-10-15 owner-formal server slice adds transactional OPA number/installation-sequence registration and frozen-snapshot conflict handling to Push/Pull. Isolated PostgreSQL migration, retry, collision, rollback and cursor-Pull tests passed without skipped database cases. Desktop projector, source-rate provenance, native multi-client evidence and the original T08/T10 acceptance gates remain open; M2/M3 status is unchanged.

Independent review then found and a test-first repair closed three server trust-boundary gaps: direct issue without a prior approved server snapshot, engineer approval/issue via Push, and incomplete frozen-field/status-transition checks. Isolated API/PostgreSQL and full development gates passed; this does not accept owner receiving, multi-client/native E2E or the M2/M3 milestones.

The next independent review found applicant self-approval mislabeling and soft-deleted order revival. A second server test-first repair binds approval to a distinct authenticated approver and immutable applicant identity, and blocks post-deletion upserts; isolated PostgreSQL proof passed. Self-approval with a local policy override remains fail-closed pending server-authoritative policy evidence, and M2/M3 stay partial.

The Honsen market-direct route now enters executing/receiving without RFQ or supplier child and records parent-level partial/final receipts. The status migration preserves old records. Operational actual expenditure and formal HPA/SPO documents remain required, so M2/M3 stay partial.

The 2026-10-15 T08-C local RFQ lifecycle slice adds trusted draft → sent → closed transitions, parent audit/outbox atomicity, snapshot-retaining history and regular procurement-page controls. It is local/DOM evidence only; server RFQ projection, cross-device recovery, actual expenditure and formal HPA/SPO are still required. M2/M3 and T08-C remain unchecked.

The follow-up RFQ Push slice validates the price-free payload and authorized Honsen parent before storage, then checks status order and frozen snapshot inside the PostgreSQL transaction. Duplicate delivery and stale-version conflict retain the existing sync guarantees. Server change-log Pull is covered; desktop RFQ projection and true two-client recovery are not. M2/M3, T08-C and T10 remain unchecked.

The 2026-10-15 RFQ local Pull slice stages dependencies, validates and projects price-free history, retains local conflicts and cursor atomicity, and aligns SQLite RFQ display-number uniqueness with the server. It does not prove two-client recovery, formal issue or native Tauri operation; M2/M3, T08-C and T10 remain unchecked.

The 2026-10-15 local integration candidate combines RFQ lifecycle/Push/Pull with formal-issue and expenditure SQLite migrations. A test-first PostgreSQL repair prevents a later parent-order Push from making an existing RFQ unprojectable. Combined Rust 38/38, PostgreSQL workspace 2/79/16 with no skips, serial Playwright DOM 30/30, and format/lint/typecheck/build pass; independent integration QA, two-client/native recovery and all parent gates remain open. The earlier parallel DOM failure is recorded in `memory.md` and is not counted as a passing run.

| Milestone | Acceptance      | Contributing tasks (reverse mapping is in BUILD-TASKS) | Outstanding acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | [ ] IN PROGRESS | T00, T01, T02, T03, T04, T05                           | Authorized initial master-data records are BLOCKED pending deployment account/setup authority. T02-A/B/C and the repaired CI local/remote gate passed; M0 is not ready for full stage acceptance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M1        | [ ] IN PROGRESS | T02, T03, T04, T05, T13                                | Close PostgreSQL/account and actual master-data acceptance; retain administration hardening. Local catalog slice is accepted, not the whole milestone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M2        | [ ] IN PROGRESS | T01, T06, T07, T08, T09, T11, T12, T14                 | T08-A's regular confirmed-parent execution route is accepted; OPA-1 has a local trusted owner pricing core and OPA-2 has local draft-mode persistence, pricing, file-SQLite approval/revision/outbox evidence, regular-route DOM recovery/rejection/resubmission evidence and internal audit display. A real Tauri host, login page and isolated test profile are available, but actual desktop multi-account smoke remains unexecuted; owner formal issue/printing, Honsen market or supplier execution, lightweight payment/receipt evidence, full receiving/archival, bilingual PDF/printing/export and final snapshot/Windows acceptance remain. Owner preview/PDF redaction remains OPA-4 after OPA-3/T12 dependencies. |
| M3        | [ ] IN PROGRESS | T02, T03, T08, T10, T11, T14                           | T02 account/session PostgreSQL and login/DOM acceptance is complete. Safe entity projection, immutable formally-issued number/quote snapshots, desktop startup/retry/WebSocket/revocation and multi-device offline/reconnect acceptance remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M4        | [ ] BLOCKED     | T09, T11, T12, T13, T14, T15                           | Approved identity no longer blocks T15, but T14 and all installer/Runner/manifest/registry/release acceptance remain unimplemented; attachment, export, backup/localization/performance, print/accessibility and Windows acceptance have not passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Accepted tasks: **T00, T01, T02, T03, T05, T06, T07**. Partial tasks: **T04, T08, T09, T10, T11**. Not started: **T12–T14**. Blocked: **T15**. Partial tasks remain unchecked even where some historical gates passed.

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

Follow the current delivery path above and the single remaining-work register in BUILD-TASKS. FIX2 and bounded G2 are independently CLOSED and integrated locally; recommended next development is existing T10-B/D / G3, only after user ordering. T04 authorized deployment and original final dependencies remain mandatory for closure. This integration starts no implementation or repeat native matrix.

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

The follow-on T10 Push cursor-order reliability slice serializes each Push change-log sequence allocation through commit, including conflict reconciliation. A test-first isolated PostgreSQL two-writer race now proves cursor Pull cannot skip an earlier uncommitted Push; failure rollback, retry and replay are covered. The full isolated workspace, Rust, Playwright DOM and package gates passed. This does not close T10-A–F, native two-client acceptance, other REST-originated publication or any milestone; their existing dependencies and checkboxes remain unchanged.

The T04 unit REST-to-Pull reliability slice now makes an authorized online unit save visible to another installation's cursor Pull, with Rust-compatible payload, immutable-code protection, monotonic business/sync version and commit-ordered publication. Isolated PostgreSQL tests cover edits, stale Push conflict, legacy divergence, late failure/retry and an earlier uncommitted log writer; the full workspace, Rust and DOM gates passed. This is not publication for all other master-data types, native two-client acceptance or completion of T04/T10 or any milestone; checkboxes and dependencies remain unchanged.

The T10-B desktop runtime checkpoint starts Push→Pull only after successful online account authentication, retains local entry on sync transport failure, and displays pending/retrying/synced state according to the trusted Push acknowledgement. Bounded retries, browser connectivity events and lock cleanup have unit and DOM evidence; the full isolated PostgreSQL workspace suite also passed. This is partial runtime progress: no native two-device/reconnect evidence, complete conflict-aware scheduling, post-mutation trigger, WebSocket lifecycle or parent T10 acceptance. M3 remains unchecked.

The 2026-10-15 T10-B multi-account containment slice adds trusted owner stamping and owner-filtered Push/ack/status while preserving unowned legacy outbox rows in quarantine. Until per-account Pull state exists, a multi-account installation stops HTTPS Pull with an actionable, non-retrying account-boundary status instead of risking cursor loss. Local Rust, disposable PostgreSQL workspace and Playwright DOM gates passed; Fixer P1 `T10-SEC-001`, server account binding, legacy recovery, per-account Pull and native two-client evidence remain open. T10 and M3 remain unchecked.

The subsequent T10-B trusted-command guard requires a successful online account login in the current process before Push, Pull or cloud authorization refresh can use a cached token. Offline login, failed login, account switch and local lock fail closed while offline operations retain their outbox. Rust and DOM development gates passed; this does not replace server revocation, multi-account Pull, true two-client HTTP/native evidence or the open P1. T10 and M3 remain unchecked.

The next T10-SEC-001 desktop checkpoint gives each account an independent durable Pull cursor and last-success timestamp using additive SQLite migration 0047. Existing installation-wide cursor data is retained without guessed attribution; account cursors replay from zero. A/B, rollback/restart, catalog replay and foreign/legacy pending-event fail-closed cases have local Rust evidence. The server owner-binding and real two-account HTTP/native gates, legacy recovery policy and shared local projection visibility review remain open; P1, T10 and M3 remain unchecked.

The desktop read-surface audit found trusted historical/execution/catalog reads guarded by active-account scope as specified, but exposed stale A authorization options in the renderer immediately after B login while B's refresh was pending. A test-first account-switch DOM slice clears those options on lock and login; it is development evidence only. Conflict-resolution requeue provenance, server origin binding, legacy recovery and true two-account HTTP/native acceptance remain open. P1, T10 and M3 remain unchecked.

An unreleased-profile migration compatibility repair now recognizes the exact old account-owner `0044` marker, validates its schema and records equivalent `0046` without repeating `ALTER TABLE` or attributing legacy rows. It is source-branch evidence only; the integrated formal `0044`/expenditure `0045` migration order still needs a dedicated test before T10-SEC-001 acceptance. P1, T10 and M3 remain unchecked.

## Original foundation instruction (retained; not current progress)

Historical FIX2 builder checkpoint (superseded by independent QA above):

G1 (2026-10-19) stays OPEN. Independent QA `b0a6069` verified the bounded Push/Pull invalidation at `85d0565` and retained management401 as OPEN/FAIL. **G1-QA-001-FIX2 is READY_FOR_RECHECK**, not independently accepted: all management requests now capture private generation/token and reuse the atomic invalidator; context/history/scope-cache access shares its lock. Fresh Rust management4/4/full69/69, targeted API/barrier/store/DOM and quality checks PASS. Final actual EXE native-smoke-20261019112134 denies current management401 context/known-selection/source access for GET/PUT/DELETE/PATCH and preserves B/replacement-A after held old-management401. Independent Fixer recheck remains BLOCKER; production conflict-view lifecycle proof remains a separate BLOCKED G1 item. Exact retained evidence/history in QA_REPORT/BUG_QUEUE/memory/audit. No G2/G3/formal changes. T10/SEC-001/P1/Formal/M3 OPEN; NATIVE-008 CLOSED; parent criteria unchanged.

The following instruction applied to the original foundation stage only; it does not override the current approved v1.0 scope or Delivery-First path.

Implement Milestone 0 only. Do not scaffold sync, PDF, installer or update machinery until architecture/contracts and migrations are reviewed.

### 2026-10-24 T09-A / T11 builder progress

T09-A payment/reversal server and SQLite/UI foundations are implemented with focused builder evidence. T11 has entered **IN PROGRESS** for its authorized COS service slice (real PUT/HEAD/GET/hash/auth-negative/cleanup passed). Local attachment queue and cross-device archival verification remain open. T09/T10/T11 and M2/M3/M4 remain unchecked; these results are not independent QA or release acceptance. See BUILD-TASKS and memory for scope and remaining gates.

### 2026-10-24 native queue and Draft QA candidate evidence

T11 now has a native managed-file queue, direct COS transfer, verified cached download, receipt/payment associations and a production attachment screen. T09-A has synchronized immutable payments and reason-required reversals; actual API/COS/PostgreSQL and two-file SQLite checks passed. Independent review repairs and Rust 21/21 are recorded in [T09-T11-VALIDATION.md](T09-T11-VALIDATION.md). M2/M3/M4 and T09/T10/T11 remain open for final running-Windows-client acceptance and all original gates.

## Catalog quote pagination checkpoint — 2026-10-22

T05/T06/T08 have a bounded quote-list correctness repair under independent review. The four-price overview is retained while material details and purchase selection can page through authorized current prices. Local SQLite and mocked browser coverage are development evidence only; independent QA, native acceptance and final-SHA CI remain open. Milestone and task acceptance gates are unchanged; see `docs/BUILD-TASKS.md` and `memory.md`.

## T15 RC integration checkpoint — 2026-10-24

Independent branch `codex/v1-release-candidate` integrates unified baseline d348514, payment/COS98537d2 and release-toolbox f9145e1. [Exact source ledger, validation and open gates](planning/V1-RC-INTEGRATION.md). This is a bounded candidate-building slice, not T15/V1 parent acceptance. Original dependency table, task register and all final gates remain unchanged. No production deployment or stable Release is authorized.
