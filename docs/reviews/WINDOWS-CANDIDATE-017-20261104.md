# Windows local candidate0.1.7 — 2026-11-04

Status: exact-source build and actual016→017 isolated Runner apply smoke PASS. Complete installed business/security/Toolbox gates remain OPEN.

Exact source `66c777e11fabeb446ed728200331eecea4cfd891`. The local0.1.7 package was actually rebuilt from that frozen source after the new print runtime was separately captured. Production inputs before/after matched the source; later evidence-document changes do not become the tested source.

Immutable installer `H:/Honsen/artifacts/windows/66c777e-017/Honsen-Procure-0.1.7-Setup.exe`; SHA-256 `844ae19a906be07139c5b911fea2b4100fe057cb01ddfeb054ef71fe6975a4f3`. Original output `.cache/cargo-target/release/bundle/nsis/Honsen-Procure-0.1.7-Setup.exe`; build log `.cache/setup-017-build-20261104.log`, exit0. Earlier016 immutable artifact and original source/hash are preserved.

## Actual affected smoke

Fresh Windows Sandbox10.0.26100.0 installed exact016 (hash c0b5d756...), seeded only a synthetic SQLite file and marker, and invoked the registered016 Runner through its existing apply protocol to install017. Actual process exit0, unique result status success, fromVersion0.1.6/toVersion0.1.7, same original directory. Registry/Manifest/main-EXE versions matched017. Both registered URLs and Manifest URL matched the canonical stable API. SQLite and marker hashes remained identical. No client restarted (wait-pid0/restart=false). Adapter log confirms native attempt and exit0.

Installed main EXE SHA-256 `ffa3c123b7ece6dce75e454b4bbf8a8ec446244e130f7d0acc2c3d173e79e851`; installed Runner `fcf339acbc51640d32aed384d88aa8b523a39fb60955fbf45a17049555e9dd9a`. These release bytes are distinct from the captured debug native EXE and must retain their separate hashes.

Raw `.cache/installed-upgrade-017-20261104/evidence/{summary.json,apply-result.json,installer-adapter.log}`; safe committed copy WINDOWS-CANDIDATE-017-20261104.json. Ignored guest bootstrap hash `8cc88cfd93e94c7bc94c25f5534f6725a5188d3d1af26cadacbfa4ebdd23f23e`, copy preserved beside the installer. Only isolated packages, synthetic SQLite and safe script/metadata were mapped; project root/cos/real env were not shared. Sandbox started after the root native-print critical UI completed, and its task-owned session was closed after capture without touching the native test client.

## Reused and open boundaries

Runner/apply source, NSIS and release parser/build script diffs100011d→66c777e were empty. Prior exact100011d/016 three-negative proof remains evidence for that explicitly unchanged owning-source boundary; those negatives and P1's full directory matrix were not rerun. A new Runner file hash is recorded rather than claiming binary identity. Normal017 apply/version/source/data smoke above is actual current-artifact evidence.

This is direct registered Runner apply with source=toolbox, not the real Toolbox application's caller. Running-client update, successful restart=true, authenticated business SQLite migration, full role/project/attachment security, physical print and actual signed-in Windows recovery are not granted by this smoke. No rollback/old-directory migration, public contract change, formal Release, merge or production deployment occurred.
