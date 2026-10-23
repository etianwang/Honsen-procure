# T04 Material Category Maintenance Implementation Plan

> **For Codex:** Execute this plan with test-driven development. Keep this branch limited to T04 material-category maintenance.

**Goal:** Let authorized local administrators add, rename, and deactivate material categories while preserving every existing material reference and creating one transactional outbox event per change.

**Architecture:** Extend the already-present `MaterialCategoryInput` through the trusted Rust boundary and the existing master-data adapter. Reuse `local_material_categories`, the existing shared `material_category` entity type, server generic sync storage, and desktop Pull projection. Do not introduce a migration, delete operation, or separate synchronization path.

**Tech Stack:** Rust/rusqlite/Tauri 2, React/TypeScript/Ant Design, Vitest/Playwright.

---

### Step 1: Prove the missing Rust boundary

**Files:** `apps/desktop/src-tauri/src/lib.rs`

1. Add focused tests for authorized create/update/deactivate, unprivileged rejection, material-reference preservation, and one pending `material_category` outbox event per write.
2. Run the focused Rust test and confirm it fails because the category methods/commands do not exist.

### Step 2: Implement the smallest trusted service API

**Files:** `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/main.rs`

1. Add list/save methods with `require_master_data_mutation`, immutable business code, existing text/version validation, and one SQLite transaction containing category upsert plus outbox write.
2. Register only list/save commands; no delete command.
3. Re-run focused Rust tests, then the affected Rust library suite.

### Step 3: Extend the desktop contract and management UI

**Files:** `apps/desktop/src/lib/master-data-api.ts`, `apps/desktop/src/components/MasterDataManager.tsx`, `apps/desktop/src/pages/MasterDataPage.tsx`, relevant fixture/test files.

1. Add the category view/API calls and load it beside existing master data.
2. Add one accessible category tab for add, edit-on-blur, and activate/deactivate.
3. Add a focused DOM regression proving the visible authorized flow and the disabled non-editor behavior.

### Step 4: Verify and checkpoint

1. Run format, focused Rust tests, TypeScript typecheck, affected frontend test/Playwright proof, and production frontend build using E:-isolated caches.
2. Inspect diff for secrets/generated data and confirm only this slice changed.
3. Record READY_FOR_RECHECK without changing T04 parent acceptance or T13 BLOCKED_DECISION; commit locally only.
