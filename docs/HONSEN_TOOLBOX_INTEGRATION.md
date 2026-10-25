<!-- Current RC evidence below supersedes historical implementation-gap labels. -->

# Honsen Toolbox Integration

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
