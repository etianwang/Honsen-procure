# SPECS — Functional and Data Specifications

## 1. Data model

### materials

`id UUID PK`, `sku TEXT UNIQUE nullable`, `name_zh TEXT`, `name_fr TEXT nullable`, `aliases JSON`, `category_id UUID nullable`, `brand TEXT`, `model TEXT`, `specification TEXT`, `unit TEXT`, `notes TEXT`, `is_active BOOLEAN`, `version BIGINT`, `created_at`, `updated_at`, `deleted_at`.

### suppliers

`id UUID PK`, `name TEXT`, `contact_name TEXT`, `address TEXT`, `city TEXT`, `country TEXT`, `phone TEXT`, `whatsapp TEXT`, `email TEXT`, `notes TEXT`, `is_active`, `version`, timestamps, `deleted_at`.

### material_prices

`id UUID PK`, `material_id UUID FK`, `supplier_id UUID FK`, `currency CHAR(3)`, `unit_price_minor BIGINT`, `unit TEXT`, `effective_at`, `source_note`, `is_active`, `version`, timestamps, `deleted_at`. Price changes append a history record; avoid destructive edits to past prices. The material quotation board groups rows by exact material/model, retains one active row per supplier quotation, and shows currency beside every price. It may sort by price only within the same currency; cross-currency comparison uses the order's locked exchange rate and visibly states that basis.

### purchase_orders

`id UUID PK`, `parent_order_id UUID nullable`, `procurement_mode ENUM(owner_self_purchase,honsen_self_purchase)`, `document_type ENUM(OPA,HPA,SPO) nullable`, `display_no TEXT`, `formal_document_no TEXT nullable`, `formal_installation_id UUID nullable`, `formal_sequence BIGINT nullable`, `formally_issued_at nullable`, `country_id UUID`, `project_id UUID`, `site TEXT`, `department_id UUID`, `team_id UUID`, `applicant_id UUID`, `supplier_id UUID nullable`, `supplier_snapshot JSON`, `currency CHAR(3)`, `primary_currency CHAR(3)`, `locked_exchange_rate_decimal TEXT nullable`, `locked_exchange_rates_snapshot JSON nullable`, `language_pair ENUM(zh_fr,zh_en)`, `status ENUM(draft,pending_confirmation,rejected,approved,formally_issued,executing,receiving,completed,completed_with_conditions,cancelled)`, `urgency ENUM(low,normal,high)`, `urgency_reason TEXT`, `order_date`, `delivery_address`, `expected_delivery_date`, `notes`, `subtotal_minor BIGINT`, `line_discount_minor BIGINT`, `order_discount_minor BIGINT`, `freight_minor BIGINT`, `tax_rate_snapshot JSON`, `tax_minor BIGINT`, `total_minor BIGINT`, `revision INT`, `version`, timestamps, `deleted_at`. `document_type` is independent of `supplier_id`/supplier business code. `formal_document_no`, `formal_installation_id` and `formal_sequence` are required and immutable once formally issued. The number format is `<country>-<project>-<YYYYMMDD>-<OPA|HPA|SPO>-<installation-short-code>-<sequence>`; the server validates the displayed short code against the complete installation UUID. `locked_exchange_rates_snapshot` records every source-to-primary rate used by owner lines; the existing scalar rate remains for the supplier-child compatibility path. Supplier children remain a Honsen-self-purchase formal-execution option, not an owner-mode requirement.

### purchase_order_items

`id UUID PK`, `order_id UUID FK`, `material_id UUID nullable`, `material_snapshot JSON`, `supplier_snapshot JSON nullable`, `quote_source_type ENUM(catalog,manual) nullable`, `material_price_id UUID nullable`, `catalog_price_snapshot JSON nullable`, `manual_reference_price_minor BIGINT nullable`, `manual_reference_currency CHAR(3) nullable`, `manual_reference_reason TEXT nullable`, `manual_reference_actor_id UUID nullable`, `manual_reference_at nullable`, `exchange_rate_snapshot JSON nullable`, `converted_reference_unit_price_minor BIGINT nullable`, `markup_type ENUM(percentage,fixed) nullable`, `markup_percentage_bps BIGINT nullable`, `markup_fixed_minor BIGINT nullable`, `quantity_decimal TEXT`, `received_quantity_decimal TEXT`, `unit TEXT`, `currency CHAR(3)`, `unit_price_minor BIGINT`, `line_discount JSON`, `line_freight JSON`, `freight_included BOOLEAN`, `line_total_minor BIGINT`, `sort_order INT`, timestamps. For owner mode, source price/currency come from the catalog/manual snapshot; `currency` is the application primary currency, `converted_reference_unit_price_minor` is the rounded primary-currency reference, and `unit_price_minor` is the trusted calculated final application price. None is renderer-editable after calculation. Source, rate, converted reference and markup fields freeze at formal issue.

