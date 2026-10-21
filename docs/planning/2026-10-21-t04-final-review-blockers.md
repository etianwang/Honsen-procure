# T04 PR #15 final review — merge blocked

Production head `3ac43fc53da13442f6444399a262e3756c145589`, base `d15a5f3039430819aa220bfa312f4db5be251c03`. This bounded review supersedes the prior merge recommendation; the earlier QA PASS remains historical evidence for the cases it exercised. Neither PR has been merged.

## BLOCKER 1: local and server business-code validation diverge

The new category branch invokes Rust `validate_reference` (`apps/desktop/src-tauri/src/lib.rs`, category save around line 2543; validator around line 9504). It allows an initial `-` or `_`. The shared `businessCodeSchema` (`packages/shared/src/master-data.ts` lines 5–10), used by the new service check (`apps/server/src/sync/service.ts` around lines 136–145), requires an alphanumeric first character. An administrator can enter `-CAT`, save a local category plus audit/Outbox, then see its Push rejected with `FORBIDDEN`. The UI accepts any nonblank code. Since the category business code is immutable, ordinary edit cannot repair the stranded category.

Focused characterization against isolated PostgreSQL 16.14: `npm run test --workspace @honsen/server -- src/sync/t04-review-contract.test.ts`, dedicated loopback database `t04_review_test`: 2/2 passed. The first assertion proves the server rejects `-CAT`; the desktop acceptance follows directly from the Rust validator and local transaction code. Minimal fix: enforce the existing shared code format at the trusted Rust category boundary before writing, and add a regression covering the exact input. Consider explicit recovery for already-created invalid-code records; do not silently delete data.

## BLOCKER 2: cross-device duplicate codes can block Pull

Two offline administrators can each create a category with the same business code and different UUIDs. The category sync service validates the payload but the PostgreSQL sync store keys its entity by `(entity_type, entity_id)` and has no category business-code uniqueness check. The focused real PostgreSQL test confirmed both pushes are accepted and two entity rows exist for the same business code. The actual desktop schema (`0023_material_categories.sql`) has `business_code TEXT NOT NULL UNIQUE`; an isolated in-memory SQLite run of this migration confirmed the second UUID with the same code raises `UNIQUE constraint failed: local_material_categories.business_code`. On Pull, category projection is in the page transaction; the second insert fails, rolls back the page and does not advance its cursor. No conflict is recorded for the different UUID. This can prevent further synchronization.

Minimal fix: enforce business-code uniqueness atomically at the server across category UUIDs and return an actionable conflict without discarding either local record; also handle already-accepted conflicting remote data explicitly at the desktop boundary. Add a focused isolated A/B offline same-code regression including repeat Push/Pull and cursor/conflict outcomes.

## Other checked boundaries

Original 0048 content matches candidate `a0a8aa0`; 0049 retains `exchange_rate` and applies transactionally. The existing independent migration evidence includes rollback and checksum cases; downgrade to code unaware of 0049 remains unverified. Category role checks exist in Rust and the service; local category, audit and Outbox share a transaction. Existing successful desktop evidence covers ordinary create/update, but not either code scenario above.

## Verification scope

Real PostgreSQL characterization used the dedicated E: cluster on `127.0.0.1:55440` and a separate synthetic database. No production code was changed, no full test matrix rerun, no shared service changed. GitHub showed both `quality` checks successful, no merge conflict, and PR ready for review at the reviewed SHA; these green checks do not cover the defects above.
