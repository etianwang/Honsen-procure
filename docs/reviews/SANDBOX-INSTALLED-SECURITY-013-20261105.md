# Installed0.1.13 security acceptance — 2026-11-05

Exact candidate source: `21491c5f4ccfbb668425b302f9be6e0523e1d1df`, branch `codex/v1-resume-20261104`. Local test version0.1.13; no formal Release or production deployment. New package built from this frozen tree rather than relabeling the old012 artifact.

Installer: `.cache/cargo-release-21491c5/release/bundle/nsis/Honsen-Procure-0.1.13-Setup.exe`.

SHA-256: `19f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b` (independently recomputed by controller).

Actual installed main EXE SHA-256: `d9ab9881afe245086d4ac9b1fcbda4de87df8fcab02474ec127d098fc678522f`; installed Runner: `dfb9b313833b2af5cceac9f976c666f7097f6b5c16daa73b6f8bad5fad5481f2`.

## Environment precondition — PASS / CLOSED_ENV

`BLOCKED_ENV — USER_DISABLED_FOR_ACE` is closed only for Sandbox availability. Read-only feature query reports Containers-DisposableClientVM Enabled; WindowsSandbox.exe exists. After the user closed the earlier window and instructed us to open it, a new owned guest actually booted and returned WDAGUtilityAccount, Windows10.0.26100.0, machineF8C74B6B-ACBF-4 and UTC2026-11-04T23:32:18.4249232Z. Official CLI command execution also wrote an independent alive marker at local07:34:41. Owned environmentIDb0663e3a-99e2-4119-976a-545f172b95d0. Merely existing processes were not counted as successful startup. Raw proof is under `.cache/sandbox-start-20261105073206` (`host-feature.json`, `started.json`, `cli-alive.txt`). No Windows feature, BIOS, Hyper-V or UAC policy was changed by this task.

## Actual isolated offline guest results

- Fresh013 installation PASS in guest-only `C:\Honsen Security Synthetic\Honsen Procure`; installer exit0, exact Manifest/registry/main version0.1.13 and installed file hashes recorded. Host installation/registration was untouched.
- Installed Runner negative checks PASS: bad hash → hash-validation; wrong target → identity-validation; foreign PID → wait-process. Each rejected without main restart, installed-file or registration changes. `summary.json` and `runner-negative.json` are scoped negative evidence, not full application security.
- Real installed Release UI rejects an uncached account offline after username/password/correct local CAPTCHA; remains at login with no authenticated session. No debug CDP/test profile was substituted.
- Uninstall PASS for initialized empty actual SQLite: exit0, main and registration removed,688128-byte SQLite SHA-256 `634222435f2b53a22e5afb8480fbea30e045c4a6f3a9d28a81d17e465f41b6ad` unchanged. This is empty initialized database retention, not authenticated/history recovery acceptance.
- Actual baseline012 install → public registered Runner apply →013 PASS: from0.1.12 to0.1.13, real old/new main hashes and success result, initialized database bytes unchanged. The baseline is source05e84ccf78761a3c187d04fc59886f55e62ee5f3 with installer SHA-256 `747a66cfd4a760ad98d0c136a94410397ae148b814d5822b8797656000d286ea`. It was not started against the retained newer database; therefore this run does not prove0060/0061 migration. Raw `upgrade-012-013.json` preserves this explicit limitation.
- UAC cancellation NOT ACCEPTED: a synthetic normal Windows account was used to start an elevated installer, but this Sandbox went directly to NSIS without a UAC/credential prompt. Cancelling the installer wizard is not UAC cancellation. `uac-result.json` and read-only policy evidence are retained. No security setting was relaxed and no fake cancellation result was generated.

Installed online login/permission revocation and authenticated upgrade-data outcomes are recorded separately after actual execution. Sandbox availability never closes these gates automatically. Previously passed business chains were not rerun. No main branch modification, merge, production change or formal Release occurred.

## Online transport precondition — approval pending

The network guest172.18.187.218 cannot establish TCP to the actual host listener172.18.176.1:3444 on vEthernet(Default Switch); strict HTTPS times out. Host strict-CA request reaches the same isolated service successfully. No guest captcha/login request has reached the proxy and isolated account_sessions created/revoked counts remain0. Consequently installed online login, permissions revocation and authenticated-data migration are NOT RUN, not PASS or a proven product authentication defect.

A concrete least-scope temporary inbound-rule test was presented to the user: only source172.18.187.218, destination172.18.176.1, TCP3444, Default Switch interface and the current Node executable, removed after testing. This changes host firewall policy and is awaiting explicit user approval. No rule or TLS-validation bypass has been applied. The exact transport cause has not been assumed proven merely from a timeout.

Pending handoff: owned network guest1ca169f7-588e-469f-b784-215d1a8e2a35 and isolated backend remain available for the requested decision; backend details are kept only in ignored.cache/installed-auth-backend. They contain solely synthetic fixtures. On approval verify current guestIP/listener before applying the exact temporary rule; on denial clean only owned guest/backend/Compose project. No credentials or CA private keys are in committed evidence.

Detailed execution ledger: [WINDOWS-CANDIDATE-013-20261105.md](WINDOWS-CANDIDATE-013-20261105.md). Read-only database inspection confirms integrity_check ok,55 applied migration records with latest0061, accounts0/sessions0/orders0 for the retained empty initialized database. No historical-business preservation is inferred.
