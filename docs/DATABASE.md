# Database and Migration Rules

## Ownership and boundaries

- The desktop owns one local SQLite database. It is the source for all normal UI reads and local writes.
- The cloud service owns PostgreSQL. The desktop never receives a PostgreSQL connection string and never connects to it.
- Shared Zod contracts define boundary payloads; SQL schema definitions and migrations remain database-specific.

The initial entity set is `materials`, `suppliers`, `material_prices`, `purchase_orders`, `purchase_order_items`, local `sync_outbox`/`sync_state`, and cloud `server_change_log`. Canonical fields are defined in `SPECS.md`.

## Migration contract

1. Use ordered, immutable, versioned migrations for SQLite and PostgreSQL. Never edit a migration that could have run outside a disposable local database.
2. Record the applied version and checksum in each database. Refuse startup/deployment on a checksum mismatch.
3. Run SQLite migrations before exposing the UI. Enable foreign keys for every SQLite connection; use WAL when compatible with the chosen driver.
4. Before a destructive SQLite migration, create a restorable local backup and verify database integrity. A destructive migration needs an explicit rollback/recovery note.
5. PostgreSQL migrations run only through the server deployment path, in a transaction where supported. Production backup and restore drills are release prerequisites.
6. Test every migration from the immediately preceding schema with realistic fixtures, including orders whose referenced catalog records are later deactivated.

## Data invariants

- IDs are UUIDs. Mutable synchronized records carry a monotonic server version. Deletes are soft deletes/tombstones until retention expires.
- Money is integer minor units: XOF uses integer francs; CNY, USD and EUR use cents. `currency` is mandatory. Floating-point values are prohibited in storage, APIs and totals.
- Quantities are decimal strings with configured precision. Calculate `quantity × unit_price_minor` with decimal/integer arithmetic and an explicit documented rounding rule.
- A purchase-order item snapshots material names, model/specification, unit, supplier details, unit price, currency and tax context. Later catalog or price changes never mutate saved snapshots.
- A confirmed order is immutable. A correction creates a revision/new order with a link to its predecessor; it does not rewrite the confirmed record.
- A sent supplier order is never edited in place. It is cancelled/closed and replaced by a linked revision. Confirmed-but-unsent orders may be modified by purchaser/administrator only with a reason, a new version and field-level audit evidence.
- Closed orders, order history, attachments and audit records are retained permanently; no user role can delete or edit them.
- Deactivation preserves referenced rows. Hard deletion is not an MVP operation.

## Required indexes and constraints

- Unique non-null material SKU; normalize and validate before write.
- Index active material search fields and supplier-price lookup by `(material_id, supplier_id, currency, effective_at)`.
- Enforce positive quantity, non-negative minor-unit price, non-empty material unit/supplier name, and order status transitions at the service layer and database where feasible.
- Local outbox `event_id` is unique. Cloud processed event IDs are unique per tenant/device scope so retries cannot duplicate a mutation.

## Migration review checklist

- Does it preserve existing SQLite data and outbox events?
- Does it preserve order snapshots and confirmed-order immutability?
- Is the new field represented in local schema, server schema, shared validation and sync payloads?
- Does it add tests for upgrade, retry/failure and any changed constraint?
- Is a rollback or recovery approach documented before production use?
