# V1 bootstrap and password-change bounded evidence — 2026-11-06

Scope: T04 deployment Seed and confirmed authentication/bootstrap gaps under the user-approved V1 ZIP delivery. This does not close server P0, production, installed, native G1 or tax acceptance.

Implemented stdin-only initial password (8–1024 characters only for bootstrap), transactional empty-account-database initialization, admin super-administrator, two countries, three approved projects, fourteen existing-standard units and zero site records. Nineteen country/project/unit sync projections are published in the same transaction. Repeat bootstrap never resets credentials; an existing unrelated admin is refused. No production credential is stored in source or package defaults.

Bootstrap sets requires_password_change false. Optional login user.passwordChangeRecommended is derived from permanent initialization/change audit entries. Password change requires an active bearer session plus current password, keeps the twelve-character replacement policy, atomically changes hash/audit and revokes all sessions. A stale concurrent login cannot create a session after the hash changes.

Actual PostgreSQL16.15 found the pre-existing projects XAF CHECK defect. New immutable 014_master_data_currencies.sql aligns project/default/rate checks with already supported shared currencies, without rewriting rows or snapshots. Initial failed Seed rolled back. Two subsequent attempts were blocked by a stopped disposable PG container; C restored its owned container and retained a WSL keeper. Those failures are not PASS evidence.

Fresh focused command with TEST_DATABASE_URL pointing solely at C's disposable PG16.15:

`npm run test --workspace @honsen/server -- src/auth src/authorization src/scripts/bootstrap-v1-postgres.test.ts src/db/migration-runner.test.ts`

Result: 7 files, 20 tests PASS. Actual tests cover injected SQL failure with zero retained accounts/master data/projections, successful Seed, eight-character admin login and recommendation, repeat retention, wrong-current-password rejection, short-new-password rejection, actual hash replacement, recommendation clearance, revoked-token denial, stale-login hash guard and existing migration/auth/authorization regression. Expected injected SQL failure stderr is retained by the test runner.

Server strict typecheck, lint and production build PASS. No production connection, remote deployment or real business database used. Tests are not independent ZIP acceptance. Runtime base grants are explicit in deploy/baota/runtime-grants.sql; reviewed later-migration grants still require grant-api.cjs and independent actual runtime-role verification by C.

BLOCKER: authoritative country tax/stamp applicability configuration is unverified and deliberately not guessed or silently replaced with zero; Seed reports BLOCKED_UNVERIFIED_AUTHORITY. Native G1/full server P0 and independent ZIP/runtime-role acceptance remain open. DEFERRED: remote deployment/restore and second production governance account provisioning. WARNING: retained old package does not prove DB rollback compatibility. Main agent owns combined task/memory/roadmap updates and final source freeze.

## Fresh runtime role and upgrade recheck

After 80d76b1: fresh-install grants now explicitly include the reviewed later-migration table, column, sequence and canonical-payment-function privileges. This SQL is only for the fixed fresh initialization path; it is not an incremental-controller migration snapshot. No runtime owner/superuser privilege is needed. The existing incremental grant controller separately accepts the no-new-object 014 check migration.

Actual nonowner LOGIN role regression uses this exact SQL, asserts current_user equals the generated restricted role and CREATE TABLE is rejected, then executes current-password verification, password hash UPDATE, permanent audit INSERT and session revocation through that role: 2/2 PASS. Existing authorization store revocation uses soft-delete UPDATE, with no DELETE statement; DELETE grants were not added. `tests/deploy/test-t04-grants.cjs` actual PostgreSQL result: restricted-role service Push/Pull/repair PASS and deployment grants/trigger PASS. `tests/deploy/test-api-grant-policy.sh` in Linux Node24.22.1: PASS, including expected unknown-migration rejection; first WSL-shell attempt had no native node executable and was not counted as PASS.

New direct old-CHECK-schema→014 upgrade test preserves saved XOF rows, accepts XAF in projects/defaults/rates and still rejects invalid currency: migration suite 5/5 PASS. Full server suite on a separately created disposable b_full_server_tests database with TEST_DATABASE_URL: 34 files PASS, 203 tests PASS, 1 file/3 tests SKIPPED. Those skips are live COS tests gated by HONSEN_COS_LIVE/real storage configuration; no COS credentials or live calls were used, so live COS acceptance remains unverified. This full-suite result predates the final nonowner-role test refinement; its affected password/migration tests were rerun separately with the results above. Later strict typecheck/lint PASS.

Final password-route recheck also serializes and rechecks locked_until under the same row lock: six concurrent wrong-current-password attempts produce exactly five 401 responses and one 423, with stored failures exactly five. This closes a newly introduced endpoint's concurrent lock boundary. Restricted-role password suite now 3/3 PASS; strict typecheck/build/lint PASS after this change. No schema change for this refinement.
