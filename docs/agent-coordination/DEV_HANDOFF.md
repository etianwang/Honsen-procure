# Builder Delivery Handoff

A delivery is not accepted merely because it appears here. It requires independent QA on the stated SHA.

| Submitted (UTC) | Branch                                | Commit                                     | Scope                                                                                                                                                                      | Builder checks                                                                                                                   | Fixer state                                               |
| --------------- | ------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 2026-10-16      | `codex/t08-t10-p1-server-integration` | `8293ed5172f8caa5dd149cec278ea09f0f1a852e` | T08/T10/P1/Formal server combination: formal registry migration, immutable formal issue checks, P1 origin binding, RFQ compatibility, and session-installation read repair | PostgreSQL combination 57/57; sync API/service 19/19; auth PostgreSQL 2/2; server lint/typecheck/build and targeted format check | QA requested; P1 and formal integration holds remain open |

## Fixer QA

1. Check out the exact SHA in a clean QA worktree.
2. Start a fresh disposable PostgreSQL 16 container and run the full server suite with `TEST_DATABASE_URL` set.
3. Re-run the 57-test PostgreSQL Formal/RFQ/sync/migration group and verify session revocation/login behavior.
4. Record every command, result, and any environment interruption in `BUG_QUEUE.md`; do not mark P1 or Formal accepted from this handoff alone.
