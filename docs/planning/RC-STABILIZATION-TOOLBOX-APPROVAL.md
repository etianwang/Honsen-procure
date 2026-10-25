# RC stabilization: minimal NSIS repair approval

Status: PENDING USER APPROVAL. Frozen RC
`f4756afdb01ebac7b17ae9016d9ad56ab450fea5` and its artifacts remain immutable.
No conflicting implementation below has been changed.

## Confirmed failure

Agent C ran the fixed0.1.2 installer in a clean Windows Sandbox, OS26100,
2026-10-25T12:30:56Z–12:30:58Z. Installer SHA256
`23ac1e5cc35b2840e905a4078b2d333b9f0faa60bbe91c0cdd96116b63f78577`,
arguments `/S /D=C:\Honsen RC 测试 路径\Honsen Procure`, exit0. Main EXE, Runner and
manifest were written to the explicit directory, but the uninstaller and HKLM
registration pointed to the default shared directory where those files did not
exist. This is a real split-install failure, not a successful installation.
Raw evidence is retained in
`E:/Honsen-build/agent-c/rc-stabilization-20261025/output/frozen-install-observation.json`.

## Original contract, implementation and target

The upstream standard requires original-directory updates and Inno arguments;
this application already has the user's NSIS exception. Public Runner `apply`
parameters and result JSON must remain unchanged. The approval sought is for
the conflicting implementation to honor that existing exception.

| Boundary                 | Current implementation                                                                                                                                            | Proposed minimal target                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner invokes installer | `update_runner.rs::run_elevated_installer` sends `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR="..." /LOG="..."` to NSIS                                    | Send case-sensitive `/S`, followed by final unquoted `/D=<validated registered InstallLocation>`; retain UAC and wait/exit handling                                                                                               |
| Default directory        | `toolbox-hooks.nsh::HonsenUseSharedProgramDirectory` looks for `/D=` in `$CMDLINE`, then changes `$INSTDIR` in PREINSTALL after Tauri already called `SetOutPath` | Initialize the shared default only in the NSIS initialization placeholder branch, before UI/output selection; preserve NSIS-parsed explicit targets and restored existing locations; remove the late PREINSTALL directory rewrite |
| Installer diagnostics    | Inno `/LOG` is assumed to produce the operation's log                                                                                                             | Keep `installerLogPath` and write a real adapter invocation/exit/error log; identify it accurately as Runner diagnostics, not an invented NSIS engine log                                                                         |

NSIS documents that `/D` is last and unquoted and is removed from `$CMDLINE` by
the engine. Sources: [installer arguments](https://nsis.sourceforge.io/Docs/Chapter3.html#installerusage),
[$CMDLINE reference](https://nsis.sourceforge.io/Reference/%24CMDLINE).

Affected implementation: `apps/desktop/src-tauri/src/update_runner.rs`,
`apps/desktop/src-tauri/packaging/windows/toolbox-hooks.nsh`, a version-pinned
NSIS template using the installed locked Tauri CLI2.12.2 template, its bundle
configuration/build wiring, focused regressions and the integration document.
No dependency upgrade is requested. The template must preserve upstream logic
and licensing, with only the directory-initialization change.

## Compatibility and acceptance

The adapter targets the already-selected NSIS installer; it does not advertise
Inno/MSI auto-detection. Public Runner commands/options, result JSON field names,
appId, executable/product names, registry paths and uninstall/data-retention
boundaries stay unchanged. No update source change, Toolbox catalog addition,
stable Release or production deployment is included. The old RC stays available
with its failure evidence; a repaired candidate gets a new SHA/version.

Required focused proof: parameters contain no Inno options; Unicode/space
target remains intact; default, explicit and existing registered paths remain
consistent before files are written; actual Sandbox install/launch/update/
uninstall uses one root; SQLite/Outbox/attachments/config sentinels survive;
hash/target/PID/version failures do not restart; operation log and result fields
are truthful. Unit/static tests alone cannot close installed acceptance.

## Smallest authorization requested

Approve only the coupled NSIS invocation and early directory-initialization
repair, including truthful adapter logging and its directly required tests and
template wiring. This is necessary to fix the confirmed split-install defect.
AGENTS.md requires approval before changing a conflicting implementation.

Other confirmed gaps remain outside this request: `UpdateManifestUrl` currently
uses the custom `releases/latest/download/manifest.json` instead of the upstream
GitHub API URL; Runner `launch` lacks the prescribed update-choice flow; Toolbox
itself adds unsupported launch options and lacks third-party `apply`. They are
reported separately, not silently included in this authorization.
