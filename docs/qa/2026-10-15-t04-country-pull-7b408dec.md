# Independent QA — T04 country REST-to-Pull (`7b408dec`)

## Scope and isolation

- Builder delivery: `7b408decaba33a66b606771a68679b71ed1eeea4`.
- QA checkout: detached `7b408dec` in Fixer worktree `C:\Users\This PC\.codex\worktrees\fixer-t10-lifecycle-74365f0`; no Builder worktree was changed.
- Static review confirms `saveReferenceData` publishes a snake-case Rust-compatible country payload in the same transaction as country/audit/sync entity/change log, uses the per-country advisory lock, monotonic business/sync version selection, and the `server_change_log` cursor-order table lock.

## Independent execution record

| Command | Exit | Result |
| --- | ---: | --- |
| Unique WSL Compose `honsen_fixer_t04_country` on `127.0.0.1:54344`; Windows-node `SELECT 1`; `npm run test --workspace=@honsen/server -- --run src/master-data/postgres-store.test.ts` | 0 | 13 passed, 0 failed. This suite covers first/revised engineer Pull, stale Push conflict, legacy sync-only immutable-code handling, sync-ahead version, injected late-publication rollback/retry and change-log cursor race. |

The normal-user WSL helper and named disposable Compose project were removed with scoped `down --volumes`; subsequent project `ps` was empty. No existing database, E2E data, Builder worktree or production resource was used.

## Verdict and limits

**QA PASSED for this isolated country REST-to-Pull reliability slice.** It may enter normal no-push integration handling. This result does not accept parent T04, validate remote deployment or native multi-account behavior, and does not change the separate P1 T10 cross-account outbox blocker.
