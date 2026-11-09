# Windows local candidate0.1.5 — 2026-11-04

Status: build and bounded installed Runner/source registration smoke PASS. Full installed business/security and final V1 acceptance remain OPEN.

Exact source `7249dc5f225e638a5fe27f9ef9e4d0be0f022ff1`, local version0.1.5. Source was frozen; production build inputs were compared to the SHA before/after and had no differences. This is not the SHA of a later evidence-only checkpoint.

Installer immutable copy: `H:/Honsen/artifacts/windows/7249dc5-015/Honsen-Procure-0.1.5-Setup.exe`.
SHA-256 `3ff34d19fc9defeb45141a39961639bd9108c440d5c97e226acb3af1b38d940c`.
Original output: `.cache/cargo-target/release/bundle/nsis/Honsen-Procure-0.1.5-Setup.exe`.
Build log `.cache/setup-015-build-20261104.log`; exit0. Previous source2812631/version0.1.4 was retained separately in `H:/Honsen/artifacts/windows/2812631-014/` with its original hash.

## Actual current artifact smoke

Fresh isolated Windows Sandbox10.0.26100.0 installed this exact package. EXE/manifest/registry version agreement and canonical manifest/both registered URL preconditions passed. Installed Runner rejected bad installer hash, incorrect target and a live foreign PID, at exact expected steps, with exit1/result.failed and unique operation IDs. No client restart occurred; installed files and registration remained unchanged, foreign process survived and was owner-cleaned. Three cases PASS. Raw `.cache/installed-security-015-20261104/evidence/summary.json` and runner-negative.json, safe committed copy adjacent WINDOWS-CANDIDATE-015-20261104.json.

Installed main EXE SHA-256 `6459ead8ae0465093ae6c6e6e84df6a6f2cd5ad1e1fc3989427a9a1c8b0e31b0`; installed Runner `5c494f36999d5949dd47339a9efef15aae86ac36a2741d0dbd3b699497a2984c`. These installed bytes are not substituted with the debug native-test EXE.

The task-owned Sandbox session was closed after capture; no host application installation or COS access occurred. Prior P1 install-path evidence was reused only for its unchanged installer/Runner contract boundaries; it was not mechanically repeated. This smoke is not actual Toolbox caller launch/apply or a successful version-upgrade proof.

## Linux unchanged-boundary reuse

`git diff db2ad11 7249dc5 -- apps/server packages/shared deploy/linux scripts package.json package-lock.json` returned no differences. The existing exact-db2ad11 Linux runtime archive, protected manifest/native module proof and restored-service smoke therefore retain their original tested SHA and unchanged server/deployment scope. They are not renamed or relabeled as a new7249dc5 build. See LINUX-CANDIDATE-20261104.md.

Remaining: authenticated installed Windows security, complete native business chain on the final candidate, actual virtual/physical print, complete multilingual acceptance, authorized Toolbox cross-repository joint flows, signed-in historical restore readback and attachment-byte restore. None is marked PASS here. No merge, formal Release, production deployment or real-data mutation occurred.
