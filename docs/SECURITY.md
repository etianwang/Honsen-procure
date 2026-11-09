# Security and Trust Boundaries

## Boundaries

The React renderer is untrusted. It may request actions but it may not decide authorization, write directly to SQLite, access device secrets, or call privileged operating-system APIs. Rust/Tauri commands validate all inputs and enforce the authorization rules below. The server independently validates every HTTPS request.

## Access model

- Every launch requires username/password plus one CAPTCHA: cloud-verified online or local image/arithmetic offline. An 8-second HTTPS attempt starts automatically; network-unavailable results offer explicit offline selection or retry, never automatic fallback. Authentication, lockout, retired API, rate-limit, TLS/protocol failures do not offer offline fallback. The app locks after 30 minutes idle, saves drafts, then requires password re-entry.
- An administrator creates accounts with a temporary password and binds the user to a photo, country/project, department and team. First login must change that password and complete all bindings before access.
- The user-approved V1 empty-database bootstrap is a narrow exception to forced first-login change: its initial admin password is supplied at runtime, login recommends a change without blocking access, and normal replacement passwords keep the twelve-character policy. Self-service change requires an active account session and current password, audits the change and revokes all sessions. This exception does not relax ordinary account-provisioning requirements.
- Store only a strong salted Argon2id password hash. Never store, return, log or place a plaintext password in the frontend.
- After five failed attempts, lock the account for 15 minutes. An administrator can unlock it. A user may have several roles; stopped accounts retain their history but cannot sign in.
- A user can have one active device session. A second online login invalidates the first; an offline device is locked on its next authenticated request. Locally cached enabled users may sign in offline for at most 24 hours after their last verified sign-in/sync.
- Roles are additive: engineer creates/edits only their assigned-project requisitions; purchaser and administrator include engineer capabilities, can view/approve all projects and maintain business data; viewer/auditor reads, prints and exports all data but cannot mutate it. Procurement administrators and purchasers share confirmation/rejection authority.
- Super administrator is a separate governance role: it manages administrator/purchaser role assignment, account provisioning, global security policy, backup/restore and system audit. It is not a normal purchasing/approval role and cannot use that power to evade an approval policy.
- A super administrator uses the normal password plus the same mode-appropriate single CAPTCHA login flow. Display that account's bound mobile-number last four digits as a recognition cue only; do not accept it as a secret, a recovery method, a second factor or authorization evidence.
- TOTP two-factor authentication is optional for every user and recommended for super administrators. Once voluntarily enabled, it is mandatory on every login, online and offline. Keep TOTP secrets encrypted in server storage and OS-backed desktop secure storage; never expose them to the renderer, SQLite business tables, logs or APIs. A reset/disable requires an administrator (or another super administrator for a super-administrator account), identity verification outside the application, and immutable audit evidence.
- `allow_self_approval` defaults to false. When false, a purchaser/administrator cannot confirm their own order; another purchaser/administrator must do so. Only a super administrator may change this policy, with a mandatory reason and permanent audit. When enabled, each self-approved order is visibly and permanently marked. Do not allow removal/stopping of the last two enabled super-administrator accounts.
- Engineers and viewers have read-only material-catalog access limited to search/view. Only purchasers/administrators can create, edit or deactivate materials; all removals are soft deletes with audit evidence, never hard deletes.
- No public account or device registration exists. A super administrator provisions initial privileged accounts; account authentication authorizes synchronization. The service tracks a non-secret installation UUID for cursor/session management and formal-number namespace validation, but it cannot independently access company data.

## Data and network rules

- Desktop-to-server traffic uses HTTPS. PostgreSQL is private to the server and must not be reachable from desktop clients.
- Validate input with shared schemas at HTTP/Tauri boundaries and use parameterized SQL everywhere.
- Treat server responses, release metadata, file paths and imported values as untrusted input.
- Keep account-session secrets in OS-backed secure storage where supported. Never commit secrets, connection strings, vendor data or production credentials. Root `.env` is deployment-only and must remain ignored.
- Minimize logs: do not include passwords, tokens, supplier personal data, full order details or raw request bodies unless separately approved for a support workflow.
- Local SQLite encryption is a threat-model decision, not a substitute for OS account protections; document the decision before handling data that requires it.

## Security tests

Verify that an unauthenticated renderer cannot invoke privileged mutations; wrong-password attempts are rate-limited; a disabled account or revoked session cannot push/pull; no API payload exposes a password hash or credential; SQL injection-shaped inputs are treated as data; and logs/fixtures contain no secrets or real supplier contacts.

## 2026-11-07 approved account identity rules

New login usernames contain only ASCII A-Z/a-z/0-9, with a maximum of100characters. Store their original spelling, but compare and enforce global uniqueness using the same ASCII case-fold expression; database uniqueness includes inactive and soft-deleted users. Display names are separate Unicode profile metadata. New account-management requests require a display name; bootstrap and legacy profiles may retain a null display name. Legacy accounts retain their exact username, UUID, password hash, roles and history, and may still authenticate using their prior non-ASCII username. No automatic rename, merge, password reset or name reuse is permitted. A migration collision stops atomically for authorized review rather than discarding an account. The protected admin remains permanent; business roles/scopes are not granted by login normalization.
