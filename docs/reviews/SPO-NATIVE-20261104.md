# SPO native acceptance — 2026-11-04

Status: **BLOCKED_ENV**. No SPO native business assertion has run successfully. The current driver changes belong to this report's containing checkpoint, not the earlier `5d976fd` scaffold. That evidence/document SHA is not a tested application source SHA.

## Implemented driver, not executed acceptance

`tests/native/spo-formal-pull.mjs` and the `spo-formal-pull` mode of `tests/native/run-native-https-smoke.ps1` use two real EXEs, production Tauri IPC, HTTPS, independent test SQLite profiles and disposable PostgreSQL. The driver contains confirmed-parent allocation and saved supplier terms, HPA issuance, ordinary native UI login → procurement execution → terms save → SPO send, formal-number feedback, concurrent post-send retries rejected without another number, one server registry row, other-client Pull, frozen fields after catalog changes and restart. It also asserts draft has no number, incomplete-terms send leaves no number, and engineer send is denied.

These are implemented assertions, **not PASS results**. A subsequent unexecuted driver extension adds a second CNY child with concurrent initial sends (one succeeds, one is rejected), and a narrowly scoped test-server post-commit503 gate. The gate path derives from the server source module location, a validated run ID and fixed .honsen-native-qa filename; its contents must be a UUID matching an event in a validated array. It has no product route. The driver arms it before native UI send, asserts failed Push retains unacknowledged SQLite outbox rows, removes the gate and retries, then checks unique registry and cross-client convergence. The gate is removed in finally. These assertions remain unexecuted. Offline TCP disconnection, pre-commit rollback fault injection and amendment/cancellation/resend acceptance are not covered yet. Existing unit/DOM evidence does not replace them. No installation-package acceptance is claimed.

## Attempt and failure evidence

The intended command, with process-local `HONSEN_NATIVE_WEBVIEW_TEST=config`, was:

```powershell
& tests/native/run-native-https-smoke.ps1 -Mode spo-formal-pull -SkipBuild -ExistingDatabase `
  -NativeExe 'H:\Honsen\Honsen-Procure\.cache\cargo-target\debug\HonsenProcure.exe' `
  -NativeProfileExe 'H:\Honsen\Honsen-Procure\.cache\cargo-target\debug\honsen-procure-test-profile.exe'
```

The runner loads only the ignored disposable `.env.test`. No credential is included here. Execution used the current dirty integration tree; no final-candidate SHA or executable hash is asserted because it stopped before native launch.

1. Starting owned Compose project `honsen-spo-native-20261104` failed with `failed to bind host port 127.0.0.1:54329/tcp: address already in use`.
2. A keeper-backed startup reported the container Healthy, but the Windows runner immediately rejected `controller-owned test database is unavailable` at its localhost54329 reachability precondition. Local logs: `.cache/spo-compose.log`, `.cache/spo-compose-error.log`, `.cache/spo-native-first.log`.
3. A foreground WSL startup again failed binding54329. The container remained Created. These failures were not relabeled as business failures or PASS, and repeated startup attempts stopped.

Controller independent diagnosis identified Windows process `steamwebhelper.exe`, PID15436, holding54329 (Bound0.0.0.0 and Established127.0.0.1). WSL `ss` showed no corresponding listener. This explains the conflicting bind/reachability observations; it is not a proven Compose configuration drift. Full process command lines are deliberately excluded. The user-owned process was not stopped, and the prescribed test port was not changed.

## Validation and cleanup

`node --check tests/native/spo-formal-pull.mjs`, targeted Prettier check, PowerShell `Parser.ParseFile` and `git diff --check -- tests/native` all PASS. These validate executable harness structure only.

Only owned project `honsen-spo-native-20261104` was removed using the repository's Compose file and `down --volumes`; its container and network removal were confirmed. Owned Windows WSL keeper PID10520 was stopped. Other Agent containers, Steam, production services, real databases and COS objects were not modified. No COS credential was loaded or printed by this test.

Next action: after54329 is free, provision a fresh isolated database and run this mode at a stable committed source with corresponding rebuilt binaries. Record exact source SHA, EXE SHA-256, profiles, registry/payload results and UI evidence. Complete the missing negative scenarios before closing SPO acceptance. Preserve payment/COS/HPA evidence for its exact previously tested source; this report does not supersede it or close any parent release/security gate.
