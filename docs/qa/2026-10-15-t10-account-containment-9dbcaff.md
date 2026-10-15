# Independent QA — T10 desktop account-boundary containment (`9dbcaff`)

## Scope and isolation

- Builder delivery: `9dbcaff0c35899ec0dc59ee0f0b26cbc0d3f6817`.
- QA checkout: detached `9dbcaff` in Fixer worktree `C:\Users\This PC\.codex\worktrees\fixer-api-postgres-qa-a82050d`; no Builder worktree was changed.
- Static review confirms the additive migration is `0046_sync_outbox_account_boundary`, leaving formal `0044` and expense `0045` names available for the later combined integration ref. It stamps new outbox rows from the trusted local session, owner-filters pending Push and acknowledgements, quarantines legacy NULL ownership, rejects in-flight account changes, and fails Pull when multiple cached accounts make the singleton cursor unsafe.

## Independent execution record

| Command | Exit | Result |
| --- | ---: | --- |
| `cargo test account_boundary` with isolated `CARGO_TARGET_DIR=E:\honsen-qa-9dbcaff-target` | 0 | 1 passed, 0 failed: legacy outbox migration preserves data without attribution. |
| `cargo fmt --check`; `cargo check --bins`; `cargo test --lib` | 0 each | Format/check passed; full Rust 30 passed, 0 failed. Includes cross-account event non-reassignment/quarantine and Pull boundary tests. |
| `npx playwright test tests/e2e/sync-lifecycle.spec.ts` | 0 | 4 passed, 0 failed: lifecycle behavior plus actionable cross-account Pull boundary/reconnect non-loop. No browser-console errors; only Node color-environment warnings. |
| `npm run typecheck --workspace=@honsen/desktop`; `npm run build --workspace=@honsen/desktop` | 0 each | Strict typecheck and production build passed. Existing Vite >500 kB chunk warning remains. |

## Verdict and limits

**QA PASSED for the desktop containment slice only.** The implementation prevents newly owned A events from being pushed/acknowledged as B and preserves unowned legacy data without silently attributing it. `T10-SEC-001` remains **OPEN**: conflict list/projection paths are still global, server origin-account binding and per-account Pull cursors are absent, old `0044` owner-marker recovery requires data-preserving integration treatment, and native A/B evidence is missing. This SHA does not itself include formal `0044`/expense `0045`; a final combined integration ref must migration-test `0044 → 0045 → 0046` before any integration acceptance.
