# Windows local candidate0.1.9 — 2026-11-04

Status: actual build, fresh installation and three existing apply-negative checks PASS. Fresh installed Runner matches the final effective external-binary entry. Upgrade replacement and installed launch acceptance remain OPEN.

Exact source `ab322af2f1e1d32bf72c9d0569c3db9f4dabe373`, local0.1.9. This contains the private hidden-start dialog visibility repair. It was genuinely rebuilt; it is not the old11bb10f/018 package relabeled. Production-input comparisons before/after build were empty.

Immutable setup `H:/Honsen/artifacts/windows/ab322af-019/Honsen-Procure-0.1.9-Setup.exe`.
SHA-256 `e0b5332f14e9cd88d1e78ae39041bbfbe0bff03b850678e7c17f82114d0c79a9`.
Build log `.cache/setup-019-build-20261104.log`, exit0. Existing build/NSIS/Manifest/public protocol were not modified.

The same read-only100ms watcher captured the first-stage actual release-assets/HonsenUpdateRunner.exe when its bytes matched the first-stage target Runner. Capture09:58:44.975Z; final main EXE completed10:00:03Z. Build completion also verified the resource did not change after capture.

First resource-stage Runner immutable copy (not the final effective installed payload): `H:/Honsen/artifacts/windows/ab322af-019/expected-payload-HonsenUpdateRunner.exe`,3793408bytes.
SHA-256 `8d9c3d129b6afcbbb758f3596f5fac7cbcfefa7387340a13083a385e42480784`.
Adjacent expected-runner.json/capture-build.mjs preserve metadata and observation logic. This is the first resource input supplied to NSIS, but subsequent read-only investigation found a second same-name external-binary entry. Treating this first capture as the final effective payload was an incorrect assumption; the correction below preserves both inputs and actual installed evidence.

No new guest/WSB script or rejected batch action was recreated. The main controller is reviewing the existing tracked Sandbox entry for the smallest supported acceptance path. This build did not start Sandbox or change desktop focus. The main controller subsequently used the existing reviewed tracked entry for fresh acceptance as recorded below. No production installation, registry, COS, Release or deployment was touched.

Host native hidden-start probes for this source are separate main-controller evidence; they do not establish installed package behavior. Disabled Sandbox networking can only establish offline/source-unreachable behavior, never HTTP404. A qualified live stable immediate-update asset, real Toolbox caller and original complete security/data-recovery gates remain OPEN.

## Corrected effective Runner provenance and actual fresh result

Generated NSIS installer.nsi line652 first copies release-assets Runner8d9c3d... to HonsenUpdateRunner.exe, then line656 copies the external binary with the identical destination name. The latter input's SHA-256 is `1943cac8e7bd8726f2f5ed6e0ad419d289bc82b2f3e946bce523d2e806f87f40`,3793408bytes. Source timestamp09:59:15.0392492Z. The generated script timestamp09:59:47.2175581Z and setup completion10:00:03Z establish the build ordering. No source or NSIS was changed during investigation.

The main controller's existing tracked Sandbox entry actually fresh-installed exact019 and ran the three bad-hash/wrong-target/foreign-PID apply rejections: PASS. Raw `.cache/installed-security-019-existing/evidence/{summary.json,runner-negative.json}`. Its installed Runner SHA is exactly1943cac8..., matching the last external-binary input, not the first resource capture. Installed main EXE SHA `5ef07e21fcae1c28742e45b9456cd21f03335724fa3e4096c1ca8615b29211d4`. This resolves the fresh hash discrepancy; it is not evidence of tampering or a failed running-parent replacement.

Immutable provenance preserved beside the package: effective-external-HonsenUpdateRunner.exe, generated-installer.nsi and effective-runner-provenance.json. Generated NSIS SHA `f1b947d381b4d060410ddfe24fcdf8a54917527fbe1bded7fb83a61084bc5fe5`. Safe combined evidence: adjacent WINDOWS-CANDIDATE-019-20261104.json. The earlier expected-runner.json/expected-payload filename remains an unmodified historical first-stage observation and is explicitly superseded as an effective-payload expectation.

Actual017→019 upgrade replacement has NOT passed and cannot inherit fresh-install success. Existing018 final effective Runner hash remains unknown: its first resource capture alone is insufficient, and its later target cache was overwritten by019. Root controls the active owned guest and subsequent official CLI/native interaction; this artifact-preservation task performed no guest operations and did not close that session.

## Actual installed offline launch: functional cancellation PASS, Chinese rendering FAIL

After the fresh install, the controller used the already-installed official Windows Sandbox CLI with ExistingLogin in the same owned guest to execute the registered019 Runner launch. This was direct invocation of an existing product in the guest, not creation/retry of the rejected guest-script/configuration batch. whoami evidence confirmed WDAGUtilityAccount.

An actual source-unavailable confirmation dialog appeared. The controller's sky interaction focused it and pressed Esc; the actual command exited0 and no HonsenProcure client started. Raw `.cache/installed-security-019-existing/evidence/after-cancel-client-count.txt` records0. This passes only explicit cancellation/no-start behavior. Guest networking was disabled, so this is offline/source-unreachable proof, not an asserted HTTP404 response.

The same actual dialog rendered its Chinese content as tofu boxes: **FAIL**, not an environmental PASS or a complete launch acceptance. The guest already had msyh.ttc/simsun.ttc and other CJK font files (`cjk-font-files.txt`), so no font installation or OS-setting change was performed. `ui-culture.json` records en-US/1033 for the inspected culture; this alone does not establish which private Runner locale selection was used.

A later minimal B-owned locale-specific dialog-font repair is being prepared separately: explicit Microsoft YaHei UI for Chinese, Segoe UI for English/French. It is not in immutable sourceab322af/019 and needs a new code SHA/package plus actual installed rendering recheck. No later result is retroactively transferred to019. Overall installed launch remains FAIL/OPEN until legibility is verified; successful Esc cancellation cannot close that gate.
