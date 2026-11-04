# PostgreSQL calendar-date assertion repair — 2026-11-04

Scope: only apps/server/src/sync/postgres-store.test.ts; no product, schema, migration, global TZ or dependency change. Working source HEAD at final verification: 6697469 plus this test-only patch.

Schema evidence: migrations/002_project_defaults_and_master_data.sql defines tax_templates.effective_at as DATE NOT NULL. API/sync fixtures use YYYY-MM-DD calendar dates. Converting pg's locally parsed DATE object to a UTC ISO timestamp moves Shanghai midnight to the preceding UTC date; the two assertions tested that conversion rather than persisted SQL date semantics.

Minimal repair: the two test SELECTs now return effective_at::text AS effective_at, type it as string, and compare directly to their expected date. All remaining row/audit/idempotency/conflict assertions are retained.

Fresh evidence using controller-owned isolated PostgreSQL on 127.0.0.1:54329; test URL assembled in-process from .env.test without logging credentials:

- Before repair: postgres-store.test.ts -t tax.template reproduced exactly two failures (expected October15/16, received October14/15), five passed and 35 unrelated filtered cases skipped.
- Intermediate first replacement covered only one SELECT; one original failure remained. Corrected the second SELECT before final verification; no product change was attempted.
- Final same focused command: PASS7/7, 35 unrelated cases excluded by test-name filter.
- Full npm run test --workspace @honsen/server: PASS166, three skipped, zero failed (28 passed files, one skipped file). Live COS/real attachment tests remain opt-in and were not enabled in this process; these skips cannot establish live storage acceptance. Agent A owns separate actual COS evidence.
- Server lint and strict typecheck: PASS.
- Test-file Prettier: PASS. git diff --check: PASS.

BLOCKER: none for this calendar-date test repair. DEFERRED: native two-client CDP/business acceptance and original release gates remain with the controller. WARNING: full server success does not replace the explicitly skipped live-service coverage. Database lifecycle remains controller-owned; no cleanup of another task's resources was attempted. No commit/push performed by this agent.
