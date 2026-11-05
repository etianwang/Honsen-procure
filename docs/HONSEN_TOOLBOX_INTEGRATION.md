<!-- Current RC evidence below supersedes historical implementation-gap labels. -->

2026-11-04 latest tested production source05e84ccf78761a3c187d04fc59886f55e62ee5f3 / local0.1.12 (pushed): actual old019 publicapply replacement, same-version exact-pair cleanup, sharing-lock refusal/no restart, explicit retry and uninstall data/unknown-file retention PASS within recorded scope. Prior011 cleanup FAIL retained. Fresh012 install is BLOCKED_ENV: automatic approval review rejected both requested variants, stating only blocked by policy; neither ran. Qualified live launch/apply/worker chain and UAC cancellation remain unverified; scope3 unapproved and original V1 security/recovery/export/language gates OPEN. Owned guests stopped. See reviews/WINDOWS-CANDIDATE-012-20261104.md and RUNNER-REPLACEMENT-P1-RESULT-20261104.md; no parent checkbox or final QA readiness is closed.

# Honsen Toolbox Integration

## Current approved launch scope2 — 2026-11-04

User explicitly approved reviews/TOOLBOX-LAUNCH-IMPLEMENTATION-20261104.md and its offline/404/failure policy after candidate66c777e. Re-read upstream README, Windows standard, desktop update protocol, integration contract and schema in that order before implementation. Current gaps remain: incomplete launch identity validation, no native stable-update selection or skipped-version preference; actual Toolbox scope3 caller and qualified stable assets remain separate. The first three gaps are now authorized only within that exact proposal. No Manifest/public argument/result/data/installation boundary change is approved. New private launch identity validation must not silently alter existing apply validation behavior. Implementation/test evidence is pending; approval is not PASS or automatic catalog eligibility.

## Status

**RC integration in progress; installed Toolbox acceptance is not complete.** The product is internally distributed rather than publicly released, but automatic update still uses the fixed Toolbox/Runner contract. This document records the approved identity and the remaining implementation gaps; it does not authorize an installer, Runner, manifest, registry entry, catalog mutation or release.

The authoritative upstream documents were reviewed on 2026-10-09:

