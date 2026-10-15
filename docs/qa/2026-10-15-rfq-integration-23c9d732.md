# Independent QA — RFQ integration and server immutability guard (`23c9d732`)

## Scope and isolation

- Builder delivery: `23c9d7321c733dee4f773fb2c3b3913b18b08350` on `codex/t08-t09-rfq-integration`.
- QA checkout: detached exact SHA in `C:\Users\This PC\.codex\worktrees\parent-acceptance-qa\Honsen materials`; QA changed neither a Builder worktree nor source/documentation.
- Reviewed server change: once an RFQ has frozen purchase-order snapshots, a generic order event must not convert its parent to owner mode/draft, move it across projects, or soft-delete it. The guard is row-lock serialized and has a PostgreSQL regression.

## Independent execution record

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run test --workspace @honsen/server -- src/sync/postgres-store.test.ts -t "keeps RFQ snapshots immutable"` | 0 | 1 passed, 0 failed, 36 skipped. The server guard held RFQ snapshots against retry, state transition and stale write attempts. |
| `npm run test --workspace @honsen/server -- src/db/migration-runner.test.ts` | 0 | 2 passed, 0 failed. |
| `npm run typecheck --workspace @honsen/server` | 0 | Passed. |
| Initial full `src/sync/postgres-store.test.ts` attempt | blocked | The isolated container was externally stopped before `beforeAll`; connection to `127.0.0.1:54347` returned `ECONNREFUSED`. No test assertion ran, so this was not a product failure or a pass. |
| Retried `npm run test:postgres` | 0 | On fresh project `honsen_fixer_rfq23c_retry` at `127.0.0.1:54348`, health and Windows-node `SELECT 1` succeeded; migration runner passed 2/2 and full PostgreSQL store suite passed 37/37. |

The first disposable normal-user WSL Compose project was `honsen_fixer_rfq23c9` on port `54347`; its focused tests ran while healthy and it was scoped-cleaned after the external shutdown. The retry used the distinct `honsen_fixer_rfq23c_retry` at port `54348`, then ran `down --volumes` and verified its scoped `ps` was empty. No shared Builder Compose project was used.

## Superseded local-only evidence

The preceding RFQ-only ref `334f5d6` was independently checked before it was superseded: Rust library 38/38, RFQ DOM 3/3 and desktop typecheck passed. Those results are deliberately not attributed to `23c9d732`.

## Verdict and remaining gate

**QA PASSED for this combined RFQ/server consistency slice.** The retry removes the environment-only gap: focused server protection, migration runner and full store regressions all passed. Parent T08/T09/T10, desktop-to-server Push/Pull, native two-client/reconnect and the P1 multi-account protocol gates remain open.
