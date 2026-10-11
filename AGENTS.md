# AGENTS.md — Honsen采购管理系统（HONSEN Procure）

## Mission

Build a production-quality offline-first desktop purchasing application. Read `docs/PRD.md`, `docs/SPECS.md`, `docs/ARCHITECTURE.md`, `docs/CODING-STANDARDS.md`, `docs/DATABASE.md`, `docs/SYNC-PROTOCOL.md`, `docs/SECURITY.md` and `docs/TEST-RULES.md` before implementation. `docs/DECISIONS.md` records assumptions.

## Required Honsen Toolbox preflight

Before changing any application code, installer, update, release or publishing logic, read these sources in this exact order:

1. `https://github.com/etianwang/Honsen-toolbox/blob/main/README.md`
2. `https://github.com/etianwang/Honsen-toolbox/blob/main/docs/HONSEN_WINDOWS_APPLICATION_STANDARD.md`
3. `https://github.com/etianwang/Honsen-toolbox/blob/main/docs/honsen-desktop-update-protocol.md`
4. `https://github.com/etianwang/Honsen-toolbox/blob/main/docs/toolbox-integration-contract.md`
5. `https://github.com/etianwang/Honsen-toolbox/blob/main/docs/schemas/honsen.app.schema.json`

Then compare the project with `docs/HONSEN_TOOLBOX_INTEGRATION.md` and report an integration-gap list before modifying anything that touches the toolbox contract. Do not invent or alter the appId, product directory, EXE name, registry paths, manifest fields, Runner arguments, result JSON or uninstall boundaries. If a conflict is found, report its effect and a proposed repair; wait for approval before changing the conflicting implementation.

## Non-negotiable rules

1. Tauri 2 + React + TypeScript + SQLite desktop; cloud TypeScript HTTPS API + PostgreSQL. Desktop must NEVER connect directly to PostgreSQL.
2. Every launch requires an account password and local image/arithmetic CAPTCHA. Only a previously authenticated, enabled account cached locally may sign in offline for up to 24 hours. There is no public account/device registration or separate device-enrollment credential; synchronization is authorized by the account session. Enforce role authorization in trusted Tauri/Rust commands and on the server; never store plaintext passwords or expose privileged commands to the renderer.
3. All normal operations work offline; write SQLite business mutation and outbox event in ONE transaction. Never claim synced before server acknowledgment.
4. Use integer minor units for money (XOF integer francs; CNY/USD/EUR cents). Currency is mandatory. No floating-point money calculations.
5. Historical order lines snapshot names, specifications, supplier details, unit prices, currency and tax; catalog changes never rewrite orders.
6. UUID identifiers, soft deletes, server versions, idempotent push and cursor-based pull. Conflict handling cannot silently discard data.
7. Do not hardcode real prices, tax rates, exchange rates, credentials or vendor details.
8. Use strict TypeScript, validate input at API and Tauri boundaries, parameterized SQL, versioned migrations, structured errors.
9. Tests required for changes; run lint, typecheck, unit and relevant integration/e2e tests before declaring done.
10. Do not implement unapproved features or change scope silently; document assumptions and open questions.

## Work protocol

- Before work: read docs, summarize scope, identify affected schemas, tests and migration requirements.
- Implement smallest vertical slice; prefer reusable services over UI business logic.
- For sync/schema changes: add migration, failure tests, retry tests, conflict tests.
- After work: report changed files, test commands/results, limitations, next steps.
- For installer/update work: update `docs/HONSEN_TOOLBOX_INTEGRATION.md` with actual values and end-to-end evidence.
- Never delete user data, overwrite production databases, or deploy without explicit approval.

## Long-lived task lifecycle and cross-session handoff

`docs/ROADMAP.md`, `docs/BUILD-TASKS.md` and `memory.md` are the joint source of truth for progress. Preserve the original requirements, dependency graph and complete acceptance gates in those documents; implementation, a passing focused test, or a historical result alone never completes a parent task or milestone.

### Trigger: `开始任务`

When the user says **「开始任务」**, perform this startup protocol before changing business code:

1. Read `AGENTS.md`, `memory.md`, and the relevant task/child entries and acceptance criteria in `docs/BUILD-TASKS.md`; use `docs/ROADMAP.md` to confirm milestone status and dependencies. Read the required product/architecture/security/test documents for the selected scope.
2. Inspect `git status --short`, recent commits, and the diff for every existing uncommitted change. Preserve valid user or prior-session work; never reset, clean, overwrite, or silently fold unrelated changes into the new task.
3. Identify the highest-priority unblocked **single minimal independently verifiable child task**. State its callers, schemas/migrations, tests, fixtures, UI/API/Rust boundaries, data-loss or exposure risks, and prerequisite status before editing.
4. If a required dependency, authority, environment, or acceptance-boundary decision is blocked, do not force work around it or mark it complete. Keep all existing code, record the exact blocker and safe next action in `memory.md`, then stop.
5. For application, installer, update, release, or publishing changes, complete the Toolbox preflight above in its stated order. For contract conflicts, report the impact and proposed repair, then wait for approval.

### Execution rules

- Work on exactly one selected child task per turn. Do not begin the next child task, milestone, or T11+ work after it passes.
- Make the smallest complete change that satisfies that child task's stated acceptance slice. Do not reimplement already accepted behavior or expand scope.
- Preserve offline-first transactions, authorization, snapshots, migrations, outbox/idempotency, conflict retention, and all other non-negotiable rules.
- For a synchronization or schema change, include focused success, failure/retry and conflict/immutability coverage where applicable. Never silently drop a remote or local record to make projection succeed.
- If the same defect remains after three consecutive repair attempts, stop. Retain the code, document the attempts, root cause, evidence, and recommended next action in `memory.md`.

### Trigger: `收尾任务`

When the user says **「收尾任务」**, perform the following only for the currently selected child task:

1. Reinspect the diff and affected callers/tests. Run its focused test first, then every mandatory affected-package quality gate from `docs/BUILD-TASKS.md`: formatting, lint, strict typecheck, unit tests, production build, relevant Rust/API/integration checks, and the required reproducible Playwright DOM proof when the scope has UI acceptance.
2. Do not claim success when a required check is skipped, fails, or is blocked. Preserve the work; record the command, result, failure/skip reason, migration/sync effect, remaining risk, and next action in `memory.md`.
3. If the selected child task is accepted, update the actual partial/full status and evidence consistently in `memory.md`, `docs/BUILD-TASKS.md`, and `docs/ROADMAP.md`. Keep incomplete parent tasks and milestones unchecked.
4. Create one local Git checkpoint commit containing only the selected task's code, tests, and progress documentation. Never push, deploy, delete data, or start another task without explicit user instruction.
5. Report changed files, commit hash, test evidence, remaining blockers/risks, and the recommended next task, then stop immediately.

### Cross-session handoff

- End every task attempt with `memory.md` recording the exact Git checkpoint, dirty files (if any), selected child task status, completed evidence, skipped/failed checks, data or migration effects, blockers, risks, and one safe next action.
- At the next `开始任务`, treat that handoff and the current Git tree as evidence to verify, not assumptions to overwrite. Reconcile contradictions in favor of current code, current Git history, and fresh test output.
- A blocked or partial child task stays unchecked. Its preserved code is a checkpoint for recovery, not proof of acceptance.

## Recommended repository layout

`apps/desktop` (Tauri + React), `apps/server` (HTTP API), `packages/shared` (Zod contracts), `docs`, `tests`.

## Definition of done

Acceptance criteria pass, offline mode validated, sync retries safe, PDFs match saved order snapshot, migrations tested, no secrets committed, docs updated.
