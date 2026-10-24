# T09-A / T11 QA candidate — 2026-10-24

## Scope and evidence boundary

Continue `codex/procurement-t09a` from `164298a97ca8699fe32bdfcc09704f8353c1d401`, based on unified baseline `d3485144b075dceb8082e493c94791aab699a3af`. Checkpoint `2ec7d53eeb501f167f7964b5239ab5637fe2714e` is pushed and its GitHub `quality` passed. The next checkpoint adds the local file queue, native transfer/view commands, production attachment UI, synchronization scheduling and independent-review repairs described below. No other worktree, release branch or production deployment is involved.

These are builder and independent code/regression checks for a **Draft QA candidate**, not final Windows product acceptance. Original T09/T10/T11 and milestone checkboxes remain open. No price snapshot or receipt quantity is changed by a payment, reversal or attachment operation.

## Implemented boundaries

- Strict shared payment payloads; append-only PostgreSQL ledger; transactional scope, order/mode/currency/original-reversal validation; event retry and immutable-row conflicts. Parent/child payments are independent integer-minor-unit records; no currency conversion is implicit.
- SQLite payment migration registration, immutable ledger guards, staged Pull, reason/actor/time audit and transactionally appended reversal outbox. Production payment/reversal controls call trusted Rust commands. A missing voucher remains a visible warning independent of payment status; an imported voucher is linked without changing the immutable payment.
- Local managed attachment copy and SQLite transfer queue, receipt/payment/order associations, original type and size validation, aggregate parent/child limit and ten-photo limit. JPG/PNG are decoded under bounded memory/dimension limits, orientation is applied and a maximum 2048-pixel derivative is saved when resizing is needed. Other permitted document formats and HEIC originals are preserved; HEIC is signature checked and downloadable, but is **not recompressed** by the JPEG/PNG decoder.
- COS prepare/finalize/download API, exact-object STS credentials, short signed URL, native direct upload and native cached download. Permanent SecretId/SecretKey and signed URLs are not returned to the renderer. Native downloads verify size/type/SHA-256 before becoming available locally. Server finalization independently reads the real object and verifies its actual SHA-256 before publishing immutable PostgreSQL metadata and a change-log entry.
- Startup/session-bound synchronization, mutation/reconnect triggers and bounded backoff. A transport or upload failure retains local data and pending state. Every fresh native launch clears the previous transient session and requires login again. The transfer queue survives restart; only the originating account's queued files are uploaded.
- Concurrent offline reversals against one payment retain both copies and a visible unresolved conflict. The authoritative remote copy stays staged, the local copy is not silently overwritten, the cursor can advance and the amount is subtracted only once. The existing generic mutable resolver cannot overwrite a payment. A dedicated immutable-payment reconciliation UI is not included in this slice.

## Executed checks

| Boundary                                                                         | Fresh result                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node/runtime                                                                     | Node 24.18.0, `npm ci` with committed npm lockfile                                                                                                                                                                                                                                  |
| Workspace format/lint/typecheck/build                                            | Passed; React effect warnings and Vite large-chunk warning remain nonblocking                                                                                                                                                                                                       |
| Workspace tests with isolated PostgreSQL 16                                      | Desktop 4, server 53, shared 16 passed; the two explicit live-COS tests are skipped in this credential-free run and executed separately below                                                                                                                                       |
| Rust fmt/check                                                                   | Passed                                                                                                                                                                                                                                                                              |
| Independent Rust `cargo test --lib`                                              | 21 passed, 0 failed; independently executed after review repairs                                                                                                                                                                                                                    |
| Focused Playwright production-route/affected auth, supplier and receiving checks | 8 passed; DOM/IPC fixtures, not two running native Windows installations                                                                                                                                                                                                            |
| File SQLite integration                                                          | Two separate database files/account contexts agree on payment and reversal amounts; receipt-photo and payment-voucher metadata project idempotently. Restart retains pending files; a fresh login is required; revoked scope is denied; PNG resizing and ten-photo limit are tested |
| Real COS isolated PDF                                                            | 63 bytes; PUT 200; successful HEAD with size 63; GET 200; SHA-256 matched; invalid signature 403; cleanup DELETE 204                                                                                                                                                                |
| Real COS expired URL                                                             | 60-second signed URL rejected after expiry with HTTP 403; no object created                                                                                                                                                                                                         |
| Real API/PostgreSQL/COS integration                                              | 4 tests passed with real COS: prepare → PUT → independent object verification → PostgreSQL metadata/change log → authorized download/hash; a second authorized account can download both payment voucher and receipt PNG; all owned objects cleaned with 204                        |
| Independent review                                                               | P1 competing-reversal cursor deadlock and P2 delayed-upload canonical metadata mismatch reproduced/repaired/source-rechecked; independent native regression gate passed; no remaining confirmed defect in reviewed boundaries                                                       |

