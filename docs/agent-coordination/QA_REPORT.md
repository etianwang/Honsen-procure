# Independent QA Report — T08/T10/P1/Formal Combination

**Date:** 2026-10-16  
**QA branch:** `codex/qa-b203c70-server`  
**Verified baseline:** `b203c70fd83a5dbcdb01fcaf9184d5b9fa9bbd13`  
**Delivered implementation:** `8293ed5172f8caa5dd149cec278ea09f0f1a852e`

## Scope and baseline

- PASS — `git merge-base --is-ancestor 8293ed5172f8caa5dd149cec278ea09f0f1a852e b203c70fd83a5dbcdb01fcaf9184d5b9fa9bbd13` returned `0`; the supplied clean handoff contains the delivered implementation.
- PASS — QA ran in an independent worktree from `b203c70`; the source worktree's pre-existing untracked native/E2E SQLite data was not copied, opened, altered or removed.
- PASS — Node `v24.18.0`, WSL Ubuntu Docker Engine 29.9.0, Compose 5.6.0 and Buildx 0.38.0 were verified. `npm ci` completed with 0 vulnerabilities.

## Fresh PostgreSQL evidence

Each official run used the isolated Compose project `honsen-qa-b203c70-20261016` and first executed:

```text
docker compose --project-name honsen-qa-b203c70-20261016 --env-file .env.test -f compose.test.yaml down --volumes
docker compose --project-name honsen-qa-b203c70-20261016 --env-file .env.test -f compose.test.yaml up -d --wait
```

The PostgreSQL 16 container was healthy before execution. Its only database was the test-only `POSTGRES_TEST_DATABASE`; no production connection string, existing E2E SQLite database, `honsen-dev`, or other Compose project was used.

| Check                                                               | Result                                                                                                                                                                                                                                                    | Evidence                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Full server Vitest suite                                            | PASS — 14 files, 92/92 tests                                                                                                                                                                                                                              | `test-results/qa-b203c70-server-full-fresh.log`     |
| Builder's combination group                                         | PASS — 6 files, 57/57 tests                                                                                                                                                                                                                               | `test-results/qa-b203c70-server-combination-57.log` |
| Migration chain `001`–`006` including both ordered `005` migrations | PASS — `migration-runner.test.ts` validates the migrated foundation and repeatable runner                                                                                                                                                                 | combination group                                   |
| Formal registry backfill and rollback                               | PASS — `formal-issue-migration.test.ts` proves legacy rows are retained and duplicate legacy formal numbers abort under a savepoint without leaving the registry table                                                                                    | combination group                                   |
| RFQ / formal frozen-state regression                                | PASS — `postgres-store.test.ts`, `formal-issue.test.ts`, and `formal-issue-hardening.test.ts`                                                                                                                                                             | combination group                                   |
| Cross-account and installation-origin isolation                     | PASS — store test rejects replay result retrieval from another authenticated account/origin; legacy unattested origin fails closed. Full suite additionally covers binding Push installation to the authenticated session rather than request `deviceId`. | full suite and combination group                    |

Official command used for the full suite:

```text
node ../../node_modules/vitest/vitest.mjs run
```

It was invoked from `apps/server` by a temporary ignored QA runner while Compose and the Windows Node process shared one foreground WSL session. This avoids the known host lifecycle interruption without changing application code or test behavior.

## Failure classification

- ENVIRONMENT (not a product failure): two initial full-suite attempts received PostgreSQL `57P01`/`57P03` because the local WSL Docker host stopped after its launching session exited. Their later assertion failures were cascading connection failures, not data pollution or implementation regressions.
- PASS after mitigation: the official fresh-container full run had no connection interruption, no skipped PostgreSQL tests, and no failures. The 57-test targeted rerun was also clean.
- DATA POLLUTION: not observed in either official run. Both began after scoped `down --volumes`; no existing user E2E data was cleaned.

## Acceptance boundary

This report accepts only the completed server/migration verification batch. It does **not** close P1 or Formal integration holds and provides **no** evidence to close `T10-SEC-001`: real Tauri A/B login, Push/Pull conflict/replay, old-token and reconnect isolation remain a separate native-client batch. No application source, schema, migration or security rule was changed by QA.

## Native Tauri / A-B HTTP QA — 2026-10-16

At the time of the original native attempt, application source remained byte-identical to `b203c70` (`git diff --quiet b203c70 -- apps packages` returned 0); the later infrastructure repair below adds only test-profile/test-server plumbing.

| Native acceptance item                                 | Result  | Actual evidence                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated native test profile                           | PASS    | `honsen-procure-test-profile seed` created only the new `.honsen-native-qa/ab-http.test.sqlite` profile and its synthetic A/B/purchaser accounts. Existing E2E profiles were not opened or cleaned.                                 |
| Real Tauri host launch                                 | PASS    | `npm run desktop:dev --workspace @honsen/desktop` ran `HonsenProcure.exe`; Windows reported title `Honsen Procure — TEST PROFILE`, nonzero main-window handle and `Responding=True`. See `test-results/qa-b203c70-native-host.log`. |
| Real native window automation                          | BLOCKED | The Computer Use inventory returned `apps: []` twice although the test-profile process/window was live. No UI field, CAPTCHA, login or mocked browser substitute was used.                                                          |
| A/B online login, logout, switch and session isolation | BLOCKED | Requires a targetable native window and a trusted HTTPS server.                                                                                                                                                                     |
| Untrusted `deviceId` origin test                       | BLOCKED | Native request cannot reach the isolated HTTP-only server. The previous server-only result remains separate evidence and is not counted here.                                                                                       |
| A/B Push, Pull, conflict query and replay containment  | BLOCKED | Same trusted-HTTPS/native-window blockers.                                                                                                                                                                                          |
| Old-token revocation/switch denial                     | BLOCKED | Same trusted-HTTPS/native-window blockers.                                                                                                                                                                                          |
| Offline mutation, reconnect, cursor recovery and retry | BLOCKED | Native UI could not be operated; no simulated Playwright result is substituted.                                                                                                                                                     |
| RFQ/Formal desktop regression                          | BLOCKED | Normal UI flow cannot be operated; no mock/Playwright result is substituted.                                                                                                                                                        |

The concrete transport blocker is structural, not an assertion failure: desktop `api_endpoint_from` and every cloud client use HTTPS only, while `apps/server/src/index.ts` provides only `http://127.0.0.1:3000`. The QA host has no `mkcert`, Caddy, OpenSSL, pre-trusted localhost/Honsen root certificate, or permitted trusted HTTPS test endpoint. Creating/trusting a root certificate would change host security settings and was not done.

**T10-SEC-001 remains OPEN.** This batch proves the test-profile host can launch, but it provides no native A/B HTTP evidence for the required isolation, replay, revocation or reconnection paths.

## Native HTTPS / controlled-host infrastructure repair — 2026-10-16

The prior native result remains valid for UI automation: Computer Use reported `apps: []` while a real test-profile window was live, so normal native-window driving is still unavailable here. This repair deliberately does not substitute Playwright, a mocked Tauri IPC, or a standalone HTTP client.

