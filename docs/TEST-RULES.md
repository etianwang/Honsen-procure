# TEST-RULES — Mandatory Quality Gates

## Test pyramid

- Unit: pricing, quantity rounding, order totals, validation, search normalization, sync state machine.
- Integration: SQLite migrations, transactional outbox, Fastify API + test PostgreSQL, idempotency and optimistic concurrency.
- Desktop E2E: Tauri commands, catalog editing lock, ordering, print preview, offline/online transitions.
- Manual: Windows installer, A4 printer, French accents, long names, multi-page PDFs, unplugged network.

## Required acceptance cases

| ID  | Scenario                                    | Expected                                                                                                                                            |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 | Launch app offline                          | Home opens, catalog searchable                                                                                                                      |
| T02 | Add item with qty 2.5                       | Exact rounded amount per configured decimal rules                                                                                                   |
| T03 | Admin backend without password              | Mutation denied at trusted command boundary                                                                                                         |
| T04 | Wrong admin password                        | Denied, rate limited                                                                                                                                |
| T05 | Save material offline                       | SQLite and outbox commit atomically                                                                                                                 |
| T06 | Cloud unreachable                           | Order still saved and printable; pending sync shown                                                                                                 |
| T07 | Repeated push same event                    | One server mutation only                                                                                                                            |
| T08 | Restart mid-sync                            | No lost changes; safe retry                                                                                                                         |
| T09 | Two devices edit same price                 | Conflict surfaced, no silent overwrite                                                                                                              |
| T10 | Delete material used by order               | Old order still reprints correctly                                                                                                                  |
| T11 | Change supplier contact later               | Old confirmed order keeps original snapshot                                                                                                         |
| T12 | Confirm empty order                         | Blocked                                                                                                                                             |
| T13 | Mixed currency in one order                 | Blocked or split by currency                                                                                                                        |
| T14 | Multi-page PDF                              | Headers repeat, totals correct, no clipped text                                                                                                     |
| T15 | Cloud pull with pagination                  | Cursor only advances after durable apply                                                                                                            |
| T16 | Account disabled or session revoked         | Server rejects sync; local data remains accessible                                                                                                  |
| T17 | Restore backup / migrate schema             | No data loss, schema version consistent                                                                                                             |
| T18 | Two offline formal issues                   | Distinct UUIDs and locally transactionally allocated formal numbers; server registers them without renumbering                                      |
| T19 | Owner line quote selection                  | No first quote is auto-selected; catalog base/final price cannot be edited; explicit manual source needs red warning and non-empty reason           |
| T20 | Server changes after initial sync           | Desktop downloads incrementally                                                                                                                     |
| T26 | Login while offline within 24 hours         | Previously verified enabled user can sign in with local CAPTCHA; no cloud request is required                                                       |
| T27 | Sixth invalid password                      | Account is locked for 15 minutes; administrator unlock is audited                                                                                   |
| T28 | Second online login                         | First device is forced to lock on next authenticated request; an offline device locks when it reconnects                                            |
| T29 | Engineer changes other-project order        | Rejected by trusted boundary and server                                                                                                             |
| T30 | Purchaser modifies approved, unissued order | Reason, version and red field diff are stored; applicant can view them                                                                              |
| T31 | Formally issued supplier order modification | Direct edit rejected; a linked cancellation/revision is required                                                                                    |
| T32 | WebSocket hint missed                       | Cursor Pull on reconnect retrieves all changes correctly                                                                                            |
| T33 | Parent has several child currencies         | Parent locked-rate total and source-currency child totals are exact                                                                                 |
| T34 | Partial receipt/over-receipt                | Cumulative quantities are exact; over-receipt needs reason; completion state follows receipt rules                                                  |
| T35 | Closed order retention                      | All roles are denied edit/delete; audit/PDF/attachments remain retrievable                                                                          |
| T36 | Default self-approval policy                | Purchaser/admin cannot confirm their own order; a different purchaser/admin can                                                                     |
| T37 | Super-admin policy enablement               | Only a super administrator can enable self-approval with a reason; audit is permanent and self-approved orders are marked                           |
| T38 | Super-admin safety                          | Attempt to stop/remove either of the final two enabled super administrators is denied                                                               |
| T39 | Super-admin mobile tail                     | Tail is shown only as a recognition cue and cannot authenticate, reset a password or authorize an action                                            |
| T40 | Optional TOTP                               | User without TOTP uses password/CAPTCHA; an enrolled user is denied without a valid current code online and offline                                 |
| T41 | TOTP reset                                  | Authorized reset/disable is audited; secret is never exposed in UI, API, logs or SQLite business data                                               |
| T42 | UI localization                             | Every supported screen renders complete Chinese, French and English message catalogs; language change preserves current route and unsaved form data |
| T43 | Localized finance/print values              | Date, number and currency formatting follow the selected UI locale while stored money and the order's print-language snapshot remain unchanged      |
| T44 | Exclusive owner markup                      | Percentage uses a non-null rate/null fixed amount; fixed uses non-null fixed amount/null rate; Rust-calculated final price is exact                 |
| T45 | Offline issue after quote revocation        | Valid local snapshot issues offline; later server price revoke/change leaves number/source/markup/final price unchanged and audits discrepancy      |
| T46 | Formal-number clone/collision               | Reused installation UUID/sequence or duplicate readable number becomes an auditable conflict; original records remain and no replacement is issued  |
| T47 | Owner formal print                          | Offline owner print shows only owner-facing final price/total and never supplier/base cost/markup/manual reason                                     |
| T48 | Honsen market payment                       | Multiple offline payments can use a free-text payee; receipt remains independent; missing voucher is warned and outbox sync is idempotent           |
| T49 | Owner payment prohibition                   | Trusted boundary rejects payment record for owner-self-purchase                                                                                     |
| T50 | Payment correction                          | Submitted payment is not overwritten; reversal/replacement and audit reason remain visible                                                          |
| T21 | Re-run installation for same appId          | Installer finds HKLM/HKCU and 32/64-bit registration and refuses a second instance                                                                  |
| T22 | Toolbox opens the application               | Registered Runner receives `launch --app-id ... --source toolbox` and starts only the registered EXE                                                |
| T23 | Toolbox update hash or target mismatch      | Runner fails, writes an operation-specific result JSON and does not restart the application                                                         |
| T24 | Uninstall application                       | Only this application files and registration are removed; user data and sibling applications remain                                                 |
| T25 | Registry lost after OS recovery             | User-selected valid install directory restores HKCU registration; no disk scan occurs                                                               |

