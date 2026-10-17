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
