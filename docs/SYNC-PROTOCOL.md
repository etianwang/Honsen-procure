# Synchronization Protocol

## Guarantees

Synchronization is asynchronous and eventually consistent. A successful local save means the SQLite transaction committed; it never means the server has acknowledged it. The UI must separately show pending, syncing, synced, conflict and actionable error states.

Each ordinary offline mutation uses one SQLite transaction:

1. Validate the request at the Tauri boundary.
2. Change the local business record.
3. Insert an immutable outbox event containing a UUID event ID, entity type/ID, operation, base server version and payload snapshot.
4. Commit both changes together.

If the transaction fails, neither the business mutation nor the outbox event is visible.

## Push

- `POST /api/sync/push` accepts a maximum of 100 versioned events and requires the authenticated account session. The request carries a non-secret installation UUID for event/session tracking and formal-number namespace validation; it is not a credential.
- The desktop obtains its API base URL from the deployment-time `HONSEN_SYNC_API_BASE_URL` runtime configuration. It accepts only a clean `https` origin/path (no embedded credentials, query or fragment); PostgreSQL/Neon credentials never appear in desktop configuration. The access token is kept in OS secure storage and is never returned to the renderer or written to SQLite.
- Each result has the original `eventId`, `accepted`, `conflict` or `validation_error` status, plus the server version when one exists. A batch can therefore contain a safe retry beside a rejected event without losing either result.
- Send pending events in stable creation order over HTTPS using the authenticated account session.
- The server validates the account/project scope, request payload, event-id idempotency and expected entity version inside one PostgreSQL transaction.
- A formal-issue payload includes the UUID, immutable formal snapshot, complete installation UUID, installation short code and local sequence. The server validates the document-type/short-code derivation and uniqueness of the formal number and `(installation UUID, sequence)`; it registers, but never assigns or renumbers, a formal number.
- An owner formal-issue payload also contains the primary currency and every line’s original quote/manual price and currency, frozen source-to-primary rate snapshot, converted reference price, exclusive markup and final price. The server validates the exact integer/rational calculation and required rate presence; acceptance never substitutes a newer exchange rate.
- On acceptance it commits the mutation and a change-log entry atomically, assigns the next entity version, and returns the event acknowledgment.
- Only after the client receives an accepted acknowledgment may it mark that local outbox event acknowledged.
- Transport failure is retryable. The same event ID must be safe to resend indefinitely.
- Validation rejection is retained with its structured reason. Version mismatch becomes a conflict; neither local nor remote value is silently discarded.
- A duplicate formal number on another UUID, a reused `(installation UUID, sequence)`, or a divergent frozen snapshot for an issued UUID is an auditable conflict. The original issued records remain available; the client must not manufacture a replacement number during retry or resolution.
- A remote rate change/revocation after local formal issue may create a verification warning, but cannot rewrite or reject an otherwise internally valid frozen issued snapshot solely because the current rate differs. A missing/invalid rate detected before issue is a local validation error and no formal issue/outbox event commits.

## Pull

- `GET /api/sync/pull?cursor=<sequence>&limit=<1..500>` requires the authenticated account session and returns ordered changes plus the cursor of the last returned change. The caller repeats the same cursor when a page fails to apply locally. A full 500-change page is followed immediately with its returned cursor until a short page is received; an empty page must not advance the cursor.
- The desktop first records a received page in a local remote-entity staging store and advances the durable cursor in the same SQLite transaction. A locally dirty entity instead creates an immutable conflict record and retains the local value. Clean materials, suppliers, material prices, project defaults, reference master data, tax templates and exchange rates are validated and projected into their local query tables inside that same transaction; unsupported entities remain staged until their projector exists. A projection failure rolls back the page, so it cannot advance the cursor or discard remote evidence.
- Pull ordered changes with an opaque, durable sequence cursor; timestamps are not cursors.
- Apply one response page to SQLite in a transaction. Do not advance the local cursor until all page changes have applied.
- A pulled change may update a clean local record. It may not overwrite a locally dirty record with pending events; create a conflict record instead.
- Immutable order comments synchronize as separate append-only events. Engineer comments are accepted only when the server verifies the comment author is the applicant of the referenced, project-bound order; comment tombstones are rejected.
- Tombstones are applied as soft deletion. Keep them long enough for the longest supported offline window.
- On restart after an interrupted pull, retry the same cursor. The apply operation must be idempotent.

