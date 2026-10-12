# Architecture — Offline-first Desktop + Cloud

## Components

- Desktop: Tauri 2 Rust commands, React + TypeScript UI, SQLite local DB.
- Server: Fastify TypeScript API with Zod validation, PostgreSQL.
- Shared: API contracts, entity schemas, enums and validation fixtures.
- PDF: local rendering/printing; choose an offline-capable implementation and validate Tauri platform compatibility.

## Trust boundaries

React UI is untrusted. Rust/Tauri commands and the server enforce user/role/project authorization for every mutation. Persist only Argon2id password hashes and local offline-account cache data; secrets use OS secure credential storage where practical. The local CAPTCHA is an anti-automation control, not an authorization control. There is no separate device-enrollment credential: the server authorizes the signed-in account session and tracks a non-secret installation UUID for cursors, one-active-session enforcement and formal-number namespaces. It is not an access credential. TLS is mandatory for sync and failed authentication is rate-limited.

## Local write and outbox

1. Validate input.
2. Begin SQLite transaction.
3. Mutate entity; insert immutable outbox event with `base_version`.
4. Commit transaction.
5. Update UI immediately; schedule sync.

## Push and pull

1. Push pending events in stable order; server checks idempotency and expected entity version in a PostgreSQL transaction.
2. Server commits business mutation + change log atomically; responds with acknowledged IDs and assigned versions.
3. Mark acknowledged events locally; retain rejected conflicts for resolution.
4. Pull change-log pages using durable monotonically increasing cursor; apply pages transactionally to SQLite.
5. Never overwrite locally dirty entities with pulled changes; route to conflict resolution.
6. Save cursor only after successful page apply. Retry with backoff and jitter; do not rely solely on wall-clock timestamps.

## WebSocket notifications

The server broadcasts a best-effort authenticated change hint only after committing its change-log transaction. On receipt, a device runs its ordinary cursor-based Pull. Startup, reconnect and periodic Pull remain mandatory because sockets can miss notifications. Attachments use a separate resumable upload queue and do not block the business mutation/outbox transaction.

## Conflict policy

- Catalog/supplier/price: detect concurrent modifications, display local vs remote, allow administrator to choose/merge; preserve both values in conflict audit record.
- Orders: drafts can conflict; confirmed orders immutable; create revision for corrections.
- Deletions use tombstones and retention long enough for offline devices.

## Formal document numbering and multi-device guarantees

Eventual consistency, not instant consistency. A device can be stale offline; show last successful sync. A formal issue uses one SQLite transaction to allocate its local sequence, persist the immutable document snapshot and full installation UUID, and append the outbox event. The resulting number is `<country>-<project>-<YYYYMMDD>-<type>-<installation-short-code>-<sequence>`; UUID remains the permanent entity identity.

The installation UUID is persistent, non-secret instance metadata. Its at-least-eight-character readable code is derived from it for the printed number, but only the full UUID plus sequence and the complete formal number are server uniqueness keys. The server registers/validates those values on Push and never allocates or replaces a formal number. Restore-to-same-instance retains the UUID/counter; an intentional clone/reinstall recovery must perform an audited re-key before issuing again. A duplicate full number or `(installation UUID, sequence)` with another document is retained as an auditable conflict, never silently remapped.

## Database lifecycle

Use versioned migrations for SQLite and PostgreSQL. Back up local SQLite before destructive migrations. Enable foreign keys, WAL where appropriate, and SQLite integrity checks. PostgreSQL backups and restore drills are required before production. Create one daily backup and retain the ten most recent backups; restoration requires administrator authorization and an audit record.

For Neon free-tier PostgreSQL cold starts, the server, migration command and initial-super-administrator command run a read-only `SELECT 1` readiness probe with five bounded backoff delays (250 ms through 4 s; about 7.75 seconds of waits at most) before their first database action. This accommodates the expected roughly three-second wake-up latency without retrying business mutations, which must remain explicit and idempotent at the API boundary.

## Security and resilience

No DB password shipped to desktop; no public PostgreSQL port; HTTPS only. Avoid logging supplier PII or tokens. Disable accounts or revoke account sessions to cut access, protect API against replay using idempotency and scoped sessions. Encrypt sensitive local credentials; assess whether local database encryption is necessary for threat model.
