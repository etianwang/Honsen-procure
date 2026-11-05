# V1 server independent ZIP acceptance — approved tax/manual stamp continuation

Current evidence supersedes the earlier ebd7 candidate below only for the newly tested exact source and package. **Current bounded server/API and extracted ZIP checks PASS.** Original native/installed/security/Formal and external recovery/COS acceptance holds remain separate; this report does not automatically close them or declare stable production release.

## Current artifact and scope

- Frozen server source: `03c2c82b7a0a34cc4f360a293478e58fd529c8f3`.
- Actual ZIP: `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-03c2c82b7a0a34cc4f360a293478e58fd529c8f3.zip`.
- Size: **3,499,032 bytes**; independent Windows SHA-256: `59fa0cfdb7176034c816015bd1fa55613244c7091bf9317507b61addc9e223cd` (matches Linux archive sidecar).
- New independent extraction `/home/honsen-dev/a-v1-independent-03c2c82b7a0a34cc4f360a293478e58fd529c8f3/unpacked`; fresh `a_tax_stamp_release_test`, nonowner runtime `a_tax_stamp_runtime`. No other API ran concurrently. OS Ubuntu 24.04.5 LTS, Node 24.22.1, PostgreSQL actual `16.15 (Debian 16.15-1.pgdg13+2)`.
- Software version remains `0.0.0-development`; API active version v1, Base URL `https://api-pr.honsen.africa/v1`, deployment `/www/wwwroot/api-pr/v1/`; server migration set remains 17/latest `014_master_data_currencies.sql`. Desktop's separate additive SQLite migration `0062_manual_stamp_duty` is not a PostgreSQL migration.

## New actual acceptance

Every operation below ran against this new extraction, fresh database and actual packaged Node process. No prior candidate's HTTP result was transferred.

1. Archive `SHA256SUMS`, all migration hashes, bootstrap hash, incremental tax entry/helper hashes, shared bundle/server entry manifest hashes and secret-file scan PASS. Nonowner role properties and actual CREATE TABLE denial 42501 PASS. Packaged migration and bootstrap commands PASS.
2. Fresh bootstrap reports 2 countries, 3 projects, 14 units, 0 site records, 2 tax templates and 3 project defaults. Real admin HTTP Pull has 24 initial projected records. Assertions verify approved rates 1800/1925 basis points, each project default's tax country equals project country and its currency matches project default currency. No additional site records are created. These are user-approved CI18%/CM19.25% configuration values, not an independent statutory tax opinion.
3. Actual admin initial-password login, advisory true/nonmandatory, password change, old-token401, old-password401, new-password200 and cleared advisory PASS. Anonymous missing-header rejection remains existing 400, empty Push rejection 400, old authenticated session invalidation401 PASS.
4. Actual HTTP engineer submission/purchaser approval/formal HPA, supplier/SPO, formal OPA, payment/full reversal, idempotent replay, immutable change conflict and project/payment permission denial PASS. Manual stamp is explicitly chosen **37 minor units**, not a universal fixed charge. HPA/SPO sample: 2500 + CI18%450 + manual37 = 2987. OPA sample: 240 + CM19.25% half-up46 + manual37 = 323; frozen totals and snapshot carry the explicit amount. Proportional tax excludes manual stamp from its tax base.
5. Actual unissued-draft compatibility check: new client saves manual37; same-version old-client edit omitting the field receives retained conflict, duplicate delivery receives conflict again; explicit manual `'0'` succeeds and cancels the fee (total2950). No silent field omission overwrites a stored amount. Formal changed stamp is rejected with conflict. PostgreSQL targeted regression additionally verifies both conflict payloads and legacy absent-field snapshots remain unchanged.
6. Actual API restart followed by normal login/Pull deep-equality of **six** complete persisted payloads (HPA/SPO/OPA/payment/reversal/explicit-zero unissued draft) PASS. Exact amounts, snapshots and formal numbers remain preserved.
7. Actual disabled-account Pull401, purchaser-role removal write rejection and engineer-project-binding removal write rejection PASS; synthetic account/role/bindings restored afterward. These are server HTTP boundaries, not closure of the prior native G1 failure.
8. C reran actual Nginx route switching against this package/database: active `/v1` CAPTCHA200, inactive POST410, retired `/v1` POST410 after switch, business row counts unchanged PASS. Raw result `.cache/server-release-controller/nginx-tax-release-proof.log`; temporary proxy removed.

Reproducible committed HTTP controllers: `tests/deploy/package-http-smoke.mjs`, `package-admin-http.mjs`, `package-business-http.mjs` (normal/verify modes) and `package-revocation-http.mjs`. Run them with explicit `HONSEN_DEPLOY_TEST=1`, loopback `TEST_API_BASE_URL`, disposable owner fixture URL and private test state path; actual API itself always uses the separately granted runtime role. Commands and sanitized actual logs are retained in `.cache/server-release-controller/independent-tax-stamp-evidence/`. No production connection, SSH or deployment occurred.

## Review corrections, limitations and cleanup

- Earlier tax/conditional-stamp blocker is resolved within the user's newly approved scope: country percentages above plus manually entered order amount; absence means zero manually recorded fee, not a legal applicability determination. No hardcoded1000 charge or automatic statutory condition inference was added.
- Independent review initially suspected `sharedBundleSha256` covered only a reexport entry. Actual final ZIP inspection disproved this: `packages/shared/dist/index.js` is the 25,764-byte esbuild bundle containing concrete schemas including manual stamp; the suspicion is withdrawn. Its manifest digest covers the actual shared bundle. External zod and other runtime dependencies are additionally fixed by package SHA256SUMS and full ZIP hash.
- Diagnostic inspection initially guessed a Debian packaging suffix `+1`; actual version was `+2`. The check was corrected to the requested PostgreSQL16.15 version, not an invented packaging suffix. No product repair or package change was needed.
- Historical OPA test-fixture mistake, 400-vs401 missing-header expectation and real d69 old-password500 failure below remain historical evidence. Final old-password401 was freshly rerun. The new legacy-client stamp omission data-loss boundary was fixed by `9136bea`, with real PG retained-conflict/explicit-zero regression before this package was built.
- No BLOCKER found for these bounded server tax/manual-stamp/package checks. DEFERRED: original native/installed/security/Formal full acceptance, authorized live COS object flow and production backup/restore/schema compatibility. WARNING: development software version, release not stable production, preserved old ZIPs are only compatibility-dependent rollback candidates.
- Unique API container `a-v1-api-proof` stopped and removed after final checks; private synthetic owner/runtime URL and restart-state files removed from this extraction's evidence directory. Public logs retained. C was explicitly authorized to perform owned disposable PostgreSQL Compose down--volumes cleanup after the handoff; its final listener/container cleanup belongs to C's record.

---

## Historical ebd7 candidate evidence (superseded for current tax/manual-stamp scope)

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