The initial live test exposed missing HEAD/DELETE request methods. It was reproduced with a focused regression and fixed. Its first object was identified by exact isolated prefix/time/size/content hash and cleaned with 204. No business objects, Bucket policy, CAM grant or lifecycle configuration was changed. No credential or signed URL query string belongs in evidence or reports.

## Migrations and deployment configuration

| Database   | Additive changes                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `005_procurement_expenditures.sql`, `006_attachments.sql`                                                                              |
| SQLite     | Register the existing `0032_procurement_expenditures.sql`; add `0033_expenditure_immutability.sql` and `0034_attachment_transfers.sql` |

No production migration has run. Apply PostgreSQL migrations through the normal controlled server migration path after deployment authorization and backup; do not connect a desktop to PostgreSQL. Rollback must preserve ledger/archive/queue tables and files. Do not drop new tables or reverse triggers as an automatic downgrade; preserve the database and fix forward if a downgrade cannot represent these records.

The server uses existing `POSTGRES_URL` and `COS_REGION`, `COS_BUCKET`, `COS_SECRET_ID`, `COS_SECRET_KEY`, with optional `COS_SIGNED_URL_TTL_SECONDS` (60–900, default 900). HTTPS is supplied by the established API deployment boundary. The server credential must be able to obtain STS `GetFederationToken` credentials scoped to the exact COS object and perform the required object verification reads. The desktop receives only `HONSEN_SYNC_API_BASE_URL` and its account session; no PostgreSQL/COS credential is installed there.

Reproduce local database checks using the repository's `.env.test` and `compose.test.yaml` in a disposable named Compose project. Live checks require explicit Bucket/prefix authorization, COS variables selected into a controlled test process, `HONSEN_COS_LIVE=1`, a task-local `COS_TEST_OWNERSHIP_FILE`, and the isolated `TEST_DATABASE_URL` for the API integration. Run:

```text
npm run test --workspace @honsen/server -- src/attachments/cos-live.test.ts
npm run test --workspace @honsen/server -- src/attachments/service-postgres.test.ts
```

Do not load deployment PostgreSQL settings from `.env` into tests. Normal CI requires no COS credentials and cannot claim real connectivity from its mocks. Live checks create only random `honsen-procure-tests/<UUID>/` objects and delete only the exact objects created by that test.

## Remaining issues

- **BLOCKER for final parent/product acceptance:** independent two-running-Windows-client HTTPS/offline/restart/UI acceptance, original full T09/T10/T11 gates and pre-existing Formal/security holds. Layered real API/COS/PostgreSQL and native SQLite proofs are not a substitute for that final installation-level run.
- **DEFERRED:** dedicated resolution of competing immutable payment corrections remains a T10 conflict-workflow boundary. Until then such conflicts remain visible, preserve both records and prevent a false fully-synced status.
- **WARNING:** HEIC recompression/inline display depends on an additional decoder/OS capability; original HEIC import/download is retained. JPG/PNG compression is implemented. Existing unrelated product localization/release/printing tasks remain outside this run. No production deployment, merge or Release was authorized or performed.
