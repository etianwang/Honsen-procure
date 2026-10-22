# T04 FIX2-B partial checkpoint — 2026-10-21

Status: **PARTIAL / NOT READY TO MERGE**. This is builder evidence, not independent QA.

## Completed boundary

The category-only shared schema rejects leading/trailing whitespace rather than
trimming it. It accepts the same 1–64 ASCII characters as the existing Rust
category boundary: an alphanumeric first character, followed by alphanumeric,
underscore or hyphen. Case is preserved and compared exactly. Other master-data
schemas retain their existing trimming behavior.

The new SyncService test first failed because `Cat-1` was accepted; after the
change, the test rejects it before storage and accepts `Cat-1` unchanged. On
production commit `86c1d2450b051edff75c5a43a67c2e1a547f25de`, the focused server
suite passed 18/18, shared tests passed 16/16, shared and server typechecks,
lint and builds passed, and the two edited files passed Prettier check. No
PostgreSQL concurrency or historical-data test was run for this checkpoint.

## Observed protocol and compatibility risks

- SQLite migration 0023 makes `business_code` globally unique within the local
  category table, including inactive categories, using SQLite's default binary
  comparison. UUID is the entity identity; a distinct UUID is not a version of
  another category.
- The server transaction locks the event ID and `entityType:entityId`, then
  checks that entity's version. It does not lock or enforce the category code.
  The prior independently pushed QA evidence `e70f77b29ecfa797fdb537964575f37d53768386`
  demonstrates acceptance of duplicate codes for distinct UUIDs at its tested SHA.
- The desktop's generic `conflict` path records the response against the
  submitted UUID as a same-entity conflict; `validation_error` supersedes the
  outbox event. Neither establishes a safe administered cross-UUID recovery
  workflow. A new error code alone is not proof of compatibility.
- The stored event replay path does not currently persist a distinct conflict
  error code. A stable `CATEGORY_CODE_CONFLICT` result must survive event replay
  without being normalized to `VERSION_CONFLICT`.
- Existing duplicates cannot be assumed absent. A plain unique index on the
  existing entity payload would fail migration where duplicates already exist.
  Choosing a winner, dropping records, changing codes, or silently filtering
  records without preserving reference semantics is not authorized.
- Desktop Pull applies a page and cursor in one transaction. A duplicate code
  can fail the projection and roll back the page, blocking later changes.
  Filtering a duplicate server-side is not by itself a proven recovery: a
  material may reference the omitted UUID, and historical change-log replay
  can expose older duplicates.

## Remaining implementation and verification

1. Design an append-only PostgreSQL migration with database-enforced atomic
   code reservation, including a deterministic, auditable quarantine of every
   pre-existing duplicate group. Preserve all UUIDs, events and references.
   Define how deployments with overlapping old and new server instances are
   protected; an application-only pre-query is insufficient.
2. Define an explicit `CATEGORY_CODE_CONFLICT` response and replay contract,
   distinct from `VERSION_CONFLICT`, with retained failed event and actionable
   administrator recovery details. Verify compatibility with existing desktop
   acknowledgement handling before enabling the response.
3. Define and implement a non-lossy Pull/quarantine contract that advances past
   bad historical records without pretending missing material references are
   resolved. Desktop changes and an administrator recovery workflow remain a
   separate necessary follow-up; no recovery UI was implemented here.
4. On a new isolated PostgreSQL 16 instance and isolated fixtures, test
   concurrent distinct UUIDs, same-event retries, same-UUID version conflicts,
   rename/disable, seeded historical duplicates, transaction rollback and
   conflict replay. Do not reuse another QA session's database or data directory.
5. Independently recheck the final production SHA, then revisit PR #15 status.

No schema migration, database constraint, `CATEGORY_CODE_CONFLICT` response,
historical quarantine, or PostgreSQL test has been completed by this checkpoint.
Existing deployed data was not inspected; its duplicate state is unknown.
The initial Node commands pointed TEMP and npm cache at the prior T04 QA
directories; no database was opened. Future runs must use task-private paths.