| Item                                         | Result  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated HTTPS endpoint                      | PASS    | `apps/server/src/scripts/native-test-server.ts` starts the real Fastify routes/services against a disposable loopback PostgreSQL database whose name must include `test`. It has no production entry point.                                                                                                                                                                                                                                     |
| Certificate trust boundary                   | PASS    | `tests/native/run-native-https-smoke.ps1` creates a one-day `localhost`/`127.0.0.1` leaf certificate in CurrentUser\My, exports it only to the ignored QA directory, and injects its PEM only via `HONSEN_PROCURE_TEST_TLS_CA_PEM` and `open_test_path`. No system Root trust, `danger_accept_invalid_certs`, or production-profile override is used. Final run verified no temporary PFX/CER and no matching certificate-store entry remained. |
| Native controlled harness                    | PASS    | `HONSEN_PROCURE_NATIVE_SMOKE=online-login` is accepted only after the existing test-profile guard has required an absolute `.test.sqlite` database. It invokes the real local CAPTCHA, cloud CAPTCHA, `online_login`, OS test credential vault, SQLite migration/persistence and HTTPS client; it cannot select a production profile.                                                                                                           |
| Actual HonsenProcure.exe HTTPS + login smoke | PASS    | Command below seeded `native-smoke-20261016172717.test.sqlite`, then the compiled `target/debug/HonsenProcure.exe` authenticated `engineer-a` through `https://localhost:3443`. Result JSON records the expected fixed synthetic user ID and username.                                                                                                                                                                                          |
| Full native A/B UI matrix                    | BLOCKED | Computer Use still exposes no Windows app target, and this controlled non-UI smoke intentionally covers only transport/login plumbing. It is a harness for the next Fixer batch, not evidence for Push/Pull/replay/revocation/reconnect or RFQ/Formal UI acceptance.                                                                                                                                                                            |

Reproducible command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Final run artifacts (ignored test data/logs):

- `.honsen-native-qa/native-smoke-20261016172717.test.json`
- `.honsen-native-qa/native-smoke-20261016172717.test.sqlite`
- `test-results/native-smoke-20261016172717-server.log`
- `test-results/native-smoke-20261016172717-server-error.log` (0 bytes)
- `test-results/native-smoke-20261016172717-client.log`

Focused validation: server typecheck PASS; Rust TLS trust-boundary unit test PASS (1/1); full desktop Rust suite PASS (53/53); `cargo check --bin HonsenProcure` PASS. The smoke run itself PASSed. A non-test-profile smoke invocation exited 101 before creating its sentinel directory. The temporary WSL PostgreSQL Compose project was removed with `down --volumes`; no existing E2E profile was opened or removed.

**T10-SEC-001 remains OPEN.** The new evidence closes only the trusted-endpoint/native-login infrastructure blocker. It does not establish A/B Push/Pull conflict/replay, token revocation, reconnect isolation or RFQ/Formal desktop behavior, and does not release P1 or Formal holds.

## Native HTTPS A/B login-switch smoke — 2026-10-16

This narrow follow-up extends the existing test-only controlled host without attempting Computer Use or substituting Playwright, a mock, or an independent HTTP client. The compiled `HonsenProcure.exe` opens two separately seeded absolute `.test.sqlite` profiles (and therefore two independently derived test credential-vault namespaces/installations) and calls the production local CAPTCHA, cloud CAPTCHA, `online_login`, `lock`, secure credential-vault and HTTPS authorization-refresh paths.

| Scenario | Result | Actual assertion |
| --- | --- | --- |
| Profile A login as `engineer-a` | PASS | Real local/cloud CAPTCHA and `online_login` completed through the isolated Fastify HTTPS server. |
| Profile B login as `engineer-b` | PASS | A second independently seeded SQLite profile authenticated with its own installation identity. |
| B switches to `engineer-a` | PASS | A new server session was created through the production Rust client flow. |
| A's replaced token | PASS | `refresh_authorization_https` on profile A returned `AuthError::NoActiveSession` after B's A-login revoked the earlier server session. |
| B logout/session guard | PASS | After `lock`, B's `refresh_authorization_https` returned `AuthError::NoActiveSession`; no protected request was sent with a retained online session. |

The harness first exposed a test-infrastructure isolation defect: the two test SQLite profiles used one OS credential-vault service and the same account ID would overwrite the other profile's test token. Commit `028ed6fbfa9df220010eb0c3271de7e75b7419b9` scopes test credential services to the SHA-256 of the absolute `.test.sqlite` path, while retaining the production service names and clearing the former legacy test names. This is needed for a valid multi-profile assertion; it does not relax TLS, authentication, installation ID, transaction, cursor, approval, soft-delete, or snapshot rules.

Reproducible command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Latest successful run: `native-smoke-20261016173505`.

- Result: `.honsen-native-qa/native-smoke-20261016173505.test.json`
- Client process log: `test-results/native-smoke-20261016173505-client.log`
- HTTPS server log: `test-results/native-smoke-20261016173505-server.log`
- Server error log: `test-results/native-smoke-20261016173505-server-error.log` (0 bytes)
- Compose logs: `test-results/native-smoke-20261016173505-compose.log` and `test-results/native-smoke-20261016173505-compose-error.log`

Focused checks: `cargo fmt --check` PASS, `cargo test --lib` PASS (54/54), `cargo build --bin HonsenProcure --bin honsen-procure-test-profile` PASS, and the native A/B command above PASS. The temporary Compose project was removed with scoped `down --volumes`; only new ignored QA profiles and their public PEM evidence remain. No production database, existing E2E data, Root trust, global TLS bypass, push, PR, or main merge was used.

**T10-SEC-001 remains OPEN; P1 and Formal holds remain OPEN.** This result is evidence only for A/B authentication/session replacement and local logout isolation. Native `deviceId` source integrity, Push/Pull, conflicts, replay, offline/reconnect/cursor/retry, and RFQ/Formal flows are deliberately not claimed and remain the next matrix batch.

## Native A/B synchronization-security harness checkpoint — 2026-10-17

This batch extended the existing controlled, real-client harness only. It invokes the compiled debug `HonsenProcure.exe`, two fresh absolute test-profile SQLite files, the OS credential vault, the production Rust local-auth/sync functions, an isolated PostgreSQL Fastify HTTPS service, and the test-profile PEM trust path. It does not use Playwright, a mocked Tauri command, or a standalone HTTP client.

| Scenario | Result | Evidence |
| --- | --- | --- |
| A/B independently seeded installations | BLOCKED | The harness asserts different SQLite installation UUIDs before sync; execution reached both native logins but could not retain A's credential-vault token after B login. |
| Forged `deviceId` retains authenticated origin | BLOCKED | The harness changes only A's test SQLite `installation_id`, then checks the server-recorded `origin_installation_id` response header after an actual Rust Push. It was not reached. |
| A/B Push/Pull isolation | BLOCKED | A's project binding and B's zero-binding Pull assertion were prepared but not reached. |
| A/B conflict-query isolation | BLOCKED | The actual purchaser stale-Push/local-conflict path was prepared but not reached. |
| Post-commit failure, replay and idempotency | BLOCKED | The HTTPS test server is configured to return a single 503 only after its real Push handler commits, then accepts the same Rust outbox event on retry; the native client did not reach Push. |

The actual reproducible run was:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Run `native-smoke-20261017083543` used a new scoped Compose PostgreSQL service and stopped with the result JSON:

```text
account A lost its protected session after login: NoActiveSession;
state=Ok((Some(engineer-a UUID), Some(engineer-a UUID), false))
```

