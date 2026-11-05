# Final installation, Toolbox and UAC ledger — 2026-11-06

Overall: `TOOLBOX_RELEASE_READY = NO`. This attempt produced a current-source local Windows candidate and verified its actual files, but did not close installed lifecycle, authenticated upgrade, real caller/apply or UAC cancellation gates. No formal host install, profile, database, registry, UAC policy or public update source was changed.

## Current-source candidate actually built

Pinned source: `20ebacfa6779baa2bea0ef761c220e0ea79efed5`, including minimal debug-only legacy draft constructor repair `f3e6af8`. Product build inputs under desktop/shared/build scripts were compared with this source before and after the pinned build: zero differences. Concurrent native test-server/driver work is separate and not part of these release inputs.

Local candidate version `0.1.14`; it is not a stable Release or a relabelled historical `0.1.13` package.

| Actual file                       |      Bytes | SHA-256                                                            |
| --------------------------------- | ---------: | ------------------------------------------------------------------ |
| `Honsen-Procure-0.1.14-Setup.exe` |  7,474,780 | `4242155528954c56272fd07d7aa49434b4063b4a28492c5ea193ebd01f8d6ae7` |
| `HonsenProcure.exe`               | 21,396,992 | `51bbe6801b2dda7843c9fcbdba1abd4ec41e2e4cf630691e23fa69e99a820579` |
| `HonsenUpdateRunner.exe`          |  3,792,896 | `ca343b5673df25815219b61c47cde5bd0f195e98104894f04acf2b0e1603ab00` |
| `honsen.app.json`                 |        314 | `e3cb9a1b7170418f0b7b44e3e7edd37c37e9db8f0dcf95eabb08bb1b745ddb08` |

Final independent artifact directory:

