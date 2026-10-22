# PR 17 supplier independent QA follow-up

Result: **QA_FAIL**. Candidate `5708b19caf019b29dae9f420380c6ae7316184a6`; previous local UI/SQLite pass is recorded in `REPORT.md`. No production application code or database was changed.

## Confirmed blocker: cross-country supplier disclosure and modification

On the candidate server with PostgreSQL 16.14, create a synthetic country A supplier through a real Windows Tauri EXE's Rust IPC and Push. Authenticate a synthetic purchaser whose sole active project binding is country B. An actual HTTPS `GET /api/sync/pull?cursor=0&limit=500` returned the country A supplier twice (create and edit) and its price. An actual HTTPS `POST /api/sync/push` with that same B purchaser's session, the current server version, and a supplier payload with a changed name and country B returned `accepted`, server version 3. Direct PostgreSQL read confirmed the supplier was changed to country B. The user had only role `purchaser` and project `QA-B-P` in country B. The full synthetic result is `sync-followup.json`; `tests/native/pr17-followup.mjs` contains the exact requests and asserts. No mock server or mock API was used.

The relevant candidate server boundary is `apps/server/src/sync/postgres-store.ts` (`pullChanges` treats purchaser as globally readable) and `apps/server/src/sync/service.ts` (`canWrite` accepts procurement roles for supplier events without supplier-country scope or immutability). This is a confirmed authorization and data-integrity failure, not a transient test error. Developer repair and a fresh independent recheck are required.

## Positive real sync evidence

Two distinct Windows debug EXEs, separate SQLite profiles and installation IDs, authenticated through the actual HTTPS test server. Supplier create, associated price create, and supplier edit were individually accepted by PostgreSQL (each `acceptedCount=1`, `pendingCount=0`). Country A was present after create and retained after edit. An authorized second device's Rust `pull_sync` applied three changes; its supplier list showed the edited supplier with country A and SQLite contained the price referencing the intended supplier and existing material. See `sync-followup.json`. The test server is the repository's real server wiring, configured for disposable fixtures, not a mocked API.

## Environment and timeouts

The earlier Docker container log stopped during initialization after post-bootstrap work; the isolated Windows PostgreSQL 16 initialization likewise stalled at `syncing data to disk`. Initializing a new disposable E-drive cluster with `--no-sync` and running it with `fsync=off` enabled this test; these durability settings are limited to disposable test data. The first `initdb` invocation failed on a PowerShell argument, the next was stopped at the stalled disk sync, and a separate `data-nosync` cluster succeeded. WSL's reported systemd user-session failure remains an environmental warning; the precise underlying storage cause was not established.

Run 05's original login timeout lacks a retained browser trace; during follow-up a real WebView2 loaded Vite resources slowly and eventually rendered the login screen, with approximately 32 seconds observed in a live inspection. A focused later recheck loaded and logged in successfully. This supports an environment/driver timing explanation but does not prove the precise cause of the original timeout.

Run 06's preserved SQLite has no new supplier or supplier outbox event; its original driver recorded neither page state nor IPC responses, so the exact failure cannot be reconstructed. A focused real EXE retest waited for the selected authorization context; WebView2 reached complete state, `get_authorization_context` and `save_supplier` returned HTTP 200 over real Tauri IPC, the save notice appeared in 935 ms, and SQLite contained the supplier and one outbox event (`timeout-recheck.json`). Source inspection shows the page refuses create before its asynchronous authorization context is available, but the original run did not record whether that condition occurred. Do not claim that run 06 was definitively explained. Two attempted diagnostic hooks could not replace frozen Tauri invoke properties; their failure is test instrumentation, not a product result (`timeout-diagnostic-attempt1.json`, `timeout-diagnostic-attempt2.json`).

Only the directly relevant supplier workflow, country isolation and associated sync were tested. Existing PR CI `quality` checks were successful for the candidate at inspection. Full T04, T10, deployment and release acceptance were not rerun.
