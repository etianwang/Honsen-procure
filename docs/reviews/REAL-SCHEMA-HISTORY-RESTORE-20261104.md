# Real-schema history restore — 2026-11-04

Status: PASS for database archive/schema/history restoration; full application recovery remains OPEN.

## Source and command

Base checkpoint `7edc434ea199ee2d172ea441ef596604ff42734f`, tested migration SQL and formal parser source unchanged from `2812631593cfec5a06375567ae6fe50aee049c4f`, plus the four new test files in this report's containing commit. Source was quiescent. Actual command: `docker exec honsen-c-business-source bash /repo/.cache/run-c-business-restore.sh`; exit 0. Safe output `.cache/business-restore-20261104.log`; initial fixture failure `.cache/business-restore-20261104-first-failure.log` retained.

Two ephemeral PostgreSQL clusters used cached `postgres:16-alpine`, image ID `sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab` (16.15 verified in the preceding run of the same image). No host ports; target shared source's isolated network namespace at internal port5433. No production data, .env, COS or system installation was used. Existing WSL root was used without changing users/groups/defaults.

## Actual checks

- Applied all 16 actual repository migration SQL files, in the production runner's lexical order, each within a transaction with its exact SHA-256 recorded in the real schema_migrations table. This executes the real SQL; it does not execute the Node migration-runner wrapper itself.
- Seeded real application tables: users/countries/projects, sync_entities and sync_events, formal_issue_registry, procurement_expenditures, attachments. Synthetic closed order retained its parser-valid SPO number and immutable snapshot, Chinese/French names, 300XOF payment and 50XOF reversal, plus uploaded attachment owner/key/checksum reference.
- Executed the existing database backup.sh custom-format archive and restored it with pg_restore into a different cluster. Both live database services were running during verification; distinct PostgreSQL system identifiers were asserted.
- Compared deterministic complete contents of every public table after restoration, not just counts. All rows and migration records matched.
- Asserted restored reversal→original-payment→closed-order relation and net amount250; formal-registry→order draft-time frozen snapshot equality; attachment→payment/order relation; all declared foreign keys validated.
- Attempted restored immutable payment update and attachment deletion; existing trusted database triggers rejected both.

All listed checks PASS. Initial fixture SQL omitted updated_by's value; it failed before backup, was corrected, and the same bounded test then passed. No business schema or production behavior was changed.

## Cleanup and limitations

Both task-owned containers were removed; no named/persistent volumes or host port bindings were created. Source/target fixture databases had EXIT-trap removal. By a later version-query attempt the source container was no longer running (WSL lifetime); the complete verification had already returned exit0 and its log was retained. No claim depends on that later query.

Alpine BusyBox lacks GNU mktemp suffix support; the ignored host wrapper adapts mktemp for the existing backup script, as documented in RESTORE-CONTENT-VERIFICATION-20261104.md. No packages were installed.

BLOCKER for full recovery: API startup and authenticated Windows client readback were not executed. Synthetic rows satisfy actual database relationships but were inserted directly for archive verification; this does not prove every API wire schema or business mutation workflow. No COS object was uploaded or restored, and attachment reference integrity does not establish object-byte availability. No schema upgrade from a historical application release, closed-order UI denial, application backup/restore screen or retention policy is accepted by this test. These gates remain OPEN.

## Parser-valid model follow-up

The first minimal archive fixture was deliberately insufficient for API/business model acceptance: its ad-hoc formal number and partial JSON cannot establish a valid SPO. It is superseded for this database test by `business-restore-model.mjs`, which mirrors the existing `spo-formal-postgres.test.ts` draft/issued fields and uses production `formalShortCode` and `parseFormalIssue`. Actual command `node --import tsx tests/deploy/business-restore-model.mjs` accepted the closed issued model and generated the fixture SQL before the database run. The formal number follows country/project/date/SPO/installation-short-code/sequence format. Its complete parser-required draft snapshot is preserved byte-for-byte as formalSnapshotJson, while the current order state is completed.

The improved model was restored in another fresh pair of actual PostgreSQL clusters; every public table content matched, all relationship and immutable-trigger assertions passed, exit0. Safe log: `.cache/business-restore-model-20261104.log`. Both containers were removed. Initial ordinary-node import could not resolve workspace shared TypeScript; using the existing supported tsx loader fixed the test invocation without installing dependencies.

This closes the production formal parser model prerequisite and real-table archive preservation only. The user row's NOT-A-LOGIN-HASH is intentionally unusable; no API/client authentication or parent approval provenance workflow was proven. It does not establish full shared sync envelope acceptance, actual server Push/Pull, or a signed-in restored client. Parent, department/team and supplier references required by higher-level services are not a complete provisioned account/business fixture. These limitations remain explicit BLOCKERs for complete recovery.

The model generator now imports the production TypeScript source directly through the existing tsx loader, removing dependency on generated dist. Fresh parser invocation PASS after this import-only change; schema/model field shapes were unchanged, so the previous database restore evidence is reused for its exact unchanged boundary.
