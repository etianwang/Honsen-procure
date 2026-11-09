# Windows local candidate0.1.10 — 2026-11-04

Status: build, exact Runner after independent reinstall, readable Chinese offline cancel/continue and six installed launch identity denials PASS. Actual public019→0.1.10 upgrade is FAIL: old Runner survived a reported success. New P1 repair remains unapproved/pending.

Source `90f28043aecd74a90d3267952b922aea45845a88`; production build inputs matched this frozen SHA before/after. This package includes the minimal explicit Chinese dialog-font repair; it is not oldab322af/019 relabeled.

Immutable setup: `H:/Honsen/artifacts/windows/90f2804-010/Honsen-Procure-0.1.10-Setup.exe`.
SHA-256 `4c69dbfaca53ea11e2da9d006b40fb126548358b05fd0b6c131a6c640d293890`.
Original build log `.cache/setup-010-build-20261104.log`, exit0.

## Correct effective Runner expectation

The unmodified generated NSIS still has two same-name Runner File entries. They were read in generated-script order; both original input files and script were preserved before any later build can overwrite caches.

- First resource Runner:89ef06281ad17e249ac007462e51fa2c93e74126b1c3b15f077c5ab0649e187d,3793920bytes, timestamp10:15:51.5707475Z. Preserved as first-resource-HonsenUpdateRunner.exe; this is not called the final effective payload.
- Last external Runner: **198093091d79159a62d01335b27dfe137bdd82b3f7e732faa34a27f065bff205**,3793920bytes, timestamp10:16:23.4896202Z. Preserved as effective-package-HonsenUpdateRunner.exe. This is the expected actual installed Runner hash for the recorded upgrade verification.
- Generated installer.nsi SHA **6a1eb8d520342081eb69de5df662d6b636a3d3211782e301805fbc81846f7f75**, preserved as generated-installer.nsi. package-provenance.json records all source/order/time/hash details.

No build script, NSIS, public Manifest/arguments/OperationResult or production body code was changed by packaging. No new guest script/configuration or rejected batch action was created/retried. C performed no active-guest commands or UI actions. Actual installed results are recorded below; packaging alone is not acceptance.

Earlier019 actual offline cancellation passed while Chinese text rendered tofu (FAIL). Those outcomes remain attached to oldab322af/019. This new candidate cannot inherit old fresh installation or host font-probe acceptance as installed proof. Qualified live stable immediate update, real Toolbox cross-repository caller and original security/data-recovery gates remain OPEN. No Release, merge or deployment occurred.

## Actual upgrade failure — retained independently from reinstall

The normal old registered019 Runner public apply returned exit0 and result success/from0.1.9/to0.1.10, main/Manifest/registry advanced and original directory/SQLite/marker survived, **but the installed Runner stayed old1943cac8... instead of expected19809309...**. This is confirmed false success, not a passed upgrade. Raw `.cache/installed-security-019-existing/evidence/{upgrade-before.json,upgrade-after.json,upgrade-result.json,upgrade-operation.txt}`. RUNNER-REPLACEMENT-P1-PLAN-20261104.md is a separate precise pending approval; no NSIS/code was changed in this documentation task.

The following independent reinstall was standard uninstall/S followed by exact NextSetup/S in the same isolated directory. It is an acceptance control, not a product rollback or a repair of the upgrade implementation. Its PASS cannot overwrite the RED above.

## Actual reinstalled010 launch and identity proof

Source90f2804's exact010 was reinstalled. Actual Runner SHA19809309... now matched the package's effective external input; main EXE/registry version0.1.10 and syntheticSQLite/marker preservation passed (`reinstalled-010.json`).

The controller used the official Sandbox CLI ExistingLogin and sky native interaction, without new guest scripts or UIA helpers. Actual Chinese source-unavailable warning was fully readable with the explicit Chinese dialog-font fix. Networking remained disabled: this is offline/source-unreachable evidence, not HTTP404. source=toolbox actual Cancel returned exit0/main0. source=app explicit Continue returned exit0, launched the actual installed HonsenProcure.exe login page with path/version0.1.10 and main count1; no password/CAPTCHA/authentication input was entered. Main-controller cleanup stopped only that verified owned executable.

Raw `010-after-cancel-count.txt` is scalar0. `010-launch-result.json` has a PowerShell5 provider-wrapped cancelClientCount.value0: committed evidence projects only allowlisted scalars and does not copy PSDrive/PSProvider/credential-type metadata.

Six actual installed launch identity cases were rejected, each command exit1 and main0, with native error acknowledged by the controller:

- old noncanonical UpdateUrl (`010-old-url-denied.json`);
- wrong LauncherPath (`010-launcher-denied.json`);
- registry/Manifest0.1.99 versus actual EXE0.1.10 (`010-version-denied.json`);
- conflicting HKCU clone (`010-conflict-denied.json`);
- junction InstallLocation alias (`010-reparse-denied.json`);
- copied Runner outside the installation (`010-outside-runner-denied.json`).

Each raw case JSON proves clientCount0; exit1 observations are the controller's actual official CLI results, not invented fields claimed present in the raw JSON. Final `010-final-state.json` confirms registry0.1.10/Runner19809309..., canonical restored, HKCU clone absent, alias absent and main0. Root stopped the owned Sandbox with the official CLI and verified wsb list empty. Safe allowlisted evidence is adjacent WINDOWS-CANDIDATE-010-20261104.json.

These close only the named installed source-failure/cancel/continue/readability and strictidentity subcases. They do not establish account/role/project/attachment business security, online stable download/immediate update, actual Toolbox cross-repository caller or Windows-native historical/COS-byte restore. Overall updater release remains blocked by the confirmed old-Runner false-success P1.
