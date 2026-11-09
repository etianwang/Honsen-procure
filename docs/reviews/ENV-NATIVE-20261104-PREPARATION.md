# Native chain preparation — 2026-11-04

Source preparation baseline: 28b32c6792490fbdd9179845838c34646b14ee3b. No application code change.

The explicitly supplied cos.txt was readable and contained four nonempty required fields. Only names/completeness and nonsecret region/bucket were inspected for reporting. No credential values were printed or copied to Sandbox. Main controller confirmed user authorization for this run only: eu-frankfurt / honsen-materials-1308426049 / honsen-procure-tests/<fresh random UUID>/. Only run-owned new objects may be uploaded/read/deleted; historical objects remain out of scope. No COS network operation was performed during preparation.

Runner compatibility change: optional WslDistribution and WslUser parameters replace hardcoded distribution/user in path conversion, Compose startup and teardown, preserving previous defaults. COS configuration parsing accepts surrounding whitespace and quotes, rejects duplicate/missing/empty required fields without exposing values, loads only the four permitted fields into the process environment, then clears the temporary map. Original runner backed up under .cache/native-compat-backup-20261104 before editing.

Validation: PowerShell Parser.ParseFile returned no errors; node --check tests/native/t09-t11-chain.mjs exited 0. These are syntax checks only. No native-chain acceptance is claimed.

Next: wait for all task-owned code to enter the unified candidate, build matching native application/profile-tool and frontend, then execute isolated PostgreSQL/HTTPS/dual-client/COS chain and retain exact SHA, executable hashes and owned-prefix cleanup evidence. Set explicit WSL distribution/user or use a verified isolated ExistingDatabase. No Cargo was run during this preparation.

## Actual dual-native attempt

Reported source SHA: 3277b2f657e48e82e3cb7466c2f9a80516638c38. EXE SHA-256: bb2e9686711408acfb7dd5e9b0fd25d1ebfb9348626f936fca72ef3f4cf5e913. Later controller commits were not substituted into the recorded SHA.

Command: pwsh -NoProfile -File tests/native/run-t09-t11-chain.ps1 -ResourceRoot H:/Honsen/Honsen-Procure/.cache -CosEnvFile <explicit authorized local configuration> -ExistingDatabase -NativeExe H:/Honsen/Honsen-Procure/.cache/cargo-target/debug/HonsenProcure.exe

The controller-owned honsen-native-final-20261104 PostgreSQL container was healthy before launch, bound to 127.0.0.1:54329; direct postgres --version returned PostgreSQL 16.15.

Result: FAIL, exit 1, phase fixture. Profile seeding recorded zero errors, but the first native launch did not expose its CDP readiness URL within 45 seconds (ready at t09-t11-chain.mjs:109, launch:146). No online-login, payment, reversal or attachment acceptance was reached. This does not reproduce the historical credential_storage_error and does not establish its root cause.

Evidence directory: .cache/native-20261104004618. Cleanup reported PASS, objects=0. No 3443/1420 listener or HonsenProcure process remained after runner cleanup. Shared disposable database was retained for the controller and next sequential test. No production installation or database operation occurred.

BLOCKER: native application startup/CDP readiness requires diagnosis before dual-client business acceptance. Preserve this failed attempt as evidence.

## Fresh-profile diagnosis and independent authorized COS evidence

A second controlled startup used a fresh UUID-named WebView data directory. Dedicated PID 22116 remained alive; its WebView child processes all included the exact expected user-data path, but none included remote-debugging-port. Port 9251 remained closed. HKCU/HKLM Edge RemoteDebuggingAllowed was unset. This rules out simple stale-profile reuse and complete loss of environment inheritance; the specific debug-argument boundary remains unresolved. PID 27244 and the later dedicated PID were stopped. No security policy was modified.

Independent COS connectivity test at HEAD 66974691b20a048faa618fcf51680db485db0468: existing cos-live.test.ts selected only the upload/inspect/download/hash/denial/cleanup test. Exit 0, 1 passed / 1 skipped (expired-URL scenario deliberately not selected). Scope was checked against the explicitly authorized eu-frankfurt / honsen-materials-1308426049 before loading credentials into process environment; environment variables were removed in finally.

Owned key: honsen-procure-tests/7df7e445-0581-4896-9fd7-b3513698b182/1353c397-d94c-4eef-b4c9-eab64f228458.pdf. Synthetic PDF: 63 bytes. PUT 200, HEAD size 63, GET 200, SHA-256 match true, invalid signature denied 403, owned-object DELETE 204. Safe evidence .cache/cos-independent-20261104.json. No bucket listing or historical object operation was performed.

COS connectivity PASS does not satisfy installed dual-client payment/COS business acceptance, which remains blocked by the CDP launch boundary. No release or production deployment occurred.

## Final minimal CDP probe — stop repeated repairs

Fresh unique userdata, only WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9251 (remote-debugging-address omitted); HONSEN_PROCURE_NATIVE_SMOKE explicitly removed. Dedicated PID 9608 alive, 6 WebView children, expected userdata present=true, debug argument present=false, port listening=false. The dedicated parent was stopped in finally. No policy/product code was changed to force CDP. Three controlled diagnostic variants now retain consistent evidence; stop repeated environment repair attempts. Root cause remains unproven beyond the missing WebView debug argument. Safe per-run summary exists under .cache/native-portonly-*/summary.json.

Agent A completion: isolated Windows credential probe PASS; Rust payment conflict 3/3 and HPA 2/2 previously PASS; full Rust fixture repair subsequently yielded 123/123; independent authorized COS PUT/GET/hash/cleanup PASS. Actual dual-native attempt FAIL at fixture/CDP readiness, before online login or financial actions. Parent acceptance and release readiness remain open. Next safe action is a separately approved supported native harness/driver investigation or an isolated guest comparison, preserving these exact failures. No more repeated CDP retries in this task.
