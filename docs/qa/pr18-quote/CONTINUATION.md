# PR #18 native QA continuation

Result: **QA_FAIL**, candidate `f805c9ed3c88f6af16238e999539fd591f7d93b4`. This supersedes the previous report's attribution of the existing server issue as a PR #18 defect. PR #17's unmerged `20da0985fdb18b1e4a6571c54de8a0a4af40282c` remains an integration dependency; its fix was not independently rechecked here. No whole-system country-isolation or release claim is made.

## P1: expired selected quote is saved and submitted

1. In the real Windows debug Tauri EXE, sign in offline as the synthetic purchaser, open purchasing, select the test material and load the next quote page.
2. Select QA Vendor 2, XOF 1,002. Use the isolated SQLite fixture to change that exact price row `40000000-0000-4000-8000-000000000002` to inactive after it is loaded and selected; leave the UI open.
3. Save the draft. The UI reports success; SQLite retains that supplier, XOF 1,002 and quantity 3 / total 3,006. Click submit: UI reports pending confirmation and the stored workflow is `pending_confirmation`.

The test demonstrates the stale selection can proceed instead of being revalidated. `continued-result.json`, `stale.png`, `submitted.png`, and `continued.mjs` preserve the reproduction. The new Honsen selection path copies price values into the line; inspect its trusted save/submit boundary when repairing. Do not silently discard the draft. This is a confirmed current PR selection-path acceptance failure; its underlying save boundary may predate the PR.

## Other results

- Real EXE, WebView2 and Rust IPC returned **25 + 7 distinct active selectable quotes**; the actual purchasing dropdown loaded all 32. A malformed UUID cursor was rejected during IPC deserialization, a syntactically valid unknown high UUID yielded an empty page, and a subsequent first-page query succeeded.
- Same supplier's XOF and USD quotes both appeared. Actual UI selected USD 1,234 minor units and SQLite stored USD 3,702 for quantity 3. An inactive price and a blacklisted supplier were absent from the selectable IPC results and UI list.
- Actual EXE IPC priced and formally issued a synthetic **pre-approved SQLite fixture**, then the fixture changed the catalog price from XOF 1,003 to 7. The issued JSON snapshot and XOF 1,003 total stayed identical. This tests the issue IPC and SQLite snapshot, not the preceding approval UI; see `snapshot-result.json` and `snapshot.mjs`.
- The new listing command requires an active account, an explicit project, an unexpired project grant and matching supplier country; the PR changes no server or shared sync files. A synthetic foreign-country supplier and price were inserted into the isolated SQLite profile: actual EXE IPC returned neither the foreign quote for the authorized project nor any quote for the ungranted foreign project. See `country.mjs` and `country-result.json`. This is not whole-system security acceptance.
- PR #18 CI `quality`: both checks successful; PR remains Draft. No application code, schema, production branch or production database changed.

## Test environment and limits

The prior isolated E-drive SQLite and debug EXE were reused, SHA-256 `a8be8bd9aa2d5cf8cb5f828b33e00711204bfaa59b34dc0d14ffe51041658195`; the debug EXE loads the candidate Vite frontend. Fresh profile seeding failed twice with Windows secure credential storage errors; the existing test account worked. First continuation attempt timed out because the test looked for the literal `USD`, while the UI correctly renders `US$`; attempt 1 is retained. Snapshot setup attempts 1 and 2 failed from SQLite locking and a driver argument name, respectively, before the successful run; they are retained. Synthetic SQL changes only affected this task's test database. Full T04, T10 and Linux deployment were not rerun.

Recommendation: repair and independently recheck the stale selection defect before final code review. PR #17 integration and independent security recheck remain separately required before release.
