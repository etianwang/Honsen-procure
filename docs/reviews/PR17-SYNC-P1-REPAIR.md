# PR #17 two-P1 repair evidence — 2026-10-23

Builder implementation and verification evidence only. Independent recheck remains required; this document does not declare security QA PASS or authorize a PR merge/deployment. Exact final production SHA, remote equality and GitHub quality result are reported with the delivery of the containing commit.

## Scope and provenance

- Repository: `etianwang/Honsen-procure`, PR #17, base production SHA `d0d6e858e4d3a53129c6ac9291bc66f646ab68da`.
- Repair branch: `codex/pr17-sync-p1-repair`; initial repair checkpoint `784b7c1898790c6c5220fc7f6600487c60f2990d`; authorization replay checkpoint `6edc01d64e2d570a6ab37642ba869243677b2bbf`.
- Original independent findings: [94126b50](https://github.com/etianwang/Honsen-procure/blob/94126b50cc0f92faa1fc145c847ad1978046d227/docs/PR17-FINAL-INTEGRATION-REVIEW.md). Those findings are not superseded by an independent acceptance result yet.
- Continue the existing approved defect repair (B), without reopening complete T04/T10 or PR #18 development. The original task/dependency/milestone gates remain intact.
- Local worktree and caches: `E:/Honsen-PR17-Sync-P1` and `E:/Honsen-PR17-Sync-P1-runtime`; Node 24.18.0, committed lockfile, real SQLite through rusqlite, disposable WSL2 PostgreSQL **16.15** through the prescribed Compose test foundation. No production database was accessed.

## P1-01 implementation

The server returns a trusted authorization fingerprint and a committed history bound from the same repeatable-read snapshot used to filter each Pull page. Binding/project/department/team row revisions detect additions, expansions and revoke/regrant between client observations. Catalog recovery audits also advance the generation when previously unroutable history becomes visible.

SQLite migration 0054 stores an account-owned history task with its own cursor, fixed upper bound and completion flag. The client conservatively replays all current authorized history when the generation changes, transactionally commits projection/task progress, then resumes its retained incremental cursor. Changes committed during replay are retrieved by the ordinary cursor. A changed authorization generation yields no stale-scope replay data and starts a new bounded task. Existing Outbox, local drafts, issued price snapshots and audit rows are retained.

The staging store now retains original source cursors. Dependency replay uses chronological price order and cannot reactivate an old quote over a known later quote or tombstone. Missing real country/material/supplier references wait in the existing durable projection quarantine; they are never fabricated. Refer to [SYNC-PROTOCOL](../SYNC-PROTOCOL.md#authorization-history-replay).

## P1-02 implementation and compatibility

Supplier/quote upserts are completely validated at both service and PostgreSQL acceptance boundaries. Entity IDs, country scope, usable immutable references, complete supplier/material dependencies and globally unique supplier codes are checked before acceptance. Invalid events return structured errors without valid change-log/entity writes. Accepted catalog fields match the desktop's byte limits, business-code/date rules and nonnegative signed 64-bit money representation; malformed decimal/nonnumeric money is safely rejected rather than throwing in `safeParse`.

Legitimate legacy snake_case fields, nullable omissions/blanks and UUID case are normalized. Required business facts remain mandatory. Stored tombstone scope/references remain authoritative and `{}` delete payloads work. Procurement quote verification uses the same complete contracts, preserves blacklist/country/latest-price checks and retains the prior immutable issued-order discrepancy path.

PostgreSQL migration 010 preserves malformed historical routing and missing mandatory fields even when scoped Pull cannot select them. Visible malformed history is archived and returned with a trusted quarantine marker. SQLite migration 0055 preserves raw bad payloads/recovery versions, supplier-code conflicts and source order, while healthy records and cursors continue. Repair does not erase or merge the original records.

An enabled, currently scoped administrator can call `POST /api/sync/catalog-repairs` with `requestId`, entity identity/type, `expectedVersion`, verified complete `payload` and `reason`. A normal version-checked/idempotent event, original snapshot, resolution links and recovery audit commit together. Existing valid country/material/supplier identities remain immutable, including uppercase UUID equivalents. Only unusable absent/invalid/orphan references can be replaced after manual verification, subject to full current scope/reference checks. Missing facts remain `MANUAL_REVIEW_REQUIRED`; operators must obtain the source facts rather than fill placeholders. [Protocol and operational boundaries](../SYNC-PROTOCOL.md#catalog-validation-quarantine-and-recovery).

## Verification

| Boundary                                 | Evidence                                                                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL authorization expansion       | Regression first failed on missing trusted version; now proves historical cursor recovery, a fixed replay bound, new quote after that bound, incremental continuation, revocation denial and regrant generation change.                                  |
| SQLite task durability                   | File SQLite crosses a 500-event page and process restart; repeated generation preserves its bound/cursor; an injected real cursor-write failure rolls back the replay page; retry succeeds; incremental cursor/Outbox/FKs survive.                       |
| Quote dependency/order                   | Missing supplier defers prices; real supplier arrival projects them; reverse-UUID quote identities still activate the chronological latest quote; older replay cannot replace newer data/tombstones.                                                     |
| Invalid Push                             | Missing fields, forged entity identity, invalid/out-of-country references, duplicate supplier code and malformed money are rejected; entity/change-log non-writes asserted against PostgreSQL.                                                           |
| Historical recovery                      | Incomplete supplier and decimal quote history are archived; healthy events continue; administrator repair is versioned, reasoned and idempotent; original payloads and audit remain.                                                                     |
| Hidden/orphan history                    | Migration test retains null-country/orphan events; a country repair changes replay generation and exposes the formerly hidden historical quote. Invalid/orphan quote references can be manually recovered only within the administrator's current scope. |
| Legacy and deletes                       | Real Push/Pull accepts complete legacy aliases/nullable omissions and empty tombstones. Uppercase existing references cannot be reassigned through recovery.                                                                                             |
| Rust library                             | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- --test-threads=4`: 98/98; final migration/replay failure coverage rerun before checkpoint. Real file/in-memory SQLite, not a mocked adapter.                                      |
| Workspace tests with isolated PostgreSQL | `npm run test`: desktop 11/11, server 128/128, shared 16/16; no PostgreSQL suite skipped. Includes 9 catalog integration cases plus the migration, origin, price/formal and rejection regressions.                                                       |
| Quality                                  | Workspace lint/typecheck/build, Rust fmt/check and project Clippy are verified before checkpoint; final GitHub quality must be checked at the actual PR HEAD.                                                                                            |

Earlier failed/interrupted evidence remains historical: the old Rust run was interrupted; a later run finished 97/98 because the cursor rollback test still expected malformed catalog data to abort the page. That test now injects an actual cursor-write failure, retaining its rollback assertions. Direct root-level multi-file Vitest runs bypassed the server's serialized-file configuration and produced concurrent lock-wait failures; the standard workspace command preserves the original assertions and passed. Incomplete legacy test fixtures in affected store/formal/origin tests were replaced with complete business fixtures, preserving their original security/snapshot assertions.

The extra strict `cargo clippy --lib --bins -- -D warnings` diagnostic fails on nine pre-existing library style warnings; `git blame` attributes all nine sites to pre-repair commits. The prescribed project Clippy command exits zero with those warnings and existing test/bin warnings. Existing React effect/Vite chunk/linker warnings remain. No suppression or unrelated cleanup was introduced.

The first integrated candidate `8c84c273f951282020b7fbf06aa18e1c8e9494cf` passed CI format/lint/typecheck/PostgreSQL tests/build, then failed the migration grant gate because migration 010 lacked an explicit API grant entry. The follow-up registers only SELECT/INSERT/UPDATE on `catalog_sync_quarantine`; DELETE and schema creation remain denied. The existing restricted-role deployment-grant regression now exercises these exact privileges and passes against disposable PostgreSQL 16. No live deployment or broad Linux QA was performed. Final CI must pass on the follow-up production SHA, not the failed candidate.

## Acceptance and release holds

- Independent QA must recheck P1-01/P1-02 and their directly affected Push/Pull/recovery paths on the final production SHA. Builder review found no remaining P0/P1 in this bounded change; this is not independent acceptance.
- PR #17 stays Draft pending that recheck and the separately authorized merge decision. No PR #17/#13 merge, main change or deployment is authorized by this repair.
- **Real Windows EXE online re-login after revocation remains NOT PASSED and a mandatory V1 production-release security gate.** The user's gate adjustment permits development-baseline integration before that independent acceptance; it does not waive the production hold.
- Complete T04/T10, Windows A/B and Linux deployment QA were not repeated. No installer/Toolbox identity/Runner/registry/release contract changed.
