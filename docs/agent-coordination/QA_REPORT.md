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

| Check | Result | Evidence |
| --- | --- | --- |
| Full server Vitest suite | PASS — 14 files, 92/92 tests | `test-results/qa-b203c70-server-full-fresh.log` |
| Builder's combination group | PASS — 6 files, 57/57 tests | `test-results/qa-b203c70-server-combination-57.log` |
| Migration chain `001`–`006` including both ordered `005` migrations | PASS — `migration-runner.test.ts` validates the migrated foundation and repeatable runner | combination group |
| Formal registry backfill and rollback | PASS — `formal-issue-migration.test.ts` proves legacy rows are retained and duplicate legacy formal numbers abort under a savepoint without leaving the registry table | combination group |
| RFQ / formal frozen-state regression | PASS — `postgres-store.test.ts`, `formal-issue.test.ts`, and `formal-issue-hardening.test.ts` | combination group |
| Cross-account and installation-origin isolation | PASS — store test rejects replay result retrieval from another authenticated account/origin; legacy unattested origin fails closed. Full suite additionally covers binding Push installation to the authenticated session rather than request `deviceId`. | full suite and combination group |

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

The application source remains byte-identical to `b203c70` (`git diff --quiet b203c70 -- apps packages` returned 0); this QA branch contains only QA records.

| Native acceptance item | Result | Actual evidence |
| --- | --- | --- |
| Isolated native test profile | PASS | `honsen-procure-test-profile seed` created only the new `.honsen-native-qa/ab-http.test.sqlite` profile and its synthetic A/B/purchaser accounts. Existing E2E profiles were not opened or cleaned. |
| Real Tauri host launch | PASS | `npm run desktop:dev --workspace @honsen/desktop` ran `HonsenProcure.exe`; Windows reported title `Honsen Procure — TEST PROFILE`, nonzero main-window handle and `Responding=True`. See `test-results/qa-b203c70-native-host.log`. |
| Real native window automation | BLOCKED | The Computer Use inventory returned `apps: []` twice although the test-profile process/window was live. No UI field, CAPTCHA, login or mocked browser substitute was used. |
| A/B online login, logout, switch and session isolation | BLOCKED | Requires a targetable native window and a trusted HTTPS server. |
| Untrusted `deviceId` origin test | BLOCKED | Native request cannot reach the isolated HTTP-only server. The previous server-only result remains separate evidence and is not counted here. |
| A/B Push, Pull, conflict query and replay containment | BLOCKED | Same trusted-HTTPS/native-window blockers. |
| Old-token revocation/switch denial | BLOCKED | Same trusted-HTTPS/native-window blockers. |
| Offline mutation, reconnect, cursor recovery and retry | BLOCKED | Native UI could not be operated; no simulated Playwright result is substituted. |
| RFQ/Formal desktop regression | BLOCKED | Normal UI flow cannot be operated; no mock/Playwright result is substituted. |

The concrete transport blocker is structural, not an assertion failure: desktop `api_endpoint_from` and every cloud client use HTTPS only, while `apps/server/src/index.ts` provides only `http://127.0.0.1:3000`. The QA host has no `mkcert`, Caddy, OpenSSL, pre-trusted localhost/Honsen root certificate, or permitted trusted HTTPS test endpoint. Creating/trusting a root certificate would change host security settings and was not done.

**T10-SEC-001 remains OPEN.** This batch proves the test-profile host can launch, but it provides no native A/B HTTP evidence for the required isolation, replay, revocation or reconnection paths.
