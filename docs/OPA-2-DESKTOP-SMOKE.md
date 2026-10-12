# OPA-2 Desktop Manual Smoke

Status: **not executed in this checkpoint**. This is a true Tauri-desktop acceptance checklist, not a substitute for Playwright DOM or Rust/SQLite integration tests.

Use only an isolated local SQLite profile and synthetic master data: one active material with an active CNY catalog price and directed CNY-to-XOF rate, an engineer account, and a different purchaser or administrator account. Do not use production data or accounts.

1. Launch the desktop application and sign in as the engineer through the real password/CAPTCHA flow.
2. Open the normal procurement-application workspace. Create an owner-self-purchase draft, select the fixture material and explicitly select its catalog quote. Confirm no quote is selected before this action.
3. Enter the locked CNY-to-XOF rate and a percentage markup. Save, verify converted and final prices, then submit. Record the visible pending status.
4. Lock/sign out, then sign in as the purchaser/administrator through the real flow. Open the same application from the normal order list/detail route. Verify the internal approval display shows catalog source, supplier, source price/currency, rate, converted reference, markup, final price, actor/time and audit snapshot. Reject with a reason.
5. Lock/sign out and sign in again as the engineer. Verify the rejection message, modify the markup, enter a price-revision reason, save and submit again. Verify the pending status and the revision reason/diff in internal audit history.
6. In a second engineer session, attempt to open or mutate the first engineer's draft. Verify the trusted command rejects it and no success message appears.
7. Start a new synthetic owner draft, make the trusted pricing call fail with an invalid/missing directed rate, and verify the UI reports partial save and blocks successful submission. Correct the rate, save and submit once; verify there is only one order after reopening the list.
8. Create a manual-reference line. Verify the red warning is visible, submission/save fails without a reason, and the audit shows its reason after a valid save.

Record the desktop build/version, OS, test profile location, operator, each observed result, and any console/host errors. Do not record passwords, CAPTCHA values, tokens, supplier contact data or production identifiers.
