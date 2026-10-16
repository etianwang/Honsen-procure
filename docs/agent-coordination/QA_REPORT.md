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
