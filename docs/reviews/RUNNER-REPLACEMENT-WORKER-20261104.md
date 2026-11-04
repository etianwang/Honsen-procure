# Runner replacement P1 — worker verification slice — 2026-11-04

Status: builder targeted checks PASS; real installed/native acceptance remains OPEN.

Approved boundary: sectionB of RUNNER-REPLACEMENT-P1-PLAN-20261104.md. Only update_runner.rs and its same-file regression tests change. No NSIS, public arguments/result fields, rollback, asynchronous parent exit, data directory or uninstall behavior changes.

## Change

After the installer returns0 and existing registration/Manifest checks pass, the worker additionally requires the registered Runner to be the fixed HonsenUpdateRunner.exe in the original install directory, rejects reparse components, and checks its actual Windows PE file version against expected-version. These checks precede constructing success and every restart=true spawn. Failures return the existing error/result mapping; they cannot reach success/restart.

The shared PE-version helper now compares four numeric u16 parts. A three-part expected release is padded with exactly one zero fourth part. A nonzero fourth part must match exactly. Repeated trim_end_matches no longer incorrectly erases zero components from versions such as1.0.0. No other release-version policy is changed.

## Proposed focused verification

- New pe_file_versions_match_only_three_parts_plus_one_zero_or_exact_four_parts regression covers1.0.0/1.0.0.0,0.1.10/0.1.10.0, exact nonzero fourth component, mismatched old version/nonzero fourth component, too few/many components, negative/nondigit/whitespace and u16 overflow.
- Controller should execute focused version and existing update_runner tests, bins check and relevant Clippy after paired NSIS changes are ready. B deliberately did not launch parallel Cargo commands.
- Rustfmt and diff checks already PASS.
- Real isolated upgrade must prove both EXE and Runner package hashes/versions and correct result/no-restart on failure. Old019 worker lacks this new check: its first upgrade must be protected by sectionA installer payload/version verification, not retroactively by new worker code.

Toolbox five-source preflight was refreshed in order. No new identity/contract gap is introduced; existing Runner false-success gap is the explicitly approved repair. Installation-directory P1 remains independently closed.

## Controller builder verification and affected callers

Controller executed `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib update_runner::tests`:12PASS,0ignored (`.cache/runner-p1-worker-targeted.log`). Rustfmt and Clippy bins/tests also exit0 (`.cache/runner-p1-worker-clippy.log`), with warnings retained (not every warning was individually traced to historical code). Controller subsequently completed the full library suite:144PASS,7ignored (`.cache/runner-p1-worker-full-lib.log`). B read the actual results and did not run duplicate Cargo.

Read-only caller review confirms the shared PE helper is used for launch’s main EXE version, apply’s main EXE version, and the newly added apply Runner version. Thus the1.0.0↔1.0.0.0 correction applies consistently to all three boundaries; nonzero fourth components are not ignored. No public version policy or startup authorization branch changed. Runner path/reparse/version rejection occurs before success construction and restart. This static conclusion is not old019 first-hop upgrade acceptance.

## Proposed isolated-guest wrong-Runner-version fixture

These are preparation steps, not an executed test or production asset:

1. Use only an official disposable Sandbox with a valid installed new candidateV containing this worker fix. Record source, Setup/main/Runner hashes and PE versions; retain the old019 Runner only as a separately labelled synthetic-test payload. Start with no client process and synthetic marker/SQLite only.
2. Build a distinctly named **NEGATIVE-TEST-ONLY** installer fixture using the already available NSIS toolchain. It is not a standard release asset, never published or made canonical. Its bounded behavior under existing UAC is to leave current main EXE/Manifest/registration atV, deliberately put the known old-version Runner at the fixed registered path, and return0. It uses the approved unique same-directory in-use rename primitive to avoid killing the mapped caller; it must not touch user data or unrelated files. This intentionally defective fixture isolates workerB: using the real production installer would correctly fail earlier in sectionA and would not exercise B’s postinstaller version check.
3. Invoke the currently installed **new worker-bearing Runner** through the unchanged public `apply` contract with the fixture’s real SHA256, original directory, expected-versionV, restart=true, wait-pid0, unique operation UUID and result path. No production URL, CLI flag or Manifest schema changes. The worker must still synchronously complete the public invocation.
4. Require actual before/after disk evidence: main/Manifest/registration remainV, fixed Runner PE version is the deliberate older version, installer adapter records exit0, public invocation fails, its unique result is statusfailed/appId/source/operationId-correct and no HonsenProcure client is restarted. Existing FileVersionMismatch mapping is step`runner`; do not invent a new result field/step or demand installerExitCode0 in that failure JSON (the existing generic failure mapping may leave it null, so adapter evidence proves the actual installer exit).
5. Preserve the negative result and hashes. Dispose the test guest or explicitly repair with the real candidate under the already-approved isolated repair procedure; do not auto-rollback, modify a production install, or relabel this negative fixture as a production candidate. Old019→real-new-package byte/version success remains a separate mandatory sectionA paired acceptance.

