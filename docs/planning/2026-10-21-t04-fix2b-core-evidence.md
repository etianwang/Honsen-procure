# T04 FIX2-B core checkpoint — PARTIAL

Production code checkpoint `4974240780a2131c88c1c524c3c3cf81c82b6804` on
`codex/t04-material-category-maintenance`; this is builder evidence, not
independent acceptance. PR #15 remains Draft / NOT READY TO MERGE.

## Implemented

- Migration 007 installs a PostgreSQL row trigger on `sync_entities`. It uses
  a transaction-scoped advisory lock keyed by the exact, case-sensitive category
  code, then rejects a new competing UUID. Existing duplicate UUIDs and their
  original codes are not rewritten; an existing ID can keep its existing code.
  Installing the trigger requires a table write lock. Hash collisions serialize
  unrelated codes but do not make them equal.
- A rejected new claimant is stored as `validation_error` with
  `CATEGORY_CODE_CONFLICT`, not as `accepted` or `VERSION_CONFLICT`; event replay
  returns the same error code. The response intentionally contains no other
  account or category payload. Rust retains a category event carrying that code
  as unacknowledged and unsuperseded with `last_error` set. No administrator
  recovery workflow or full conflicting-record details are provided yet.
- Migration 008 records every UUID in a pre-existing duplicate-code group in
  `category_code_quarantine`, preserving the original code and data. This is a
  registry only: it does not yet isolate Pull or expose a recovery endpoint.

## Fresh targeted evidence

PostgreSQL 16.15 ran in a task-specific Docker container on loopback 55472;
its ext4 image and TEMP, Cargo target and npm cache were on E:. Synthetic test
data only. The concurrent test first failed with two accepted events and then
passed with one accepted and one code conflict; it also checked replay,
same-UUID version conflict, rename/disable, no rejected change-log entry and
ordinary server Pull. A separate migration test seeded two duplicate UUIDs and
two material references, then verified 007/008 preserve both and reject a new
claimant. Targeted PostgreSQL/service tests: 4 passed, 55 intentionally skipped.
Server typecheck, lint and build passed. Rust code-conflict retention and the
existing ordinary conflict acknowledgement test each passed 1/1; cargo fmt
check passed. These tests do not establish historical Pull recovery, direct
desktop A/B sync, production migration rollout safety, or independent QA.

## BLOCKER — work still required

- The quarantine registry is not consumed by Pull. A historical duplicate may
  still roll back the desktop page and block its cursor. Filtering entries
  without accounting for material references would be silent data loss.
- There is no authenticated, authorized, audited and replay-safe administrator
  repair endpoint or shared recovery contract. No code or UUID may be silently
  rewritten or merged. FIX2-C also needs desktop repair UI and safe Outbox
  reconciliation; pending code-conflict events currently continue to be retried.
- Test a true existing-database migration including audit/change history,
  migration rollback and concurrent upgrade; assess production lock duration,
  direct migration connection, old-server overlap and rollback procedure.
- Retest the final SHA with isolated PostgreSQL and desktop clients, then obtain
  independent QA. Do not mark READY_FOR_RECHECK or release PR #15 yet.
