# Independent QA — formal issue server sync (`8e20a48`)

## Scope and isolation

- Builder delivery: `8e20a48` on `codex/t08-formal-server-sync`, based on the QA-verified T08/T09 integration ref.
- QA checkout: detached `8e20a48` in Fixer worktree `C:\Users\This PC\.codex\worktrees\fixer-t10-lifecycle-74365f0`; no Builder worktree was changed.
- Static review found additive server migration `006_formal_issue_registry.sql`, immutable formal-number/installation-sequence/preissue-snapshot registry, duplicate/divergent collision handling and retained Purchase-Order Pull projection.

## Independent execution record

| Command | Exit | Result |
| --- | ---: | --- |
| Unique WSL Compose `honsen_fixer_formal_8e20` on `127.0.0.1:54345`; Windows-node `SELECT 1`; `npm run test --workspace=@honsen/server -- --run src/sync/formal-issue-migration.test.ts src/sync/formal-issue.test.ts` | 0 | 4 passed, 0 failed: migration registry plus duplicate-number/divergent-snapshot formal handling. |
| Same isolated database: `npm run test --workspace=@honsen/server` | 0 | 13 files passed; 79 tests passed, 0 failed. |

The normal-user WSL helper and disposable project were removed via scoped `down --volumes`; subsequent `ps` was empty. No production database, E2E data or Builder worktree was used.

## Verdict and limits

**QA PASSED for the server formal-registration checkpoint.** The server component may enter normal no-push integration handling. `INT-001` is only partially addressed: a final desktop-to-server Push/Pull integration ref and native/multi-client proof are still required. The current wire also lacks source-record/effective-date rate provenance, so this evidence proves arithmetic/snapshot immutability only, not that provenance acceptance requirement.
