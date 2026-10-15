# Builder Delivery Handoff

This register is maintained by the Fixer/primary agent. A delivery is **not accepted** merely because it appears here; acceptance requires an independent QA record and an integration-worktree regression run.

| Submitted (UTC) | Builder branch | Commit | Scope | Builder-reported checks | Fixer state |
| --- | --- | --- | --- | --- | --- |
| 2026-10-15 | `codex/t04-parent-acceptance` | `a82050d` | REST tax-template cursor-Pull publication | Independent PostgreSQL: focused 9/9 passed; related sync 34/35 failed | **QA_FAILED / RETURNED_TO_OWNER** — T04-001 lock-order deadlock |
| 2026-10-15 | `codex/t09-receipt-payment` | `cbc129a` | Local append-only procurement expenditures, voucher warning, owner-mode denial, atomic outbox | Independent Rust 28/28, desktop typecheck/build, Playwright 1/1 passed | **QA_PASSED (local slice only)**; `INT-002` and `INT-003` block integration |
| 2026-10-15 | `codex/t08-formal-execution` | `6a006ed` | Local owner formal issue, immutable snapshots and local formal numbering | Independent Rust 27/27, desktop typecheck/build, Playwright 1/1 passed | **QA_PASSED (local slice only)**; `INT-001` and `INT-003` block integration |

## Handoff contract

- QA checks out the stated SHA in its own worktree and records commands, exit codes, counts, logs/artifacts and reproduction steps in `BUG_QUEUE.md` or a dated QA report.
- A test blocked by infrastructure is `BLOCKED`, never `PASS`.
- A QA PASS still requires the primary agent to run the relevant regression on an isolated integration ref before accepting the slice.
- Cross-worktree Markdown is synchronized only by an explicit commit/SHA; worktrees do not share uncommitted documentation.
