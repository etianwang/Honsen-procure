# V1 approved tax and manual-stamp ZIP acceptance — 2026-11-06

This report supersedes the previous tax-unconfigured candidate only for the exact artifact and scope below. Historical packages and [previous ZIP evidence](SERVER-V1-ZIP-20261106.md) remain preserved. No remote server was accessed, no SSH/deployment occurred, and no stable production release was published.

## Frozen artifact and versions

| Field                         | Actual value                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Source SHA                    | `03c2c82b7a0a34cc4f360a293478e58fd529c8f3`                                                                             |
| ZIP                           | `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-03c2c82b7a0a34cc4f360a293478e58fd529c8f3.zip` |
| Size                          | 3,499,032 bytes                                                                                                        |
| SHA-256                       | `59fa0cfdb7176034c816015bd1fa55613244c7091bf9317507b61addc9e223cd`                                                     |
| Software package version      | `0.0.0-development`                                                                                                    |
| Active API version / Base URL | `v1` / `https://api-pr.honsen.africa/v1`                                                                               |
| Deployment directory          | `/www/wwwroot/api-pr/v1/`                                                                                              |
| PostgreSQL migration set      | 17 SQL migrations; latest `014_master_data_currencies.sql`                                                             |
| Node / PostgreSQL tested      | 24.22.1 / 16.15                                                                                                        |

The desktop SQLite migration `0062_manual_stamp_duty.sql` is a separate client boundary, not a PostgreSQL schema version. Current server/shared/deployment package inputs remain unchanged relative to the frozen SHA; later desktop-only audit or documentation changes do not enter this ZIP.

The build manifest records every PostgreSQL migration digest and these independently checked runtime digests:

- Bootstrap: `8d81808196dcd0374c2f19eca9779e8eb1b3b974d55e1b3cd9547e21e04b10dd`.
- Existing-bootstrap tax entry: `2179cfec84ece2ec8f0d89eb2b92fffd2747fb25acaed68fbbcdeee0f317ab0d`.
- Tax helper: `04ed4db045252eae4dc2613626b33b98659f9a7cbb4ff46fb541b3cd70534056`.
- Shared ESM bundle: `43071418ea7c131d8b0bdd14e1a81bb662c31bbf8c93f2f92b125f4e1410712a`.
- Server entry: `befd1e266133154d86708b0852bee74114cf075dcf9fea4faca35d16512607a9`.

Actual archive inspection confirms shared `dist/index.js` is the 25,764-byte esbuild bundle containing the schemas, including manual stamp duty, rather than a re-export-only entry. Runtime dependencies and all other package files are fixed by SHA256SUMS plus the complete ZIP digest.

## Build and fresh Linux package verification

The committed-source builder ran as the existing normal WSL user `honsen-dev`. Docker Engine 29.9.2, Compose v5.7.0 and buildx v0.38.1 were verified; no default-user or group change was made. The builder installed Linux dependencies from the committed lock file and compiled the actual server and shared contracts. Docker is a local test/build dependency only.

Fresh temporary Linux extraction and `deploy/baota/verify-zip.sh` PASS: all package SHA256SUMS, Linux ELF modules, actual Node v24.22.1 argon2 hash/verify and pg/shared loading. Separate final archive inspection PASS: 2,589 entries, zero test/fixture entries, no `.env`/private-key/`cos.txt` files and no embedded bootstrap password. Manifest tax policy, both Seed entries, the tax helper and the contract/server digests were checked against the actual archive bytes. Old ZIPs were not overwritten.

Agent A independently extracted this actual ZIP into a new Linux directory and initialized a new database `a_tax_stamp_release_test` with a separate restricted runtime role. Its actual runtime reports Ubuntu 24.04.5 LTS and Node v24.22.1; PostgreSQL was the exact 16.15 image. Package migration/manifest/Seed digests and runtime non-owner DDL refusal passed independently.

## Actual Seed and business API results

The user-approved configuration is CI 18% and CM 19.25%, with manually entered order stamp amounts, not an automatic fixed charge. The package manifest records `USER_APPROVED_CONFIGURATION_2026-11-06`; this is the user's business configuration.

