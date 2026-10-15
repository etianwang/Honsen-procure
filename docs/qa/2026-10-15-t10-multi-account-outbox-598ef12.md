# Security QA — T10 cross-account outbox isolation (`598ef12`)

## Scope and method

- Subject: `598ef12dd3e7d67d4416fff942f12634787c4103`.
- The Builder T10 worktree had unrelated uncommitted state files during inspection. QA therefore read only immutable `git show HEAD:<path>` content, made no checkout, compilation, database write or file change there.
- This is a confirmed data-ownership path defect from the exact commit, not a UI observation.

## Confirmed path

1. Local migration `0016` defines `local_sync_outbox` and `local_sync_conflicts` without `account_id` ownership columns (migration lines 8–35).
2. `pending_sync_events` (`apps/desktop/src-tauri/src/lib.rs:4363–4382`) selects every globally pending event based only on acknowledgement/supersession state.
3. `push_pending_https` (`:4546–4579`) obtains these global events before reading the current `active_session_user_id`, then sends them using that current account's credential-vault token.
4. Both login paths replace the sole `local_session` record (online `:1316–1320`, offline `:1385–1388`); `insert_local_sync_outbox` (`:7013+`) likewise records no account owner.
5. Server `SyncService.canWrite` grants purchaser/administrator writes without an event-origin account match (`apps/server/src/sync/service.ts:125`); an engineer-only project/applicant check appears later (`:132–149`). A purchaser/admin B can therefore submit A's pending event and have server mutation/audit attributed to B.

## Required regression boundary

No existing test covers A creates a pending offline event → B signs in online → Push. Add a two-account SQLite/HTTP test that asserts B's Bearer token never sends A's event, plus isolation for conflict listing/acknowledgement/resolution. The defect spans SQLite schema migration, historical-event ownership and shared sync/server authorization; Fixer must not implement it while Builder/design owns those contracts.

## Verdict

**CONFIRMED HIGH/P1 security and data-integrity defect.** Do not accept T10 runtime sync or multi-account acceptance until an explicit account-ownership design, migration and regression proof are delivered. The lifecycle-only `598ef12` QA pass remains valid only for its stated single-account orchestration slice.
