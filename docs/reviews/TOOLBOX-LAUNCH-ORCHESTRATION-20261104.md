# Runner launch orchestration and identity — 2026-11-04

Status: implementation and Rust builder checks PASS; actual installed018 launch/native choice acceptance pending. This report belongs to its containing code checkpoint, not the prior66c777e/017 installed artifact.

User explicitly approved TOOLBOX-LAUNCH-IMPLEMENTATION-20261104.md scope2, including offline/source-failure explicit confirmation before verified local startup. Five upstream sources were refreshed in AGENTS order; remaining gaps (native stable query/choice/skip/strictlaunch) are implemented only here, while scope3 Toolbox caller/catalog/live stable remain separate. No public CLI/Manifest/OperationResult/registry identity or installation contract changed.

## Exact implementation

C-owned update_runner.rs adds a separate private LaunchRegistration reader, keeping existing apply read_registration and validation/worker/installer behavior untouched. Strict launch enumerates allHKLM/HKCU32/64 views, ignores only NotFound, rejects partial/unreadable/conflicting registrations, permits identical identity duplicates. It checks approved appId/displayName/publisher/schema, fixedEXE/Runner/Launcher, both canonical registry URLs and Manifest URL, legal/equal versions, actual EXE file version, absolute canonical same-directory paths, reparse components and the current Runner's own canonical executable path. Launch-only Manifest reading is bounded1MiB and accepts standard UTF8 BOM. Existing apply reader was not changed.

All metadata/preference/UI work follows initial identity validation. Every local startup performs a fresh validation and compares with the initial identity, rejecting a valid but switched registration after a dialog/network wait. No-update, exact skipped version and explicit remind-later start only that verified local EXE. Bad preference read/write displays the dedicated acknowledgement; dialog creation failure propagates and prevents launch. Bad source/download/hash requires the separate explicit fallback confirmation, never a silent local start. Future versions still prompt after an older version was skipped.

Immediate update retains the downloaded installer RAII owner while synchronously invoking the registered Runner's **existing public apply CLI**, preserving the temporary-copy worker chain, operation-specific result path and mutex/UAC/NSIS validation. It does not directly call apply to bypass the worker. The downloaded SHA is checked again, and identity is revalidated/compared before invoking apply. Result process status/appId/operationId/source/fromVersion/toVersion/installLocation/executablePath are verified. Apply failure returns failure without local-start fallback or automatic rollback. Source=app/toolbox changes only source recording, not authorization policy.

lib.rs exposes the two new modules privately; the existing public update_runner module provides the minimal error-dialog wrapper to the CLI. Cargo adds only required features on the already-pinned windows-sys dependency. Cargo.lock did not change. No schema, DB, business outbox/payment/COS or renderer behavior changed.

## Actual checks and retained failures

- First cargo check failed on B's missing DWLP_USER binding; corrected in its owned module to pointer-width-compatible dialog storage offset. No false PASS was recorded.
- Full library run:139PASS/7ignored, .cache/scope2-lib-tests.log. Ignored tests require actual nativeUI or canonical network and are not accepted by this result.
- After launch-only BOM compatibility addition, affected launch filter:8PASS/7ignored, .cache/scope2-launch-final-tests.log. This includes C identity/stateflow/BOM and B noninteractive transport/URL checks; overlap is not additional independent acceptance.
- A's focused parser/preferences run:7PASS/7ignored overall (5A/2B), .cache/scope2-a-tests.log; real Windows protected preference/symlink tests passed without modifying globalLOCALAPPDATA.
- Current bins check PASS, .cache/scope2-final-check.log; Runner CLI contract/result tests4/4PASS, .cache/scope2-bin-tests.log.
- Cargo fmt and Clippy exit0, .cache/scope2-clippy.log. Existing warnings remain; new B style warnings and A test-only readonly warning were separately disclosed, not called all historical. They do not establish native UI acceptance.

C tests cover incomplete/foreign/old-URL/version/path/schema identity, duplicate conflict, invalid identity before any network, changed identity on local revalidation, source failure confirm/cancel, missing/older release, exactskip/future release, preference failure and warning creation failure, and apply failure with no spawn. Real registry conflict/path/version rejection still requires installed isolated Windows proof; pure field/state tests do not replace it.

All builds/cache/TEMP useH. No production install, real registry edit, release publishing, merge, deployment, account secret or new Node/browser runtime was introduced by this Rust implementation.

## Remaining actual acceptance

BLOCKER for scope2 closure: installed newRunner018 bytes must match the installer payload (capture pre-Tauri release-assets bytes or actual NSIS extraction), then real native404/offline warning cancel/continue and strictidentity negative scenarios. Running old Runner parents could affect replacement; this is a risk to verify, not a declared defect or silent NSIS change. Actual live immediate-update flow needs a qualified canonical stable asset; noRelease is fabricated to claim that PASS. Native three-button/locale/keyboard probes are separate real desktop evidence, not DOM proof. Original P1 proof is reused only for unchanged boundaries.

## Combined checks and subsequent focused safety repairs

A later combined run completed142PASS/7ignored (.cache/scope2-final-lib.log), plus final Runner CLI4/4 (.cache/scope2-final-bin.log) and fmt check. After that run, independent review found B's constructor-failure cleanup could follow an unpinned UUID directory into an external sentinel. Its owned implementation was repaired and the failing-first genuine Windows junction regression then passed with the other module checks (5PASS/7native probes still ignored), current bins check/Clippy/fmt passing. The full142 result remains evidence for its exact pre-repair combined boundary; it is not represented as a post-repair full rerun. The focused repair proof supplements that unchanged combined scope.

The controller also confirmed a real hidden-start nativeUI defect on11bb10f and had B repair private dialog visibility with posted-message explicit ShowWindow. Sourceab322af2f1e1d32bf72c9d0569c3db9f4dabe373 contains that repair. Controller-operated hidden-start Chinese X→Later and English Esc→Later probes then actually passed. These are separate desktop interactions, not derived from ignored Rust tests. Candidate018 remains immutable old-source evidence; a genuine019 rebuild and payload capture is in progress for ab322af. Installed source-failure/identity/payload-replacement gates are not automatically closed by those host probes.