If a controlled defective fixture is not built, label workerB’s real postinstaller negative case NOT RUN rather than substituting the pure version-unit test. B has not created or executed any guest fixture in this handoff.

## Test-only installer fixture implementation

`tests/windows/runner-version-negative.nsi` is now provided. It is explicitly NEGATIVE TEST ONLY, file version0.0.0.0, absent from product packaging and never a standard Release asset. Runtime rejects any account other than WDAGUtilityAccount, any target other than `C:\Honsen Security Synthetic\Honsen Procure`, mismatching HKLM64 app/installation/EXE/Runner/Launcher/version registration, wrong main/Runner PE version, and current Runner/Manifest bytes differing from the exact embedded candidate inputs. The compiled manifest version must equal EXPECTED_VERSION. Old payload must report the actual0.1.9.0 PE version.

Only after these guards does the fixture rename the mapped fixed Runner to a unique same-directory `.NEGATIVE-TEST-ONLY-runner-<UUID>.exe`, publish the retained old019 Runner with CopyFileW fail-if-exists, verify its exact bytes and deliberately exit0. It does not change main, registry, Manifest, data or business state. It never removes unknown files, rolls back or starts a client. Failure returns91 (initial guards) or92 (fixture publication); the alias is retained for explicit repair/disposal.

Compilation requires explicit OLD_RUNNER, CURRENT_RUNNER, CURRENT_MANIFEST, EXPECTED_VERSION, EXPECTED_MS, EXPECTED_LS and FIXTURE_OUT definitions. EXPECTED_MS is major*65536+minor and EXPECTED_LS is patch*65536+revision. CURRENT_RUNNER and CURRENT_MANIFEST must be captured from the final new-worker candidate used in the guest. The Runner and Manifest receive full comparison at check time using built-in System/kernel32/CRT with64KiB buffers; those comparison guards are released afterward. This is a controlled, non-adversarial synthetic WDAG fixture only, not a production path-pinning/security control. Main EXE is checked by PE version, not a full-byte main-EXE hash. No plugin download, external scripting or new environment dependency occurs in the installer.

A compile-only syntax check using retained010 Runner/current010 manifest and019 old input succeeded with the already-installed NSIS. Output `.cache/runner-version-negative-syntax/Runner-Version-Negative-TEST-ONLY-syntax010.exe`, log `compile.log` in the same directory. TEMP/TMP were explicitly set to that H:-based cache. This syntax010 file does **not** exercise the new worker and must not be used as the final negative-acceptance asset. No fixture was run on the host or guest by B. Recompile with the final new-worker candidate and record the three input hashes and fixture hash before controller execution. Compiler retains a LegalCopyright metadata warning; no success claim is derived from it.

## Actual production helper byte-comparison matrix

Added `tests/windows/runner-file-compare.nsi`, a host-only, silent test fixture which includes the exact reviewed `runner-install.nsh` and directly calls `HR_Pin`, `HonsenRunnerCompare` and `HR_Unpin`. It does not reimplement the comparator, invoke publish/cleanup/lifecycle functions, access registration or install an application. Executable location and compile-time TEST_ROOT must match a fresh directory under the authorized H: repository cache; results are written only there. No Cargo or guest action occurred.

C confirmed the four-function interface stable while adding lifecycle logic. To preserve exact compile provenance, the whole helper was captured byte-for-byte (not rewritten) under `.cache/runner-file-compare-a153777f-5597-4e3b-91a6-234f9c94fe91/runner-install.nsh` and included directly via HELPER_FILE. Captured helper SHA256 `565aa99e351eaba80bbaf74ec7e484f9bd90626d8912265282ffce24d9184f0d`. Current helper after C’s concurrent lifecycle edits was `4a713038ee476d946d507303581f59d8291d729443d0a64beb992a96c8a10958`; exact LF-normalized function-body comparison for HR_Open, HR_Pin, HR_Unpin and HonsenRunnerCompare all returned true (`unchanged-boundary.json`). This supports reuse only for those unchanged functions; it does not label the entire changed helper tested.

