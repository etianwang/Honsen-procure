# RC stabilization: confirmed NSIS failure and bounded approval request

Status: **P1 CONFIRMED; CONTRACT REPAIR AWAITS APPROVAL**. No conflicting production code was changed. This report concerns the existing T15 installation/update gate, not a new feature or a release authorization.

## Sources and fixed candidate

The five required upstream sources were read in this exact order on 2026-10-25:

| Source                                                                                                                | GitHub blob SHA                            |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [README](https://github.com/etianwang/Honsen-toolbox/blob/main/README.md)                                             | `2f133170104f07e8ae8b1d84b8dba929e65194f0` |
| [Windows standard](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/HONSEN_WINDOWS_APPLICATION_STANDARD.md) | `8f3a48d4e6c9eec6b6600df16687e53b74829c13` |
| [Update protocol](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/honsen-desktop-update-protocol.md)       | `4fdb16c07faf30ccb66799b39569df227c597311` |
| [Integration contract](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/toolbox-integration-contract.md)    | `0d885811aa4a7b8e105f3ae21830d3abc8d53b51` |
| [Manifest schema](https://github.com/etianwang/Honsen-toolbox/blob/main/docs/schemas/honsen.app.schema.json)          | `b2717e866a3024e6688ee9a88ba4a3eb7ab80dea` |

Compared with `docs/HONSEN_TOOLBOX_INTEGRATION.md` at controller `710edd7c622d8983fc5cf6af232b566d9e192b57`. Its current RC sections supersede its historical “Not implemented” inventory. The prior user-approved NSIS exception is preserved; no new installer selection is requested.

Frozen source remains `f4756afdb01ebac7b17ae9016d9ad56ab450fea5`, version `0.1.2`. Installer SHA-256 is `23ac1e5cc35b2840e905a4078b2d333b9f0faa60bbe91c0cdd96116b63f78577`; Runner SHA-256 is `c2a6afdb1b1c3295aa6aa154ed69a79ebab9be659cae031d8cd2ecee6ea2849f`. Neither artifact was replaced or relabeled.

## Integration gaps

| Boundary                           | Actual implementation                                                                                                                                                                         | Required behavior and effect                                                                                                                                                                       | Scope disposition                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Runner invokes NSIS                | `update_runner.rs::run_elevated_installer`, line 399 at `710edd7`, sends `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR="..." /LOG="..."`                                                | Those are Inno switches. The selected NSIS installer requires `/S` and a final unquoted `/D=<absolute original directory>`. Existing invocation cannot establish silent original-directory update. | Include in the one bounded approval below.                                                   |
| Installer directory initialization | `toolbox-hooks.nsh::HonsenUseSharedProgramDirectory` reads `/D=` from `$CMDLINE`, then changes `$INSTDIR` inside `NSIS_HOOK_PREINSTALL`.                                                      | NSIS removes `/D=` from `$CMDLINE`; it already sets `$INSTDIR`. Tauri sets `$OUTDIR` before this hook. Late mutation separates copied files from registration/uninstaller.                         | Same P1 repair; an adapter-only change is incomplete.                                        |
| Update source                      | Build default and hook constant are `https://github.com/etianwang/Honsen-procure/releases/latest/download/manifest.json`. Generated JSON has `appId/version/installerUrl/sha256`.             | Existing contract requires `https://api.github.com/repos/etianwang/Honsen-procure/releases/latest`; Toolbox `GetLatestVersionAsync` reads `tag_name`. The custom JSON cannot satisfy that parser.  | Separate protected change; not included in the minimum NSIS approval.                        |
| Procure launch                     | `update_runner.rs::launch` directly starts the registered EXE.                                                                                                                                | Existing protocol also requires stable-update check and immediate/later/skip choices.                                                                                                              | Separate protected behavior; no implementation in this slice.                                |
| Toolbox launch                     | Upstream `MainWindow.xaml.cs` blob `429a0eefc2780d2cb4c5d8f58cf1bf14cc53bc92`, lines 487–488, appends `--wait-pid`, `--operation-id`, `--result-path`.                                        | Procure accepts exactly `launch --app-id <id> --source <source>`; its parser rejects the extra fields.                                                                                             | Cross-repository repair remains external; do not silently widen Procure's public parser.     |
| Toolbox apply                      | Upstream integration contract explicitly records the missing third-party Runner `apply` path; `MainWindow.xaml.cs` only implements discovery, launch, comparison and selected first installs. | Download, digest validation, exact public `apply`, unique result file and post-update verification are required.                                                                                   | Separate cross-repository work; no catalog entry or automatic-install enablement authorized. |

The update-source protected fields are `honsen.app.json.updateManifestUrl`, Honsen registry `UpdateManifestUrl`, and compatibility `UpdateUrl`. This report changes none of them. Identity remains `honsen.procure`, `Honsen Procure`, `HonsenProcure.exe`, `HonsenUpdateRunner.exe`, machine scope and the existing registry paths.

## Exact-candidate guest evidence

Agent A created one fresh Windows Sandbox and verified its eligibility, then explicitly handed it to Agent C. Guest OS was `10.0.26100.0`; Sandbox ID `e922739e-4dcc-4b75-a6af-4894140ae3bd`. C shared frozen artifacts and check scripts read-only; only its own E:-backed evidence output was writable. C refused to install if any Procure registration already existed in HKLM/HKCU, both views. No host application, host registration, business data or credential was changed.

At `2026-10-25T12:30:56.3344928Z`, the hash-verified frozen setup ran with:

```text
/S /D=C:\Honsen RC 测试 路径\Honsen Procure
```

It exited `0` at `12:30:58.4814895Z`, but the result was **FAIL_CONFIRMED**:

- Main EXE, Runner, manifest and auxiliary binaries landed in the explicit Unicode/space directory.
- `uninstall.exe` landed in `C:\Program Files\Honsen Program\Honsen Procure`.
- HKLM64 registered the default location, EXE and Runner paths; those registered EXE/Runner files did not exist.
- Standard `Runner launch --app-id honsen.procure --source toolbox` subsequently exited `1`, OS error `2`, because the registered directory lacked its manifest.
- The actual Toolbox-shaped launch with its three extra options exited `1`, `invalid manifest`, before launch. This independently reproduces the documented parser incompatibility.

Raw evidence remains under `E:/Honsen-build/agent-c/rc-stabilization-20261025/`:

| Evidence                                 | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `output/frozen-install-observation.json` | `1e46d6e85f99dbac9421e93b83fe529c272fad1790c418294cd0a44e33823783` |
| `output/frozen-launch-observation.json`  | `391b521235e8db1f34faa0919daa16251e5217ab9b38f4dfbc69bd6e73420201` |
| `input/frozen-install-observation.ps1`   | `52a0171668e242f176679ccd52e2d9d30cdfb59dff663a04202d754f88d07ddd` |

C left the split installation intact for diagnosis and handed the guest back to A. No uninstall, update, registry repair or data-retention PASS is claimed. These failures apply only to the fixed source and artifact above; a future build needs its own evidence.

## One minimum approval request

**Approve only the existing Procure NSIS installation/update adapter and its directory-initialization repair:** change Runner's private installer invocation to native NSIS `/S` plus final `/D=<validated original InstallLocation>`; move the shared default directory selection to Tauri's supported installer initialization/template boundary, before file output and before the directory-selection page; retain all public Runner parameters, result JSON fields, identity, registration paths, uninstall/data boundaries, UAC, hash/PID/original-directory/version checks. Create a real adapter call/exit/error log at the existing `installerLogPath`; do not label it an NSIS engine log. URL, launch choices, Toolbox code/catalog, releases and deployment are excluded.

AGENTS.md requires reporting a contract conflict and waiting before changing it. This request is that bounded approval; general development/push authorization does not substitute for it.

### Reviewable implementation sketch (not applied)

1. In `apps/desktop/src-tauri/src/update_runner.rs`, extract only private argument construction and replace the Inno invocation in `run_elevated_installer`:

```diff
- format!("/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR=\"{}\" /LOG=\"{}\"", install_location.display(), log_path.display())
+ nsis_parameters(install_location) // exactly /S /D=<absolute path>, no later options
```

The helper must reject embedded NUL/CR/LF/quotes and preserve Unicode/space characters. Use the existing validated original directory, not a renderer-supplied alternate path. Record actual attempted invocation and exit/error timestamps to the adapter log. The successful result retains its existing `installerLogPath`; no public field is added or renamed.

2. Remove `HonsenUseSharedProgramDirectory` and its invocation from `packaging/windows/toolbox-hooks.nsh`. Keep duplicate-instance, registry and uninstall behavior unchanged. Never fix this by comparing the selected path with a default-looking string: an explicitly selected path may equal that string.

3. The locked Tauri CLI is `2.12.2`. Its installed configuration schema supports a custom NSIS `template`, but only pre/post install/uninstall hooks, no initialization hook or independent installation-directory setting. Prefer a pinned upstream template through `tauri.conf.json.bundle.windows.nsis.template` with only the default-directory branch changed:

```diff
  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; default selection only; NSIS /D already bypasses this branch
-   StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
+   StrCpy $INSTDIR "$PROGRAMFILES64\Honsen Program\${PRODUCTNAME}"
    ; keep the existing RestorePreviousInstallLocation and directory-page behavior
```

Preserve architecture fallbacks, upstream license and all other pinned-template behavior. Establish the exact upstream template/source hash before implementation; do not copy an old generated installer with hardcoded source paths or version values. A generated-cache template encountered during investigation was version `0.1.0`; it is only explanatory and is not evidence for this RC.

4. Extend the existing Runner/installer regression boundaries, without creating a new task system. Verify explicit Unicode and space `/D`, an explicit path identical to the former Tauri default, normal default install, repair/update of registered non-default directory, and out-of-date registration handling. Assert EXE/Runner/manifest/uninstaller/registration all share the one location. Reproduce current RED before accepting the repaired candidate. Test adapter logging and no restart on failed hash, target, PID or installer exit. Run actual upgrade and uninstall/retained synthetic-data checks in a fresh disposable guest only.

This sketch must be reviewed as a complete pair: changing Runner arguments without fixing the late installer hook is insufficient.

## Remaining evidence boundaries

The exact `f4756af` CI run `40191375930` already covers isolated Linux nginx, systemd, controller, restricted grants and restore checks. Reuse it only for that SHA/scope/environment; production Baota topology, protected directory ownership, independent PostgreSQL 16 management and operator deployment authorization remain unverified. Do not rerun those passed systems merely for this documentation/Windows defect report. No old Linux manual, `www` service ownership or blanket-grant script is integrated.

**BLOCKER:** confirmed split installation and NSIS adapter incompatibility; required contract approval; remaining update/Toolbox/native business and original final gates. **DEFERRED:** independent URL/launch/Toolbox repairs and post-fix exact-SHA package acceptance. **WARNING:** old release worktree retains four pre-existing dirty files, excluded from this report's checkpoint.
