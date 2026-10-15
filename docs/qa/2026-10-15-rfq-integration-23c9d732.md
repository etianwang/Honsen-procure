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
| Full `src/sync/postgres-store.test.ts` | blocked | The isolated container was externally stopped before `beforeAll`; connection to `127.0.0.1:54347` returned `ECONNREFUSED`. No test assertion ran, so this is not a product failure or a pass. |

The disposable normal-user WSL Compose project was `honsen_fixer_rfq23c9` on port `54347`. Its focused tests ran while healthy. After the external shutdown the QA agent ran `down --volumes` and verified its scoped `ps` was empty. No shared Builder Compose project was used.

## Superseded local-only evidence

The preceding RFQ-only ref `334f5d6` was independently checked before it was superseded: Rust library 38/38, RFQ DOM 3/3 and desktop typecheck passed. Those results are deliberately not attributed to `23c9d732`.

## Verdict and remaining gate

**PARTIAL QA ONLY.** The new targeted server guard and migration suite pass, but the full PostgreSQL store regression must be rerun on a stable disposable database before this combined delivery can be accepted. Parent T08/T09/T10, desktop-to-server Push/Pull, native two-client/reconnect and the P1 multi-account protocol gates remain open.