The result proves that A's SQLite local session and in-memory online-account marker still point to A, but its OS credential-vault sync token is absent after B's login. The A/B paths are distinct: profile SHA-256 prefixes were `a184106b` and `411b7fc5`, yielding distinct `S-...` credential services, and the underlying Windows keyring target is `account_uuid.service`. The original longer names, a 24-character scoped name, and the current 10-character scoped name all reproduced the same loss. This is a **native-test-harness BLOCKER**, not evidence of a server account-isolation defect; no Push request was made and no product security assertion has been relaxed.

Artifacts retained for reproduction:

- `.honsen-native-qa/native-smoke-20261017083543.test.json`
- `.honsen-native-qa/native-smoke-20261017083543-account-a.test.sqlite`
- `.honsen-native-qa/native-smoke-20261017083543-account-b.test.sqlite`
- `test-results/native-smoke-20261017083543-{client,server,server-error,compose,compose-error}.log`

Fresh focused checks: `cargo fmt --check` PASS; credential-service isolation and test-installation replacement Rust tests PASS (2/2); `npm run lint --workspace @honsen/server` PASS; `npm run typecheck --workspace @honsen/server` PASS. The native command itself is FAIL/BLOCKED at credential retention, so it is not counted as an acceptance pass. The temporary Compose project was removed with its own scoped `down --volumes`; existing E2E data, production databases, production TLS policy, P1 and Formal state were not changed.

**T10-SEC-001 remains OPEN; P1 and Formal holds remain OPEN.** Before another run, the Integration Owner must diagnose the Windows keyring process/profile behavior with a minimal vault-level reproduction or provide an approved native vault isolation mechanism. Do not replace this with HTTP/Playwright evidence.

## Integration Owner Windows keyring investigation — 2026-10-17

| Check | Result | Evidence |
| --- | --- | --- |
| Test-profile keyring target/service A/B round trip | PASS | `honsen-procure-test-profile.exe vault-probe` writes, reads, distinguishes and deletes two synthetic 43-character base64url-shaped tokens using the same `S-<profile SHA>` services and fixed account UUID. |
| Real `HonsenProcure.exe` A login token readback | FAIL | Run `native-smoke-20261017094219` fails immediately after A login, before B opens: local session, in-memory online account and `last_authenticated_user_id` are all A, while `load_sync_token(A)` returns `None`. |
| B overwrite / test cleanup / server revocation | NOT CAUSAL | The failure occurs before B login, `clear_test_profile` invocation, protected request, or server-session validation. |
| Explicit profile-first keyring target experiment | FAIL / reverted | A test-only `Entry::new_with_target` target with profile hash first reproduced the same native A failure. It was not retained as a product or harness semantic change. |

The minimum root-cause evidence is therefore: `cache_sync_access_token(A, accessToken)` returned success and updated SQLite `last_authenticated_user_id=A`; an immediate vault read by the same live `HonsenProcure.exe` returned `NoEntry`. The same process's profile, account, token shape and default keyring naming were independently successful in the test-profile executable. There is no application call site that deletes a sync credential between those two operations. The remaining differentiation is executable/process-specific Windows Credential Manager behavior, not a service/account/target collision and not an expected server revocation.

Reproducible commands:

```text
cargo build --bin HonsenProcure --bin honsen-procure-test-profile
honsen-procure-test-profile.exe vault-probe
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Relevant artifacts:

- `.honsen-native-qa/native-smoke-20261017094219.test.json`
- `test-results/native-smoke-20261017094219-{client,server,server-error,compose,compose-error}.log`

Fresh local validation: `cargo fmt --check` PASS; `cargo test --lib` PASS (55/55); both native binaries build PASS. The script is FAIL as above, so A/B switch, old-token rejection, logout clearing, and sync matrix are not re-accepted in this batch. No production TLS, credential policy, database, existing E2E data, server suite, P1 or Formal state changed.

**T10-SEC-001, P1 and Formal remain OPEN.** Fixer must independently reproduce this process-specific vault failure before accepting a platform-appropriate repair; no HTTP/Playwright/Mock substitution is acceptable.

## Independent Fixer Windows Credential Manager readback diagnosis — 2026-10-17

| Check | Result | Evidence |
| --- | --- | --- |
| Real `HonsenProcure.exe`: same Entry write/read | PASS | Test-profile-only `vault-readback` wrote and read a controlled synthetic token through one `keyring::Entry`. |
| Real `HonsenProcure.exe`: recreated Entry read | FAIL | The identical target immediately returned `NoEntry` after recreating `Entry`; final result is `.honsen-native-qa/native-vault-readback-final-20261017151305.test.json`. |
| Production wrapper write/read | FAIL | `cache_sync_access_token` returned success, then `load_sync_token` (which creates a fresh Entry) returned absent in the same EXE/process. |
| Console probe with recreated Entries | FAIL | `test-results/native-vault-probe-final-20261017151306-client.log` records `No matching entry found in secure storage`; the earlier probe had only proved same-object reads. |
| Credential Manager metadata | FAIL | Read-only `cmdkey /list:<controlled-target>` found no stored credential after the controlled failed run. No existing credential was queried or deleted. |

The corrected minimum root cause is not an A/B collision, application deletion, session revocation, TLS, or a Tauri-specific target difference. In this Windows user/session, `keyring` 3.6.3 reports successful `CredWriteW` for a controlled Generic credential, but a fresh `CredReadW` for the same exact `account.service` target returns `NoEntry`. `keyring` maps that result from Win32 `ERROR_NOT_FOUND` (1168). The test uses only a fixed synthetic account, a synthetic token whose SHA-256 prefix (not its value) is emitted, a new absolute `.test.sqlite` profile, and a hashed process-context marker.

No application workaround was accepted: retaining the original `Entry` would merely hide the fault inside one process and would fail the required restart/persistence boundary. The diagnostic entry is accepted only in debug/test-profile mode and deletes its own controlled credential on every completed probe path. Production credential service names, TLS, authentication, SQLite token policy and server code are unchanged.

Reproducible commands:

```text
cargo build --bin HonsenProcure --bin honsen-procure-test-profile
# Set HONSEN_PROCURE_PROFILE=test, an absolute new *.test.sqlite path,
# HONSEN_PROCURE_NATIVE_SMOKE=vault-readback and an absolute *.test.json result path.
HonsenProcure.exe
honsen-procure-test-profile.exe vault-probe
```

Fresh checks: `cargo fmt --check` PASS; `cargo test --lib` PASS (55/55); both native binaries build PASS. The required immediate real-EXE readback is **FAIL/BLOCKED**, so this batch provides no new A/B security acceptance evidence and no minimal application fix is safe without repairing the Windows Credential Manager/keyring environment.

**T10-SEC-001, P1 and Formal remain OPEN.**

## NATIVE-002 native A/B conflict projection diagnosis — 2026-10-17

`native-smoke-20261017152627` failed because the harness queried B's local conflict table immediately after the stale Push. This was a **harness timing defect**, not a cross-account data leak. The shared production client intentionally records a Push acknowledgement only when `status=accepted`; a `conflict` acknowledgement contains no server payload. The next production `pull_sync_https` receives the authoritative remote entity and `apply_sync_pull_page_for_account` atomically inserts the local conflict only when the matching pending outbox event belongs to the active account.

The repair adds that required real Rust Pull before the conflict assertion and tightens the checks: stale B Push must remain pending, Pull must advance the cursor and apply exactly one remote change, B must have exactly one local conflict for the shared order, and A must still have zero local conflicts. The test-only Fastify host now records only non-secret Push metadata (event UUID, status/version, trusted actor/origin installation, and the small response body) in an ignored `.test.jsonl` file. No production SyncService, Postgres filtering, authentication, TLS, keyring naming or SQLite schema changed.

| Check | Result | Evidence |
| --- | --- | --- |
| A/B profiles and installations | PASS | Result records A installation `87a280de-8a3b-454c-9007-b43d805d0c29` and B installation `e39814fc-ffa2-4926-bbd5-fca28da03aef`; profiles are distinct absolute `.test.sqlite` files. |
| Forged client `deviceId` | PASS | A's locally forged ID `a50ab94f-4e56-4e9a-948a-94d9ac991124` differs from the server's trusted A origin installation above. |
| A Push post-commit retry | PASS | Diagnostic records one injected 503 after accepted commit and the same A event replayed as accepted at version 1. |
| A/B Pull isolation | PASS | B's pre-purchaser Pull remains cursor `0` with zero A changes; after B switches to purchaser, its authorized Pull receives A's one remote entity and cursor advances `0→1`. |
| B stale Push and conflict ownership | PASS | Raw B response is `status=conflict`, version 1, with actor/origin account `10000000-0000-4000-8000-000000000013` and B installation. The resulting B SQLite state contains one conflict for entity `7ded78e2-f21f-47ae-9c38-b8a6fbd1042d`, server version 1; A has zero conflicts. |

Reproducible command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Fresh real-native run: `native-smoke-20261017153555` (exit 0).

- Result and local SQLite metadata: `.honsen-native-qa/native-smoke-20261017153555.test.json`
- Sanitized raw server Push evidence: `.honsen-native-qa/native-smoke-20261017153555-server-sync.test.jsonl`
- Client/server/Compose evidence: `test-results/native-smoke-20261017153555-{client,server,server-error,compose,compose-error}.log`

Focused checks: `cargo fmt --check` PASS; `cargo test --lib` PASS (55/55); `cargo check --bin HonsenProcure --bin honsen-procure-test-profile` PASS; server `npm run lint` and `npm run typecheck` PASS. The disposable Compose database was removed with scoped `down --volumes`; existing E2E data was not removed and no production database was opened.

**NATIVE-002 is fixed as a harness defect. T10-SEC-001, P1 and Formal remain OPEN.** This is only the first native synchronization slice; offline/reconnect/cursor-retry and RFQ/Formal native acceptance have not run.

## Independent Fixer recheck: NATIVE-002 — 2026-10-17

Baseline reviewed: `87ab8e5bf18511cfa84ce97ef925502a7210e75f` is the actual HEAD and descends from the keyring repair `28441d1`. No tracked source or harness change was present for this recheck; the only working-tree entry is the preserved ignored `.honsen-native-qa/` evidence directory.

The Fixer independently executed the same real native command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Fresh run `native-smoke-20261017153900` exited 0 after building/running real debug `HonsenProcure.exe`, two newly seeded absolute SQLite test profiles, Windows Credential Manager, ephemeral test-profile TLS trust, Fastify HTTPS and disposable PostgreSQL. It is not a Playwright, Mock or standalone HTTP-client result.

| Item | Result | Independent evidence |
| --- | --- | --- |
| Baseline / profile / installation separation | PASS | A installation `d1e9ba9f-5762-4072-be1d-fb940ecff600` and B installation `93872dc5-b614-4596-9603-177d0359bc6d` differ in the fresh result. |
| Trusted source despite forged client device ID | PASS | Forged A client ID differs from the Fastify-recorded trusted A installation in the sanitized Push record. |
| Post-commit fault and replay | PASS | One injected 503 carries an accepted server commit; retry of the exact event returns accepted version 1. |
| B Push/Pull visibility isolation | PASS | B begins with no A project data; the authorized purchaser phase Pull advances only after B's own stale event is pending. |
| Conflict projection account boundary | PASS | Raw B result is `conflict@1`, with B purchaser account/installation as origin. The test requires `accepted_count=0`, `pending_count=1`, Pull `applied_count=1`, nonzero cursor, B local conflict count 1/entity match, and A conflict count 0. |
| Server/client errors | PASS | Client and server-error logs are zero bytes; Compose report contains normal create/healthy lifecycle output only. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017153900.test.json`
- `.honsen-native-qa/native-smoke-20261017153900-server-sync.test.jsonl`
- `test-results/native-smoke-20261017153900-{client,server,server-error,compose,compose-error}.log`

