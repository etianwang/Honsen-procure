# OPA-2 Desktop Manual Smoke

Status: **not executed in this checkpoint**. This is a true Tauri-desktop acceptance checklist, not a substitute for Playwright DOM or Rust/SQLite integration tests.

Use only an isolated local SQLite profile and synthetic master data: one active material with an active CNY catalog price and directed CNY-to-XOF rate, an engineer account, and a different purchaser or administrator account. Do not use production data or accounts.

## Desktop test-profile setup

The normal desktop profile stores mutable data only in `%LOCALAPPDATA%\\Honsen Program\\honsen.procure`. Do not seed it. Use an absolute path ending in `.test.sqlite`, for example `$PWD\\.honsen-test\\honsen.procure.test.sqlite`.

In PowerShell, provide three non-production passwords through the current process only, seed the isolated profile, then launch the desktop host:

```powershell
$env:HONSEN_PROCURE_TEST_DB_PATH = "$PWD\\.honsen-test\\honsen.procure.test.sqlite"
$env:HONSEN_TEST_ENGINEER_A_PASSWORD = "choose-a-test-password"
$env:HONSEN_TEST_ENGINEER_B_PASSWORD = "choose-a-different-test-password"
$env:HONSEN_TEST_PURCHASER_PASSWORD = "choose-a-third-test-password"
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin honsen-procure-test-profile -- seed
$env:HONSEN_PROCURE_PROFILE = "test"
npm run desktop:dev --workspace @honsen/desktop
```

The command creates only `engineer-a`, `engineer-b` and `purchaser`, plus synthetic OPA catalog/rate master data. Each login still uses the normal password/CAPTCHA command and Rust authorization. To clean this exact test profile and its separate verifier entries after closing the app, run `cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin honsen-procure-test-profile -- clean` with only `HONSEN_PROCURE_TEST_DB_PATH` set.

For a named-role desktop smoke, optionally set `HONSEN_TEST_NAMED_PASSWORD` in the current process before `seed`. This adds `test-en` (engineer), `test-pr` (purchaser), and `test-ad` (administrator) to the same isolated profile and synthetic project; no password is written to the repository or SQLite. Keep the standard CAPTCHA. The test-only named password may be eight characters; normal account provisioning rules are unchanged. `clean` also removes their test-only OS verifier entries.

1. Launch the desktop application and sign in as the engineer through the real password/CAPTCHA flow.
2. Open the normal procurement-application workspace. Create an owner-self-purchase draft, select the fixture material and explicitly select its catalog quote. Confirm no quote is selected before this action.
3. Enter the locked CNY-to-XOF rate and a percentage markup. Save, verify converted and final prices, then submit. Record the visible pending status.
4. Lock/sign out, then sign in as the purchaser/administrator through the real flow. Open the same application from the normal order list/detail route. Verify the internal approval display shows catalog source, supplier, source price/currency, rate, converted reference, markup, final price, actor/time and audit snapshot. Reject with a reason.
5. Lock/sign out and sign in again as the engineer. Verify the rejection message, modify the markup, enter a price-revision reason, save and submit again. Verify the pending status and the revision reason/diff in internal audit history.
6. In a second engineer session, attempt to open or mutate the first engineer's draft. Verify the trusted command rejects it and no success message appears.
7. Start a new synthetic owner draft, make the trusted pricing call fail with an invalid/missing directed rate, and verify the UI reports partial save and blocks successful submission. Correct the rate, save and submit once; verify there is only one order after reopening the list.
8. Create a manual-reference line. Verify the red warning is visible, submission/save fails without a reason, and the audit shows its reason after a valid save.

Record the desktop build/version, OS, test profile location, operator, each observed result, and any console/host errors. Do not record passwords, CAPTCHA values, tokens, supplier contact data or production identifiers.
