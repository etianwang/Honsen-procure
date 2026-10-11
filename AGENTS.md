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

## Recommended repository layout

`apps/desktop` (Tauri + React), `apps/server` (HTTP API), `packages/shared` (Zod contracts), `docs`, `tests`.

## Definition of done

Acceptance criteria pass, offline mode validated, sync retries safe, PDFs match saved order snapshot, migrations tested, no secrets committed, docs updated.
