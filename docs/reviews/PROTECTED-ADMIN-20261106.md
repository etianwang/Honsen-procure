# Permanent admin protection — actual acceptance 2026-11-06

Source frozen at `0829780499a9b0ffe4bc490a9d4530e0416a24cb` (task branch `codex/admin-protection-20261106`). Previous69052e0 ZIP is superseded: it omitted reviewed trigger functions from the deployment grant tool whitelist. The actual failure and repair are preserved below.

ZIP: `H:\Honsen\Honsen-Procure\.cache\server-release\honsen-procure-server-v1-0829780499a9b0ffe4bc490a9d4530e0416a24cb.zip`.

Size **3,537,677 bytes**. SHA-256 **c9233b3e5a9a7222dd53cbab831877af2352ca264a1569e32091a59ee0018f12**.

Independent audit attribution recheck supersedes the a17 candidate: local maintenance recovery writes actor_id NULL, verified maintenance database role and operator/reason, and target entity_id=existing admin. It never pretends the forgotten-password account authenticated the recovery. Actual final ZIP asserts this attribution. No historical audit rows rewritten.

## Implemented boundary

Additive `015_protected_admin.sql`,18 migrations total; no old migration/checksum edits. Does not create or reset admin, change UUIDs, business records, formal snapshots or existing passwords. An unhealthy preexisting admin causes migration refusal and requires authorized review rather than silent repair. Permanent admin identity/status/super role and user/role TRUNCATE are protected. Concurrent super-administrator reductions are serialized; the preexisting final-two rule remains stricter than the final-one minimum. Initial single-account bootstrap remains supported. Authentication lockout remains enabled; authorized recovery can clear a temporary lock.

Ordinary administrators cannot change protected admin scopes; normal self-service password change remains available. Admin retains existing global master-data/governance role authority without a daily-procurement or approval-policy bypass. Successful account/role governance changes and recovery have audit evidence; existing scope/password operations retain application actor audit.

Recovery is a local interactive maintenance-owner operation, never an HTTP bypass. It requires PostgreSQL authentication as the users-table owner without SET ROLE, operator identity, reason and a twice-entered non-echo strong password. API runtime credentials are refused. Existing ID, roles and history remain; old sessions are revoked atomically. Audit failure rolls password/session changes back. Passwords never enter argv, package defaults or audit. Repeated Seed preserves the recovered password. The CLI does not load the API .env automatically.

PRD, SPECS, SECURITY and permission/test rules updated; canonical root README and Baota mirror identical. Recovery appendix follows the single eleven-step deployment flow. Deployment function allowlist pins exact body hashes, owner/invoker/signature/search_path and all six trigger bindings; runtime receives no EXECUTE privilege on these trigger functions.

## Executed checks

- Full final server source0829780 with real disposable PostgreSQL16.15 without pgcrypto:225 PASS,3 opt-in real COS SKIP. Exact final-code evidence is audit-full.log; grant-tool repair independently rechecked below.
- Protected-admin suite6 PASS, including upgrade from pre015 object boundary preserving full user rows, runtime/ordinary-administrator denials, concurrent reduction, maintenance owner NOSUPERUSER/NOCREATEDB/NOCREATEROLE recovery, immutable identity/roles, audit-failure rollback, revoked token/stale login rejection and new-password CAPTCHA authentication.
- Focused auth/password/scope recheck17 PASS. Strict server typecheck/lint/build and affected formatting PASS. Release14 PASS.
- Existing affected authorization-management Playwright DOM1 PASS. No new desktop UI or offline SQLite mutation was introduced.
- Actual pseudo-terminal CLI: password not echoed, successful recovery exit0 against owned disposable test account; unhealthy/missing admin negative exit1 retained. Normal automated fixtures use independent account identities; admin is used only for explicit protection/Seed/recovery checks.
- Expanded T04 grants regression PASS: rejects SECURITY DEFINER, body substitution and disabled triggers for all three new routine types; exact bindings verified. Restricted runtime service Push/Pull/repair PASS.
- Actual final ZIP freshly unpacked in Ubuntu24.04/Node24.22.1 with PostgreSQL16.15 image physically lacking pgcrypto: available0, installed0,18 migrations PASS under ordinary owner; Seed2 countries/3 projects/14 units, tax1800/1925 basis points; runtime grants and protected writes refusal; root start.mjs loads .env from different cwd; admin login, recovery, old-session401, old-password401, new-password200, authenticated admin self-change200, repeated Seed/password preservation, migration repeat, restart/history preservation PASS. Packaged grant-policy --check PASS.
- Packaged SHA256SUMS,18 SQL manifest hashes and fixed source identity verified. start.mjs/recovery entry present, forbidden secret filenames0. No real .env, cos.txt or key included.

Logs/controllers live in ignored task-owned `.cache/admin-protection`. Full package proof is `linux-082.log`; source690 initial package proof is retained separately. Build controllers needed explicit Linux GIT_DIR/GIT_WORK_TREE for a Windows-created worktree; no Git metadata or foreign branch was changed. The first local PostgreSQL attempt hit ECONNREFUSED because WSL had exited; a deliberate WSL keeper fixed the disposable environment. First cleanup wrapper returned1 after removal due shell assertion/quoting; explicit subsequent container/Compose-volume/network inventories were empty. Test-only private credentials and env were removed. Final keeper56935 intentionally interrupted, exit1, after cleanup. No production DB/SSH access or reset of an existing user account.

## CI and remaining gates

69052e0 CI42150877077 failed T04 because routine whitelist integration was missing. Fixed in a17c37d with tests; never relabelled the first run PASS. Prior README-only825aaa2 CI42148885478 failed unrelated unchanged quote-selection DOM (70PASS/1FAIL); rerun connector returned403, not user approval rejection. Final task-branch CI result belongs to its exact final commit and is reported separately.

README1–10 actual real Baota PM2-backend rehearsal on source1ec5ab5 is recorded in BAOTA-PM2-README-20261106.md; root start.mjs, PM2 configuration, Nginx and first-install ordering are unchanged in the new package except migration count18 and recovery appendix. New package independently re-executed migrations/Seed/grants/root entry and recovery. New package was not installed into real Baota PM2 again, nor uploaded remotely; do not transfer GUI or production acceptance. Software0.0.0-development, active APIv1, migration015, deployment directory/www/wwwroot/api-pr/v1/. Files retained for rollback require schema compatibility and verified database backup, not a direct downgrade to an unprotected older API.

BLOCKER: final exact-SHA CI pending when these records are committed; full production/real Windows/live COS and original final-release holds remain open. DEFERRED: user backs up and replaces the old ZIP, applies018-total migration set with maintenance role, retains current database/password and same single Baota project. No stable Release or main merge. WARNING: existing dependency advisories; no lockfile/dependency changes. Shared original worktree's concurrent account-provisioning code remains untouched. This acceptance is for the bounded protection defect and scoped package proof, not SERVER_V1_READY.
