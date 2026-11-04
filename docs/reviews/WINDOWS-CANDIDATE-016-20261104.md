# Unified-source Windows candidate0.1.6 — 2026-11-04

Status: build, actual single-directory Runner upgrade, synthetic-file retention and post-upgrade negative/source smoke PASS. Full installed application/Toolbox/security acceptance remains OPEN.

Exact source `100011d41383bac4a7533c388572b4ac65bb97ee`, local0.1.6. The package was genuinely rebuilt from this frozen checkpoint, not renamed from0.1.5. Before/after production-input comparisons to100011d were empty; worktree evidence-only SPO documents were dirty and were not build inputs.

Immutable package `H:/Honsen/artifacts/windows/100011d-016/Honsen-Procure-0.1.6-Setup.exe`; SHA-256 `c0b5d756a76656bbf393cc6301efe147873dfecaaa996fd4f03e362491aed639`. Build exit0/log `.cache/setup-016-build-20261104.log`. Previous0.1.5 is preserved at `H:/Honsen/artifacts/windows/7249dc5-015/` with its original3ff34d19... digest.

## Actual Windows Sandbox upgrade

Fresh Sandbox10.0.26100.0 installed the immutable0.1.5 package in one synthetic directory. A genuine isolated SQLite file (integrity_check=ok, synthetic_history.minor_amount250) and a text marker were placed under the synthetic guest app-data directory. Their pre-upgrade hashes were captured. This is a file-retention fixture, not authenticated application business-data migration acceptance.

The registered old Runner was invoked through the existing public apply parameters, source=toolbox, wait-pid0, restart=false, verified0.1.6 package, unique operation/result path. Actual result: exit0, status success, fromVersion0.1.5, toVersion0.1.6, original directory unchanged. Registry/manifest/main-EXE version matched0.1.6, installed files existed, no client restarted. Adapter attempt and exit0 logs were captured. SQLite and marker hashes remained byte-for-byte unchanged.

Then the existing current installed-runner-security script checked canonical manifest and both registry URLs, and all three precise bad-hash/wrong-directory/foreign-live-PID rejections. All PASS, no restart/file/registration change. Installed main EXE hash `31ed016a264d046b427ce692ed33f70cb325206e91bba8c21f1c1d89f76b7a34`; Runner `5c494f36999d5949dd47339a9efef15aae86ac36a2741d0dbd3b699497a2984c`.

Raw `.cache/installed-upgrade-016-20261104/evidence/{summary.json,apply-result.json,runner-negative.json,installer-adapter.log}`. Safe committed structured evidence: WINDOWS-CANDIDATE-016-20261104.json. Ignored guest controller bootstrap SHA-256 `8fdb017238f7d8b7d1493d8f130a81650e32a75a066bc459cbd4512925a9d011`; copy preserved beside the immutable package. It was syntax-checked before execution. Only candidate packages, this safe script, original negative-test script, synthetic SQLite and safe metadata were mapped; no project root/cos/real env. No tracked production/script change was needed.

Task-owned Sandbox closed after capture. No host install, production data,54329 access, COS upload, Release or deployment occurred. Prior P1 directory matrix was not repeated.

## Exact remaining boundaries

This is an actual Runner invocation with source=toolbox, not the real Toolbox application's cross-repository caller. It does not prove running-client update handling (wait-pid was0), restart=true success, rollback, full business SQLite migration, installed account/role/project/attachment security, virtual/physical print or restored signed-in client readback. Those gates remain OPEN. Debug native business EXE and installed Release EXE are separate artifacts even when source matches100011d; their hashes are not substituted.

Linux server/deploy/build-input diff db2ad11→100011d is empty for apps/server, packages/shared, deploy/linux, scripts and root package/lock. Existing exact-db2ad11 runtime proof is reused for that unchanged boundary with its original source label, not rebuilt or relabeled.