### Next minimal native scenario

**BLOCKED as-is, but ready for a bounded harness extension:** existing native modes are `online-login`, `ab-login-switch`, `ab-sync-security` and `vault-readback`; none injects a Pull transport fault, controls an EXE restart, or asserts durable per-account cursor recovery. Existing Rust unit tests cover Pull failure/replay/cursor behavior, but are not native acceptance evidence. The next smallest valid test-profile slice is one native A/B reconnect mode plus one Fastify test-only first-Pull fault: make real `pull_sync_https` return `SyncTransport`, assert the SQLite account cursor is unchanged, restart the real EXE against the same profile, retry Pull and require one durable projection/cursor advance with no duplicate. This preserves HTTPS, SQLite, OS credential vault and production Rust sync paths. RFQ/Formal is explicitly outside that next slice.

**T10-SEC-001, P1 and Formal remain OPEN.**

## Native Pull transport interruption / restart recovery — 2026-10-17

The native harness now has a deliberately narrow `pull-recovery` mode.  In the isolated Fastify HTTPS test host only, `HONSEN_PROCURE_TEST_FAIL_FIRST_PULL_RESPONSE=1` changes the first real `GET /api/sync/pull` response to HTTP 503 after the normal route has run.  The actual debug `HonsenProcure.exe` still calls production `LocalAuthService::pull_sync_https`; neither the harness nor the host writes the profile SQLite database or simulates a Rust response.  The mode is compiled only with `debug_assertions`, requires the existing absolute test-profile database guard, and the release binary returns unavailable.

