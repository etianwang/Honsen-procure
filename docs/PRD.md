# PRD — Honsen采购管理系统（HONSEN Procure）

**Version:** 1.0 draft | **Product:** overseas MEP materials catalog and purchase-order desktop app | **Language:** full Chinese, French and English UI; Chinese/French or Chinese/English documents.

## 1. Goals

- Fast prescription-style material selection and purchase-order generation.
- Maintain internal material/supplier/price data manually.
- Authenticated offline-first desktop workflow, automatic bidirectional cloud synchronization across devices.
- Print A4 orders or export PDFs with itemized prices and totals.
- Every application screen supports Chinese, French and English. The signed-in user chooses one UI language at a time; do not show three copies of each label in the same working view.

## 2. Users and access

- Every launch requires account password and local image/arithmetic CAPTCHA. The session locks after 30 minutes idle. A locally cached enabled account may sign in offline for up to 24 hours; it must later reconnect and validate.
- Engineer: submits requisitions only for assigned projects; edits or withdraws their own unconfirmed/unrejected orders; views all same-project orders and all information.
- Purchaser and administrator: include engineer capabilities and can create supplier orders/RFQs. They see and approve/reject every project; may edit another creator's order with a mandatory reason and visible field diff; maintain catalog, suppliers, prices, tax/exchange data and master data. Administrators manage engineer/viewer accounts.
- Super administrator: a narrow governance role, not a daily purchasing role. It manages administrator/purchaser roles, account provisioning, global approval policy, backup/restore and system audit. It does not normally create, approve, send or receive orders.
- Super-administrator login uses the standard account password and local CAPTCHA. The bound mobile-number last four digits are displayed only as an operator-recognition cue; they are not a password, one-time code or authorization factor.
- Optional TOTP two-factor authentication is available to every user and strongly encouraged for super administrators. Once a user enables it, the dynamic code is required at every login, including permitted offline login; users who do not enable it retain the password/CAPTCHA flow.
- Self-approval is disabled by default: a purchaser/administrator creator requires another purchaser/administrator to confirm the order. Only a super administrator may enable it as a global policy; each policy change needs a reason/audit record and every self-approved order is permanently marked in the order and export audit.
- Viewer/auditor: sees all data, prints/exports all data, but cannot create, edit, delete or comment. Keep at least two super-administrator accounts so a departure or lockout cannot block recovery.
- Materials are searchable/read-only for engineers and viewers. Purchasers and administrators can create, edit and deactivate (soft-delete) materials; hard deletion is prohibited to preserve order history.
- A user may hold multiple roles. Stopped accounts remain in history. One account may have one active online device session.
- No supplier portal/login or public account/device registration in this release; reserve the integration API only. An authenticated account session authorizes synchronization.

## 3. Main screens

### 3.1 Home: purchase ordering (default after login)

- Homepage is a statistics/work queue dashboard. It shows role-appropriate counts for pending confirmation, purchasing in progress, receipt outstanding, urgent orders and current-period purchasing amount, with country/project/date filters and direct entry to the relevant order list.
- Country/project, site, requesting department/team, applicant, currency, language, delivery address, expected arrival date, notes and attachments.
- Fast material search by Chinese/French name, alias, category, specification, model, SKU.
- Select a material and quantity. For an owner-self-purchase line, explicitly choose one associated catalog quote from its dropdown, or explicitly switch to a red-marked manual-reference exception; never default to the first quote. The selected supplier is internal estimation evidence only and does not require the owner to purchase from that supplier.
- A manual-reference exception requires a non-empty reason and records the actor, time, unit price and currency. Catalog base cost and the final owner application price are not directly editable; the trusted boundary calculates the latter from one per-line markup rule.
- Add/remove lines, reorder, duplicate, update quantity; automatic line subtotal and document totals.
- Draft autosave, submit, withdraw, approval, rejection/resubmission, cancel/revision controls, history search, duplicate and reprint.
- PDF export and system print dialog; no network required.

### 3.2 Procurement workspace and controlled maintenance

- Material CRUD: names, category, brand, model, specifications, unit, image (future optional), notes, active status.
- Material image upload is supported for purchasers/administrators. Before saving, the user must crop the selected image to a 1:1 square and review the resulting catalog thumbnail.
- Supplier CRUD: name, contact person, address, phone, WhatsApp, email, country/city, notes.
- Price records: material, supplier, currency, integer price, unit, effective date, source note; keep price history.
- Filter/search/sort, duplicate detection; CSV/Excel bulk import deferred unless explicitly prioritized.
- RFQ creation, supplier allocation and supplier-specific sub-orders; account/master-data maintenance, cloud account-session status and manual sync trigger.

## 4. Procurement modes, issue and execution