All8 compiled fixtures were actually executed on Windows in their fresh H: directories, with process TEMP/TMP set to that H: cache. Every fixture exit0 means its observed HR_Ok matched the expected success/rejection; rejection cases intentionally report HR_Ok0.

| Case                                   |       Input size | HR_Ok / error | Compared bytes | Helper elapsed ms |
| -------------------------------------- | ---------------: | ------------- | -------------: | ----------------: |
| small identical                        |               15 | 1 /0          |             15 |                 0 |
| empty identical                        |                0 | 1 /0          |              0 |                 0 |
| large identical                        |          2097183 | 1 /0          |        2097183 |                 0 |
| byte65543 flipped                      |          2097183 | 0 /13         |          65536 |                 0 |
| truncated by1byte                      | 2097183 /2097182 | 0 /13         |              0 |                 0 |
| missing target                         | 2097183 /missing | 0 /2          |              0 |                 0 |
| real010 PE identical, expected0.1.10.0 |          3793920 | 1 /0          |        3793920 |                 0 |
| same PE bytes, expected0.1.11.0        |          3793920 | 0 /13         |        3793920 |                15 |

GetTickCount has coarse resolution:0 means below one tick, not zero processing cost. Whole-process wall times were726–2524ms including process startup. Exact per-case input/fixture SHA256, size, exit status, wall time and raw HR_Ok/error/bytes/elapsed results are retained in `evidence.json` plus each case’s `result.ini` and compile.log under that same directory. Large baseline SHA `352913daa44b3a05ece55d8d5aa96f37a14c639463a714f07af0a59aba2932be`; flipped SHA `9a4964ee3905d8af314b789b1760cc4b7951eebeaf59e43024f99a87cde61fbc`; truncated SHA `1995d53e082c76e1d7533951e436332891dc5cc597dcfd9138e79cfda13195fa`; actual010 PE SHA `198093091d79159a62d01335b27dfe137bdd82b3f7e732faa34a27f065bff205`.

The PowerShell controller wrapper contained an unintended `text` command after collecting each result. It produced non-terminating command-not-found diagnostics, preserved in the tool history; all8 actual compiler/fixture processes still independently exited0 and wrote the asserted raw result files. A subsequent independent read of the retained JSON/INIs verified those outcomes. No warning or wrapper error was relabelled as an installer/native upgrade PASS.

These are actual comparator/helper file regressions, not final NSIS package, mapped-parent upgrade, worker wrong-PE, cleanup lifecycle or production installation acceptance. No unknown files were deleted; synthetic inputs and evidence are retained.

Reproduction inputs: large baseline is2097183 bytes populated by .NET Random(1234).NextBytes; tampering XORs byte65543 with1; truncation removes the last byte. The15-byte small input is UTF8 "synthetic small"; the zero case is an empty file. Compile runner-file-compare.nsi with TEST_ROOT set to its fresh case directory, HELPER_FILE to the exact captured helper, FIXTURE_OUT inside TEST_ROOT, EXPECTED_OK=1/0, CHECK_VERSION=0/1 and VERSIONWITHBUILD=0.1.10.0 (or0.1.11.0 for the wrong-version case); execute that silent fixture once. Keep result.ini absent before running; the fixture refuses an existing result.

## Repository-relative test guard correction

Review found the compare fixture initially hardcoded the current H: project cache prefix. It now requires compile-time AUTHORIZED_CACHE, resolved by the controller from its repository-relative .cache directory with trailing separator. NSIS calculates the prefix length with StrLen and retains exact EXEDIR==TEST_ROOT plus existing-result refusal. The actual Windows run still uses the authorized H: workspace; the fixture no longer embeds that machine-specific project path.

A fresh compile/run of the small15-byte equal case after the guard change passed: exit0, HR_Ok1/error0/bytes15. Evidence .cache/runner-compare-guard-9caaa7c8-f2b4-4e56-a077-ef67d48e949a/evidence.json; fixture SHA d61bfa46ff420aab1aa016ab149973a4248dabf5f7e5b163221afa5b067baa98. It includes the same captured helper565aa99e...; earlier8cases retain their original test-source/helper provenance and are not relabelled as rerun on a final helper. Add AUTHORIZED_CACHE to the compile definitions documented above. TEMP/TMP were again explicitly H:-based. No helper or production source changed.
