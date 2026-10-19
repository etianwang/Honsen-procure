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
9. Code changes require affected-package quality gates and directly relevant regression/integration/e2e tests before declaring done. Documentation-only changes require formatting, reference and status-consistency checks, not application test reruns.
10. Do not implement unapproved features or change scope silently; document assumptions and open questions.

## Work protocol

- Before work: read docs, summarize scope, identify affected schemas, tests and migration requirements.
- Implement smallest vertical slice; prefer reusable services over UI business logic.
- For sync/schema changes: add migration, failure tests, retry tests, conflict tests.
- After work: report changed files, test commands/results, limitations, next steps.
- For installer/update work: update `docs/HONSEN_TOOLBOX_INTEGRATION.md` with actual values and end-to-end evidence.
- Never delete user data, overwrite production databases, or deploy without explicit approval.

## v1.0 Delivery-First and scope control

- Follow **IMPLEMENT → TARGETED TEST → INDEPENDENT RECHECK → CLOSE**. Deliver one bounded, real user workflow or confirmed defect repair per turn. Implementation or builder PASS is not independent acceptance.
- Preserve M0–M4, T00–T15, approved PRD scope and acceptance gates. OPA/HPA/SPO slices and audit G1–G10 are mappings into those tasks, not additional task systems. `docs/BUILD-TASKS.md` owns the remaining-work register; `docs/planning/V1-DELIVERY-CLOSURE-PLAN.md` is navigation only.
- Classify work as A (required functionality missing), B (confirmed defect), C (acceptance evidence missing), D (accepted bounded scope), or E (non-required optimization). Do not turn C into redevelopment or E into a release blocker. Printing, three languages, receiving, payments, backups and release remain v1.0 requirements; postponement requires explicit approval.
- Distinguish implementation prerequisites, final-acceptance prerequisites and external authorization. Preserve the original dependency table. An open final gate does not prohibit an independently safe slice whose technical/security prerequisites exist; it still prevents closing its parent. Record contradictory dependency boundaries and await approval rather than silently rewriting them.
- Reuse evidence only for its exact SHA, scope and environment, or after an explicit unchanged-boundary comparison. Never transfer another worktree's implementation/test status to current HEAD. Record independent failures and subsequent builder readiness separately.
- Run directly affected checks, preserving all original final gates. Do not mechanically rerun NATIVE-002–008, create NATIVE-009, split tests into extra tasks, or block delivery on nonessential Harness refactoring. A necessary new regression belongs to the existing task and must address an actual changed boundary.
- Confirmed security, authorization, data-loss, silent-overwrite and immutable-snapshot defects must be fixed and independently rechecked. Record unrelated nonblocking findings without expanding the selected task. No automatic closure of security or Formal holds.
- New work enters v1.0 only by tracing it to an approved PRD requirement/original acceptance condition or a confirmed correctness/security defect. Otherwise record it as nonblocking Backlog and request approval before expanding scope.

## Git workflow

- Before starting a task, inspect the worktree and branch state, fetch `origin/main`, and create or continue one independent task branch from the latest `main`. Windows and macOS use this same workflow.
- Never commit or push development changes directly to `main`. Keep one task's changes, tests, and task-document updates on its task branch.
- At task completion, run the required local checks, update the required task records, and create a local commit on the task branch. Do not push, create a pull request, or merge without explicit user authorization.
- When authorized, push the task branch and create its pull request. Wait for the GitHub Actions `quality` check to pass; fix CI failures on that same task branch and never bypass required checks.
- Only after all merge conditions and explicit user approval may the task branch be Squash Merged. Then synchronize local `main` from `origin/main` and delete only the confirmed merged task branch.

## Cross-platform development and test environment

- Use Node.js `24.18.0` from `.nvmrc` and `npm ci` with the committed `package-lock.json`; do not regenerate the lock file without a dependency change.
- On Windows, run Docker Engine and the Compose Plugin inside WSL2 Ubuntu, not Docker Desktop. On macOS, use Colima with its Docker context. Verify `docker`, `docker compose`, and `docker buildx` before local container tests.
- Run disposable PostgreSQL tests with `docker compose --env-file .env.test -f compose.test.yaml`. Copy `.env.test.example` locally; `.env.test` stays untracked and contains test-only credentials. The container binds only to `127.0.0.1:54329`, has no persistent volume, and must be removed with `down --volumes` after testing.
- Never use `.env`, deployment credentials, a business database, or hardcoded system paths for tests. Use repository-relative paths and environment variables so Windows/WSL2 and macOS/Colima use the same commands.
- `.gitattributes` governs cross-platform line endings: repository text defaults to LF, while Windows command scripts retain CRLF and binaries remain unmodified. Never mass-normalize or re-check out unrelated tracked files for a line-ending-only change.
- Keep the single `.github/workflows/ci.yml` quality workflow. It must use `.nvmrc`, least-privilege read-only permissions, the isolated PostgreSQL 16 Actions service, and bounded same-ref concurrency. `npm run test` already includes the two PostgreSQL suites when `TEST_DATABASE_URL` is present; do not add `test:postgres` afterward and execute them twice.
- Before commits, run the affected-package checks and the focused test command. Keep the Git worktree clean except for the selected task, make one local checkpoint commit after acceptance, and never push without explicit approval.
- WSL distributions that default to `root` are supported only for bootstrap. Create and use a normal development user deliberately; do not change the default WSL user or Docker group membership without explicit approval.

## Long-lived task lifecycle and cross-session handoff