Independent packaged HTTP acceptance PASS:

- Runtime-supplied initial admin password, super-administrator login, advisory-only password change, actual change, old-password 401 and old-session rejection.
- 2 countries, 3 approved projects, 14 units, 0 newly created site records; 2 tax templates at 1800/1925 basis points and 3 correctly related project defaults. Initial Pull contains 24 published changes.
- Six actual business records covering OPA/HPA/SPO, payment and reversal, idempotent replay, immutable conflict handling and engineer project/payment denial.
- Manual stamp 37 in the tax-bearing frozen workflow; legacy-client omission does not discard a stored stamp, conflicting omission is retained/rejected, and explicit zero can cancel an editable stamp.
- Restart followed by field-by-field Pull preservation of six formal/business/payment records.
- Disabled-account 401, revoked purchaser-role write refusal and revoked engineer-project-binding write refusal.

Public independent evidence: `.cache/server-release-controller/independent-tax-stamp-evidence/` (`package-admin-http.log`, `package-http-smoke.log`, `business-first.log`, `verify-final.log`, `security-final.log`, `inspect-final.log`, `runtime-os.txt`, `zip.sha256`). This is packaged server HTTP acceptance; it does not substitute for installed/native G1 acceptance. Agent A's independent report owns the full scenario detail.

## Actual version routing verification

Against that same unique API, while Agent A paused business writes, C ran the real Nginx test anew:

- Active `/v1/api/auth/captcha` reaches the API successfully.
- Inactive `/v2/api/sync/push` and unversioned business POST return 410 with `client_upgrade_required`.
- Switching the same proxy's active path makes old `/v1/api/sync/push` return 410. No V2 service or second API was created.
- `sync_events`, `server_change_log` and `audit_entries` counts remain unchanged across rejected requests.

Raw proof: `.cache/server-release-controller/nginx-tax-release-proof.log`. The first outer status-capture wrapper returned a false failure after the test itself printed PASS; rerunning with Bash pipefail and tee returned exit 0. No product or proxy-test implementation changed for that rerun. The temporary Nginx container was removed.

## Cleanup and remaining gates

After Agent A finished restart/revocation and stopped/removed the only test API, C ran the original owned Compose project `honsen-v1-package` with `.cache/baota-v1-compose.yaml` and `.cache/baota-v1.env` through `down --volumes`, exit 0. The YAML was derived from repository `compose.test.yaml` with only the exact PostgreSQL image pinned to 16.15. It used loopback 54329 and test-only credentials, no declared persistent volume. Owned API/PG containers, project network and project volumes are absent; Linux `ss` reports no listeners on 3000, 54329 or 18081. The WSL wait session exited normally. C's generated synthetic credential env file was deleted and its absence verified; public evidence and ZIPs remain.

Baota startup command, in `/www/wwwroot/api-pr/v1/` with a runtime-role `.env`:

```sh
node --env-file=.env apps/server/dist/index.js
```

The package Chinese README includes the executable empty-database migration/bootstrap/runtime-role flow and the controlled existing-bootstrap tax update entry. Cloudflare Flexible uses the existing Baota HTTP origin; no new production Docker dependency or backup system is introduced.

BLOCKER: any still-open original parent/security/native/private-COS acceptance remains open; these are not silently closed by this package result. Agent B's exact-source server result is 213 PASS with 3 live-COS opt-in skips, not proof of actual private COS object round trips.

DEFERRED: user-operated remote upload/deployment, authorized production backup/restore verification and V2. No such operation was attempted.

WARNING: npm reported one low and one moderate advisory and install-script notices; runtime modules were actually verified, no lock-file/dependency upgrade was introduced. The package remains a test candidate rather than a published stable asset.

Rollback is conditional on old API compatibility with both PostgreSQL schema and stored business/immutable-snapshot contracts, including manual stamp duty. An unchanged SQL migration version alone does not establish rollback safety. Otherwise only an authorized, verified Baota backup recovery can provide a rollback basis; retained old ZIPs are not an executable rollback guarantee.
