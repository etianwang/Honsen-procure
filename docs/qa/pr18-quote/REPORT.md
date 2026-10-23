# PR #18 independent quote pagination QA

Result: **QA_FAIL**. Production candidate `f805c9ed3c88f6af16238e999539fd591f7d93b4`; PR remains draft against `codex/v1-unified-baseline`. Existing server country isolation is a blocker; desktop acceptance below is partial.

## Requirements

PRD 37, 54, 62, 68–71 and SPECS supplier/price, order-line and formal issue sections require four overview quotes, all active detail quotes, project-country selection, historical prices and frozen formal snapshots. BUILD-TASKS T05, T08 and T10 retain their original acceptance gates.

## Evidence

- Windows Node 24.18.0, debug Tauri EXE built from candidate using isolated E-drive Cargo target, npm cache, TEMP and SQLite. EXE SHA-256 `a8be8bd9aa2d5cf8cb5f828b33e00711204bfaa59b34dc0d14ffe51041658195`. Debug EXE loads candidate Vite frontend, not a packaged release. `native.mjs` uses real WebView2 and Tauri IPC, synthetic test-profile accounts and direct SQLite fixture setup only. Screenshots and `native-result.json` retained. Seed quote plus 32 synthetic valid quotes exist; detail second page showed QA Vendor 25, the 26th ordered row. In the actual desktop purchasing flow it selected QA Vendor 25 and saved supplier UUID, XOF 1025, quantity 3 and total 3075 in SQLite. This is not proof of all 33 rows or of formal issue through UI.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib supplier_country_isolation_uses_file_sqlite_for_catalog_and_requisition -- --nocapture`: 1 passed. File SQLite test checks 32 unique rows across 25+7 pages, a USD quote for same supplier, inactive history, blacklisting, country and a prior row becoming inactive between requests. It does not prove dynamic UI refresh or invalid cursor handling.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib owner_pricing_requires_a_catalog_or_audited_manual_quote_and_freezes_the_result -- --nocapture`: 1 passed. It formally issues, changes the source price and checks frozen snapshot; not native UI acceptance.
- `npx playwright test tests/e2e/navigation.spec.ts --grep "owner purchase draft explicitly selects a quote source|catalog details and Honsen draft can reach later quote pages" --workers=1`: 2 passed. Mock IPC; supplemental only.
- PR #18 GitHub `quality` checks both SUCCESS on inspection. CI is builder evidence, not independent native acceptance.

## Blockers and limitations

- **BLOCKER — existing server country isolation:** PR #17 independent `docs/qa/pr17-supplier/FOLLOWUP.md` at `5708b19caf019b29dae9f420380c6ae7316184a6` documents real HTTPS foreign-country supplier/price Pull and accepted forged supplier Push. `git diff 5708b19caf019b29dae9f420380c6ae7316184a6 f805c9ed3c88f6af16238e999539fd591f7d93b4 -- apps/server/src/sync/service.ts apps/server/src/sync/postgres-store.ts` is empty; PR #18 has no server/shared changes versus its target. The security failure remains applicable; local filtering is not whole-system isolation PASS. Repair and independent recheck required.
- **BLOCKER — incomplete native acceptance:** overview count, all pages and invalid cursor, same-supplier multi-currency selection, blacklist/inactive and foreign-country UI selection, quote changes during paging, and formal issue followed by price change were not independently exercised in the actual EXE. Complete these before final review.
- **WARNING:** `npm ci` reported one low-severity dependency advisory; no dependency changes made. Test setup files and SQLite remain in ignored/untracked task-specific `.qa-pr18`; no other session data removed. Full T04, T10 and Linux deployment were deliberately not rerun. No deployment or production data changes.

Recommendation: do not enter final review until the existing server blocker is repaired and the remaining native acceptance is completed. No application changes or migrations in this QA branch.
