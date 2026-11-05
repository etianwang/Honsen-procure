# V1 server independent ZIP acceptance — 2026-11-06

Result: **bounded package/runtime checks PASS; SERVER_V1_BLOCKED overall**. This is independent verification by Agent A of Agent C's actual ZIP, not acceptance inferred from a build or source-unit tests. Tax/conditional stamp-duty requirements remain unsatisfied; existing native/security/release gates are not closed.

## Frozen artifact and environment

- Actual source SHA: `ebd7d6b1ff303fd68ad3abb7eb455570d15a043f` (includes failed-login timestamp repair `4314899`). Later reports/test-only commits do not change this pin.
- ZIP: `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-ebd7d6b1ff303fd68ad3abb7eb455570d15a043f.zip`.
- Size: 3,493,944 bytes. Full independently computed Windows SHA-256, matching Linux sidecar: `916787ab606ae5e772c17a8e92fa62fa6a8478998c73dc9190776feb6b34b257`.
- Actual runtime OS `/etc/os-release`: Ubuntu 24.04.5 LTS; actual `node --version`: v24.22.1. Isolated PostgreSQL image 16.15 under WSL Ubuntu normal user, no production Docker requirement.
- API active version v1; Base URL `https://api-pr.honsen.africa/v1`; target deployment directory `/www/wwwroot/api-pr/v1/`.
- Software package version remains `0.0.0-development` (candidate, not stable production). Database migrations: 17 SQL files, latest `014_master_data_currencies.sql`; migration identity is separate from API/software version.
- Fresh independent extraction: `/home/honsen-dev/a-v1-independent-ebd7d6b1ff303fd68ad3abb7eb455570d15a043f/unpacked`. Fresh database `a_release_business_test`, API role `a_release_runtime`, separate from builder's database and earlier failed-candidate database. Only one API process ran at a time.

## Actual checks

1. Unzip actual archive into new directory, run `sha256sum --quiet -c SHA256SUMS`. Independently verify manifest source/version/path, every migration digest and Seed entry digest. Recursively scan package for `.env`, `.env.test`, `cos.txt`, PEM/key/PFX secret files: PASS.
2. Execute packaged `node apps/server/dist/db/migrate.js` with isolated owner connection, then runtime-stdin bootstrap `node apps/server/dist/scripts/bootstrap-v1.js`: PASS. Actual initialization reports 2 countries, 3 projects, 14 units, 0 site records. No statutory tax rates were invented or seeded.
3. Create separate limited runtime role, apply package's `deploy/baota/runtime-grants.sql`, then start actual packaged `node apps/server/dist/index.js` as that role: PASS. Verify current user, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS and actual `CREATE TABLE` rejection SQLSTATE 42501: PASS. Migration/fixture owner was never used as the API runtime identity.
4. `HONSEN_DEPLOY_TEST=1 TEST_API_BASE_URL=http://127.0.0.1:3000 ... node /controller/package-http-smoke.mjs`: real CAPTCHA/password login and Pull PASS; empty Push rejects 400; missing authorization header rejects 400 under existing required-header validation; repeated login invalidates old token with 401 and new token succeeds. This is scoped server G1 evidence, not native-client G1 closure.
5. `node /controller/package-admin-http.mjs` with runtime-supplied initial password: actual admin login PASS, `requiresPasswordChange=false`, advisory true, seed Pull 2 countries/3 projects/14 units/0 sites. Actual self-service password change 200; revoked old token 401, old password login 401, new password login 200, advisory cleared: PASS. Replacement test password stayed in memory and was not logged or packaged.
6. `node /controller/package-business-http.mjs`: setup synthetic identities/scope through separate owner connection, then all business mutations through actual HTTP API. Engineer submission, purchaser approval, formal HPA, formal OPA, supplier/SPO creation and formal issuance, payment and full reversal, identical replay, frozen HPA conflict, cross-project engineer denial and engineer payment denial: PASS. OPA frozen arithmetic fixture uses quantity 2 × 120 = 240, synthetic 5% tax 12, total 252; this is arithmetic evidence only, not a legal tax configuration.
7. Restart the actual API container, then run the same business script with `TEST_BUSINESS_MODE=verify`: normal login and Pull deep-equality of five complete saved payloads (OPA/HPA/SPO/payment/reversal) PASS. Formal numbers, snapshots and amounts remain unchanged.
8. `node /controller/package-revocation-http.mjs`: actual runtime HTTP disabled-account Pull 401, purchaser-role removal rejects write, engineer project-binding removal rejects write: PASS. Only disposable fixture account/role/bindings were changed and restored; historical business payloads were untouched.
9. Agent C independently reran actual Nginx tests against this final runtime/database: active `/v1` CAPTCHA 200, inactive version POST 410, retired `/v1` POST 410 after route switch, database business-count unchanged. See builder report and `.cache/server-release-controller/nginx-release-proof.log`.

Public proof logs are retained at `.cache/server-release-controller/independent-final-evidence/` (admin, business, smoke, inspection, restart, revocation, OS and ZIP hash). Private owner/runtime URLs and synthetic restart state remained outside the repository in the owned Linux evidence directory and were not copied into these public logs or ZIP. After API shutdown, these owned synthetic URL/state files were explicitly removed from all three independent extraction evidence directories; public evidence was retained. Controlled startup scripts use runtime environment variables; do not publish private state.

## Failures retained and corrected

- Earlier `ea34b12` package business attempt rejected OPA with conflict because the test incorrectly put derived `ownerPrintTotalsJson` into the approved preissue record. The documented contract generates it on issue. Corrected test `2ee04e4`; final package passed without weakening production validation.
- Initial HTTP smoke incorrectly expected empty events 200 and absent authorization header 401. Existing contracts safely reject these as 400. Expectations were corrected to the actual input-validation contract; old authenticated-session rejection remains strictly 401.
- Earlier `d69d9cf` candidate exposed a real defect: after successful admin password change, old-password login returned 500. Independent direct runtime-role diagnosis reproduced PostgreSQL 42804, CASE timestamptz/interval type mismatch. Repair `4314899` casts failed-login parameter to timestamptz; fresh final ZIP was rebuilt and independently re-extracted, with actual old-password HTTP 401 PASS. Historical d69 failure is not relabeled PASS.

## Remaining gates and cleanup

- **BLOCKER:** authoritative country tax-rate values and applicable conditional stamp-duty rules are not configured/implemented as required; this package must not be called SERVER_V1_READY.
- **BLOCKER:** preserve all existing native G1/installed-release/security/Formal acceptance holds. Server HTTP revocation evidence is not proof of Windows native logout/relogin recovery or the historical three-attempt native failure resolution.
- **DEFERRED:** authorized real COS attachment upload/download/object restore, complete native end-to-end role/history/printing/localization/backup acceptance, remote Baota upload/deployment and verified production backup restore/rollback. No SSH, remote service or production database was accessed.
- **WARNING:** retained old deployment ZIPs are rollback candidates only; no production schema-compatibility/restore validation is claimed. Software version is a development candidate.

The owned unique API container `a-v1-api-proof` was stopped and removed after final checks. Agent C was explicitly handed PostgreSQL Compose cleanup responsibility after public logs were retained; final container/listener cleanup is recorded by C. No production/user data was deleted. No parent milestone or security hold is automatically closed.