Fresh run command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-recovery
```

Fresh real-native run `native-smoke-20261017154749` exited 0 using an ephemeral loopback PostgreSQL database, Fastify HTTPS with per-run test-profile certificate trust, Windows Credential Manager and the same absolute A SQLite profile for both EXE processes.

| Pull phase | Result | Evidence |
| --- | --- | --- |
| First real Pull after accepted Push | PASS | Server JSONL records `GET /api/sync/pull`, requested cursor `0`, injected HTTP `503`; the first EXE result requires `SyncTransport`, zero projections and durable cursor `0→0`. |
| Exit then restart same EXE/profile | PASS | The second real `HonsenProcure.exe` opens the same profile and credentials, executes production Pull at cursor `0`, projects exactly one entity and persists cursor `0→1`. |
| Repeated real Pull | PASS | Server sees cursor `1`; the result requires zero new projections, cursor remains `1`, and the already-projected entity remains server version `1`. |
| Existing A/B native safety regression | PASS | `native-smoke-20261017154824` retains different installations, trusted-origin protection for forged device ID, post-commit 503 idempotent replay, Push/Pull account isolation and B-only conflict projection. |

Artifacts (ignored, non-secret test evidence):

- `.honsen-native-qa/native-smoke-20261017154749-pull-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261017154749-pull-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017154749-server-sync.test.jsonl`
- `test-results/native-smoke-20261017154749-{client,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261017154824.test.json` and `.honsen-native-qa/native-smoke-20261017154824-server-sync.test.jsonl`

Focused checks: `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --bin HonsenProcure`, `cargo check --release --bin HonsenProcure`, and server `npm run lint` / `npm run typecheck` all PASS. The scoped disposable Compose projects were removed with their volumes; no production database or pre-existing E2E data was opened or deleted.

**This adds the required native Pull-fault/restart cursor evidence but is not independent Fixer acceptance. T10-SEC-001, P1 and Formal remain OPEN; RFQ/Formal native and broader offline/reconnect cases remain outstanding.**

## Independent Fixer recheck: Native Pull recovery — 2026-10-17

Baseline rechecked: actual HEAD is `bc80b09e303d09e338a629736dbbc783cbc940f0`, and `git merge-base --is-ancestor bc80b09 HEAD` returned 0. The only untracked path before and after execution is the deliberately ignored `.honsen-native-qa/` evidence directory; no application code changed in this recheck.

The Fixer independently ran the two required native commands against fresh disposable PostgreSQL/Fastify HTTPS instances. Both commands build and execute the real debug `HonsenProcure.exe`, use newly seeded absolute SQLite test profiles and Windows Credential Manager, and use an ephemeral test-profile CA. They are not HTTP-client, Mock, Playwright, or renderer tests.

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-recovery
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode ab-sync-security
```

| Item | Result | Independent evidence |
| --- | --- | --- |
| Test-only fault boundary | PASS | `native-test-server.ts` returns one 503 only when `HONSEN_PROCURE_TEST_FAIL_FIRST_PULL_RESPONSE=1`; it does not write profile SQLite. Release `cargo check --release --bin HonsenProcure` passes with the debug-only smoke entry unavailable. |
| First real Pull and cursor preservation | PASS | `native-smoke-20261017155533` records `pullFailure=PASS`, zero projected changes and cursor `0→0`; sanitized HTTPS JSONL records `GET /api/sync/pull`, cursor `0`, status `503`, `injectedTransportFault=true`. |
| Actual EXE exit / restart, not in-process reuse | PASS | The script synchronously invokes `HonsenProcure.exe` once, fails on any nonzero exit, then invokes it a second time only after the first result file is read. The second result uses the same profile/account/installation, starts at cursor `0`, projects exactly one remote entity and persists `0→1`. |
| Real replay without duplicate/rollback | PASS | The third production Pull is recorded at cursor `1`; the recovered result requires zero new projections and cursor `1→1` while the entity remains server version 1. |
| Existing A/B safety assertions | PASS | Fresh `native-smoke-20261017155623` records different A/B installations, forged A device ID different from trusted A origin, same-event post-commit 503 replay, B trusted conflict origin, exactly one B SQLite conflict and zero A conflicts. |
| Focused release/server guards | PASS | `cargo fmt --check`, release `cargo check --bin HonsenProcure`, server lint and server typecheck all pass. The release check has only pre-existing debug-test unused-symbol warnings. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017155533-pull-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261017155533-pull-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017155533-server-sync.test.jsonl`
- `test-results/native-smoke-20261017155533-{client,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261017155623.test.json`
- `.honsen-native-qa/native-smoke-20261017155623-server-sync.test.jsonl`
- `test-results/native-smoke-20261017155623-{client,server,server-error,compose,compose-error}.log`

The per-run test containers and loopback listeners were absent after completion. No production database, pre-existing E2E profile, production TLS/keyring policy, push, merge or deployment was used.

**NATIVE-003 is independently verified for this bounded Pull-fault/restart scenario. T10-SEC-001, P1 and Formal remain OPEN: this is not complete T10 acceptance, and RFQ/Formal plus remaining offline/reconnect variants are still unexecuted.**

## Native offline edit / Push recovery — 2026-10-17

The native harness now has one additional debug/test-profile-only `offline-push-recovery` mode. It deliberately executes three separate real `HonsenProcure.exe` process phases: an online A baseline Pull, an EXE that waits until the script has stopped the isolated loopback Fastify HTTPS process before creating a requisition draft and attempting production Push, and a new EXE after that HTTPS host restarts. The test code calls the same `save_requisition_draft`, `push_pending_https` and `pull_sync_https` Rust production functions; its only new desktop accessors are debug-only read-only checks for outbox acknowledgement and local order status. No test directly writes SQLite, sends an independent HTTP request, or mocks a sync response.

The fresh full run used a new disposable PostgreSQL/Fastify HTTPS instance and `native-smoke-20261017161207` profile. The runner verified that port 3443 was no longer listening before releasing the offline EXE. The same A profile and installation then crossed the restart boundary.

| Step | Result | Evidence |
| --- | --- | --- |
| Online A baseline | PASS | Real HTTPS Pull applied 0 at cursor `0`; baseline account/installation are recorded in the offline result. |
| Offline business mutation | PASS | Real Rust draft save leaves local purchase order status `draft` and exactly one pending `purchase_order` outbox event. |
| Disconnected Push | PASS | With the loopback HTTPS host stopped, production Push returns `SyncTransport`; event remains unacknowledged/pending `1`, cursor stays `0`. |
| Exit/restart retention | PASS | A new real EXE on the same profile retains the exact event, local draft and pending count. |
| Reconnected Push/replay | PASS | Real Push accepts one event then reports pending `0`; a second Push sends no event. Sanitized server JSONL contains exactly one accepted POST for the event, trusted A account and original installation. |
| Authoritative Pull | PASS | Real Pull projects one change, local status remains `draft`, remote version is 1 and cursor advances `0→1`. |
| Existing A/B regression | PASS | Fresh `native-smoke-20261017161438` retains independent installations, forged-device trusted origin, post-commit replay, account isolation and B-only conflict checks. |

Reproducible command (the current interactive PowerShell command remains supported):

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode offline-push-recovery
```

Evidence:

- `.honsen-native-qa/native-smoke-20261017161207-offline-push.test.json`
- `.honsen-native-qa/native-smoke-20261017161207-offline-push-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017161207-server-sync.test.jsonl`
- `test-results/native-smoke-20261017161207-{client,client-error,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261017161438.test.json`

Focused quality checks: Rust `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server lint and server typecheck PASS. Existing debug-only unused-symbol warnings remain in the release check. The two early harness-only attempts are not acceptance evidence: a WSL Compose health race and then a quoted server restart argument were diagnosed; after the minimal harness correction, the fresh run above passed. All temporary Compose projects were removed with their scoped volumes; no production database, existing E2E data, production TLS/keyring policy, push, merge or deployment was touched.

**NATIVE-004 is ready for independent Fixer recheck. T10-SEC-001, P1 and Formal remain OPEN; this is only the offline-edit/Push-recovery slice, not complete native T10 acceptance.**

## Independent Fixer recheck: NATIVE-004 — 2026-10-17

Reviewed baseline: actual `HEAD` was `b16f3061ce28d43b2b82ff8cbdd4f6d59c1ae91e`; `git merge-base --is-ancestor b16f306 HEAD` returned 0.  Before the rerun, the only worktree entry was the preserved ignored `.honsen-native-qa/` evidence directory.  The Fixer made no business-code change.

The Fixer independently executed the real native scenario using a fresh disposable PostgreSQL/Fastify HTTPS instance, a newly generated test-profile certificate, a new absolute SQLite profile and Windows Credential Manager:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode offline-push-recovery
```

Fresh run `native-smoke-20261017161819` completed successfully.  It builds and starts the debug `HonsenProcure.exe` twice; it is neither a standalone HTTP client nor a Mock/Playwright result.  The actual loopback HTTPS process is stopped before the first EXE creates its draft, then a second EXE opens the same profile only after the HTTPS service is restarted.

| Boundary | Result | Fresh evidence |
| --- | --- | --- |
| Profile/session continuity | PASS | Offline and recovered results have the same A account, installation, profile path, entity and event UUIDs. |
| Offline SQLite mutation and failed Push | PASS | The first real EXE records local `draft`, outbox pending `1→1`, cursor `0→0`, and Rust `SyncTransport` after the script confirmed port 3443 was unavailable. The debug-only read-only rusqlite assertions check the actual local order/outbox; no direct SQLite write exists in the harness. |
| Process exit/restart retention | PASS | The recovery phase is a new EXE process and requires the same pending event/local draft before any Push. |
| Recovered Push and idempotency | PASS | The recovery EXE acknowledges the retained event (`1→0`); its second production Push sends no event. Sanitized server JSONL contains exactly one HTTP 200 Push for that event. |
| Trusted server event / authority convergence | PASS | The sole server event records A's matching account and installation, `accepted` version 1; real Pull projects one change, keeps local `draft`, and persists cursor `0→1`. |
| Test-only and release boundary | PASS | `HONSEN_PROCURE_TEST_FAIL_FIRST_{PUSH,PULL}_RESPONSE` is read only by `apps/server/src/scripts/native-test-server.ts`; this mode sets both to `0` and obtains its offline failure by stopping the isolated host. The native test entry and state accessors are `debug_assertions`-only; release `cargo check --release --bin HonsenProcure` passes. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017161819-offline-push.test.json`
- `.honsen-native-qa/native-smoke-20261017161819-offline-push-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017161819-server-sync.test.jsonl`
- `test-results/native-offline-push-fixer-20261017161818.{log,error.log}`

Independent focused verification: `cargo test --lib` PASS (55/55), `cargo check --release --bin HonsenProcure` PASS, `git diff --check` PASS. The release check has existing debug-test unused-symbol warnings. No listener or native Compose project remained after the run. The host lacks a standalone SQLite CLI, so SQLite file state was validated through the real EXE's debug-only read-only rusqlite checks plus the phase result files, not claimed as an external CLI inspection.

**NATIVE-004 is independently CLOSED for this bounded offline draft/Push recovery scenario. T10-SEC-001, P1 and Formal remain OPEN: this does not cover all reconnect failure forms or RFQ/Formal native workflows, and is not complete T10 acceptance.**

## Native Push partial-success batch — 2026-10-17

### T10 reliability matrix

| Failure boundary | Native evidence | Status |
| --- | --- | --- |
| Request cannot reach service before Push | NATIVE-004: actual loopback HTTPS host stopped; retained draft/outbox then restart recovery. | COVERED |
| Service commits but Push response is lost | NATIVE-002: test-host post-commit 503 and same-event replay. | COVERED |
| One Push batch has accepted and conflict results | NATIVE-005 independently closed. | COVERED |
| First Pull transport failure / restart | NATIVE-003: 503, cursor unchanged, process restart, one projection. | COVERED |
| Pull after a full 500-change page then transport failure | NATIVE-006 independently closed. | COVERED |
| Local cursor persistence write fails | Atomic SQLite unit coverage exists; no sanctioned real-disk fault injection in the native harness. | NOT COVERED |
| EXE terminates during an in-flight request | Not covered; existing tests terminate only after a completed failed/successful operation boundary. | NOT COVERED |
| Duplicate-event idempotency | NATIVE-002/NATIVE-004 cover accepted replay; NATIVE-005 covers retained conflict replay. | COVERED for these bounded forms |

The selected smallest high-risk gap is partial Push acknowledgement: the protocol permits a batch to contain safe accepted and retained conflict results, and the client must never acknowledge every local event merely because the HTTP request returned 200.

The first RED run added only the `push-partial-batch` test-script mode and invoked the real EXE. Fresh `native-smoke-20261017162327` failed at the pre-existing production test-mode whitelist with `unknown native smoke mode`; no business action ran. This proves the new scenario was not inherited from a prior native PASS. The subsequent narrow implementation is debug/test-profile-only: it opens the existing second profile, uses production `save_requisition_draft`, `push_pending_https` and `pull_sync_https`, and adds test-server diagnostics for all event IDs in an already-real Fastify Push request. Production sync code, TLS, session/installation checks, SQLite transaction behavior and server result semantics are unchanged.

Fresh real-native GREEN command:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode push-partial-batch
```

Fresh run `native-smoke-20261017162543` builds/runs real debug `HonsenProcure.exe`, isolated PostgreSQL, Fastify HTTPS, two newly seeded absolute SQLite profiles and Windows Credential Manager. A first A event establishes server version 1. Purchaser B then creates a valid new draft followed by a stale copy of A's entity, and sends both with one real production Push request.

| Assertion | Result | Fresh evidence |
| --- | --- | --- |
| Partial server result is genuine | PASS | The one B Push request has two event IDs; Fastify's actual SyncService response is `accepted@1` for B's new order and `conflict@1` for B's stale event. |
| Client acknowledgement is selective | PASS | Real Rust result is accepted `1`, pending `1`; debug-only read-only checks require the accepted outbox record acknowledged and the conflict record unacknowledged. |
| Pull preserves conflict evidence | PASS | B's real Pull applies two remote changes, cursor `0→2`, projects the accepted order at version 1 and creates exactly one local conflict for the stale event. |
| Retained conflict replay | PASS | A repeated production Push sends only the stale event and returns accepted `0`, pending `1`; it is not silently discarded. |
| Test/release boundary and cleanup | PASS | No fault-response variable is enabled; the test uses service validation, not a response Mock. `cargo check --release --bin HonsenProcure` passes and release smoke entry returns unavailable. The disposable Compose project and loopback listeners were absent after completion. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017162327.test.json` and `test-results/native-push-partial-red-20261017162327-{log,error.log}` (expected RED)
- `.honsen-native-qa/native-smoke-20261017162543-push-partial-batch.test.json`
- `.honsen-native-qa/native-smoke-20261017162543-server-sync.test.jsonl`
- `test-results/native-push-partial-green-20261017162542.{log,error.log}`
- `test-results/native-smoke-20261017162543-{client,server,server-error,compose,compose-error}.log`

Focused checks: Rust `cargo fmt --check`, `cargo test --lib` (55/55), debug and release `cargo check --bin HonsenProcure`, server lint/typecheck and `git diff --check` PASS. Existing debug-only release warnings remain. No production database, existing E2E data, production TLS/keyring policy, push, merge or deployment was touched.

**NATIVE-005 is READY_FOR_RECHECK. T10-SEC-001, P1 and Formal remain OPEN; full-page Pull interruption, durable-cursor write failure, in-flight termination and RFQ/Formal native flows remain outside this one slice.**

## Independent Fixer recheck: NATIVE-005 — 2026-10-17

Baseline checked: actual `HEAD` was `ae1bfc9c336ad91e068bf4e15895314eeeb5a901`; `git merge-base --is-ancestor ae1bfc9 HEAD` returned 0. The only pre-existing worktree path was the preserved ignored `.honsen-native-qa/` evidence directory. Code review confirms `eventIds` is appended only to the test-only Fastify `.test.jsonl` diagnostic; it does not enter SyncService, authentication, acknowledgement or persistence decisions. The original RED evidence is a missing debug smoke-mode registration (`unknown native smoke mode`), not a business failure.

The Fixer independently used a new disposable PostgreSQL/Fastify HTTPS instance, a newly generated test-profile certificate, new A/B absolute SQLite profiles, Windows Credential Manager and real debug `HonsenProcure.exe`:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode push-partial-batch
```

Fresh run `native-smoke-20261017162947` completed without using the Builder's prior result. The native result contains distinct profiles and B installation `5b3239a9-c8cd-44e2-bc2f-5b7c651f1fff`; server/client error logs are zero bytes and no loopback listener or Compose project remained after cleanup.

| Boundary | Result | Independent evidence |
| --- | --- | --- |
| A establishes authoritative remote record | PASS | First A Push event `08ed1564-8f42-47f3-a71f-e6ae29770a74` is accepted at server version 1. |
| One real B batch contains two different events | PASS | The single B POST contains `00699ad8-4fc2-46c5-ae04-637cb4a99a92` and `8500243f-ed29-415b-b551-22a434a59778`. |
| Actual mixed server response | PASS | Fastify JSONL records HTTP 200 with the first event `accepted@1` and the second `conflict@1`; no fault-response variable was enabled. |
| Selective outbox acknowledgement | PASS | Real Rust result is accepted `1`, pending `1`; debug-only read-only rusqlite checks require accepted acknowledged and conflict unacknowledged. |
| Authoritative Pull and cursor | PASS | Real Pull applies 2 changes and persists B cursor `0→2`; it retains exactly one local conflict. |
| Conflict-only replay | PASS | The final POST has only `8500243f-ed29-415b-b551-22a434a59778`, returns conflict, and reports accepted `0`, pending `1`; the accepted event is not resent. |
| Release/test boundary | PASS | Release `cargo check --release --bin HonsenProcure` passes; test entry is unavailable outside `debug_assertions`. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017162947-push-partial-batch.test.json`
- `.honsen-native-qa/native-smoke-20261017162947-server-sync.test.jsonl`
- `test-results/native-push-partial-fixer-20261017162946.{log,error.log}`
- `test-results/native-smoke-20261017162947-{client,server,server-error,compose,compose-error}.log`

Fresh focused checks: `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server lint/typecheck and `git diff --check` PASS. Existing debug-test unused-symbol warnings remain in the release check. No Mock, Playwright, standalone HTTP client, production database, existing E2E data, production TLS/keyring policy, push, merge or deployment was used.

**NATIVE-005 is independently CLOSED for the bounded partial-Push scenario. T10-SEC-001, P1 and Formal remain OPEN: full-page Pull interruption, cursor-write fault, in-flight process termination and RFQ/Formal native workflows remain unverified.**

## Native second-page Pull interruption / restart — 2026-10-18

NATIVE-006 adds only a debug/test-profile entry, read-only SQLite state accessors, and a test-only Fastify `onSend` fault boundary. It does not alter `pull_sync_https`, SQLite projection, cursor handling, authentication, TLS, credential-vault naming, or production server behavior. The new mode invokes the existing production Rust `save_requisition_draft`, `push_pending_https`, and `pull_sync_https` functions through real `HonsenProcure.exe` processes. No test writes SQLite directly or substitutes an HTTP client.

The RED run `native-smoke-20261018010204` added only the test-script mode and failed at the existing native-mode whitelist (`unknown native smoke mode`) before any business action. The earlier `native-smoke-20261018010115` did not reach a native process because the disposable WSL PostgreSQL loopback startup timed out; it is environment evidence only, not acceptance evidence.

Fresh run:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-page-recovery
```

`native-smoke-20261018010425` used a new disposable PostgreSQL/Fastify HTTPS host, generated test certificate, two absolute test SQLite profiles, and Windows Credential Manager. A real B EXE created 501 purchase-order drafts and production Push accepted all 501 with no retained outbox row. A separate real A EXE used production Pull: the first HTTP page at cursor `0` returned 500 changes/next cursor `500` and committed 500 local remote entities. The test host then returned its single 503 only for A's real second request at cursor `500`; the production Pull returned `SyncTransport`, while the already committed boundary remained cursor `500`, projection count 500, and A outbox 0. That EXE exited. A new A EXE using exactly the same profile/installation recovered over HTTPS, projected the final one change and persisted cursor `500→501`; a final Pull returned 0 changes and left both cursor and local entity count at 501.

| Boundary | Result | Evidence |
| --- | --- | --- |
| B production creation/Push of 501 events | PASS | B account `...0013`, distinct installation/profile; accepted `501`, pending outbox `0`. |
| A page 1 production Pull | PASS | HTTPS GET `cursor=0`: 200, 500 changes, next cursor `500`; local cursor/projection `0→500`. |
| A page 2 deterministic transport fault | PASS | HTTPS GET `cursor=500`: one test-host 503; Rust `SyncTransport`; local cursor/projection remain `500`/500. |
| Same-profile A EXE restart/recovery | PASS | HTTPS GET `cursor=500`: 200, one change, next cursor `501`; local cursor `500→501`, 501 entities. |
| Replay | PASS | HTTPS GET `cursor=501`: 200, zero changes, cursor/entity count remain 501. |
| Outbox and partial commit safety | PASS | A outbox is 0 before/after interruption/recovery; page 1 is the established production transaction boundary, not a speculative rollback target. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261018010425-pull-page-producer.test.json`
- `.honsen-native-qa/native-smoke-20261018010425-pull-page-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261018010425-pull-page-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261018010425-server-sync.test.jsonl`
- `test-results/native-pull-page-green-20261018011200.{log,error.log}`
- `test-results/native-smoke-20261018010425-{client,server,server-error,compose,compose-error}.log`

Focused checks: Rust `cargo fmt --check` and `cargo test --lib` (55/55), server lint/typecheck and `git diff --check` PASS. The release guard is run with the final implementation before checkpoint. No production database, pre-existing E2E data, production TLS/keyring policy, push, merge or deployment was touched; scoped Compose resources and loopback listeners were absent after the run.

**NATIVE-006 is READY_FOR_RECHECK. T10-SEC-001, P1 and Formal remain OPEN. This slice does not cover durable-cursor write faults, abrupt EXE termination in-flight, or RFQ/Formal native workflows.**

## Independent Fixer recheck: NATIVE-006 — 2026-10-18

Baseline checked: actual `HEAD` was `1a5d71960507c5adc48b4bddd1bf84e016b07b77`; `git merge-base --is-ancestor 1a5d719 HEAD` returned 0. The only pre-existing worktree artifact was the ignored native-evidence directory. The Fixer made no application-code change.

Fresh independent execution:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-page-recovery
```

Fresh run `native-smoke-20261018112034` started the real debug `HonsenProcure.exe` three times with a new disposable PostgreSQL/Fastify HTTPS endpoint, generated test certificate, new A/B absolute SQLite profiles, and Windows Credential Manager. It is not a standalone HTTP, Mock, Playwright, or prior-result replay.

| Check | Result | Fresh evidence |
| --- | --- | --- |
| B production Push | PASS | B account `...0013` accepted 501 real outbox events, pending 0; JSONL has six accepted Push batches totaling 501 events. |
| A page 1 | PASS | HTTPS GET `cursor=0` returned 200 / 500 changes / next `500`; A durable cursor and projections are both 500. |
| A page 2 fault | PASS | Actual HTTPS GET `cursor=500` received the only injected 503; Rust returned `SyncTransport`, while A remains cursor 500, 500 projected, outbox 0. |
| A restart recovery | PASS | New A EXE retains the same profile and installation, then GET `cursor=500` projects 1 / advances to 501. |
| Replay | PASS | GET `cursor=501` returns zero changes; cursor and entity count both remain 501. |
| Production safety guards | PASS | Fault env is consumed only by `native-test-server.ts`; test entry/accessors are `debug_assertions`; release build uses the fail-closed smoke implementation. Cursor/account/projection assertions remain strict. |

Fresh quality checks: Rust `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server lint/typecheck and `git diff --check` PASS. Release check reports only the existing debug-test unused-symbol warnings. The scoped Compose project was removed; ports 3443/54329 had no listener afterward.

Artifacts:

- `.honsen-native-qa/native-smoke-20261018112034-pull-page-producer.test.json`
- `.honsen-native-qa/native-smoke-20261018112034-pull-page-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261018112034-pull-page-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261018112034-server-sync.test.jsonl`
- `test-results/native-pull-page-fixer-20261018012000.{log,error.log}`
- `test-results/native-smoke-20261018112034-{client,server,server-error,compose,compose-error}.log`

**NATIVE-006 is independently CLOSED for this bounded paged-Pull interruption/restart scenario. T10-SEC-001, P1 and Formal remain OPEN: this does not cover cursor-write faults, in-flight EXE termination, or RFQ/Formal native workflows.**

## Native Cursor-write failure / transaction recovery — 2026-10-18

NATIVE-007 audits `LocalAuthService::apply_sync_pull_page_for_account`: remote entity/conflict projection, staged business projection, the account-scoped cursor upsert, and `transaction.commit()` all occur in one SQLite transaction. The test-only debug hook is placed immediately before that production cursor upsert and performs one intentionally invalid cursor-state insert (`last_pull_cursor = NULL`), so SQLite rejects the write and drops the uncommitted transaction. It is compiled only under `debug_assertions`; the release smoke function is fail-closed.

Fresh native execution:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode cursor-write-recovery
```

Run `native-smoke-20261018112716` used a new disposable PostgreSQL/Fastify HTTPS endpoint, generated test certificate, Windows Credential Manager, and distinct A/B absolute test SQLite profiles. A real B `HonsenProcure.exe` created the source requisition and production Push accepted exactly one event. A first real A EXE received the actual HTTPS Pull page `cursor=0`, then the cursor-boundary injection fired; Rust returned `AuthError::Database`, while read-only native checks report cursor `0→0`, remote projection `0→0`, and pending outbox `0`. That EXE exited. A second real A EXE with the same profile and installation performed production Pull, projected one event and persisted cursor `0→1`; its replay Pull projected zero and left cursor/entity count at `1`.

| Boundary | Result | Evidence |
| --- | --- | --- |
| B production source event | PASS | One accepted production Push; B account/profile/installation differ from A. |
| A cursor-write failure | PASS | Real HTTPS `GET cursor=0` completed; debug hook confirms it triggered; Rust result is `Database`. |
| Atomicity | PASS | Before/after failure: A cursor 0, projected entities 0, pending outbox 0. Cursor cannot be ahead of durable projection. |
| Same-profile EXE restart | PASS | New A EXE pulls one event/cursor `0→1`; no SQL file mutation or test HTTP client is used. |
| Replay stability | PASS | HTTPS `GET cursor=1` returns zero changes; cursor and entity count stay 1. |
| Release/test boundary | PASS | `cargo check --release` compiles no injection state and resolves the native test entry to fail-closed. |
| Existing A/B security regression | PASS | Fresh `native-smoke-20261018112931` retains separate installations, trusted forged-device origin, account/conflict isolation and Push replay idempotency. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261018112716-cursor-write-{producer,fault,recovered}.test.json`
- `.honsen-native-qa/native-smoke-20261018112716-server-sync.test.jsonl`
- `test-results/native-smoke-20261018112716-{client,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261018112931.test.json`
- `test-results/native-smoke-20261018112931-{client,server,server-error,compose,compose-error}.log`

Focused checks: `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release`, server lint/typecheck, both native commands, and `git diff --check` PASS. Release check has only pre-existing debug-test unused-symbol warnings. No production database, existing E2E data, production TLS/keyring/authentication setting, push, merge or deployment was touched.

**NATIVE-007 is READY_FOR_RECHECK. T10-SEC-001, P1 and Formal remain OPEN. In-flight process termination during a sync transaction and RFQ/Formal native workflows remain unverified.**

## Windows Credential Manager backend repair — 2026-10-17

Root cause: desktop declared `keyring = "3.6.3"` with only its empty default feature set. Cargo therefore compiled keyring without `windows-native`; `cargo tree -e features -i keyring` showed no `windows-sys` or `byteorder` beneath keyring. That selected keyring's in-process mock credential implementation, which explains why a single `Entry` worked while a new Entry or process returned `NoEntry`.

The minimal repair is `keyring = { version = "3.6.3", features = ["windows-native"] }`. It retains the existing `account.service` target, Generic credential type, Enterprise persistence, username, production service names and token encoding; it only enables keyring's documented Windows Credential Manager backend. No Windows policy, TLS behavior, database, or authentication rule changed.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Direct Win32 Generic, Enterprise persistence | PASS | Same-process and child-process `CredReadW` read the same SHA-256 digest after `CredWriteW`, Type=1, Persist=3, Win32 status=0. |
| Direct Win32 keyring-shaped credential | PASS | Exact UTF-16 blob, `account.service` target, UUID username and `keyring v3.6.3` comment pass same/cross-process read. |
| Direct Win32 LocalMachine control | PASS | Persist=2 same/cross-process control also passes; no policy was changed or adopted by production code. |
| Corrected keyring `vault-probe` | PASS | New Entry reads both independent profile targets after write. |
| Real `HonsenProcure.exe` immediate readback | PASS | `vault-readback` direct/reopened/wrapped write/read all pass. |
| Real EXE exit/restart readback | PASS | One EXE writes a runtime-generated synthetic token; a second EXE reads it from the same absolute test profile; a third EXE deletes only that controlled target. |
| A/B profile isolation harness | BLOCKED / new failure | The existing real HTTPS harness now passes the former credential barrier but fails later at `account B conflict query did not contain only its own stale event`. No sync assertion is accepted from that run. |

Commands and evidence:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/invoke-windows-credential-readback.ps1 -Persist Enterprise -KeyringShape
cargo test --lib
cargo build --bin HonsenProcure --bin honsen-procure-test-profile
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

- Direct Win32: `test-results/windows-credential-api-20261017152337-{enterprise,local-machine}.json` and `test-results/windows-credential-api-keyring-shape-20261017152403.json`.
- Real immediate readback: `.honsen-native-qa/native-vault-fixed-20261017152532-exe.test.json`.
- Real restart boundary: `.honsen-native-qa/native-vault-restart-20261017152623-{write,read,clear}.test.json`.
- A/B native HTTPS run: `.honsen-native-qa/native-smoke-20261017152627.test.json`, with server/client/Compose logs in `test-results/native-smoke-20261017152627-*`.

Fresh Rust library validation passed 55/55; `cargo check --release --bin HonsenProcure` also passed after placing the pre-existing A/B smoke behind the same debug-only release guard as the vault entry. The native sync harness is not recorded as PASS because its conflict assertion failed after credentials were repaired. No token plaintext was written to SQLite, logs or ordinary files; direct Win32 evidence prints only controlled target metadata and token digests.

**T10-SEC-001, P1 and Formal remain OPEN.**