`docs/ROADMAP.md`, `docs/BUILD-TASKS.md` and `memory.md` are the joint source of truth for progress. Preserve the original requirements, dependency graph and complete acceptance gates in those documents; implementation, a passing focused test, or a historical result alone never completes a parent task or milestone.

### Trigger: `开始任务`

When the user says **「开始任务」**, perform this startup protocol before changing business code:

1. Read `AGENTS.md`, `memory.md`, and the relevant task/child entries and acceptance criteria in `docs/BUILD-TASKS.md`; use `docs/ROADMAP.md` to confirm milestone status and dependencies. Read the required product/architecture/security/test documents for the selected scope.
2. Inspect `git status --short`, recent commits, and the diff for every existing uncommitted change. Preserve valid user or prior-session work; never reset, clean, overwrite, or silently fold unrelated changes into the new task.
3. Identify the highest-priority unblocked **single minimal independently verifiable child task**. When multiple child tasks are available, prefer one whose prerequisites are satisfied, does not expand the modification scope, and can be accepted independently. State its callers, schemas/migrations, tests, fixtures, UI/API/Rust boundaries, data-loss or exposure risks, and prerequisite status before editing.
4. Classify blocked dependencies first. Never bypass a missing technical/security prerequisite, external authority or disputed acceptance boundary. An unrelated final-acceptance hold alone does not stop a safe independent approved slice. If the selected slice truly cannot proceed, preserve code and record the exact blocker and safe next action in `memory.md`; select an eligible independent slice only before starting work, otherwise stop.
5. For application, installer, update, release, or publishing changes, complete the Toolbox preflight above in its stated order. For contract conflicts, report the impact and proposed repair, then wait for approval.

### Execution rules

- Work on exactly one selected child task per turn. Do not begin the next child task, milestone, or T11+ work after it passes.
- Make the smallest complete change that satisfies that child task's stated acceptance slice. Do not reimplement already accepted behavior or expand scope.
- Preserve offline-first transactions, authorization, snapshots, migrations, outbox/idempotency, conflict retention, and all other non-negotiable rules.
- For a synchronization or schema change, include focused success, failure/retry and conflict/immutability coverage where applicable. Never silently drop a remote or local record to make projection succeed.
- If the same defect remains after three consecutive repair attempts, stop. Retain the code, document the attempts, root cause, evidence, and recommended next action in `memory.md`.

### Unattended fallback task pool

When the main path is blocked by external approval, product decisions, or task dependencies, inspect for a separately verifiable fallback task before stopping. Eligible work is limited to a known defect fix, targeted test-coverage improvement, error-handling gap, documentation consistency repair, or reliability improvement for an already implemented feature.

- Record the evidence, scope, affected callers/tests, acceptance criteria, and why it does not alter product behavior before editing.
- Use the normal branch, validation, progress-record, and checkpoint workflow for the selected fallback task; recommend the next item after it completes, then stop. Independently implementable approved v1.0 work may also be selected through the normal startup protocol; it is not an invented fallback feature.
- Do not invent requirements, bypass a blocked dependency, change product behavior, or conduct an unfocused refactor to create fallback work. If no eligible task exists, save the checkpoint and stop.

### Trigger: `收尾任务`

When the user says **「收尾任务」**, perform the following only for the currently selected child task:

1. Reinspect the diff and affected callers/tests. For code, run its focused test first, then every mandatory affected-package quality gate from `docs/BUILD-TASKS.md`: formatting, lint, strict typecheck, unit tests, production build, relevant Rust/API/integration checks, and reproducible Playwright DOM proof when the scope has UI acceptance. Do not rerun unrelated suites. Documentation-only tasks check formatting, references and status consistency. Preserve final release gates and name the SHA/scope of reused evidence.
2. Do not claim success when a required check is skipped, fails, or is blocked. Preserve the work; record the command, result, failure/skip reason, migration/sync effect, remaining risk, and next action in `memory.md`. Every skipped test must name the affected acceptance item and the impact of not running it.
3. If the selected child task is accepted, update the actual partial/full status and evidence consistently in `memory.md`, `docs/BUILD-TASKS.md`, and `docs/ROADMAP.md`. Keep incomplete parent tasks and milestones unchecked.
4. Create one local Git checkpoint commit containing only the selected task's code, tests, and progress documentation. Never push, deploy, delete data, or start another task without explicit user instruction.
5. Classify every remaining issue as `BLOCKER` (prevents the current task's acceptance), `DEFERRED` (belongs to a later task), or `WARNING` (does not affect current acceptance). Never mark a `BLOCKER` complete or automatically fix a `DEFERRED` issue. Report changed files, commit hash, test evidence, this classified issue list, and the recommended next task, then stop immediately.

### Cross-session handoff

- End every task attempt with `memory.md` recording the exact Git checkpoint, dirty files (if any), selected child task status, completed evidence, skipped/failed checks, data or migration effects, and every remaining issue classified as `BLOCKER`, `DEFERRED`, or `WARNING`. A skipped test must include its reason and affected acceptance item.
- At the next `开始任务`, treat that handoff and the current Git tree as evidence to verify, not assumptions to overwrite. Reconcile contradictions in favor of current code, current Git history, and fresh test output. Prioritize an unblocked `BLOCKER` that affects the current task's acceptance before any `DEFERRED` work.
- A blocked or partial child task stays unchecked. Its preserved code is a checkpoint for recovery, not proof of acceptance.

## Recommended repository layout

`apps/desktop` (Tauri + React), `apps/server` (HTTP API), `packages/shared` (Zod contracts), `docs`, `tests`.

## Definition of done

Acceptance criteria pass, offline mode validated, sync retries safe, PDFs match saved order snapshot, migrations tested, no secrets committed, docs updated.
