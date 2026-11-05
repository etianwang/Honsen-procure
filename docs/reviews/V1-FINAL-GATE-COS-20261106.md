# Final gate — real COS layers, 2026-11-06

Agent A result: **live COS network PASS; frozen-ZIP module HTTP COS PASS; owned-object and PostgreSQL restoration PASS**. Windows native/two-client attachment and installed-release gates are not covered by these results. No server production source, migration, permissions contract or COS contract changed; server ZIP remains frozen and was not rebuilt.

## Evidence identities and authorization

- Source-test baseline: `0b78424`; Node24.18.0 per `.nvmrc`, Windows11 Pro10.0.26200. Three previously external-gated cases were actually executed. `03c2c82..0b78424` comparison of server attachment/shared attachment sources was empty; root independently checked the entire server/shared/deploy boundary. Later test/controller commits do not become another production candidate.
- Actual ZIP source `03c2c82b7a0a34cc4f360a293478e58fd529c8f3`; archive `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-03c2c82b7a0a34cc4f360a293478e58fd529c8f3.zip`,3499032bytes,SHA256 `59fa0cfdb7176034c816015bd1fa55613244c7091bf9317507b61addc9e223cd` freshly recomputed unchanged.
- New extraction `/home/honsen-dev/a-final-cos-package-03c2c82b7a0a34cc4f360a293478e58fd529c8f3/unpacked`; all package SHA256SUMS checked before use. Ubuntu24.04.5,Node24.22.1, isolated PostgreSQL16 via repository Compose, dedicated `a_final_cos_package_test` and restored `a_final_cos_restored_test`, limited API role `a_final_cos_runtime` with packaged explicit grants.
- `cos.txt` four-field presence and scope checked without printing credential values. Only `eu-frankfurt`,bucket `honsen-materials-1308426049`; no bucket listing, historical object read/overwrite/delete, insecure TLS or remote deployment. Source cases use their freshly generated owned UUID prefixes and exact cleanup records. Package run owns prefix `honsen-procure-tests/7fd1e5d8-c6a6-4e1a-b2d5-439b05606a7c/` exclusively.

## Layer 1 — source real-network tests

Actual commands (credentials loaded from local private configuration into process environment, never printed):

```text
HONSEN_COS_LIVE=1 npm run test --workspace @honsen/server -- src/attachments/cos-live.test.ts
HONSEN_COS_LIVE=1 TEST_DATABASE_URL=<isolated a_final_cos_test> npm run test --workspace @honsen/server -- src/attachments/service-postgres.test.ts -t "prepares idempotently|publishes a payment voucher|uploads the actual Rust HEIC"
```

First command **2/2PASS**,71.82seconds: real PDF63bytes PUT200/HEAD63/GET200/SHA256match, modified signature403, own cleanup204; second case waits66seconds for real signature expiry then asserts403/expired response, creates no object. Ownership proof `.cache/final-cos/pdf-ownership-*.json`; raw `.cache/final-cos/live-pdf-expiry.log`.

Second command **3PASS/5non-target tests excluded**: actual HEIC/JPEG source/derivative PUT/complete/GET/hash/ownership and exact cleanup; PDF prepare/complete idempotency, immutable replacement refusal, one published metadata event and unrelated account refusal; payment voucher and receipt photo read by another authorized account. Raw `.cache/final-cos/live-api-heic.log`. The five exclusions are deliberate test-name filtering, not still-skipped original external cases. All three originally external COS gates ran and passed. Source API test uses existing injection/auth fixture, so it is not substituted for the real-session HTTP layer below.

## Layer 2 — actual frozen ZIP module HTTP

Committed test controllers `c297755`: `tests/deploy/package-cos-launcher.mjs`, `package-cos-http.mjs`, `package-cos-object-restore.mjs`. Syntax, formatting and diff checks PASS. The launcher imports **actual freshly extracted ZIP dist modules**, uses production Auth/Postgres/authorization/sync services and restricted runtime role, but passes the existing `AttachmentService` constructor's isolated-prefix argument. Production `dist/index.js` defaults to a production namespace, so that unmodified default-prefix write was intentionally not executed. This is an explicit test launcher boundary, not a new production environment override or an index-entry deployment claim. Strict HTTPS remains in effect for every COS request; local API is loopback HTTP.

Launcher SHA256 `ad94b28a1f9daf984bda905bab4ef59ae90f9c8b2954a04f8c8e5cd91742e79c`; HTTP controller `83006c03ab439f7ffc21495143db7b0282ad1f4d0608d429a8d430868ba34c5c`; object restore controller `dc35bdb4d7d763420e324ac0fc0d80f67250973759c2854f741310c7a12b0ee6`.

