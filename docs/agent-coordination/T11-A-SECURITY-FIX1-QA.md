# T11-A Security FIX1 — Independent QA

**Candidate:** `1d58b4c391499c682f6d3a9805a52e8b9d276fa3`

**Parent:** `baca5084ff2befd278b9428248d6a02bf46ba`

**QA branch:** `codex/t11a-security-fix1-qa`

**Verdict:** **BLOCKED** — no reproducible production bypass found, but this Windows account cannot create a terminal file symlink, so the required native symlink evidence is absent.

## Verified boundary

- `main.rs` registers `select_order_attachment` and `ingest_selected_order_attachment`; the former `ingest_order_attachment` raw-path IPC command is absent. The TypeScript adapter likewise sends only `orderId` to selection and `orderId` plus `selectionToken` to ingestion.
- `WebviewWindow` is injected by Tauri into both commands. The renderer does not supply the window label. `LocalAuthService` binds every selection to the current account, service session epoch, injected window label and order ID.
- The pending-selection mutex checks expiry and all bindings, then removes the token while still holding the mutex. A second concurrent caller can only observe an absent token; consumption is atomic before file copying or SQLite work starts.
- The native dialog is the only production path that produces a source path. The backend stores a read handle, not that path. Windows opens with `FILE_FLAG_OPEN_REPARSE_POINT` and a read-only share mode that denies write/delete; later copying reads from that held handle.
- Every path ancestor is inspected using `symlink_metadata`; Windows reparse attributes and symlinks are rejected. The focused test creates a real Windows directory junction with `mklink /J` and confirms rejection.
- The application declares only the `main` Tauri window and no application source creates another webview. Closing the sole window ends this process in the normal desktop lifecycle, dropping in-memory tokens. No native window-close automation was added in this scoped QA.

## Fresh independent evidence

All commands used isolated directories under `E:\Honsen-isolated\t11a-fix1-qa` for TEMP/TMP, Cargo home, Cargo target and npm cache.

| Check                                                                                              | Result                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `cargo fmt --check`                                                                                | PASS                                   |
| `cargo test --lib order_attachment_ --no-fail-fast`                                                | PASS 7/7                               |
| Native Windows junction/reparse rejection (`mklink /J`)                                            | PASS                                   |
| Token order/window/session/reuse/expiry and held-handle rename-replacement coverage                | PASS within the 7 Rust tests           |
| `cargo test --lib catalog_writes_are_role_protected_and_price_changes_keep_history --no-fail-fast` | PASS 1/1                               |
| `cargo check -q`                                                                                   | PASS                                   |
| `npm ci` with Node 24.18.0                                                                         | PASS; 0 vulnerabilities reported       |
| Desktop TypeScript typecheck and Vite production build                                             | PASS; existing chunk-size warning only |
| Focused history Playwright regression                                                              | PASS 1/1                               |

The Playwright proof verifies that the raw absolute-path input is absent, selection occurs before archive, and the archive call receives the selection token rather than a path. SQLite-insert rejection cleanup, pending-upload state, SHA-256, size limits and restart persistence are included in the directed Rust coverage.

## Required unavailable evidence

A fresh Windows `New-Item -ItemType SymbolicLink` attempt against a QA-owned file returned: `Administrator privilege required for this operation.` The previously verified junction case is a real reparse-point proof, but it is not evidence for a terminal file symlink. Therefore this QA does not claim PASS.

## Final symlink-evidence environment check — 2026-10-21

The current isolated Windows QA account is `desktop-rtp971k\this pc`. `whoami /priv` lists no `SeCreateSymbolicLinkPrivilege`, and the AppModelUnlock Developer Mode values are not available to this non-elevated session. The earlier fresh symlink creation attempt therefore cannot be retried meaningfully here; it already returned `Administrator privilege required for this operation` before a link object existed. No native file-dialog selection was attempted, so a chooser cancellation, missing source path, or test-harness failure cannot be misreported as production rejection.

**Final QA verdict remains BLOCKED_ENV.** The independently verified real `mklink /J` junction rejection remains valid reparse evidence, but the required terminal file-symlink creation and production rejection proof needs a Windows account with Developer Mode or `SeCreateSymbolicLinkPrivilege`. No production candidate file, attachment SQLite row, managed file, G4/PostgreSQL/Formal state, push, PR, or merge changed in this supplement.

No PostgreSQL, G4/Native matrix, COS/archive, push, PR, merge, production database, or production-source change occurred. The QA worktree is otherwise clean; its only intended change is this evidence document.

## Independent recheck entry

In a Windows environment that permits file symlinks, repeat the directed attachment suite and add a terminal file-symlink selection attempt. It must return `invalid_input`, create no token or attachment record, and leave no managed attachment file. If that passes, this exact candidate may receive a PASS for the bounded T11-A Security FIX1 boundary; T11-B remains `NOT_READY_TO_START` and the parent T11 acceptance remains open.
