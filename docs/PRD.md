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
- Select material, supplier quotation and quantity; editable per-order unit price with clear override indication.
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

## 4. Orders and supplier policy

- One internal parent requisition may contain multiple currencies and supplier-specific child purchase orders. A child purchase order has exactly one supplier and one currency. The parent uses its chosen primary currency for a locked-exchange-rate aggregate total.
- Confirmed supplier-specific orders should contain only that supplier's items; supplier contact/address snapshotted.
- Unique offline-safe UUID and human-friendly display number; display numbers may be provisional offline until server assigns global sequence.
- State flow: `draft → pending confirmation → confirmed → sent to supplier → completed | completed with conditions | cancelled`; rejection returns an order to editable status and resubmission creates a new approval cycle.
- Confirmed-but-unsent orders can be changed only by purchaser/administrator with a reason, version and field-level audit diff. Sent orders are cancelled/closed and replaced by a revision; historical PDFs and snapshots never change.
- Parent orders close only after all children are completed or cancelled. Supplier order-level taxes, discounts and freight are entered manually after splitting.

## 5. Pricing and tax

- Manually entered supplier quotations; no automatic live supplier price feed.
- The catalog overview must show at least four active supplier quotations for each material/model when available, with supplier name, currency and unit price visible directly in the list. The material detail shows all active quotations and their preferred/blacklist state, effective date, lead time, payment terms and quote source. Do not hide suppliers merely because their currencies differ.
- Default quotation may be latest effective for selected supplier, visibly showing effective date.
- User can override line price for this order only; catalog quotation remains unchanged.
- Multi-currency: the parent may aggregate child values into its selected primary currency using a user-entered, order-locked exchange rate. Display source-currency figures as well.
- Tax is order-level and selected from versioned templates or entered at order time. Old orders retain their tax rate and amount.
- Line/order discount and freight support both fixed amounts and percentages. Apply line discount, order discount, freight, then tax. Freight may be included in a line price or added separately.

## 6. Sync

- Local SQLite is source of immediate UI reads/writes; PostgreSQL is shared cloud state.
- Startup, post-mutation, periodic and network-recovery synchronization. WebSocket change hints trigger normal cursor Pull for online devices; they never replace Push/Pull.
- Show synced / syncing / offline-pending / error-conflict with counts.
- Server rejects disabled accounts and revoked sessions; data encrypted in transit.

## 7. Out of scope

Accounting ledger, supplier accounts, payments, AI OCR, external live exchange-rate integration, mobile app and external supplier login. Receipts/partial receipts, attachments, RFQs, approval, comments and export are in scope.

## 8. Acceptance outcomes

- New user can create and print an order offline.
- Authorized accounts can maintain the catalog offline; other signed-in installations eventually receive updates.
- Repeated sync calls do not duplicate orders.
- Changing catalog prices cannot change historical order PDFs.
- Concurrent edits surface conflicts without silent loss.