Actual package module hashes:

| Module                  | SHA256                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| attachments/cos.js      | f2cee5cc7dba35c36c20cdcca7107e72f4e9589994ae33bd5ca45a8a31d1a8c8 |
| attachments/service.js  | e826adba171b479096c395e20b5ee94bce6355c2e8f12696c2e04f91bd099e77 |
| app.js                  | 9f1603b603fba1b5dcc190a280db340f341448949babe52895f4e25f5c989fb0 |
| shared bundled index.js | 43071418ea7c131d8b0bdd14e1a81bb662c31bbf8c93f2f92b125f4e1410712a |

Actual CAPTCHA/password session login then business-fixture HTTP6records PASS; real attachment API PDF/HEIC/JPEG prepare and retry, bytes PUT and GET, complete retry, exact metadata size/checksum/derivative reference PASS. Duplicate COS PUT refuses overwrite409, immutable metadata replacement409, exactly one server_change_log publication per attachment. Anonymous download401, engineer upload403 and engineer download403 after removing project scope PASS; scope restored afterward. These requests exercised actual packaged routes on a real listening Node process, not `app.inject`.

| Owned content   | Bytes | SHA256                                                           |
| --------------- | ----- | ---------------------------------------------------------------- |
| PDF             | 52    | d62b99412563c239d0813fb7da4b7c2b0747132759a1633779ef5b3e6d6c6a85 |
| Original HEIC   | 4378  | a618edb8cc6f7b53ee61bc44178014bf16c51dfb55a592be35c83611d7a236f8 |
| JPEG derivative | 18098 | b871e368eb980720f33b7880ec43740d7568667ff4dd82b34aee3feb7110ee80 |

## Layer 3 — actual object bytes and database archive restoration

For each of these three exact owned objects: download actual COS bytes, verify checksum, save private local object backup, DELETE204, signed GET404, restore same key from saved backup with PUT200, verify HEAD size/checksum. **All original and restored responses had versionId=null.** Controller asserts null before deleting, aborting if a pinned version exists; it deletes the current unversioned/null-version object, not a claimed non-null pinned version. No global bucket-versioning configuration was queried or inferred, and no delete-marker/pinned-version restoration claim is made.

Then stop the unique package API, create a genuine pg_dump custom archive of its disposable source DB, pg_restore into fresh separate `a_final_cos_restored_test`, explicitly reapply package runtime grants, restart the same extracted modules against restored DB and log in normally. Actual Pull deep-equality preserves six full business payloads. For all three attachments, restored API metadata objectKey/versionId(null)/checksum/sourceAttachmentId match original metadata; fresh API-signed GET returns original size/hash bytes. HEIC/JPEG relation survives. **PASS.** This is a distinct restored database within the same disposable cluster; it does not claim separate-cluster disaster recovery or Windows native restoration.

Public exact-key proofs/logs: `.cache/final-cos/package-evidence/` contains `cos-http.log`, `object-restore-proof.json`, `object-cleanup-proof.json`, `cos-api-restored.log`, `business-restored.log`, `launcher-ready.log`, module/OS hashes and archive hash. No signed URL or credential is in these public proofs.

## Cleanup and remaining gates

- Exact package-run three objects removed with204; independently confirmed404 for each, no list operation. Source tests' owned-object cleanup assertions passed. No test COS object intentionally retained by A.
- Own `a-final-cos-api` container stopped/removed; private synthetic owner/runtime URL and login restart-state files removed. Public evidence retained. Initial evidence copy encountered normal-user denial reading Docker-created mode600 ownership JSON; only that noncredential ownership JSON was copied through the owning container into public output. It was not a network or product failure.
- Shared Compose `honsen-final-gates`/loopback54329 remains for B's `b_native_test`; A has handed ownership/lifecycle coordination to root/B and must not take it down while B is using it. A source/package/restored databases are disposable and contain synthetics only.
- **BLOCKER for final native gate:** two actual Windows clients' original/derived attachment bytes and native history restoration are not established by A's server results. B owns that execution; existing t09-t11 prefix-safe native chain and these test-only reusable controllers were communicated. No direct SQLite fixture or HTTP test is relabeled Windows native PASS.
- **DEFERRED:** complete native G1/installed security, authenticated-data upgrade, actual Toolbox chain and real UAC acceptance belong to B/C. A's bounded live network, frozen-package module API and owned object/archive restoration have no remaining blocker.
- **WARNING:** standard production-default-prefix writes, global bucket version-history recovery, remote production backup restore and stable release were not authorized/tested here. None is inferred from the tested constructor-prefix launcher.
