# SPECS — Functional and Data Specifications

## 1. Data model

### materials

`id UUID PK`, `sku TEXT UNIQUE nullable`, `name_zh TEXT`, `name_fr TEXT nullable`, `aliases JSON`, `category_id UUID nullable`, `brand TEXT`, `model TEXT`, `specification TEXT`, `unit TEXT`, `notes TEXT`, `is_active BOOLEAN`, `version BIGINT`, `created_at`, `updated_at`, `deleted_at`.

### suppliers

`id UUID PK`, `name TEXT`, `contact_name TEXT`, `address TEXT`, `city TEXT`, `country TEXT`, `phone TEXT`, `whatsapp TEXT`, `email TEXT`, `notes TEXT`, `is_active`, `version`, timestamps, `deleted_at`.

### material_prices

`id UUID PK`, `material_id UUID FK`, `supplier_id UUID FK`, `currency CHAR(3)`, `unit_price_minor BIGINT`, `unit TEXT`, `effective_at`, `source_note`, `is_active`, `version`, timestamps, `deleted_at`. Price changes append a history record; avoid destructive edits to past prices. The material quotation board groups rows by exact material/model, retains one active row per supplier quotation, and shows currency beside every price. It may sort by price only within the same currency; cross-currency comparison uses the order's locked exchange rate and visibly states that basis.

### purchase_orders

`id UUID PK`, `parent_order_id UUID nullable`, `display_no TEXT`, `country_id UUID`, `project_id UUID`, `site TEXT`, `department_id UUID`, `team_id UUID`, `applicant_id UUID`, `supplier_id UUID nullable`, `supplier_snapshot JSON`, `currency CHAR(3)`, `primary_currency CHAR(3)`, `locked_exchange_rate_decimal TEXT nullable`, `language_pair ENUM(zh_fr,zh_en)`, `status ENUM(draft,pending_confirmation,rejected,confirmed,sent,completed,completed_with_conditions,cancelled)`, `urgency ENUM(low,normal,high)`, `urgency_reason TEXT`, `order_date`, `delivery_address`, `expected_delivery_date`, `notes`, `subtotal_minor BIGINT`, `line_discount_minor BIGINT`, `order_discount_minor BIGINT`, `freight_minor BIGINT`, `tax_rate_snapshot JSON`, `tax_minor BIGINT`, `total_minor BIGINT`, `revision INT`, `version`, timestamps, `deleted_at`. Parent is internal requisition; child is supplier-specific and has one supplier/currency.

### purchase_order_items