### procurement_expenditures

`id UUID PK`, `order_id UUID FK`, `project_id UUID`, `receipt_id UUID nullable`, `counterparty_type ENUM(registered_supplier,market_casual)`, `supplier_id UUID nullable`, `payee_name TEXT`, `counterparty_snapshot JSON nullable`, `currency CHAR(3)`, `amount_minor BIGINT`, `payment_date`, `payment_method ENUM(cash,bank_transfer,mobile_payment,other)`, `payment_handler_id UUID`, `notes TEXT nullable`, `status ENUM(recorded,reversed)`, `corrects_expenditure_id UUID nullable`, `created_by UUID`, timestamps. Attachments use the existing `attachments.owner_type=procurement_expenditure` relation; voucher absence is permitted but visibly warned. This is the single lightweight payment/expenditure record: each row is one actual payment, several rows may belong to one order, and it exists only for `honsen_self_purchase`. It is not a general accounting ledger and must be absent for `owner_self_purchase`.

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

`installation_id`, `installation_short_code`, `next_formal_sequence`, `last_pull_cursor`, `last_success_at`, `last_authenticated_user_id`. The installation UUID supports cursor/instance and formal-number namespace tracking only; it is not a synchronization credential. Its readable short code is derived from the UUID, not independently user-editable.

### server_change_log (cloud)

`sequence BIGSERIAL PK`, `entity_type`, `entity_id`, `operation`, `version`, `changed_at`, `payload_json`.

## 2. Validation

- Quantities are positive decimals with two decimal places; price is nonnegative integer minor units.
- Never use JS float for financial arithmetic; use decimal arithmetic and explicit half-up rounding: XOF has zero decimal places; CNY/USD/EUR have two.
- Required material name and unit; required supplier name; unique SKU if provided.
- Disallow confirmation with zero lines. Supplier children have one currency; a parent may combine children by using its locked primary-currency exchange rate.
- Parent order transitions are mode-constrained: both modes permit `draft → pending_confirmation → approved` and `pending_confirmation → rejected → draft`; only owner mode permits `approved → formally_issued → receiving`, while only Honsen mode permits `approved → executing → receiving`. Only receiving permits `completed` or `completed_with_conditions`; cancellation may not rewrite a formally issued snapshot. `confirmed` is a legacy local-storage alias for `approved` and is not a third approval state. Trusted commands must reject every other transition and cover rejection, cross-mode and skipped-state attempts.
- Line/order discounts and freight accept fixed minor amounts or percentages. Calculation order is line discount, order discount, freight, then tax.
- Draft/submitted temporary material requires name, model, specification and unit. Confirming the parent creates it as pending-completion; purchaser/administrator completes it before normal activation.
- Reject invalid email/phone only where appropriate; permit international phone formats.
- Deactivation does not delete referenced history.
- For owner mode, every line must explicitly select `catalog` or `manual`; no dropdown may auto-select a first price. `catalog` requires an active `material_price_id` matching its material and a frozen supplier/price/currency snapshot; base cost is not editable. `manual` requires no `material_price_id`, a nonnegative unit price, currency, non-empty reason, actor and time; it is red-marked in internal UI/audit and never writes to `material_prices` automatically.
- Owner mode requires exactly one markup rule per line: `percentage` has non-null basis points and null fixed amount; `fixed` has non-null fixed minor amount and null percentage. The Rust command validates integer-money/currency compatibility and calculates final unit/line totals. Renderer values cannot override either source cost or result.
- Owner source currency may differ from the application primary currency. For a non-identity pair, a valid local exchange-rate record with direction `source_currency → primary_currency` is required at issue. Convert first with integer/rational arithmetic: `converted_minor = round_half_up(source_minor × rate × 10^primary_digits ÷ 10^source_digits)`. Then calculate `percentage` as `round_half_up(converted_minor × (10000 + markup_bps) ÷ 10000)` or `fixed` as `converted_minor + markup_fixed_minor`; fixed markup is always primary-currency minor units. Same-currency lines use identity rate `1` without an external rate record. No floating-point value enters storage or calculation.
- The rate snapshot includes source/target currencies, canonical decimal/rational value, rate record ID/source/effective time and the rounded converted reference. Formal issue is rejected if a required rate is absent, inactive, wrongly directed or outside its validity rules. Issued rate/source/converted/final snapshots are immutable and Pull cannot replace them with newer rates.
- A revoked/inactive catalog price cannot be newly selected. A draft referencing one must select another active catalog quote or explicit manual reference before formal issue. A locally valid quote may be formally issued offline: issue freezes the full source and calculation snapshot, formal number and UUID in one local business/outbox transaction.
- Server Push/Pull is idempotent on UUID plus frozen formal snapshot. If an issued catalog price is now revoked/changed remotely, retain the issued snapshot and create an auditable verification discrepancy rather than changing price/number. A duplicate formal number on a different UUID, or a different frozen snapshot for the same issued UUID, is a conflict requiring resolution; neither is silently remapped. Manual source validation checks required exception metadata, not catalog-price existence.
- Formal issue requires a transactionally allocated installation-local sequence and a full installation UUID. The readable code is at least eight Crockford-Base32 characters derived from that UUID; it is not sufficient by itself for uniqueness. Enforce unique local `(formal_installation_id, formal_sequence)` and cloud formal-number/(installation UUID, sequence) registrations. Database clone/recovery must retain existing issued records and re-key to a new audited installation UUID before new issue on another active instance.
- `procurement_expenditures` requires a positive amount, currency, payment date, payment method, handler, payee and creator. It may not be created for owner-self-purchase, and it never changes receipt quantities or derives from an estimate. Submitted payment values are immutable: a correction appends a `reversed`/replacement record linked by `corrects_expenditure_id` with an audit reason; vouchers may be attached later without erasing the missing-voucher warning.