`H:\Honsen\Honsen-Procure\.cache\windows-final-candidate-20ebacfa\`

`candidate-build.json` records the exact source and files. All three executable PE versions are `0.1.14`. Actual Manifest identity, canonical update URL and Setup SHA sidecar were checked successfully. The unchanged build script performed TypeScript/Vite production build, release Runner/main build and NSIS packaging successfully; no installed runtime acceptance is inferred.

Build evidence: `.cache/final-c-install-20261106/build-014-pinned.log` and `final-build-source.txt`. An earlier build started at `0b78424` while the debug-only constructor was repaired; its installer is separately retained as `intermediate-unpinned-014-Setup.exe`, not presented as a clean-source final candidate. The second pinned build is the final artifact above. B's original debug main-bin `E0063` failure is not hidden by library-only test success; `f3e6af8` repairs that constructor, and B owns its subsequent debug-build evidence.

## Current environment and actual test boundary

- Read-only official `wsb list` returns the retained historical guest `283a80d3-ca0e-4799-963f-8d2a9eaa74d5`. This is inventory, not proof of current successful guest execution.
- Computer Use skill, guidance, confirmations and API were read; supported `sky.list_windows()` returned no targetable Sandbox or Toolbox window. No guessed HWND, terminal UI or alternate helper was used.
- That guest's last concrete installation evidence inspection was rejected with `CreateProcess blocked by policy`. This attempt did not retry it, change mechanisms or move the rejected installation/trust operation to the host.
- Exact `honsen.procure` and `honsen.toolbox` HKLM/HKCU × 32/64-bit registration checks returned eight absent records. This is a bounded inventory and does not assert no portable executable exists anywhere. Bounded Honsen directory/artifact searches did not identify a real caller.
- Current read-only host policy: `EnableLUA=1`, `ConsentPromptBehaviorAdmin=0`, `PromptOnSecureDesktop=0`. No policy or account was changed. No actual UAC prompt was triggered/cancelled in this attempt; current admin context and unavailable isolated install environment do not provide the required acceptance. Status remains `BLOCKED_ENV`.
- C did not start a guest, listener, installer, application or new installed profile. There are no new C test resources to clean. The pre-existing retained guest was not stopped or modified by C.

Raw nonsecret inventory/ledger: `.cache/final-c-install-20261106/{host-registration-readonly.json,ledger.json}`. New candidate main/Runner hashes must not be substituted for B's debug-native EXE or historical installed EXE hashes.

## Installed gate ledger and exact historical evidence

| Gate                                          | This attempt                                   | Historical evidence retained, without transferring it to current candidate                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh install/files/Manifest/registration     | `BLOCKED_POLICY`, current014 not installed     | Source `21491c5f4ccfbb668425b302f9be6e0523e1d1df`, installed013 offline guest PASS within [candidate013](WINDOWS-CANDIDATE-013-20261105.md).                                                            |
| Installed invalid hash/target/PID refusal     | No new installed execution                     | Installed013 actual negative cases PASS, `.cache/sandbox-start-20261105073206/runner-negative.json`; fixed-boundary historical scope only.                                                              |
| Installer failure/no false success/no restart | No new installed execution                     | Source `05e84ccf78761a3c187d04fc59886f55e62ee5f3`, actual sharing-lock refusal and explicit retry in [P1 result](RUNNER-REPLACEMENT-P1-RESULT-20261104.md). No P1 redevelopment or mechanical rerun.    |
| Real012→013 Runner update                     | Authenticated-history portion `BLOCKED_POLICY` | Actual old/new main replacement and initialized-empty SQLite byte retention PASS; baseline012 was not started against the newer database, so migration/authenticated business retention was not proven. |
| Uninstall retains data/unknown files          | Current014 not executed                        | Source05e84cc unknown/data retention PASS; source21491c5 initialized-empty SQLite retention PASS. Neither proves current authenticated-history retention.                                               |
| Real Toolbox discovery/launch/apply           | `BLOCKED_CALLER_CONTRACT_AND_ASSET`            | No substitute simulated caller, fake stable asset or source-labelled Runner call counts as real Toolbox acceptance.                                                                                     |
| Actual UAC cancellation                       | `BLOCKED_ENV`                                  | Historical ordinary guest account reached NSIS directly; wizard cancellation is explicitly not accepted as UAC cancellation.                                                                            |

Recomputed historical installer hashes remain:

- Baseline012 Setup: `747a66cfd4a760ad98d0c136a94410397ae148b814d5822b8797656000d286ea`.
- Installed013 Setup: `19f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b`.
- Historical013 installed main: `d9ab9881afe245086d4ac9b1fcbda4de87df8fcab02474ec127d098fc678522f` (historical installed observation, not a loose-file substitution).
- Historical013 Runner: `dfb9b313833b2af5cceac9f976c666f7097f6b5c16daa73b6f8bad5fad5481f2` (current loose artifact independently matches that historical Runner hash).

Installer/Runner/packaging owning-code diff against21491c5 was inspected and empty for that boundary. This permits explaining historical scoped evidence; it does not transfer a whole installed application/security PASS to the new main binary or repair the missing authenticated-data upgrade proof.

## Confirmed Toolbox conflict and concrete approval boundary

Five upstream Toolbox sources were freshly read in the required order. Owner source `f4a83c5848fa4bcab16e34c683b0423dd5cb6051`, actual MainWindow blob `429a0eefc2780d2cb4c5d8f58cf1bf14cc53bc92`, still appends apply-only arguments to launch and lacks a connected third-party Runner apply path. Procure is not catalog-enabled. `HONSEN_PROGRAM_ROOT` is only an installation-root override; no supported update-source test channel was found.

Fresh actual `node scripts/check-github-stable-release.mjs` returned HTTP404/exit1. It correctly refused to claim a qualified stable asset. No stable candidate was published to remove that failure.

The separately reviewable [repair proposal](TOOLBOX-FINAL-GATE-REPAIR-PROPOSAL-20261106.md) splits approval A (implement existing caller contract and correct launch arguments) from approval B (a new explicitly gated development-only HTTPS integration channel). Neither is implemented here. Public identity/Manifest/registry/Runner/result/installation/uninstall boundaries remain unchanged, and catalog auto-eligibility is not enabled.

## Handoff and classified issues

BLOCKER: current installed lifecycle and authenticated-data upgrade lack an executable isolated environment after the exact policy rejection; real UAC cancellation lacks an actual prompt; real Toolbox apply requires the confirmed caller repair and a qualified asset or explicitly approved development test channel. These gates remain unchecked and are not replaced by a successful build.

DEFERRED: bounded approved cross-repository work after explicit approval, manual/operator-supported resolution of isolated execution policy, and independent installed acceptance of the new candidate. Do not retry the rejected operation through a different host or tool.

WARNING: local014 has build/identity/hash evidence only. Existing compiler unused-import and chunk warnings remain. Old012/013 artifacts and failures are preserved. Mainline owns the final unified source and push; C creates no stable asset or deployment.

Server package `03c2c82b7a0a34cc4f360a293478e58fd529c8f3` / SHA-256 `59fa0cfdb7176034c816015bd1fa55613244c7091bf9317507b61addc9e223cd` is untouched by this Windows attempt. No C application/schema/server change requires repackaging that ZIP.