`id UUID PK`, `order_id UUID FK`, `material_id UUID nullable`, `material_snapshot JSON`, `supplier_snapshot JSON`, `quantity_decimal TEXT`, `received_quantity_decimal TEXT`, `unit TEXT`, `unit_price_minor BIGINT`, `line_discount JSON`, `line_freight JSON`, `freight_included BOOLEAN`, `line_total_minor BIGINT`, `sort_order INT`, timestamps.`

### users and master data

`users`: UUID, immutable business code, username, password hash, employee photo reference, `mobile_tail_last4` nullable, `totp_enabled BOOLEAN`, `ui_locale ENUM(zh-CN,fr-FR,en-US)`, enabled state, failed-attempt/lock fields, first-login completion, timestamps. Roles are many-to-many and additive: `super_administrator`, `administrator`, `purchaser`, `engineer`, `viewer`. User-project, user-department and user-team bindings are versioned/soft-deleted. At least two enabled super administrators must remain. Mobile tail is a display-only recognition cue, never an authentication factor. TOTP secrets are encrypted and kept out of ordinary SQLite data/API responses; an enabled account requires its current code on every login.

`security_policy_audit`: UUID, policy key, old value, new value, mandatory reason, actor ID and timestamp. `allow_self_approval` defaults to false and may be changed only by a super administrator. Approved orders retain `is_self_approved` and approver identity in their immutable approval/audit snapshot.

`countries`, `projects`, `departments`, `teams`, `tax_templates`, `exchange_rates`, `units`, `categories`: UUIDs, immutable business codes, active state, versions, timestamps and soft deletes. A project belongs to one country. Tax templates have effective dates; exchange rate used by an order is copied/locked into the order snapshot.

### collaboration, RFQ, files and receiving

`order_comments`: immutable UUID, order ID, author ID, body, created time. The order creator may comment; purchasers and administrators may comment on every order. Comments are immutable; mentions create notifications.

`order_audit_entries`: UUID, order ID, actor ID, action, mandatory reason where required, previous/new field values, version and timestamp. Audit entries are permanent.

`rfqs` / `rfq_items`: one RFQ per selected supplier/order context, supplier snapshot, status, quotation rows and generated document snapshot. Accepted quotation values append immutable `material_prices` history records.

`receipts` / `receipt_items`: receipt batch, child order, receipt date, receiver, actor, note; line-level received quantity/unit and required over-receipt reason. Receipt entries are effective immediately.

`attachments`: UUID, owner type/ID, original name, content type, byte length, local path/pending state, object-storage key, checksum, uploader and timestamps. Allow PDF, Word, Excel, JPG/JPEG, PNG, HEIC, DWG and ZIP. Limit an order and its attachments to 200 MB total; each file to 100 MB. A receipt batch has at most 10 photos.

`material_images`: UUID, material ID, original attachment reference, square-cropped image reference, crop metadata, uploader and timestamps. Purchasers/administrators upload/change the image. Crop to a 1:1 square before saving; preserve the source image reference for audit/re-crop while the catalog uses the square derivative for all thumbnails.

### sync_outbox (local)

`event_id UUID PK`, `entity_type`, `entity_id`, `operation`, `base_version`, `payload_json`, `created_at`, `retry_count`, `last_error`, `acknowledged_at`.

### sync_state (local)

`installation_id`, `last_pull_cursor`, `last_success_at`, `last_authenticated_user_id`. The installation ID supports session/cursor tracking only and is not a synchronization credential.

### server_change_log (cloud)

`sequence BIGSERIAL PK`, `entity_type`, `entity_id`, `operation`, `version`, `changed_at`, `payload_json`.

## 2. Validation

- Quantities are positive decimals with two decimal places; price is nonnegative integer minor units.
- Never use JS float for financial arithmetic; use decimal arithmetic and explicit half-up rounding: XOF has zero decimal places; CNY/USD/EUR have two.
- Required material name and unit; required supplier name; unique SKU if provided.
- Disallow confirmation with zero lines. Supplier children have one currency; a parent may combine children by using its locked primary-currency exchange rate.
- Line/order discounts and freight accept fixed minor amounts or percentages. Calculation order is line discount, order discount, freight, then tax.
- Draft/submitted temporary material requires name, model, specification and unit. Confirming the parent creates it as pending-completion; purchaser/administrator completes it before normal activation.
- Reject invalid email/phone only where appropriate; permit international phone formats.
- Deactivation does not delete referenced history.

## 3. Screen behavior

- Home: left search and catalog results, right order/cart, sticky total and print actions.
- Keyboard: focus search on startup; Enter add selected item; Esc close dialog; Tab accessible traversal.
- Backend: modal password unlock, auto-lock after configurable inactivity, manual lock button.
- Search works offline using SQLite indexes/FTS as appropriate; diacritic-insensitive French search where feasible.
- Clear empty, loading, offline and error states; never show stale cloud status as live.
- Login requires password and local image/arithmetic CAPTCHA. Lock after 30 minutes idle and save drafts. Enforce user/project scope independently of what the UI hides.
- UI strings use complete `zh-CN`, `fr-FR` and `en-US` message catalogs; no visible application label may be hardcoded in a component. The user switches one active UI locale from the top bar/profile settings. Missing translated material/document values follow the print-language validation rules rather than silently changing the UI locale.

## 4. Printing

- A4 portrait default, pagination with repeated table headers; company logo and bilingual title `BON DE COMMANDE / 采购订单`.
- Header: order number, date, project, supplier name/address/contact, delivery location.
- Rows: line number, French/Chinese description, model/spec, unit, quantity, unit price, line total.
- Footer: subtotal, explicit tax, total, currency, notes, prepared/approved signature placeholders.
- PDF output generated from persisted order snapshot; deterministic values across reprints.
- Draft print watermark optional; confirmed order prints no draft watermark.

## 5. Cloud API (draft contracts)

`POST /api/auth/login` — account/password, CAPTCHA and optional TOTP; no public registration or separate device enrollment.
`POST /api/sync/push` — `{deviceId, events:[{eventId,entityType,entityId,operation,baseVersion,payload}]}`; response per event: accepted / conflict / validation_error with server version.
`GET /api/sync/pull?cursor=...&limit=...` — ordered server changes and opaque next cursor; durable sequence-based pagination.
`GET /api/sync/status` — server reachability and authenticated account-session status.
`GET /api/sync/ws` (or equivalent authenticated WebSocket endpoint) — best-effort change hint only; client obtains data only with cursor Pull.
Reserved `/api/integrations/suppliers/*` disabled until future implementation.

## 6. Error handling

- Distinguish local save failure, server unreachable, expired account session, conflict, invalid data, and print failure.
- Local save success must not depend on network; pending outbox visible.
- Server retries must be idempotent using event IDs and transactional writes.
- Account/session APIs enforce one online device session per user, five-failure/15-minute lock, forced first password change and administrator unlock.
