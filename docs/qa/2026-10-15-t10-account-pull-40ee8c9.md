# Independent QA — T10 per-account Pull state (`40ee8c9`)

## Scope and isolation

- Builder delivery: `40ee8c959983439cde27b8ccbe14148ba74b465c`.
- QA checkout: detached exact SHA in `C:\Users\This PC\.codex\worktrees\parent-acceptance-qa\Honsen materials`; QA left no source or documentation changes.
- Reviewed change: additive SQLite migration `0047_sync_account_pull_state` follows `0046`; it preserves the former global cursor as unattributed historical evidence, starts each account at cursor zero, and atomically commits that account's cursor/success only with a fully projected Pull page. A dirty entity belonging to a different/legacy account fails closed without cursor advance.

## Independent execution record

| Command | Exit | Result |
| --- | ---: | --- |
| Four focused per-account Pull tests (`pull_cursor_and_success_are_isolated_per_cached_account`, legacy cursor migration, failure/restart replay, foreign dirty entity) | 0 | 4 passed, 0 failed. |
| Four online-session boundary tests | 0 | 4 passed, 0 failed. |
| `cargo fmt --check`; `cargo check --bins`; `cargo test --lib` | 0 each | Format/check passed; full Rust suite 39 passed, 0 failed. Only linker informational warnings appeared. |
| `npm run typecheck --workspace=@honsen/desktop` | 0 | Passed. |
| `npx playwright test tests/e2e/sync-lifecycle.spec.ts --workers=1` | 0 | 4 passed, 0 failed: online Push-before-Pull, offline/lock suppression, CAPTCHA failure, and cross-account Pull boundary. |

No PostgreSQL/API suite ran: this exact SHA changes only desktop Rust/SQLite and contains no server or PostgreSQL migration diff. No combined `0044 → 0045 → 0046 → 0047` upgrade chain exists on this delivery, so it is deliberately not claimed.

## Verdict and remaining gate

**QA PASSED for the desktop per-account Pull containment slice.** The P1 `T10-SEC-001` finding is improved but remains open: no server event-origin binding, audited legacy recovery, conflict visibility isolation, real A-offline/B-online HTTP lifecycle, native two-account proof, or combined migration integration is present. No T10 parent or parent-task acceptance follows.
