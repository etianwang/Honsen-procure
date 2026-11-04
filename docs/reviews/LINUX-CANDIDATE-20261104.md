# Linux candidate artifact — 2026-11-04

Status: runtime Linux API package and restored-service minimal checks PASS. Earlier source-only/BLOCKED_ENV preparation below is historical and superseded by the actual run section. Full authenticated recovery remains OPEN.

Exact source `db2ad11988050583ae70b76c834b7eb8cbb1985d` includes Zod security patch and verified-backup retention fix. Current worktree progress-document changes were not used: git archive consumes the exact committed tree.

Source-only package: `H:/Honsen/artifacts/linux/db2ad11-source-20261104/Honsen-Procure-db2ad11-source-only.tar.gz`.
SHA-256: `2c222cb6be0bffa9683fb15626bb012cec53958f4e875df931722466e25e806f`.
Manifest: adjacent `source-only-manifest.json`, explicitly marked SOURCE_ONLY_NOT_RUNNABLE_LINUX_API. It records exact SHA-256 values from all 16 Git migration blobs. Filename scan excludes cos.txt, actual .env/.env.test/.env.production and key/certificate files; tracked example templates are present. This is not a blanket content-secret assurance or a protected runnable artifact manifest.

The supported full build is `RELEASE_DIR=<new-protected-Linux-directory> bash deploy/linux/scripts/build-release.sh`: clean exact-SHA standalone checkout, npm ci, server build, Linux package checks, protected filesystem inventory, tar and SHA. It was not bypassed or relabeled PASS. Current WSL has no Linux node executable; npm resolves to the Windows Node installation. Cached Docker images contain PostgreSQL16 Alpine only, no Node24 image. Windows native dependencies (notably argon2) cannot establish a runnable Linux package. H-drive mounted permissions also require independent protectedParents verification before the production manifest can be accepted.

No global runtime, package, image or service was installed; no production deployment, database access, port54329 change or release publishing occurred.

BLOCKED_ENV: full Linux dependency/build package and restored API startup/health/authentication rejection need a supported Linux Node24 runtime or prepared Node24 image, plus a protected clean build directory. Follow-on service/client history and attachment-byte recovery remain OPEN. The source-only artifact is not eligible for deployment or final independent release QA.

## Actual isolated Linux runtime build and restored service

The controller explicitly approved a disposable official Linux Node24 build dependency. Pulled docker.io/library/node:24.18.0-bookworm and pinned digest `sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059`. Node v24.18.0/git2.39.5 verified. Only the Git objects directory (read-only), exact source-only archive (read-only), safe output directory and npm cache were mounted. The project root, cos.txt, real env files, user Git configuration and hooks were never mounted.

The exact db2ad11 source was reconstructed in a clean protected container directory. The unmodified supported build-release.sh executed npm ci with the committed lock, Linux server build and package tests3/3, then its original protected artifact inventory. A subsequent verify-artifact invocation passed against the independent manifest digest. Linux argon2 native module loading passed. No TLS or integrity checks were disabled; no global/host runtime was installed.

Runtime artifact: `H:/Honsen/artifacts/linux/db2ad11-runtime-20261104/runtime-release.tar.gz`, 82603539bytes.
SHA-256: `070a7e2a2e69e864df87bc298e9c1269f8af1e2f9ff40b1c8634523607cad395`.
Protected build manifest: adjacent `runtime-release.manifest.json`; SHA-256 `eb59e000a7ed5401283a82a236468f888d3e47995c550ab621e591966da929ac`. Build log: adjacent `build.log`, exit0. Its protected ownership verification applies inside the container; copied H-drive files require their own trusted distribution handling. No production deployment is authorized.

All16 repository migrations are included. Manifest filename scan found zero real env/cos/private-key entries; example templates remain. This scan is filename-scoped, not a blanket assurance about all third-party content. No user credentials were made available to the build or service containers.

A second isolated environment actually applied the real migrations, seeded parser-valid synthetic SPO/history fixture, used the existing backup.sh, restored to another PG cluster and passed relationship/immutable assertions. The runtime archive was then extracted into a fresh Node container sharing only that private network namespace. The production equivalent entry `node --import=tsx apps/server/dist/index.js` connected to the restored database and started successfully. Actual HTTP loopback probes: captcha200, completely missing bearer rejected400 INVALID_REQUEST, syntactically valid but nonexistent synthetic bearer rejected401 for sync/pull and authorization/context. No business records were returned. Service result: adjacent `api-readonly-result.json`; scripts and safe logs `api-restore-db.sh`, `api-restore-db.log`, `api-start.sh`, `api-readonly-check.mjs`, `api-readonly-check.log` are retained.

The first probe assumed missing bearer should return401; observed production Zod-boundary behavior is400. That failed expectation is retained in api-readonly-first-failure.log; a separate nonexistent-session test proved401 without changing production behavior. This is recorded rather than relabeling the initial attempt PASS.

All four task-owned containers (build, API, sourcePG, targetPG) were removed after capture. No host port binding,54329 change, production data, COS operation, release publishing or deployment occurred. Docker image/cache remain in the existing H-backed WSL storage.

Remaining BLOCKERs: signed-in client history readback with complete account/approval fixtures, HTTPS/native installed-client recovery and attachment object-byte restoration. Minimal server startup/input-denial is not full backup/recovery acceptance. The earlier runtime-environment blocker is resolved only for this isolated build; no persistent Linux host environment was configured.
