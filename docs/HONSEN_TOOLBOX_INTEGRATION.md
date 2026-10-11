# Honsen Toolbox Integration

## Status

**Not implemented; identity registration is required before installer, automatic update or toolbox-catalog work.** The product is internally distributed rather than publicly released, but automatic update still uses the fixed Toolbox/Runner contract. The display name is now **Honsen采购管理系统（HONSEN Procure）** and its source repository is `etianwang/Honsen-procure`; this document records the remaining gap rather than inventing values that would become a cross-project compatibility contract.

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
| `appId`                            | Not assigned                                                 | Requires owner approval; must be permanent `honsen.<kebab-case>`                       |
| Display name                       | Honsen采购管理系统（HONSEN Procure）                         | Working product name; not an identity                                                  |
| Product installation directory     | Not assigned                                                 | Requires owner approval; must not change after release                                 |
| Main EXE                           | Not assigned                                                 | Requires packaging decision/approval                                                   |
| Installation scope                 | Not assigned                                                 | Choose machine or current-user installation                                            |
| Installer                          | Not implemented                                              | Upstream permits Inno Setup or MSI with identical behavior                             |
| Source repository                  | `https://github.com/etianwang/Honsen-procure.git`            | Confirmed source repository                                                            |
| Internal update repository/API URL | Same GitHub repository is intended; API URL not yet approved | Required for `updateManifestUrl`; choose the internal update source before Runner work |
| Release asset                      | Not assigned                                                 | Must be exactly one `<ProductId>-<version>-Setup.exe` plus `.sha256`                   |
| `HonsenUpdateRunner.exe`           | Not implemented                                              | Must ship in installation root                                                         |
| Manifest                           | Not implemented                                              | Must be root `honsen.app.json`, `schemaVersion: 1`                                     |

## Integration-gap list

| Required item                  | Current state | Required resolution before implementation                                                                         |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| appId                          | Missing       | Register and approve one unique immutable ID; do not infer it from display name.                                  |
| Product directory and main EXE | Missing       | Approve stable names before installer/shortcut work.                                                              |
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
