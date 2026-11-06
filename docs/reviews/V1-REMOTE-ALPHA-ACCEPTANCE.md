# V1 Remote Alpha acceptance — 2026-11-06

Decision: **ALPHA_INTERNAL_TEST_BLOCKED**. Bounded local repairs do not establish remote or production acceptance.

## Candidate identity

- Starting client source: `cc59672395afeb60124b77532754b8821d01eee4`.
- Task branch: `codex/v1-remote-alpha-20261106`; fetched `origin/main` at `5139cc8f7d5a70cddb80b3ce5665100a316c9656`, which is an ancestor of the candidate.
- Only authorized API: `https://api-pr.honsen.africa/v1`.
- Server source SHA, deployed migration checksums and shared contract digest: NOT VERIFIED. Public build-manifest endpoint returned 404; deployment manifest is required from the operator. No server configuration or database was changed.
- Installer version/hash and Prerelease URL: NOT PRODUCED.
- A concurrent deployment-document-only checkpoint `1ec5ab5ebe72135a2f7fad9550d374166dd4e5b0` advanced HEAD during work; it is preserved. No application acceptance was transferred from that documentation change.

## Remote observations

- Actual HTTPS `/api/auth/captcha`: 200. This proves reachability only.
- Unauthenticated `/api/authorization/context`: 500 instead of 401. No business access was obtained.
- Account creation/list/role-assignment endpoints are absent in the starting source. Bootstrap/super-administrator provisioning is not a substitute for the requested normal account workflow.
- Neither requested account has been created or reset. Their existence is not yet verified through an authorized administrator session. No passwords are recorded here.
- Roles support additive administrator/purchaser and the separate engineer role. Existing bindings require project, department and team.
- An existing governance operator must authorize privileged role assignment; target accounts must not be made super administrators.

## Execution ledger

| Gate                                               | Current result          | Evidence / limitation                                                                                    |
| -------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Workspace lint / typecheck / production build      | PASS at starting source | `.cache/remote-alpha-c/`; not evidence for subsequent code changes                                       |
| Desktop unit                                       | PASS at starting source | 9 files, 30 tests                                                                                        |
| Rust lib                                           | FAIL at starting source | 158 pass, 1 fail, 7 ignored; Windows OS5 rename after dropping directory guard at `update_launch.rs:449` |
| Rust failed-test independent retry                 | PASS, scoped            | One test only; original full-suite failure retained; root cause unresolved                               |
| PostgreSQL integration for new repair              | PASS locally            | Full server 221 pass / 3 opt-in live COS skip; `.cache/remote-alpha-c/server-pg-accepted.log`, exit 0    |
| Remote admin / requested-account login             | NOT RUN                 | Protected administrator entry and supported account workflow required                                    |
| Remote two-client requests / full procurement      | NOT RUN                 | Requires matching deployed candidate and accounts                                                        |
| Remote authorization / revocation / old Outbox     | NOT RUN                 | No acceptance transferred from historical local evidence                                                 |
| COS / SHA-256 / PDF / printing / Excel / languages | NOT RUN remotely        | Historical evidence is not current remote acceptance                                                     |
| Installed login / offline reconnect / history      | NOT RUN                 | No current installed candidate accepted                                                                  |
| Fresh install / upgrade / uninstall retention      | NOT RUN                 | Historical package evidence is SHA/environment scoped                                                    |
| Toolbox update                                     | NOT RUN                 | Existing cross-repository caller differences remain open                                                 |

Latest changed-boundary local results supersede the starting-source results only for these local checks: server lint/typecheck/build PASS; full fresh PostgreSQL server suite 221 PASS / 3 COS SKIP (`server-avatar-final.log`); Rust lib 164 PASS / 7 existing ignored (`rust-final-repaired.log`); desktop typecheck/lint/unit 30 PASS; renderer DOM 5 PASS including first-login business-effect refusal, existing-account protection, and Chinese/English/French default-avatar account creation with password-field clearing. DOM uses mocked IPC, not remote authentication. Browser pageerror/console error capture was empty in the final run. Original fixture/locator/trace-race and Rust failures remain retained in ignored local evidence, not relabelled PASS.

The first Rust repair run retained two HPA/SPO rejection-error mismatches. The trusted gate now returns the established `Forbidden` error for incomplete/disabled accounts while retaining rejection. The repeated Windows OS5 directory test failure has no proven external root cause: a test-only bounded two-second sharing retry was added after dropping the guard, while the immediate held-lock refusal assertion is unchanged. No Runner production contract changed. Full Rust subsequently passed. Seven ignored native/dialog/network probes do not establish installed or remote acceptance.

Existing native drivers directly mutate their disposable PostgreSQL fixtures and depend on local seed accounts. They were not run against Staging. A remote driver must use normal HTTPS and trusted Tauri business operations with separate client profiles. One online session per account requires different accounts on the two clients; default no-self-approval policy remains enforced.

## Remaining issues

- BLOCKER: use a protected administrator session and deploy a verified matching account-workflow repair through an authorized deployment workflow before remote account creation. The user will enter the admin password once in the normal Windows login interface; no further password requests or guesses are permitted.
- BLOCKER: all critical remote, installed security, financial/snapshot/sync and data-retention gates above remain unaccepted.
- DEFERRED: Alpha asset, SHA256SUMS, release notes, private account instructions, feedback channel and Prerelease creation until required gates pass.
- WARNING: upstream Manifest requires numeric versions; an Alpha suffix cannot be silently inserted into its version field. Preserve identity, stable update URL and existing public contracts.
- WARNING: concurrent deployment README mirror edits were independently committed as `1ec5ab5`; they are preserved, outside this repair's acceptance scope.

