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
