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

- `POST /api/sync/push` accepts a maximum of 100 versioned events and requires the authenticated account session. The request carries a non-secret installation UUID only for event/session tracking; it is not a credential.
- Each result has the original `eventId`, `accepted`, `conflict` or `validation_error` status, plus the server version when one exists. A batch can therefore contain a safe retry beside a rejected event without losing either result.
- Send pending events in stable creation order over HTTPS using the authenticated account session.
- The server validates the account/project scope, request payload, event-id idempotency and expected entity version inside one PostgreSQL transaction.
- On acceptance it commits the mutation and a change-log entry atomically, assigns the next entity version, and returns the event acknowledgment.
- Only after the client receives an accepted acknowledgment may it mark that local outbox event acknowledged.
- Transport failure is retryable. The same event ID must be safe to resend indefinitely.
- Validation rejection is retained with its structured reason. Version mismatch becomes a conflict; neither local nor remote value is silently discarded.

## Pull

- `GET /api/sync/pull?cursor=<sequence>&limit=<1..500>` requires the authenticated account session and returns ordered changes plus the cursor of the last returned change. The caller repeats the same cursor when a page fails to apply locally.
- Pull ordered changes with an opaque, durable sequence cursor; timestamps are not cursors.
- Apply one response page to SQLite in a transaction. Do not advance the local cursor until all page changes have applied.
- A pulled change may update a clean local record. It may not overwrite a locally dirty record with pending events; create a conflict record instead.
- Tombstones are applied as soft deletion. Keep them long enough for the longest supported offline window.
- On restart after an interrupted pull, retry the same cursor. The apply operation must be idempotent.

## WebSocket change hints

WebSocket is a latency optimization, not a data synchronization channel. After the server transaction commits a change-log entry, it may notify authorized online devices with a minimal `dataset-changed` hint and latest sequence/project scope. The recipient then performs the normal authenticated cursor Pull.

- Never send order payloads, attachments or authoritative state through the socket.
- Subscribe with the authenticated account session; disconnect disabled accounts and revoked sessions.
- Reconnects, missed hints, app startup, network recovery and periodic checks always run cursor Pull. Correctness must not depend on receiving a socket message.
- File attachments upload separately with resumable/pending state. An order can be saved while an attachment remains pending sync; no virus-review workflow is required by the current product scope.

## Conflict handling

| Entity                    | Conflict policy                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Material, supplier, price | Preserve local and remote payload/version in an audit record; a procurement administrator explicitly chooses or merges a result.  |
| Draft order               | Preserve both drafts and require an explicit resolution before a replacement is synced.                                           |
| Confirmed/cancelled order | Never mutate in place. Use a revision/new order for a correction.                                                                 |
| Delete vs update          | Preserve the tombstone and competing value in the conflict record; an administrator decides whether to restore via a new version. |

The resolver creates a normal new local mutation/outbox event against the version chosen as its base. It never changes historical conflict evidence.

## Retry and observability

- Retry with bounded exponential backoff and jitter; restart/network recovery can trigger an earlier safe retry.
- Do not retry authentication failure, malformed payload or an explicit conflict as if it were a network error.
- Record structured, non-secret diagnostics: event ID, entity type/ID, attempt count, error class, server version where supplied and time.
- Show the last successful synchronization time and pending/conflict counts. Do not label an offline device as current.

## Required tests

Test duplicate delivery, timeout after server commit, restart during push, partial batch rejection, out-of-order responses, paged pull interruption, concurrent price editing, tombstone/update conflict and revoked-session handling. See `TEST-RULES.md` for acceptance IDs.
