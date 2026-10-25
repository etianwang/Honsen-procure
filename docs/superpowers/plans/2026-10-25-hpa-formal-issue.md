# HPA Formal Issue Implementation Plan

> **For agentic workers:** Use executing-plans inline. This is one bounded T08 HPA slice; independent recheck belongs to the controller.

**Goal:** An authorized purchaser/administrator can issue an approved Honsen parent as HPA offline, retain its complete immutable snapshot, and synchronize it without renumbering.

**Architecture:** Reuse the OPA SQLite allocator, audit and transactional Outbox through one private issuer. Keep separate narrow OPA/HPA commands. Extend existing formal registration and Pull validation for HPA `approved/confirmed → executing → receiving`; keep legacy unnumbered market execution intact.

**Tech Stack:** Existing Tauri 2/Rust, React/TypeScript, SQLite and Fastify/PostgreSQL16.

**Spec:** `docs/PRD.md` §4, `docs/SPECS.md`, existing T08/T10 acceptance in `docs/BUILD-TASKS.md`.

## Constraints and boundaries

- Continue `codex/v1-business-flow` at `5915335`; preserve the unrelated AppShell role-label edit.
- No Toolbox identity/contract change; preflight completed in the required five-source order. No production deployment, main merge or formal Release.
- Existing SQLite0044 and PostgreSQL006 allow HPA: no DDL or historical payload rewrite is needed. Generic shared SyncEvent already carries the formal fields.
- Callers: Rust issuer/commands/main, frozen Pull validator and number checker; `requisition-api.ts`, preview API and history panel; server formal parser/registry. Preserve OPA calculation and preissue bytes.
- HPA freezes ordinary saved line prices, currencies, supplier/material snapshots, tax and totals; it never applies owner markup. Existing supplier children remain separate documents. SPO, exports, translations, payments and closure are excluded.

## Steps

- [x] Add failing HPA parser and real SQLite Pull regressions.
- [x] Add the narrow HPA command, shared internal issuer, mode-specific validation and normal history action.
- [x] Extend formal parser/registration/Pull without weakening approval provenance, uniqueness, immutability or cursor rollback.
- [x] Verify local issue authorization and late-Outbox rollback; retry without another number; frozen restart/Pull/receiving and conflict retention. Verify PostgreSQL Push/Pull, same-event replay, forged approval, number collision and changed snapshot rejection. Verify actual history controls with Playwright.
- [x] Run affected package gates and update memory/task/roadmap evidence for the containing checkpoint; stop for independent recheck. Keep all original parent/Formal holds open.