1. [Honsen Toolbox README](https://github.com/etianwang/Honsen-toolbox/blob/main/README.md)
2. [Windows application standard](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/HONSEN_WINDOWS_APPLICATION_STANDARD.md)
3. [Desktop update protocol](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/honsen-desktop-update-protocol.md)
4. [Toolbox integration contract](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/toolbox-integration-contract.md)
5. [Manifest schema](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/schemas/honsen.app.schema.json)

The Gitee mirror is a mirror, not a replacement for resolving an ambiguity in the fixed upstream contract.

## Actual application identity

| Field                              | Actual value                                                 | Status                                                                                 |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `appId`                            | `honsen.procure`                                             | Approved immutable Toolbox identity                                                    |
| Tauri identifier                   | `africa.honsen.procure`                                      | Approved distinct Tauri bundle/data identifier; it is not the Toolbox appId            |
| Display name                       | `Honsen Procure`                                             | Approved product-facing name                                                           |
| Product installation directory     | `Honsen Procure`                                             | Approved stable product directory                                                      |
| Main EXE                           | `HonsenProcure.exe`                                          | Approved executable name                                                               |
| Installation scope                 | `machine`                                                    | Approved default release scope                                                         |
| Installer                          | Not implemented                                              | Upstream permits Inno Setup or MSI with identical behavior                             |
| Source repository                  | `https://github.com/etianwang/Honsen-procure.git`            | Confirmed source repository                                                            |
| Internal update repository/API URL | Same GitHub repository is intended; API URL not yet approved | Required for `updateManifestUrl`; choose the internal update source before Runner work |
| Release asset                      | `Honsen-Procure-<version>-Setup.exe`                         | Approved naming; first release version and update source remain unapproved             |
| `HonsenUpdateRunner.exe`           | Not implemented                                              | Must ship in installation root                                                         |
| Manifest                           | Not implemented                                              | Must be root `honsen.app.json`, `schemaVersion: 1`                                     |

## Integration-gap list

| Required item                  | Current state | Required resolution before implementation                                                                         |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Approved identity              | Recorded      | Do not substitute the Tauri identifier for Toolbox `appId`; use the approved fields when T15 starts.              |
| Product directory and main EXE | Recorded      | Implement only after the approved installer/release decision.                                                     |
| Runner                         | Missing       | Implement `launch` and exact `apply` contract; only Runner may replace application files.                         |
| Manifest                       | Missing       | Create schema-v1 manifest after actual identity, EXE and release URL are approved.                                |
| Honsen registry entries        | Missing       | Installer must inspect HKLM/HKCU and 32/64-bit views, write required values, and prevent a second valid instance. |
| Windows uninstall entry        | Missing       | Provide `DisplayName`, `DisplayVersion`, `InstallLocation`, `UninstallString`, `QuietUninstallString`.            |
| Reinstall/upgrade behavior     | Missing       | First install may choose a directory; repair/update must use registered `InstallLocation` only.                   |
| Release assets and SHA-256     | Missing       | Stable GitHub Release needs version tag, one setup asset, matching `.sha256`, and GitHub API `sha256:` digest.    |
| Toolbox actions                | Not available | Validate open, check update, apply, uninstall and manual registration repair only after prior items exist.        |
| E2E evidence                   | Missing       | Execute and record the cases below on Windows 10/11 candidate builds.                                             |

## Fixed implementation contract

When the missing identity is approved, implementation must conform to these rules:

- Manifest required fields: `schemaVersion: 1`, `appId`, `displayName`, `version`, `executable`, `updateRunner: "HonsenUpdateRunner.exe"`, `publisher: "Honsen"`, `updateManifestUrl`. `executable` and `updateRunner` are file names only and reside inside `InstallLocation`.
- Registry base is `HKLM` or `HKCU` `Software\Honsen Program\Apps\<appId>` with `AppId`, `DisplayName`, `Version`, `InstallLocation`, `ExecutablePath`, `LauncherPath`, `UpdateRunnerPath`, `UpdateManifestUrl`, compatibility `UpdateUrl`, `InstallScope`, and `Publisher`. Check both 32- and 64-bit registry views before installation.
- Toolbox opens only through `HonsenUpdateRunner.exe launch --app-id <appId> --source toolbox`.
- Runner must support exact `apply` parameters: `--source`, `--app-id`, `--wait-pid`, `--installer`, `--sha256`, `--target-dir`, `--expected-version`, `--restart`, `--operation-id`, `--result-path`.
- Runner validates identity, registry, manifest, target directory, process path and SHA-256; it copies itself to a temporary directory, uses a per-app mutual exclusion lock, waits at most 30 seconds for the registered process, invokes the installer, revalidates the installed version, and atomically writes the operation-specific result JSON.
- Uninstall removes only this app's files and registration. It must not delete user data, the shared `Honsen Program` parent directory, or another product's directory/registration.
- The toolbox discovers applications solely by exact `appId`, registration and manifest verification. It must not use a display name, shortcut, fixed path or disk scan.

## Required E2E record for each release candidate

| Case                                                                                         | Result                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------- |
| Clean first install: files, manifest, Honsen registration and Windows uninstall registration | Not run — application not implemented |
| Reinstall: duplicate appId rejected across HKLM/HKCU and 32/64-bit views                     | Not run — application not implemented |
| Open through shortcut/start menu/toolbox Runner launch                                       | Not run — application not implemented |
| Toolbox update check does not start/download/update the app                                  | Not run — application not implemented |
| App and toolbox `apply` update original directory and write separate result JSON             | Not run — application not implemented |
| Invalid hash, target, PID path and installer exit all fail safely                            | Not run — application not implemented |
| Uninstall preserves user data/shared parent/sibling application                              | Not run — application not implemented |
| Lost registration repaired only from user-selected valid install directory into HKCU         | Not run — application not implemented |
| Unicode/space installation path and offline update-source failure                            | Not run — application not implemented |

## Change control

If a future implementation conflicts with this contract, report the exact conflict, its user impact and a repair plan before modifying it. Do not make a local exception or silently change an upstream field, result JSON, Runner argument, registry path or deletion boundary.

## RC integration — 2026-10-24

Source: release-toolbox `f9145e1e4f62958e379f8f81c08971a9383c116b` plus unified payment/API candidate `98537d22b17853752203e11646bd1966ef6d1d03`, on independent `codex/v1-release-candidate`. Identity remains honsen.procure; product directory Honsen Procure; main HonsenProcure.exe; Runner HonsenUpdateRunner.exe; machine HKLM registration and NSIS installer. User explicitly selected NSIS, overriding the historical Inno/MSI-only note for this application.

Actual source now includes NSIS registry hooks, both Runner commands, manifest generators and Windows build script. Historical Missing/Not implemented labels above are retained as historical requirements, not an accurate source inventory. Installed-bundle acceptance remains NOT RUN for this RC; no historical installer can substitute for its business binary.

Preflight read in required order on 2026-10-24. Contract discrepancies are recorded, not silently repaired: build/hook default UpdateManifestUrl points to download/manifest.json instead of the canonical GitHub releases/latest API; launch starts the registered EXE without the required update-choice flow; existing upstream integration-contract prose also records Toolbox launch-argument/apply gaps. URL/Runner contract repair requires the requested user approval and independent tests. No Toolbox catalog mutation or stable Release is authorized.

RC evidence must name exact source commit, installer SHA-256, OS and each actual install/update/uninstall outcome. Windows Credential Manager error8 remains a native login blocker; no credential deletion or protection bypass is allowed. Unchanged synthetic Runner tests do not constitute Toolbox joint E2E.

## Multi-agent RC preflight — 2026-10-25

The controller read the five required upstream documents in order again. Their
GitHub blob SHAs were README `2f133170104f07e8ae8b1d84b8dba929e65194f0`,
Windows standard `8f3a48d4e6c9eec6b6600df16687e53b74829c13`, update protocol
`4fdb16c07faf30ccb66799b39569df227c597311`, integration contract
`0d885811aa4a7b8e105f3ae21830d3abc8d53b51`, and schema
`b2717e866a3024e6688ee9a88ba4a3eb7ab80dea`.

The approved identity and existing NSIS exception above are preserved. No
Runner arguments, result JSON, registry identity, update URL, uninstall boundary
or Toolbox catalog was changed. The URL/launch/apply gaps above still prevent
Toolbox acceptance; repairing the conflicting implementation requires the
approval specified by AGENTS.md. Candidate version `0.1.2` is a local/CI package
target, not a published stable Release. Exact source, package evidence and open
gates are tracked in the [controller handoff](planning/V1-MULTI-AGENT-CONTROL-20261025.md).

No install/update/uninstall/repair case has passed on this candidate. The prior
credential-store error is historical; this round has not rerun the dual-native
chain without an authorized test COS configuration. Building a new installer
does not replace those gates or qualify financial/file workflows for production.

## Approved bounded installation P1 repair — 2026-11-04

The user approved only INSTALL-P1-PLAN-20261104.md's paired private NSIS adapter and early default-directory repair. Five upstream sources were reread in AGENTS order before implementation. Runner now builds native `/S` with final unquoted `/D=<validated original InstallLocation>` and writes timestamped adapter attempt/exit/error records to the existing log path (not an NSIS engine log). Public parameters/result fields and all validation/restart gates remain unchanged.

The late PREINSTALL directory mutation is removed. The custom template pins official tauri-cli-v2.12.2 commit `5b23c82ea5ba6b9aec420dd71f60493edc486aa9`, upstream blob `f66b011e6b8acdd3e8e4f463c185e5c347b8f18c`; license and source record are adjacent to the template. Only four per-machine architecture default paths add Honsen Program; explicit /D and previous-install restore remain upstream.

URL/manifest values, public Runner protocol, identity, registry and uninstall/data boundaries remain unchanged. Split/stale old registration is not automatically migrated or repaired. No automatic rollback is introduced. Candidate build, real install/update/uninstall and synthetic-data retention are NOT RUN at this writing; unit/static checks cannot substitute. Exact new SHA/hash/OS evidence must be appended after actual execution; historical f4756af RED remains valid only for its frozen artifact.

### Actual bounded P1 Windows evidence — 2026-11-04

See reviews/INSTALL-P1-RESULT-20261104.md and adjacent safe JSON. Source6697469 local setup0.1.2 SHA653b6111b6435513768a2f40f2145897d5e35843f2207bcbbf7b165fd0ff5224 passed independent fresh default, Unicode/space and former-default directory consistency, Runner repair, and synthetic-data-preserving uninstall. Local0.1.3 SHAd72c77895eed9c957395b648249c6e291aa48f4f8f24f1bc75efa3c51e8a1964 passed actual Unicode original-directory0.1.2-to-0.1.3 Runner upgrade and uninstall. Native adapter attempt and exit0 logs captured; synthetic stale registration rejected without restart or setup mutation. The bounded slice has actual guest evidence; parent release/Toolbox/business/security gates remain open. No production or stable publishing. Earlier NOT RUN statements are historical for this bounded slice only; all excluded gates remain unaccepted.

## Approved canonical update source — 2026-11-04

User approved only scope1 in reviews/TOOLBOX-JOINT-SCOPE-20261104.md. Build input/default, generated manifest and both installer registration URL values now use https://api.github.com/repos/etianwang/Honsen-procure/releases/latest; non-canonical overrides are rejected. New read-only contract consumer validates stable tag, unique version-matched Setup.exe, same-repository HTTPS asset and GitHub sha256 digest. Auxiliary EXEs do not become installer candidates. Release regressions14/14 passed; actual API check returned404/exit1 and correctly failed closed. No qualified stable source is claimed.

Existing launch behavior, public parameters/schema, old registry records, artifact-summary fields and Toolbox caller remain unchanged. No native launch polling is connected or claimed. New source values have not yet been installed/joint-tested; prior P1 proof is retained for its original bounded artifact. Joint launch/apply, old URL migration and stable-release/catalog acceptance remain open. See reviews/TOOLBOX-CANONICAL-SOURCE-20261104.md.

### Installed canonical-source and Runner rejection proof — 2026-11-04

Current code source `2812631593cfec5a06375567ae6fe50aee049c4f`, local NSIS `0.1.4`, setup SHA-256 `70671eb69e832b0e8dba5cb536fae1004557572996c461fcc9e685becf634e1b` was actually installed in fresh Windows Sandbox `10.0.26100.0`. Manifest and both registration URL values matched the canonical stable API; registry/manifest/main-EXE versions matched. Installed Runner rejected wrong hash, target directory and a live foreign executable PID at the exact expected failure steps, without restart or installed-file/registration changes. Safe evidence: reviews/INSTALLED-RUNNER-SECURITY-20261104.md/json. Guest disposed after capture. This closes only those negative/security and installed-source-value checks. No actual Toolbox caller, successful apply update, live stable source, launch update choice or full application security gate passed. P1's earlier bounded proof remains unchanged.

### Actual current-source apply proof — 2026-11-04

Source `100011d41383bac4a7533c388572b4ac65bb97ee`, local NSIS `0.1.6`, setup SHA-256 `c0b5d756a76656bbf393cc6301efe147873dfecaaa996fd4f03e362491aed639` passed actual installed `0.1.5`→`0.1.6` existing-Runner apply in fresh Windows Sandbox10.0.26100.0. The original directory, canonical Manifest/both registered URLs and actual version checks passed; synthetic SQLite-file and marker hashes survived. Wrong hash/target/foreign-PID cases again failed at their precise expected steps. Evidence: reviews/WINDOWS-CANDIDATE-016-20261104.md/json. Earlier successful-apply-not-run statements above are historical for those older artifacts.

This run used a direct test caller with existing `source=toolbox`, `waitPid=0`, `restart=false`; it does not establish actual Toolbox UI/caller integration, running-client handling, business-schema migration or full application security. Original P1 acceptance was reused without repeating its matrix. Scope2 launch remains unmodified pending approval of reviews/TOOLBOX-LAUNCH-IMPLEMENTATION-20261104.md; scope3 caller/live stable/catalog gates remain open. No public protocol, old-registration migration, formal Release or deployment changed.

### Exact-source0.1.7 affected upgrade smoke — 2026-11-04

Source66c777e11fabeb446ed728200331eecea4cfd891 was actually rebuilt as local0.1.7; setup SHA844ae19a906be07139c5b911fea2b4100fe057cb01ddfeb054ef71fe6975a4f3. Fresh Windows Sandbox performed registered Runner0.1.6→0.1.7 apply with exit0/success, exact version/unchanged directory, canonical Manifest and both registration URLs, and identical synthetic SQLite/marker hashes. Scope uses wait-pid0/restart=false and a direct existing Runner call, not real Toolbox UI/caller acceptance. Raw/safe evidence: reviews/WINDOWS-CANDIDATE-017-20261104.md/json. Guest disposed after capture. Existing P1 and unchanged-source negative gates were not mechanically repeated; all excluded launch/scope2 and cross-repository/scope3 gates remain OPEN and unimplemented without approval.

### Actual010 launch subcases and new Runner replacement P1 — 2026-11-04

Exact90f28043aecd74a90d3267952b922aea45845a88/local0.1.10 setup SHA4c69dbfaca53ea11e2da9d006b40fb126548358b05fd0b6c131a6c640d293890 has final effective package Runner198093091d79159a62d01335b27dfe137bdd82b3f7e732faa34a27f065bff205 (last same-name external NSIS entry, not first resource). Actual old019 public apply incorrectly reported success while retaining old1943cac8... Runner: upgrade FAIL/new P1. Independent standard reinstall produced correct19809309... bytes, preserved syntheticdata, and then passed actual readable Chinese offline warning, Toolbox-source Cancel/no-main, app-source explicit Continue/installed login screen and six installed identity denials. Official Sandbox CLI ExistingLogin and sky were used; no credentials entered, no guest script/config retry. Final canonical/registry/Manifest state restored, clone/junction absent, main0 and guest stopped. Evidence reviews/WINDOWS-CANDIDATE-010-20261104.md/json.

Reinstall and launch PASS do not repair or close failed upgrade. RUNNER-REPLACEMENT-P1-PLAN-20261104.md awaits its specific approval; no NSIS/public contract/install-directory change has been made for that new defect. Disabled-network evidence does not assert HTTP404. Live stable immediate update, real Toolbox caller/scope3 and original business/security/data-recovery gates remain open.

## 2026-11-05 business acceptance boundary and remaining joint gate

Current application source854186c3d22540d81ee39c2af49c3128e20c10f6 preserves the Toolbox owning-source boundary: comparison fromf5631ea through854186c of update_runner.rs, update_launch.rs and update_launch_windows.rs is empty. This business/SQLite repair does not alter app identity, Manifest, registry, Runner arguments/results, installer or uninstall boundaries. Prior bounded installation P1 was not rerun or broadened.

Fresh read-only GitHub latest stable Release lookup for etianwang/Honsen-procure returned404. A qualified stable installer/digest source for the actual launch/apply/temporary-worker/caller chain is therefore still absent. No Release was created, consistent with the user's prohibition. The current host also has no WindowsSandbox.exe and its Containers-DisposableClientVM feature is Disabled; no Windows/Hyper-V setting was enabled. These are remaining actual joint/installed acceptance prerequisites, separate from the resolved WSL environment and successful debug-native business/PDF scopes. See reviews/V1-RESTORED-ACCEPTANCE-20261105.md and its native ledger. No Toolbox eligibility or final T15 acceptance is implied.

## 2026-11-05 recovered Sandbox installed candidate013

Actual isolated013 package source21491c5f4ccfbb668425b302f9be6e0523e1d1df / SHA25619f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b passes fresh registration/Manifest/EXE consistency, installed hash/target/PID refusals and public012→013 Runner apply with unchanged empty initializedSQLite. ActualUAC prompt was not observed; installer-wizard Cancel is not that gate. Online/revocation/authenticated-cache retention await guest-host transport permission. No identity/publicCLI/Manifest/result/uninstall contract or production source changed. Detailed actual boundaries: reviews/SANDBOX-INSTALLED-SECURITY-013-20261105.md. Existing full Toolbox/security gates remain open.

### 2026-11-05 approved exact-rule continuation — still blocked, cleaned

User explicitly approved the single guest172.18.187.218→host172.18.176.1:3444 TCP/DefaultSwitch/currentNode inbound rule. Actual post-rule strict probe remained TCPfalse/HTTPStimeout. No expansion/TLS bypass; unique rule removed and absence verified (remaining0). Owned Sandbox list empty; own Compose down--volumes exit0, API/proxy/keeper/certificates/private fixture files cleaned, test listeners0. The former approval-pending/active-resources handoff is superseded. Sandbox USER_DISABLED_FOR_ACE availability hold remains CLOSED_ENV, while installed online login, role/project/session revocation and authenticated-upgrade data retention remain NOT RUN/BLOCKED_ENV; exact network root cause unknown. UAC actual-prompt cancellation remains unverified. No production/source/installer contract change or business-test rerun. Candidate source21491c5f4ccfbb668425b302f9be6e0523e1d1df/package013 SHA25619f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b unchanged; later evidence checkpoint is the containing commit, selected worktree expected clean after commit/push. Remaining BLOCKER is transport/security acceptance, DEFERRED main/merge/Release/production, WARNING empty-data/real-history and wizardCancel/UACCancel scope distinctions. See reviews/SANDBOX-INSTALLED-SECURITY-013-20261105.md and INSTALLED-013-NETWORK-RULE-20261105.json. Next safe action: independently diagnose the specific Sandbox network path before proposing any further policy change; retain original final gates.

### 2026-11-05 Sandbox networking layer correction and actual path diagnosis

Never classify the entire Sandbox as offline: offline-install wsb explicitlyNetworkingDisable/guestb066; separate old network wsb NetworkingEnable/guest1ca. User public TCP observation guest179.246 is historical; currentinventory was empty, so a fresh owned Enable guestdd3adece/current172.18.190.164 was created and independently passed www.microsoft.com443. Controlled listeners127.0.0.1:3443 and172.18.176.1:3444 were verified before probe. Current guest→host3444 initially timed out while public TCP passed. Scoped metadata/counters prove3 packets reached host and were dropped at TCP/IPv4 accept inspection. Existing WFP event identifies default QueryUser filter76539 and actual Node MSIX image path, different from earlier Roaming alias; both paths hash9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de. Same-binary/single-current-guest/single-port/interface exact temporary exception bound to actual physical path made TCP connect PASS at03:22:05Z. No broad rule or managed security-rule disable; exact exception removed, remaining0; pktmon stopped/filtersremoved. This is current190 evidence, not a retroactive filter finding for old187.

Layer3 is still NOT RUN: automatic approval review rejected preparation/mapping of public CA+013 package, guest CA trust/strictTLS/installation-launch before execution, stating only blocked by policy. No split/alternate mechanism retry. User explicit confirmation requested for onlyguestdd3 public CA thumbprintEA450575942FD681A41157146726D8E4E448F92B and verified013 package; do not infer approval from elapsed time. BLOCKER is now tool-policy permission for installed strictHTTPS/login/revocation, not Sandbox public networking; UAC actual-prompt gate remains open. Code unchanged9f3aa76, installed candidate remains21491c5/package013SHA19f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b, backendowning code unchanged. Owned guest/backend+keeper53402 retained awaiting response; only synthetics, no sessions/login/revocation, no COS. On denial clean owned resources; on explicit approval resubmit the same reviewable operation, do not bypass another rejection. DEFERRED production/main/merge/Release, WARNING earlier raw probe overwrite disclosed, no parent/security/Formal holds auto-close. See reviews/SANDBOX-API-LAYER-20261105.md/.json. Later evidence checkpoint contains only docs, with expected clean selected tree after commit/push; app source9f3aa76 remains unchanged.

### 2026-11-05 explicit Sandbox authorization resubmission

User explicitly authorized guest-only trust of public CA EA450575942FD681A41157146726D8E4E448F92B and installation/launch of 0.1.13 package SHA-256 19f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b (source 21491c5f4ccfbb668425b302f9be6e0523e1d1df). Current owned guest dd3adece still has 172.18.190.164; host listeners and strict host TLS remained ready. The same concrete operation was resubmitted for tool review and rejected again before execution: `CreateProcess blocked by policy`, with no more specific reason. Explicit user authorization is not tool approval. No split, alternate mechanism, CA import, guest strict TLS, installation, login or revocation followed. The narrowly restored physical-Node rule was removed at 2026-11-05T06:25:43.2099006Z; remaining zero (ignored raw evidence `.cache/sandbox-host-transport-20261105/approved-resume-cleanup.json`).

BLOCKER: automatic tool approval prevents this guest trust/install operation; online strict HTTPS, login and revocation remain NOT RUN. Public connectivity and previously evidenced host TCP results remain separate PASS evidence. No business/schema/migration change, production action or parent-gate closure. Owned guest/backend are retained pending manual user action or a policy resolution; no further automatic retry is authorized by this record. This documentation checkpoint follows 895c796; no application tests rerun because no application code changed. See `docs/reviews/SANDBOX-API-LAYER-20261105.md` for scoped evidence. DEFERRED: remaining installed online security acceptance. WARNING: retained isolated test resources are not production resources.

### 2026-11-05 staging-mapped Sandbox attempt (after6f2f8ee)

Created missing user-requested Honsen-Staging-Test.wsb outside repo: Networking Enable, only staging read-only mapped, no project/private key. Host installer hash19f4648d…619c1f7b and both publicCA thumbprints verified. Closed only previous owned dd3 guest after official single-instance error; new283a80d3 guest actually reached desktop, IPv4172.18.177.118. Guest hash/public-network probe child0 without retained stdout; per-check status evidence incomplete. Verified-hash silent installer command child0, installed artifacts not yet verified. Inventory/evidence command child1 unknown cause; diagnostic official exec then rejected CreateProcess blocked by policy. Stopped immediately, no alternative/retry, no CA import/login/revocation/new firewall rule. Retain owned guest/backend. No source/schema/data migration changes; source21491c5/package013 correspondence unchanged. BLOCKER: tool review rejection and missing installed/online evidence. DEFERRED: online security, authenticated-history upgrade retention and real UAC cancellation. WARNING: retained isolated resources and limited CLI stdout. Full scoped ledger: docs/reviews/SANDBOX-INSTALLED-SECURITY-013-20261105.md. No parent/security gate closed; documentation checks only, application suites skipped because no code changed. This task's commit follows6f2f8ee; final checkpoint is recorded by Git history.
