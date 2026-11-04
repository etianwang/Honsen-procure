# HPA native independent acceptance — 2026-11-04

Status: HARNESS READY; native execution PENDING. Source base: 28b32c6, with controller to commit a unified candidate before building and executing.

## Scope

HPA implementation is now integrated. This slice adds tests/native/hpa-formal-pull.mjs and the hpa-formal-pull mode in tests/native/run-native-https-smoke.ps1. It reuses existing native HTTPS server, synthetic scope/account bootstrap and real Tauri IPC. No business code, schema, migration, dependency, installer contract or production data changes are made. Toolbox contract preflight is not applicable to this test-only change.

The new driver launches two copies of the actual EXE with distinct profile paths, installation IDs and WebView folders. An engineer creates/submits a Honsen draft; a distinct purchaser confirms and signs HPA. The driver checks pending outbox before acknowledgement, production Push and empty repeated Push, real serialized HTTPS Pull response, full frozen approved snapshot bytes, ordinary integer price fields and absence of owner markup. It changes the current catalog price, then checks frozen order preservation; receiver restart and repeat Pull must preserve rows, cursor, outbox/conflicts and formal number. SQLite is opened read-only for evidence. No formal business events or HTTP response pages are fabricated. Synthetic scope/code alignment writes are restricted to the disposable test PostgreSQL fixture.

Report captures actual Git HEAD/dirty status, EXE SHA256 hashes, distinct installation IDs, process IDs, command outcomes, actual consumer response and restart/replay assertions. This remains a same-Windows-host two-installation test; it does not establish physical two-Windows-machine acceptance or a disconnected transport test.

## Execution handoff

After controller commits the unified candidate and builds it once, run:

```powershell
pwsh -NoProfile -File tests/native/run-native-https-smoke.ps1 -Mode hpa-formal-pull -SkipBuild -NativeExe <absolute-candidate-HonsenProcure.exe> -NativeProfileExe <absolute-candidate-honsen-procure-test-profile.exe> -ExistingDatabase
```

Use repository-local .env.test containing only disposable test credentials. Runner creates per-run profiles and artifacts below .honsen-native-qa, logs below test-results, isolated Compose PostgreSQL, temporary localhost HTTPS certificate and generated passwords. Existing cleanup removes its Compose project/volumes and temporary private certificate material. Native EXE paths are explicit so controller's .cache/cargo-target outputs can be used without rebuilding or assuming an old E drive.

## Verification and limitations

- Node syntax check: PASS.
- PowerShell AST parse: PASS.
- Targeted JavaScript Prettier: PASS.
- git diff --check: PASS.
- No Cargo or native test run by this agent; controller owns final SHA build and execution.
- Read-only WSL inspection found Ubuntu-24.04 default root and no rootroot or honsen-dev passwd entry. Runner requires an explicit normal WSL user only when it owns Compose. ExistingDatabase skips WSL startup/cleanup entirely and requires the controller-owned test service at 127.0.0.1:54329. No account/default-user/group setting was modified.

Remaining issues:

- BLOCKER for native acceptance: execute final committed candidate binaries with controller-owned disposable PostgreSQL via ExistingDatabase; until then this harness is not runtime proof.
- DEFERRED: physical two-Windows HPA/OPA, SPO implementation/acceptance, PDF/Excel, full language coverage and original release/security gates. Those are excluded from this single slice.
- WARNING: the earlier baseline-missing-HPA blocker was resolved by integration; the older PR20 CI failure was already superseded by successful CI. Neither warrants repeat implementation.

## First real execution — native-smoke-20261104004826

Executed runner with ExistingDatabase, SkipBuild and explicit .cache/cargo-target/debug EXE/profile paths; no rebuild. Source HEAD was 04a55bac0166ffb04f5b05848a383edd0491933a; controller identifies the debug binary build as 3277b2f with only subsequent test/install changes. Both copied EXEs have SHA256 bb2e9686711408acfb7dd5e9b0fd25d1ebfb9348626f936fca72ef3f4cf5e913. Dirty source was an unrelated preparation document, recorded by the driver.

Result: FAIL, runner exit 1. Both isolated profiles seeded successfully with different installation IDs. First EXE PID6924 launched, but its 9241 CDP /json/version endpoint did not become ready within 30 seconds. Command calls are empty: no login, HPA mutation or Push/Pull occurred. The shared server log showed localhost HTTPS listening and server stderr was empty. This does not establish a product HPA defect or any business acceptance.

Evidence retained in .honsen-native-qa/native-smoke-20261104004826.test.json and test-results/native-smoke-20261104004826-client.log. Runner finally stopped its server and driver-owned child processes; post-run 3443/1420/9241 had no listeners. ExistingDatabase was left controller-owned. Added bounded per-EXE stdout/stderr and exit/spawn diagnostics for the next run; syntax and formatting checks passed. Coordinate the next attempt with Agent A because its separate native chain showed the same CDP readiness failure; do not run simultaneous servers/drivers.
