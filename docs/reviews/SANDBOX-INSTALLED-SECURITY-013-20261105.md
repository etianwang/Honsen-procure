> Current layered clarification: a fresh Networking Enable guest independently passed publicTCP. Its hostAPI TCP block was diagnosed with actual WFP receive events and same-guest alias/physical Node path controls; the exact physical-image exception passed and was removed. Strict guestHTTPS/installed login have not run because a subsequent automatic approval review rejected the CA/install operation. Previous guest187 transport failures below remain historical, not evidence of globally offline Sandbox. See [layered diagnosis](SANDBOX-API-LAYER-20261105.md).

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

Installed online login/permission revocation and authenticated upgrade-data scenarios were not executed because their transport prerequisite remained blocked. Sandbox availability never closes these gates automatically. Previously passed business chains were not rerun. No main branch modification, merge, production change or formal Release occurred.

## Online transport precondition — approved exact rule did not restore connectivity

The network guest172.18.187.218 cannot establish TCP to the actual host listener172.18.176.1:3444 on vEthernet(Default Switch); strict HTTPS times out. Host strict-CA request reaches the same isolated service successfully. No guest captcha/login request has reached the proxy and isolated account_sessions created/revoked counts remain0. Consequently installed online login, permissions revocation and authenticated-data migration are NOT RUN, not PASS or a proven product authentication defect.

A concrete least-scope temporary inbound-rule test was presented to the user: only source172.18.187.218, destination172.18.176.1, TCP3444, Default Switch interface and the current Node executable, removed after testing. The user explicitly approved this rule. It was created at UTC2026-11-05T00:34:35.6727993Z. The actual post-rule guest probe at00:35:06.3030212Z still returned TCP=false and strict HTTPS timeout. The unique rule was deleted at00:36:35.3895816Z, with a fresh query confirming remaining0. No rule expansion or TLS-validation bypass was used. The exact transport cause has not been assumed proven merely from a timeout.

Final cleanup: the owned network guest was stopped through the official CLI (environment list empty); owned Compose down--volumes exited0, API/proxy and keeper were stopped, own synthetic host certificate entries removed, private test key/password/config files deleted. Backend listeners remaining0. Docker and unrelated services were not stopped. No credentials or CA private keys are in committed evidence.

Detailed execution ledger: [WINDOWS-CANDIDATE-013-20261105.md](WINDOWS-CANDIDATE-013-20261105.md). Read-only database inspection confirms integrity_check ok,55 applied migration records with latest0061, accounts0/sessions0/orders0 for the retained empty initialized database. No historical-business preservation is inferred.

## Approved trial conclusion and retained limits

The previous approval-pending handoff is superseded. The exact authorized rule was tried and removed, but installed online login, actual role/project/session revocation and authenticated-data upgrade retention remain NOT RUN behind the transport boundary. Sandbox availability remains PASS/CLOSED_ENV; it is distinct from this still-open network prerequisite. The exact transport root cause has not been determined, so the timeout is not labelled a proven firewall rule defect or product authentication failure. A broader network-policy change was neither requested nor applied.

[Sanitized rule/probe/cleanup evidence](INSTALLED-013-NETWORK-RULE-20261105.json). The initial pre-rule raw connectivity file was overwritten by the later probe; only the post-rule raw file is independently retained. The earlier committed report/chat records the pre-rule observation; no second raw artifact is invented. Original UAC cancellation and installed-online security gates remain open; no business chain was rerun and no parent/security/Formal gate was automatically closed.
