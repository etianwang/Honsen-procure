# T10 lifecycle baseline QA — `74365f0`

Date: 2026-10-15.  Tester worktree: `codex/fixer-api-postgres-qa` (report only).  Subject checkout: detached `74365f0f39032d4b768d8bc4c397b626221820f1` at `fixer-t10-lifecycle-74365f0`.  No Builder branch, migration, contract, E2E data, or application source was changed.

## Environment

- Windows PowerShell: Node `v24.18.0`, npm `11.16.0` (matches `.nvmrc`).
- Docker is absent from PowerShell. WSL2 Ubuntu exposes Docker Engine `29.9.0`, Compose `v5.6.0`, and Buildx `v0.38.0`.
- `npm ci` completed in the detached subject checkout: 217 packages added, audit reported 0 vulnerabilities. npm reported two pending `allowScripts` notices (`argon2`, `esbuild`); no approval/configuration was changed.

## Executed evidence

| Surface | Exact command | Result |
| --- | --- | --- |
| Server WebSocket hint, authenticated Push boundary, database-start retry, login/session service | `npm run test --workspace @honsen/server -- src/sync/api.test.ts src/db/pool.test.ts src/auth/service.test.ts` | Exit 0. 3 files passed; 10 tests passed; 0 failed/skipped. |
| HTTPS endpoint validation | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml sync_endpoint_requires_clean_https_base_url` | Exit 0. 1 passed, 0 failed, 26 filtered. |
| Pull continuation after a partial/non-advancing page | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml pull_continues_only_after_a_full_advancing_page` | Exit 0. 1 passed, 0 failed, 26 filtered. |
| Durable cursor update plus local conflict preservation | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml pull_page_advances_cursor_atomically_and_preserves_local_conflicts` | Exit 0. 1 passed, 0 failed, 26 filtered. |
| Cached offline login role gate | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml cached_account_can_login_offline_and_is_role_checked` | Exit 0. 1 passed, 0 failed, 26 filtered. |
| Offline-window and idle-session expiry | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml offline_window_and_idle_sessions_expire` | Exit 0. 1 passed, 0 failed, 26 filtered. |

Rust emitted only the existing linker informational warning (`#[warn(linker_messages)]`); all listed commands exited zero.

## PostgreSQL multi-device conflict attempt

Targeted command:

```powershell
wsl.exe -d Ubuntu -- bash -lc 'cd "/mnt/c/Users/This PC/.codex/worktrees/fixer-t10-lifecycle-74365f0" && docker compose --env-file .env.test -f compose.test.yaml up -d --wait'
$env:TEST_DATABASE_URL='postgresql://honsen_t10_qa:***@127.0.0.1:54330/honsen_t10_74365f0'
npm run test --workspace @honsen/server -- src/sync/postgres-store.test.ts -t "is idempotent and records an optimistic-concurrency conflict without overwriting"
```

Result: **BLOCKED, not PASS**. Compose printed network creation and `postgres-test` creation/starting, but did not reach health completion within the command window. A subsequent `docker compose ... ps -a` reported no service rows. The Vitest command therefore did not run; no assertion count exists. This is an environment/WSL-Docker lifecycle blocker, not evidence of a product defect. Safe retry: start the same disposable Compose command in WSL and wait for `Healthy`; only then set the isolated `TEST_DATABASE_URL`, run the exact `-t` test, and always run `docker compose ... down --volumes` afterward.

## Verified coverage and gaps

- Verified server-side hint route/notification through `apps/server/src/sync/api.test.ts`; verified desktop Pull page durability through `apps/desktop/src-tauri/src/lib.rs` tests.
- **T10-GAP-001 (acceptance gap, owner: T10 runtime):** `apps/desktop/src/pages/LoginPage.tsx:192-198` performs one `refresh_authorization` and one `pull_sync` after online login. `apps/desktop/src` has no invocation of `push_pending_sync`, and no runtime retry/backoff, online/offline event listener, or reconnect scheduler. `push_pending_sync`/`pull_sync` are only exposed commands in `apps/desktop/src-tauri/src/main.rs:64-65` and `lib.rs:5188-5201`. T08/T09 outbox events therefore cannot be demonstrated to drain after reconnect.
- **T10-GAP-002 (acceptance gap, owner: T10 runtime):** the server implements a WebSocket hint endpoint in `apps/server/src/app.ts:272-292`, but `rg` found no desktop WebSocket client. T32 (missed hint followed by cursor Pull) has no native runtime/E2E proof.
- **T10-GAP-003 (coverage gap, owner: T10 QA/runtime):** the focused PostgreSQL optimistic-concurrency test could not execute because the disposable Compose service did not become healthy. T09/multi-device conflict server persistence remains unverified in this round; no failure is attributed to `74365f0`.
- **T10-GAP-004 (coverage gap, owner: T10 runtime):** no focused native desktop test covers session revocation causing lock on the next authenticated request (T16/T28). The existing unit evidence covers offline expiry only, not online revocation/reconnect.

## QA conclusion

The six executable focused commands passed (15 assertions total). This is partial baseline evidence only. The four gaps above leave T10 and its parent acceptance open. No defect fix was made and no Builder delivery is accepted by this report.