## 3. Screen behavior

- Home: left search and catalog results, right order/cart, sticky total and print actions.
- Keyboard: focus search on startup; Enter add selected item; Esc close dialog; Tab accessible traversal.
- Backend: modal password unlock, auto-lock after configurable inactivity, manual lock button.
- Search works offline using SQLite indexes/FTS as appropriate; diacritic-insensitive French search where feasible.
- Clear empty, loading, offline and error states; never show stale cloud status as live.
- Login requires password and local image/arithmetic CAPTCHA. Lock after 30 minutes idle and save drafts. Enforce user/project scope independently of what the UI hides.
- UI strings use complete `zh-CN`, `fr-FR` and `en-US` message catalogs; no visible application label may be hardcoded in a component. The user switches one active UI locale from the top bar/profile settings. Missing translated material/document values follow the print-language validation rules rather than silently changing the UI locale.

## 4. Printing

- A4 portrait default, pagination with repeated table headers; company logo and bilingual title appropriate to the mode. An owner document is a formal material application, not a supplier purchase order.
- Owner-print header: immutable formal number, date, project, applicant, delivery location, primary currency and owner-facing notes. Its rows show material/specification/unit, quantity, primary-currency final owner application unit price and total only. It must never contain supplier identity/contact, source currency/base cost, exchange rate, converted reference, markup type/value, `material_price_id` or manual-reference reason.
- Internal approval/detail views retain the quote source, manual exception red warning, reason, actor/time and markup audit data; this is expressly not copied into the owner print template.
- Rows: line number, French/Chinese description, model/spec, unit, quantity, unit price, line total.
- Footer: subtotal, explicit tax, total, currency, notes, prepared/approved signature placeholders.
- PDF output generated from persisted order snapshot; deterministic values across reprints.
- Draft print watermark optional; confirmed order prints no draft watermark.

## 5. Cloud API (draft contracts)

`POST /api/auth/login` — account/password, CAPTCHA and optional TOTP; no public registration or separate device enrollment.
`POST /api/sync/push` — `{installationId, events:[{eventId,entityType,entityId,operation,baseVersion,payload}]}`; `installationId` is the non-secret installation UUID. Response per event: accepted / conflict / validation_error with server version.
`GET /api/sync/pull?cursor=...&limit=...` — ordered server changes and opaque next cursor; durable sequence-based pagination.
`GET /api/sync/status` — server reachability and authenticated account-session status.
`GET /api/sync/ws` (or equivalent authenticated WebSocket endpoint) — best-effort change hint only; client obtains data only with cursor Pull.
Reserved `/api/integrations/suppliers/*` disabled until future implementation.

## 6. Error handling

- Distinguish local save failure, server unreachable, expired account session, conflict, invalid data, and print failure.
- Local save success must not depend on network; pending outbox visible.
- Server retries must be idempotent using event IDs and transactional writes.
- Account/session APIs enforce one online device session per user, five-failure/15-minute lock, forced first password change and administrator unlock.
