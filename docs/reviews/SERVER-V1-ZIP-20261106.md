# V1 Linux ZIP actual build evidence — 2026-11-06

Status: candidate built and independently executable; this report does not declare SERVER_V1_READY. Statutory country tax/stamp configuration and original final gates remain open.

## Frozen artifact

- Source SHA: `d69d9cf8bd1abf9aa73d4e61ea6a6a0e766dea89`.
- Windows path: `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-d69d9cf8bd1abf9aa73d4e61ea6a6a0e766dea89.zip`.
- Size: 3,493,931 bytes.
- SHA-256: `a9e178f9a4d791f841157aff546bf17c6f4a4b1de63af13793d779720559d78b`.
- Software package version remains `0.0.0-development`; active API version is `v1`, Base URL `https://api-pr.honsen.africa/v1`, deployment directory `/www/wwwroot/api-pr/v1/`.
- Migration set: 17 checked-in SQL files, latest `014_master_data_currencies.sql`. The package manifest contains every migration SHA-256; actual database records remain authoritative.
- Bootstrap entry SHA-256: `6e4e13a35f0b1a684833e151ef5d1b468125923b04ed5184f7c4a18a3c82a232`.
- Original candidate ZIPs `80d76b1` and `ea34b12` remain untouched; neither substitutes for this artifact's acceptance.

## Builder and content checks

Actual WSL Ubuntu-24.04 normal user `honsen-dev`, Docker Engine 29.9.2, Compose v5.7.0 and buildx v0.38.1. No default WSL user or group membership changed.

`deploy/baota/build-zip.sh` builds committed allowlisted sources using Node.js 24.22.1 Linux dependencies, an ESM shared bundle and compiled server. Build image digest: `node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea`.

Actual final ZIP `deploy/baota/verify-zip.sh` PASS: fresh temporary Linux extraction, every SHA256SUMS entry checked, Linux ELF native modules, Node v24.22.1 actual argon2 hash/verify, pg and shared imports. Separate content inspection PASS: 2,587 entries; no test/fixture directories or test/spec modules, no `.env`, private-key files or `cos.txt`, and no embedded bootstrap password. The legacy seed directory is excluded; approved bootstrap is the only initialization seed source.

Warnings: npm reports one low and one moderate advisory, and install-script approval notices. No dependency or lock-file upgrade was performed. Runtime argon2 was actually exercised successfully. Manifest acceptance remains `NOT_YET_VERIFIED`, not a stable-production claim.

## Real reverse proxy checks

Final package source, actual Nginx 1.28 and actual independently started API against the disposable `a_final_business_test` database:

- Active `/v1/api/auth/captcha` reaches the real API successfully.
- Inactive `/v2/api/sync/push` and unversioned business POST return 410 with `client_upgrade_required`.
- Simulated future active-path switch in the same Nginx instance makes `/v1/api/sync/push` return 410; no V2 implementation or second API process is started.
- `sync_events`, `server_change_log` and `audit_entries` counts remain unchanged across rejected requests.
- Test Nginx container removed after completion. No source/production service was changed.

Two earlier proxy-test failures are preserved in the working evidence: `sed -i` replaced the inode of a single bind-mounted config file, so Nginx reloaded the old file. The test now writes the same inode; both candidate and final reruns passed. This was a test-harness defect, not evidence that a retired route was safe before the repair.

## Isolated database and handoff

PostgreSQL 16.15 image digest: `postgres@sha256:933463a6c8eba2b9f5cd414138738cd8d5519cd2c471214c222652f547a66a32`. Compose uses `.cache/baota-v1-compose.yaml`, derived from repository `compose.test.yaml` with only the exact image changed to 16.15, and `.cache/baota-v1.env` test-only credentials. Project `honsen-v1-package`, loopback 54329, no persistent volume. It is not a production dependency.

A first PG instance exited cleanly unexpectedly; it was restarted without deleting its data and held by an owned `docker wait` WSL session. Existing fixture accounts were correctly rejected by bootstrap; fresh databases were created for package acceptance instead of deleting those records.

Agent A owns the independent final package HTTP/admin/password-change/restart results. Agent B owns the focused migration/Seed and least-privilege role results. Those reports must be evaluated on their exact SHA and scope. C owns subsequent Compose `down --volumes` cleanup after A finishes; do not remove an active acceptance database prematurely.

## Operational command and limits

Baota Node project work directory `/www/wwwroot/api-pr/v1/`; Node.js 24.22.1, start command `node --env-file=.env apps/server/dist/index.js`. The package Chinese README contains executable first-empty-database migration, runtime-stdin bootstrap, separate runtime-role setup and explicit SQL grants. No plaintext credential is packaged. Cloudflare Flexible uses the Baota HTTP origin and must not be combined with an origin HTTPS redirect loop.

BLOCKER: unverified statutory tax/stamp configuration and any incomplete original server P0/security acceptance; actual private COS and remote production verification are not inferred from module loading.

DEFERRED: user-operated Baota upload/deployment, authorized backup restore validation, V2. No SSH or production change occurred.

WARNING: preserved files are rollback candidates only. Schema compatibility and verified data recovery are required before executing a rollback; software/API/schema versions remain distinct.
