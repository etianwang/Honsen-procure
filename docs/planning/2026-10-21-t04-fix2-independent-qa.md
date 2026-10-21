# T04 FIX2-B/C independent QA checkpoint

Candidate: `dc414f18b5efba040ce4a20bacefb3d1a4de539c`. QA branch starts at this exact candidate. PR #15 was at this SHA; GitHub quality checks were successful when inspected. No final acceptance is claimed at this checkpoint.

- PostgreSQL 16.15, isolated Compose container and E: ext4-backed disposable data: focused category tests 3 passed (simultaneous repairs, replay/reference preservation, duplicate-code race). First run's beforeAll timed out at 10 seconds during cold migration; repeat with 60-second hook/test limits passed.
- Independent `tests/qa-t04-migration-race.mts` runs two `runMigrations` calls on separate pools against a fresh disposable database. One fulfilled and one rejected with PostgreSQL `pg_type_typname_nsp_index` duplicate-key error. `runMigrations` reads applied migrations without a global migration lock; concurrent migration runners can race. This establishes a deployment constraint: use exactly one migration runner, complete and verify migrations before starting new application instances. It does not demonstrate data loss or establish whether old servers can safely run during upgrade.
- Docker container stopped and its loop mount disappeared once during setup; it was restarted on the original E: image. Intermediate ECONNREFUSED/startup errors were environmental, not product acceptance results.
- Windows desktop, SQLite, migration rollback and remaining adversarial cases are still unverified at this checkpoint. No previous builder result is adopted.
