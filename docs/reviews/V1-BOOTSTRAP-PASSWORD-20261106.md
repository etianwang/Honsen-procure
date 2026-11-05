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