### Authorization history replay

Historical reference projection (country/project/site/department/team/unit) accepts the existing camelCase and snake_case wire forms at the trusted Pull boundary. Different values supplied through two aliases are rejected; equivalent UUID casing is the same identity. Payload ID and any supplied kind must match the envelope; version is taken only from the positive envelope version. Required business data and FK/immutable-code checks remain mandatory. Invalid/ambiguous events roll back projection and cursor together; they are never silently skipped or filled with invented references.

Pull also returns `authorizationVersion` (a server SHA-256 fingerprint of current live project/country/department/team bindings, their PostgreSQL row revisions and the catalog-recovery audit generation) and `replayUntil` (the committed change-log high-water mark). A revoke/regrant changes the fingerprint even if the client never observed the revoked state. A catalog repair also changes it: establishing a missing supplier country can make old quotes newly routable without changing a grant. Each page uses one repeatable-read database snapshot for both authorization and changes.

The desktop persists an account-owned replay task in `local_sync_authorization_replay` when this fingerprint changes, including on upgrade from a client without a recorded fingerprint. It conservatively replays all currently authorized history with a separate cursor and fixed upper bound. This also covers newly granted projects and their countries; it never resets the incremental cursor. Replay requests carry `authorizationVersion` and `replayUntil`; every page reapplies current authorization. A changed fingerprint returns no historical records and starts a new bounded task. Replaying a revoked scope cannot restore access.

Page projection and the task cursor/completion flag commit in one SQLite transaction. Restart resumes the committed task. A repeated fingerprint cannot extend its upper bound or rewind progress. Supplier/material dependency quarantine is replayed after each page; older versions cannot replace a newer projection. Pending Outbox and order snapshots remain protected by the existing conflict rules. After the bounded replay completes, ordinary Pull resumes from its original incremental cursor, including events committed during replay. Empty pages retain their cursor and complete the bounded task.

### Catalog validation, quarantine and recovery

Supplier and material-price upserts pass the same complete catalog validator at service and PostgreSQL acceptance boundaries. Entity IDs, immutable usable references, country scope, referenced material/supplier contracts and supplier-code uniqueness are checked before mutation. Amounts fit nonnegative signed 64-bit integers. Catalog text uses the existing desktop UTF-8 byte limits; codes follow the existing business-code contract and dates start at 2000-01-01, matching Rust. Malformed decimal/nonnumeric amounts produce structured rejections, never conversion exceptions. Ordinary updates cannot assign a missing historical country or replace unusable historical references without the recovery path.

Compatibility preserves required business facts: legacy snake_case names and omitted nullable fields are normalized, optional blank text becomes null, UUIDs are canonicalized, and the envelope server version remains authoritative. Required names, flags, currencies, amounts, units, dates and identities are never invented. Tombstones may carry `{}`; stored identity/scope and references remain authoritative, and a supplied mismatched payload ID is rejected. Normal rejected Outbox events retain permanent-failure evidence and do not prevent unrelated events from progressing.

Migration 010 preserves incomplete/routing-invalid historical events in `catalog_sync_quarantine`, including records that no currently authorized Pull can select. Pull performs full validation of visible catalog history, records newly discovered failures with immutable raw payloads and audit entries, and returns a reserved `__catalogQuarantine` marker rather than an unparseable catalog object. The SQLite migration 0055 archive retains received bad payloads and recovery versions; the existing staging/dependency quarantine handles absent country/material/supplier references and historical supplier-code collisions. Other legitimate events and cursors continue. Staged source cursors preserve quote chronology across dependency recovery and history replay; an older quote cannot reactivate over a known later quote/tombstone.

