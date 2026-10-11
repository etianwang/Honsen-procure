# Decisions and Open Questions

## Confirmed

- Product Chinese display name: `Honsen采购管理系统`; the English companion name is `HONSEN Procure`. This is a display-name decision only and does not approve or imply a Toolbox `appId`, EXE name or installation directory.
- Desktop: Tauri 2 + React + TypeScript + SQLite.
- Remote: PostgreSQL behind HTTPS API; bidirectional incremental sync.
- Every launch uses account/password plus local CAPTCHA; session locks at 30 minutes. A cached enabled user can sign in offline for 24 hours.
- Roles: engineer, purchaser, administrator and viewer/auditor. Users can have multiple roles; administrator creates/stops/unlocks accounts.
- Internal parent requisitions split to supplier-specific child purchase orders. Purchasers/administrators approve/reject and can view all projects.
- Parent totals use an elected primary currency and order-locked user-entered exchange rate; children have one supplier/currency.
- RFQs, price history, permanent audit/comments/attachments, partial receiving, Excel export, PDFs and backups are production scope.
- WebSocket is used for change notifications that trigger cursor Pull; HTTPS Push/Pull remains authoritative.
- Super administrator is a narrow governance role. Self-approval defaults off and is configurable only by super administrator with an immutable audit trail; retain at least two enabled super administrators.
- Super administrator uses standard password/local-CAPTCHA login. Mobile-number last four digits are display-only recognition information, not an authentication factor.
- TOTP two-factor authentication is optional. Once a user enrolls, it is mandatory for every login and is supported during the permitted offline-login window.
- All UI screens support Chinese, French and English. Users select one active UI language; order PDFs remain Chinese/French or Chinese/English according to the selected document language pair.
- The approved UI direction is the Chinese desktop workbench visual draft: restrained green HONSEN accent, light/dark adaptive surfaces, compact left navigation, persistent top status bar, data-dense tables, rounded small controls and explicit text-plus-color statuses. This is the baseline for subsequent page/component implementation.
- Supplier integration is reserved, not implemented.
- Offline ordering, local printing, PDF export.
- Supported currencies are XOF, CNY, USD and EUR. XOF has zero minor places; the others have two.
- Initial projects, teams, numbering, company print identity, cloud configuration boundary and internal update direction are recorded in `INITIAL-MASTER-DATA.md`.
- There is no public account/device registration and no separate device-enrollment credential. Account sessions authorize synchronization; an opaque installation ID only supports session/cursor management.
- Neon free-tier PostgreSQL cold starts use a bounded, read-only startup readiness probe (up to about 7.75 seconds of backoff). Purchases, approvals and other business writes are never automatically retried by this probe.

## Open implementation decisions

1. **Toolbox identity:** `appId`, stable product-directory name, main EXE name, installer technology and internal update URL have not been registered. See `HONSEN_TOOLBOX_INTEGRATION.md`.

## Deferred

Supplier API integration, inventory, approvals, accounting, OCR, AI, mobile, external supplier login.