- Every requisition has exactly one mode. `owner_self_purchase` is formally issued to the owner for offline purchase/payment; it records demand and partial receiving only, never a Honsen procurement payment or actual Honsen expenditure. `honsen_self_purchase` is internally approved then executed by Honsen; it records actual procurement expenditure and partial receiving.
- Honsen execution supports a market/casual counterparty without a supplier profile, RFQ or formal supplier order. When a registered supplier and formal process are appropriate, it reuses the existing RFQ, allocation and supplier-specific child-order path; a child has one supplier/currency and retains supplier snapshots.
- Owner mode flow: `draft → pending_confirmation → approved → formally_issued → receiving → completed | completed_with_conditions | cancelled`. Honsen mode flow: `draft → pending_confirmation → approved → executing → receiving → completed | completed_with_conditions | cancelled`; RFQ and supplier-order states are optional execution detail, not mandatory gates for market purchasing. Rejection returns to an editable state and starts a new approval cycle on resubmission.
- UUID is the permanent entity identity. Formal issue allocates and freezes `<country>-<project>-<YYYYMMDD>-<document-type>-<installation-short-code>-<sequence>` locally in the same transaction as its outbox event. `OPA` denotes owner-self-purchase, `HPA` Honsen-self-purchase and `SPO` supplier-child purchase order; these fixed document types are reserved from supplier business-code reuse. The persistent full installation UUID is the server uniqueness key behind the readable at-least-eight-character short code; it is not a credential. The server registers/validates it and reports collisions as conflicts; it never silently renumbers a formally issued document.
- A formally issued document is immutable in its quote/price/number snapshot. A required correction is a cancelled/closed original plus a new revision with its own UUID and formal number.
- Honsen-self-purchase may append one or more lightweight payment records (for example deposit and balance): actual amount/currency, payment date/method, handler, supplier or free-text payee, optional voucher and note. Payment and receiving are independent records. A submitted payment is corrected only by an auditable reversal/replacement, never silent overwrite; market counterparties do not need a supplier profile.

## 5. Pricing and tax

- Manually entered supplier quotations; no automatic live supplier price feed.
- The catalog overview must show at least four active supplier quotations for each material/model when available, with supplier name, currency and unit price visible directly in the list. The material detail shows all active quotations and their preferred/blacklist state, effective date, lead time, payment terms and quote source. Do not hide suppliers merely because their currencies differ.
- Owner-facing pricing is line-local: `catalog` selects one existing material-price row, or an operator explicitly selects `manual` reference pricing with a mandatory reason. Catalog quotation base cost cannot be edited in the application. Manual reference prices do not masquerade as catalog quotes and are never automatically written back to the catalog.
- Owner lines may select reference prices in any supported currency. The application primary currency is the final pricing and print currency. Rust first converts each source unit price with the application’s frozen source-to-primary exchange rate, using exact integer/rational arithmetic and half-up rounding, then applies exactly one markup: percentage against the converted reference price, or fixed per-unit amount entered in the application primary currency. Missing a valid required rate blocks formal issue.
- On formal issue, retain the material, selected supplier (when catalog), original source price/currency/effective information, manual-reference metadata (when manual), frozen rate direction/value/source/effective time, converted reference unit price, markup and calculated primary-currency final-price snapshots. Later catalog or rate changes cannot alter them. Printed owner documents expose only primary-currency owner application prices and totals, never supplier, base cost, exchange rate, markup or manual-reference reason.
- Multi-currency: the parent may aggregate child values into its selected primary currency using a user-entered, order-locked exchange rate. Display source-currency figures as well.
- Tax is order-level and selected from versioned templates or entered at order time. Old orders retain their tax rate and amount.
- Line/order discount and freight support both fixed amounts and percentages. Apply line discount, order discount, freight, then tax. Freight may be included in a line price or added separately.

## 6. Sync

- Local SQLite is source of immediate UI reads/writes; PostgreSQL is shared cloud state.
- Startup, post-mutation, periodic and network-recovery synchronization. WebSocket change hints trigger normal cursor Pull for online devices; they never replace Push/Pull.
- Show synced / syncing / offline-pending / error-conflict with counts.
- Server rejects disabled accounts and revoked sessions; data encrypted in transit.

## 7. Out of scope

General accounting ledger, supplier account reconciliation, payment integration, AI OCR, external live exchange-rate integration, mobile app and external supplier login are out of scope. Honsen self-purchase still records its operational actual procurement expenditure; owner-self-purchase never does. Receipts/partial receipts, attachments, optional RFQs, approval, comments and export are in scope.

## 8. Acceptance outcomes

- New user can create and print an order offline.
- Authorized accounts can maintain the catalog offline; other signed-in installations eventually receive updates.
- Repeated sync calls do not duplicate orders.
- Changing catalog prices cannot change historical order PDFs.
- Concurrent edits surface conflicts without silent loss.