`POST /api/sync/catalog-repairs` accepts `{requestId, entityType, entityId, expectedVersion, payload, reason}`, where entityType is `supplier` or `material_price`. An enabled administrator must supply verified complete data and a nonempty reason. The server rechecks the administrator role and live project/country scope, keeps any existing valid country/reference immutable (UUID case is immaterial), and permits verified replacement only for an absent/invalid/orphan reference. Supplier-code conflicts still reject. The request becomes a normal version-checked, account/installation-bound idempotent event, with original-payload archival, resolution linkage, immutable recovery audit and a new change-log version in the same transaction. Issued order snapshots remain untouched; existing issued-quote discrepancy handling remains in place.

Authorized database operators can inspect unresolved `catalog_sync_quarantine` rows (`source_key`, entity identity/version, `reason`, `detected_at`, `resolved_at`) without delivering them through unscoped client APIs. Missing facts remain `MANUAL_REVIEW_REQUIRED` until an administrator verifies them against original records. Restore an actual missing master-data dependency or provide a verified recovery payload; retain both original and corrected records. A repair advances the replay generation so clients whose cursors passed previously unroutable dependencies can retrieve the recovered history.

## WebSocket change hints

WebSocket is a latency optimization, not a data synchronization channel. After the server transaction commits an accepted Push, it notifies authenticated online devices with the minimal `dataset-changed` hint. The recipient then performs the normal authenticated cursor Pull.

- Never send order payloads, attachments or authoritative state through the socket.
- Subscribe with the authenticated account session; disconnect disabled accounts and revoked sessions.
- Reconnects, missed hints, app startup, network recovery and periodic checks always run cursor Pull. Correctness must not depend on receiving a socket message.
- File attachments upload separately with resumable/pending state. An order can be saved while an attachment remains pending sync; no virus-review workflow is required by the current product scope.

## Conflict handling

| Entity                          | Conflict policy                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Material, supplier, price       | Preserve local and remote payload/version in an audit record; a procurement administrator explicitly chooses or merges a result.              |
| Draft order                     | Preserve both drafts and require an explicit resolution before a replacement is synced.                                                       |
| Formally issued/cancelled order | Never mutate its number or frozen price/source snapshot in place. Use a cancelled/closed original plus a revision/new order for a correction. |
| Payment record                  | Never overwrite a submitted payment. Preserve it and create an append-only correction/reversal record with audit reason.                      |
| Delete vs update                | Preserve the tombstone and competing value in the conflict record; an administrator decides whether to restore via a new version.             |

The resolver creates a normal new local mutation/outbox event against the version chosen as its base. It never changes historical conflict evidence.

Only an administrator or super administrator may resolve a conflict. For catalog, reference data and immutable comments, **keep local** supersedes the rejected event and creates a new event against the server version; **use server** applies the preserved server operation transactionally. Purchase-order conflicts are never directly overwritten and remain subject to their revision workflow.

## Retry and observability

- Retry with bounded exponential backoff and jitter; restart/network recovery can trigger an earlier safe retry.
- Do not retry authentication failure, malformed payload or an explicit conflict as if it were a network error.
- Record structured, non-secret diagnostics: event ID, entity type/ID, attempt count, error class, server version where supplied and time.
- Show the last successful synchronization time and pending/conflict counts. Do not label an offline device as current.

## Required tests

Test duplicate delivery, timeout after server commit, restart during push, partial batch rejection, out-of-order responses, paged pull interruption, concurrent price editing, tombstone/update conflict, revoked-session handling, formal-number clone/re-key/collision and append-only payment retries. See `TEST-RULES.md` for acceptance IDs.