## Bounded local repair

New authenticated `/api/accounts` exact-username lookup and creation use the existing schema and runtime grants, with no migration. A super-administrator operator may assign administrator/purchaser roles, but the target cannot be a super administrator. Ordinary administrators can create engineer/viewer accounts only within their own exact scope. Argon2id password hashing, account/role/project/scope/audit creation are transactional; duplicate usernames return 409 without password reset.

The old authorization endpoints now reject ordinary-administrator self-expansion, privileged targets and cross-scope access. Ordinary first-login sessions are restricted to password change; the bootstrap exception remains unchanged. Desktop account-management commands use the existing online session vault and HTTPS; the renderer never receives its token. First-login UI blocks business effects, and trusted Rust role/conflict checks reject incomplete accounts. Successful password change invalidates the previous local offline-login window and locks the session.

Independent PostgreSQL coverage used a restricted runtime role and the actual production API composition: CAPTCHA login, first-login 403, password change, old-token 401, new-password login and scope readback; duplicate-password preservation, unauthorized roles/scopes, revoked-scope read/create rejection, audit-write failure rollback and safe retry. Concurrent revocation during account creation remains NOT RUN. The first full server run retained a failure in an obsolete self-grant fixture; the fixture now first asserts refusal before using an explicit governance operator. Latest complete suite passed. Three live COS tests were skipped because opt-in live configuration was absent; these skips leave COS remote acceptance open.

Owned Compose project `honsen-remote-alpha-c` ran in WSL Ubuntu-24.04 as `honsen-dev`; `down --volumes` exited 0 and project containers/volumes were verified absent. Existing unrelated containers and ignored `.env.test` were preserved. No Staging data or configuration was modified.

No Alpha installer is currently approved for company testing. Original T00–T15 and M0–M4 gates remain unchanged.

## User steering and zero-configuration policy

The user explicitly approved a generated default avatar for these Alpha accounts. The built-in SVG uses `builtin:default-avatar:v1`; the server accepts this supported reference and rejects empty/unknown references. It is a default avatar, not a COS employee-photo upload. The missing employee-photo upload lifecycle remains DEFERRED and does not block this explicitly approved default-avatar path.

Employee release builds use only `https://api-pr.honsen.africa/v1`, ignoring runtime endpoint overrides. Debug/test builds or the explicit `isolated-api-override` compilation feature may use validated HTTPS overrides. The normal release pipeline does not enable that feature. Release startup ignores test-profile/database/native-smoke environment variables, creates its standard local directory and SQLite database automatically, and shows the login screen without server/database/COS setup fields. Actual installed first-start/login proof is still NOT RUN.

Build manifests are developer acceptance evidence, never employee login requirements. The latest locally delivered ZIP is candidate information only: source `1ec5ab5ebe72135a2f7fad9550d374166dd4e5b0`, ZIP SHA-256 `0b65b95bb9e523cef6f17819c92d453cebbf4b0a201ab1598beb1a0ab1ae5980`, 17 migrations/latest `014_master_data_currencies.sql`, with the authorized API base. This does not prove the running server's identity. No unsafe public management endpoint was added. If exact identity is needed, the operator can run this single read-only command in the deployed directory (no credentials or environment values are printed):

```sh
node -e "const m=require('/www/wwwroot/api-pr/v1/build-manifest.json');console.log(JSON.stringify({sourceSha:m.sourceSha,apiContract:m.apiContract,latestMigration:m.latestMigration,migrations:m.migrations},null,2))"
```

Unknown running identity remains explicit; candidate compatibility must additionally be demonstrated by real HTTPS business results. No employee is asked to supply a manifest or technical configuration.

## Initial interactive login attempt — failed preparation

At the user's request to test the admin password, the coordinator opened the existing `.cache/cargo-target/release/HonsenProcure.exe` before verifying its age. The user reported the online-login button was disabled. Subsequent inspection found this executable was dated 2026-11-04, SHA-256 `5b4849f06608829b35312b942c5292c8e64dc02eb63abd3541e78252e927c84a`, and did not establish current fixed-API behavior. This was an invalid candidate selection, not proof of password failure or remote login. The user was told to stop entering credentials; the old window was subsequently absent. No password was requested, read, logged or guessed by the agents. A current-source client must replace this interactive attempt before any login acceptance. Cloud CAPTCHA transport errors also need explicit visible feedback rather than a silently disabled online button.

The current-source standalone Release executable was subsequently built successfully in the installed VS18 Developer environment using `tauri/custom-protocol` (latest frontend embedded), without `isolated-api-override`. Path `.cache/remote-alpha-login/HonsenProcure.exe`, SHA-256 `0828865d2cfdddff45df7fba7e044dc7f186a7a14948658d7a2d6e1985048821`. This is a manual interactive diagnostic executable, not an installer or an accepted Alpha distribution. It was opened for the user to enter the admin password/CAPTCHAs themselves; login result remains pending. Initial Release check failed under an uninitialized MSVC environment; the same source passed after using the already-installed VsDevCmd, with no new tool installation/security changes. Current login UI now reports cloud CAPTCHA transport failure and offers retry in all three languages.

The additional `cloud-captcha-retry.spec.ts` renderer regression passed 1/1 with an explicitly ready Vite server: failure shows a message and disables online login; retry restores a cloud challenge; entering its answer enables the button. No login or password input was automated. Two preceding page-load timeout runs are retained. Final desktop typecheck/lint/unit30/build/format passed after this change. Login/CAPTCHA handoff remains user-controlled.
