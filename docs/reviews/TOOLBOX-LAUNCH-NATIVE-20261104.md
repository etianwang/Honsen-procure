# Runner launch scope2 native observations — 2026-11-04

Status: **PASS only for actual native dialog return values and bounded HTTPS completion**. Successful online update, final Chinese-font installed acceptance and full Toolbox integration remain OPEN. This evidence-only report does not modify any product, guest or release artifact.

## Exact hidden-start probe artifact

Tested hidden-start repair source: `ab322af2f1e1d32bf72c9d0569c3db9f4dabe373`.

Immutable native probe `.cache/scope2-native-ui-hidden-fix/scope2-native-probes.exe`, SHA256 `e61284dc9d6af906decde7aac22507f27e3d9ab4b9792d2bccf99740674cd1d0`. This is a cfg-test binary executing the real Unicode Win32 dialog code, **not an installed Release Runner**. Root actually operated the desktop; Agent A independently read each saved result/error log and recomputed binary/log hashes. No UI interaction, Cargo test rerun or guest operation was performed for this evidence review.

| Actual controller action                           | Asserted return | Saved result log under `.cache/scope2-native-ui-hidden-fix/` |
| -------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| Chinese dialog window X                            | RemindLater     | chinese-hidden.log                                           |
| English Esc                                        | RemindLater     | english-default.log                                          |
| French Skip this version                           | SkipVersion     | french-skip.log                                              |
| Update now                                         | UpdateNow       | update-now.log                                               |
| Failure warning Cancel                             | false           | failure-cancel.log                                           |
| Failure warning explicit Continue                  | true            | failure-continue.log                                         |
| English Tab → visibly focused Remind later → Enter | RemindLater     | english-keyboard.log                                         |

All seven log files independently contain their named native test's successful assertion, one pass/zero failures/zero ignored; matching stderr files are empty. User interaction times above60seconds in two logs are interactive observation delays, not a claimed metadata timeout. The logs establish asserted return values; exact clicks/focus are attributed to root's actual desktop observation rather than fabricated as log contents.

The same binary's real `native_canonical_network_probe` returned `canonical_request_success=false`, elapsed1817ms, test exit0. **This result exists in the main-controller tool transcript only; no raw log filename is invented.** It passes the bounded-completion assertion, but does not prove a valid stable feed, HTTP404, successful download or apply. The probe did not report an HTTP status. Seven previously ignored functions were explicitly executed eight times in total: English choice was exercised twice, with the canonical HTTPS probe providing the eighth execution. This is8 successful bounded assertions, not8 end-to-end updates.

Update-now is only the cfg-test native choice return; it did not download or run an installer. French skip did not itself persist a user preference or prove restart consumption. Failure Continue did not itself start a registered installed client. Separate unit/state/filesystem evidence cannot silently convert these native-return checks into those integrated outcomes.

## Retained hidden-start failure

Initial source `11bb10f42acfcbaffcb15710d9768c5bfcbc493b`, probe SHA256 `5954b5eac1b9bec70fbfd0a561df40dcd92751fb7b21fb11ba5fb7556104f971`, hung under its hidden caller. `.cache/scope2-native-ui-11bb10f/chinese-close.log` records test start/over60seconds without a completed result; root verified and terminated the owned hung fixture. This is retained as hidden-visibility FAIL, not an assertion PASS.

A separately visible-start old-source Chinese close test passed in `.cache/scope2-native-ui-11bb10f/chinese-close-visible.log`. It proves only that visible-start return boundary for11bb10f, not the later hidden-start repair. The corrected sourceab322af added the required visibility handling; its seven dialog results above are separate evidence from the fixed binary.

## Font patch and installed boundaries

Current later font repair `90f28043aecd74a90d3267952b922aea45845a88` passes Locale into the dialog helper and selects Microsoft YaHei UI for Chinese; English/French remain Segoe UI. A direct `git diff ab322af 90f2804 -- apps/desktop/src-tauri/src/update_launch_windows.rs` review found the font/Locale propagation change, not a choice-handler/state-data change. Prior English/French return checks may be reused only for that explicitly unchanged boundary. Old Chinese close-return success does not establish legible Chinese output from the new font or its final installed package. Candidate0.1.10 subsequently completed its exact-source build, but the actual upgrade payload check failed as recorded below; no installed-font or upgrade PASS is assigned here.

The separate [candidate0.1.9 record](WINDOWS-CANDIDATE-019-20261104.md) contains actual fresh installation and three apply-negative PASS results, including corrected effective Runner provenance. In its networking-disabled Sandbox, root launched the registered Runner, cancelled the actual source-unavailable dialog, observed exit0 and zero client processes. `.cache/installed-security-019-existing/evidence/after-cancel-client-count.txt` independently reads0. This is offline Cancel/no-start proof; disabled networking cannot establish HTTP404.

The same installed019 Chinese dialog rendered tofu boxes: **FAIL** despite functional cancellation. Existing CJK font files were present, so no font installation or OS setting change was performed. The inspected culture alone does not identify the private locale-selection result. New font source90f2804 and its package must receive their own actual installed rendering recheck; neither old host probe nor019 cancellation closes that failure. Actual017→019 replacement was not accepted by the fresh-install result.

Remaining NOT RUN/open: high-DPI/long-version native layout, final-source Chinese legibility, real qualified stable asset download/hash/apply, actual skip persistence/restart through launch, installed explicit-continue client startup, actual Toolbox scope3 caller, and full installed security. No formal Release, production deployment, main/PR merge or external account credential was created or exposed. The adjacent JSON separates source/binary/log/transcript provenance and these limits.

## Subsequent actual upgrade payload P1 — FAIL

The controller actually attempted019→0.1.10. Read-only host evidence `.cache/installed-security-019-existing/evidence/upgrade-result.json` reports status success and installerExitCode0; `upgrade-after.json` records registry/Manifest/main EXE versions0.1.10, preserved directory/SQLite/marker and no client process. Those facts do **not** establish a successful complete upgrade. Installed Runner bytes remain old019 hash `1943cac8e7bd8726f2f5ed6e0ad419d289bc82b2f3e946bce523d2e806f87f40`, while immutable010's final effective package Runner is `198093091d79159a62d01335b27dfe137bdd82b3f7e732faa34a27f065bff205`. Agent A recomputed the preserved effective package file hash and compared the actual saved result, confirming the mismatch without touching the guest.

This is a new Runner-payload replacement P1, separate from the previously closed installation-directory repair. The controller grades it FAIL; C owns its precise repair proposal under the frozen installer contract. CLI/installer success, updated version labels and preserved data cannot close it. Because that upgraded instance still has old Runner code, it also cannot validate the later Chinese font fix. Any separately fresh010 font observation must retain its own scope and cannot become upgrade PASS. No guest, Result JSON, C-owned report, NSIS or production file was modified in this evidence-only recheck.

## Later controller installed010 evidence

The earlier pending installed-font/explicit-continue statements above describe the probe-stage checkpoint only. WINDOWS-CANDIDATE-010-20261104.md/json now separately records source90 reinstallation with exact expected Runner bytes, readable Chinese, actual Cancel/main0 and explicit Continue/installed client1, plus six identity refusals and completed guest cleanup. Those scoped PASS results supersede pending local-launch items; they do not overwrite the failed019→010 upgrade, establish live immediate update or close scope3/full installed security.
