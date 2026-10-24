# T09-A / T11 execution ledger — 2026-10-24

Base: `codex/v1-unified-baseline` at `d3485144b075dceb8082e493c94791aab699a3af`.
Continue `codex/procurement-t09a` at `164298a97ca8699fe32bdfcc09704f8353c1d401`.
Preserve the pre-existing uncommitted Rust reversal implementation and the unrelated primary checkout.

The user's continuous-development instruction authorizes sequential T09-A and T11 implementation, checkpoint commits, push and CI. It supersedes the one-child-per-turn scheduling restriction for this run; original acceptance gates remain open. No deployment, merge or release is authorized.

1. Payment sync: shared strict payload schema; append-only PostgreSQL ledger migration and transactional order/currency/scope/reversal validation; SQLite dependency-staged immutable projection. Cover three payments, two children, retries, conflicts, malformed input and denied scope. Never change order snapshots.
2. Reversal: complete the trusted Rust command, audit/outbox transaction, duplicate protection and real React action. Cover unchanged original rows, reason/actor/time, amount restoration and denied roles.
3. Attachments: durable local queue and import limits, server-authorized COS upload/finalization/download, hash verification, metadata and owner links, production UI. Keep secrets server-only; deny arbitrary keys and cross-scope access. Cover restart, URL expiry, unsafe file and upload failures.
4. Verify affected shared/server/desktop gates, SQLite/PostgreSQL integration and DOM flows; perform isolated real COS PUT/HEAD/GET/hash/auth-negative/owned-object cleanup if authorized bucket configuration permits it. Record exact evidence; mocks cannot establish COS connectivity.
5. Update BUILD-TASKS/ROADMAP/memory, commit and push valid checkpoints; confirm remote SHA and CI. Draft PR to the unified baseline only after the three core modules and required real checks are complete. Independent QA remains separate.

Toolbox preflight: read upstream README, Windows standard, update protocol, integration contract and manifest schema in order. Existing installer/Runner/manifest/registry/release gaps remain T15; this work changes none of those contracts.

Review focus: immutable payment overwrite; concurrent duplicate reversal; wrong child/currency/scope; cursor advancing before durable projection; attachment key substitution/expired authorization/hash mismatch. Fresh tests must exercise these boundaries.

Environment: Node 24.18.0; committed lockfile; task temp/cache/Cargo output in `E:/Honsen-T09A`. Test PostgreSQL must use isolated Compose credentials, never deployment `.env`. Only COS configuration may be read from the user's explicitly authorized `.env`, without logging values.
