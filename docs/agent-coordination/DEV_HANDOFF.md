# Builder Delivery Handoff

This register is maintained by the Fixer/primary agent. A delivery is **not accepted** merely because it appears here; acceptance requires an independent QA record and an integration-worktree regression run.

| Submitted (UTC) | Builder branch | Commit | Scope | Builder-reported checks | Fixer state |
| --- | --- | --- | --- | --- | --- |
| 2026-10-15 | `codex/t04-parent-acceptance` | `a82050d` | REST tax-template cursor-Pull publication | Independent PostgreSQL: focused 9/9 passed; related sync 34/35 failed | **QA_FAILED / RETURNED_TO_OWNER** — T04-001 lock-order deadlock |
| 2026-10-15 | `codex/t09-receipt-payment` | `cbc129a` | Local append-only procurement expenditures, voucher warning, owner-mode denial, atomic outbox | Independent Rust 28/28, desktop typecheck/build, Playwright 1/1 passed | **QA_PASSED (local slice only)**; `INT-002` and `INT-003` block integration |
| 2026-10-15 | `codex/t08-formal-execution` | `6a006ed` | Local owner formal issue, immutable snapshots and local formal numbering | Independent Rust 27/27, desktop typecheck/build, Playwright 1/1 passed | **QA_PASSED (local slice only)**; `INT-001` and `INT-003` block integration |
| 2026-10-15 | `codex/t08-rfq-lifecycle` | `0958fca8e24befc7250e29bca1a88260e804493a` | SQLite RFQ Pull projection and display-number migration | Independent Rust focused 2/2 + 7/7 + migration 1/1, full Rust 26/26, desktop typecheck/build and Playwright 1/1; follow-up isolated PostgreSQL migration 1/1 and sync-store 4/4 | **QA_PASSED (isolated slice only)**; `docs/qa/2026-10-15-rfq-pull-0958fca8.md` records the evidence. T08-C/T10, server source verification, native two-device and reconnect acceptance remain open. |
| 2026-10-15 | `codex/t08-t09-schema-integration` | `c3bf374ed3254a7699127d7216a6acc71b71f1a8` | T08 formal `0044` plus T09 payment `0045`, including exact legacy-marker promotion | Independent format/lint/typecheck/build, focused migration 3/3, full Rust 31/31 and regular DOM 1/1 passed | **QA_PASSED / integration regression passed**; `docs/qa/2026-10-15-int-003-d12d2e9.md`. `INT-003` is resolved, but `INT-002` and parent acceptance remain open. |
| 2026-10-15 | `codex/t10-runtime-sync` | `598ef12dd3e7d67d4416fff942f12634787c4103` | Online-login Push→Pull lifecycle, bounded retry/reconnect, offline/failure suppression and cleanup | Independent lifecycle unit 7/7, Rust 27/27, DOM 3/3, desktop typecheck/build, PostgreSQL migration 2/2 and sync store 35/35 passed | **QA_PASSED (runtime slice only)**; `docs/qa/2026-10-15-t10-lifecycle-598ef12.md`. T10-B/C and parent acceptance remain open. |

## Handoff contract

- QA checks out the stated SHA in its own worktree and records commands, exit codes, counts, logs/artifacts and reproduction steps in `BUG_QUEUE.md` or a dated QA report.
- A test blocked by infrastructure is `BLOCKED`, never `PASS`.
- A QA PASS still requires the primary agent to run the relevant regression on an isolated integration ref before accepting the slice.
- Cross-worktree Markdown is synchronized only by an explicit commit/SHA; worktrees do not share uncommitted documentation.
