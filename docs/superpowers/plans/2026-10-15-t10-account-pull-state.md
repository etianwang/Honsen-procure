# T10 Per-Account Pull State Implementation Plan

> **For agentic workers:** Use test-driven development in this isolated Builder worktree; this single child task is executed inline under the existing Builder assignment.

**Goal:** Make desktop Pull cursor and last-success state account-specific without attributing legacy data.

**Architecture:** Add SQLite migration `0047` for account sync state. Keep the old installation row for identity and historical evidence, but start each account cursor at `0`; update the new row in the same transaction as a Pull page. The HTTP Pull caller reads the active account's cursor, while status reads that account's success timestamp.

**Tech Stack:** Rust, rusqlite, Tauri 2, SQLite migrations.

**Spec:** `docs/SYNC-PROTOCOL.md`, `docs/BUILD-TASKS.md` T10-B, `docs/SECURITY.md`.

## Global Constraints

- Desktop never connects directly to PostgreSQL; account authentication remains the trusted Rust boundary.
- Preserve old singleton sync state and NULL-owner outbox rows; do not infer ownership.
- Do not edit server/shared contracts, Fixer files, or E2E data.

## Review Focus

- B's first Pull after A advanced must start at `0` and receive B-only earlier changes.
- A response arriving after account switch must not project rows or advance either account.
- A failed page must leave its account cursor and staged rows unchanged.
- Restart must resume each account's committed cursor; replay of the last page must be idempotent.
- Status must show only the active account's last success and pending/conflict counts.

## Task: Per-account desktop Pull state

**Files:** create `apps/desktop/src-tauri/migrations/0047_sync_account_pull_state.sql`; modify `apps/desktop/src-tauri/src/lib.rs` tests, migration runner, Pull and status; update `docs/BUILD-TASKS.md`, `docs/ROADMAP.md`, `memory.md`.

**Interface:** `local_sync_account_pull_state(account_id, last_pull_cursor, last_success_at)` is local-only; HTTP request/response and Tauri return shapes do not change.

- [x] Write A/B cursor, status, failure, replay, restart and migration preservation tests; focused Rust tests first failed on missing per-account table and foreign-outbox cursor advance.
- [x] Add migration 0047 and account-keyed cursor/status reads and transactional page write; remove the multi-account Pull stop after local isolation tests passed.
- [x] Run full affected Rust, workspace, Playwright DOM and native debug build gates; PostgreSQL-dependent server tests skipped and not claimed as acceptance.
- [x] Commit one local checkpoint and hand it to Fixer without claiming T10-B or P1 closure.