## Execution rules

- Every code task must include a reproducible Playwright DOM interaction test: load the affected route, act through accessible controls, assert the visible result and record browser-console output. A manual click-through does not replace this gate.
- Every bug fix must add a regression test.
- Every migration must be tested against a copy of the previous schema.
- Every sync change needs failure injection: timeouts, duplicate delivery, reordered responses, partial batch rejection.
- Formal-number work additionally tests concurrent local issue, restored database, intentional clone/re-key, duplicate full number, reused installation sequence and server restart after commit. Payment work additionally tests multiple payments, owner-mode denial, missing voucher, append-only correction and independent receipt/payment synchronization.
- Installer/update changes require the Windows and toolbox acceptance cases in `HONSEN_TOOLBOX_INTEGRATION.md`; record the actual OS, installer and result for each release candidate.
- CI gates: formatting, lint, TypeScript strict typecheck, unit tests, API integration tests, production build.
- Do not use real supplier contact data or real production credentials in test fixtures.
- Never report tests passed unless actually executed; document skipped tests explicitly.

## Release checklist

[ ] All critical tests pass
[ ] Offline create/edit/order/print verified
[ ] Sync idempotency and conflicts verified
[ ] PDF snapshot integrity verified
[ ] Admin lock enforced outside React
[ ] Windows installation/update/uninstall verified
[ ] Database backup and rollback plan documented
[ ] No credentials in repo or packaged frontend
