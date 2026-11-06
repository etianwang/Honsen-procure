# Account wizard and independent content scrolling

Scope: user-selected four-step account creation design, name-based authorization selectors and a stationary navigation column. Existing T02/T04 account-management UX and confirmed shell scrolling defect; no new product workflow or authorization rule.

## Implementation

- Basic information and username existence check → roles → country/project/department/team → confirmation. Existing users cannot be recreated or have their passwords reset through this flow.
- Default avatar is presented visually; its internal reference is no longer editable or displayed. Passwords are excluded from the review summary and cleared on cancel, completion, failed operations or organization reload.
- Existing accounts are found by username. Grants, edits and revocations display real organization names, with no UUID entry fields or fallback UUID display.
- Existing trusted `pull_sync`, `list_reference_master_data` and `list_authorization_contexts` supply options. Ordinary administrators see only exact authorized project/department/team combinations; the server and Rust retain their independent enforcement. No fabricated departments or teams are added when reference data is empty.
- Upper-level changes clear downstream choices. Refresh failures and unconfirmed mutation results clear stale choices/readback and require a fresh query.
- The shell occupies the window height. Sidebar and main content have separate scrolling containers; the page header remains outside the content scroller. At narrow widths the existing compact navigation remains accessible above the independent content pane.

No API, SQLite/PostgreSQL schema, migration, synchronization payload, Toolbox identity/Runner/installer or uninstall contract changed. Previously read Toolbox integration gaps remain open and unchanged. No remote account/data operation, deployment or release publication occurred.

## Verification

Committed-lock `npm ci` restored the working dependencies before checks. Desktop typecheck, lint, 30 unit tests and production frontend build passed. Existing effect/chunk/advisory warnings remain nonblocking and unchanged. Independent code review confirmed name-based display, exact-scope filtering and stale-selection clearing. DOM and visual evidence are recorded after execution below; mocked IPC does not establish real remote account acceptance.

Status: local implementation and independent checks passed within the boundaries below. Original Alpha/security/Formal/release gates remain open.

- `npx playwright test tests/e2e/account-provisioning.spec.ts` selected wizard cases: 9 PASS, including three languages, actual named selectors, confirmation/back, existing-account no-reset, cancellation and empty reference data.
- Three separate real viewport regressions at 1280×800, 1024×768 and 760×768: content scroll position advances while navigation bounding box stays fixed; no body horizontal overflow. Initial screenshot viewport override in the test was corrected before this scoped run.
- Password/conflict/home follow-up target: 10 PASS; additional super-administrator guidance and saved-workbench visual checks: 3 PASS. Renderer tests use mock IPC, never real passwords or live account mutations.
- `cargo test --lib`: 165 PASS, 7 existing ignored; `cargo fmt --check` PASS. Ignored native/dialog/network probes do not establish installed acceptance. Targeted password-response regression: 5 PASS; initial fixture FK failure retained and corrected.
- Desktop lint/typecheck/unit30/production build and selected formatting/diff checks PASS. Existing effect, chunk and dependency warnings remain. Browser initial loading, strict-locator and incomplete sync-fixture failures were retained and corrected; Ant Design's new dialog mask deprecation was resolved using installed type guidance. No failed run was counted PASS.

Actual rendered basic/scope/home/conflict images were inspected. The duplicate step marker found in visual inspection was corrected. Logs and screenshots remain in ignored `.cache/` directories. No unrelated PostgreSQL/native/install suite was rerun because these UI/response boundaries do not change their implementation; those original acceptance gates remain open.

## Additional explicitly requested UI completeness

The user requested an accessible password-change entry, conflict/home styling and three alternatives for master-data appearance without feature loss. Password change is now reachable in the signed-in header and bootstrap recommendation, with current/new/confirmation fields, translations, online availability, specific safe errors and forced relogin after success. The first-login mandatory route remains. The hardcoded user-avatar initial was replaced by the actual username and built-in avatar.

Password change does not assign business roles or project scopes. The UI now separates bootstrap password advice from scope availability, describes the super-administrator governance role and bases approval capability on actual administrator/purchaser roles. It never automatically grants roles/scopes.

A confirmed Rust error-classification defect was repaired in `account_management.rs`: server `401 INVALID_LOGIN` for a wrong current password preserves the session, whereas unauthenticated session responses still invalidate it; account lock and success handling retain their protections. Five targeted actual HTTP-structure tests passed after retaining/fixing an initial fixture foreign-key failure. No TLS verification bypass was introduced.

Sync and category conflict controls retain their original handlers, resolution restrictions and audit behavior; only semantic layout classes were added. A confirmed contradictory-state defect was also repaired: partial/failed reads no longer claim there are no conflicts, failure preserves known records and a successful refresh clears the prior error. Home retains all saved-history, statistics, per-currency amount, refresh and navigation functions under the new styling. Master-data code is unchanged pending the user's selection among the three appearance alternatives.

## Diagnostic executable and checkpoint

Final VS18 Developer Release build succeeded (57.34s), embedding current frontend `index-Ybf1_jhZ.js` / `index-C_URFKrp.css` and current Rust password-response repair. Standalone path `.cache/remote-alpha-ui/HonsenProcure.exe`, SHA-256 `cb7c33fbd6f73402833195fe7a72210ff86643293c42d11b8643d2f30c9fd2a2`; build log `.cache/remote-alpha-b/build-ui-vs.log`. It was not launched, did not overwrite the user's running executable, and is not an installer or Alpha readiness proof. Application source corresponds to this report's containing task commit; no server source changed and no server ZIP repack is required for this UI-only server boundary.

BLOCKER: none for the bounded local UI/response repair acceptance. DEFERRED: user choice and implementation of the master-data appearance proposal, real remote account/business tests and all original installed/security/Formal/Toolbox release gates. WARNING: existing lint/build/advisory warnings, absent real organization records may prevent scope selection, and seven ignored native tests. Local tests cannot establish deployed-server behavior. No automatic parent milestone closure or Alpha publication.
