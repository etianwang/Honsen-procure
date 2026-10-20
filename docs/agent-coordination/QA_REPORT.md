# Independent QA Report — T08/T10/P1/Formal Combination

## T10-D / G4 independent QA — 2026-10-20 — QA_BLOCKED

**Candidate:** `b190a82cf528fcd654b268abba3de6f139b42dee`; **QA HEAD:** isolated `codex/qa-t10d-g4-b190a82` at the exact candidate. Its only parent is `c3eca9b57e4a9b6d4438cb548d3fdf4b01bcbc45`. Production source was not modified.

- A disposable WSL2 PostgreSQL 16 container, loopback Fastify HTTPS server, two isolated SQLite test profiles and real debug `HonsenProcure.exe` were built and launched for `native-smoke-20261020120000`. Actual server diagnostics show A's accepted purchase-order event at version 1 and B's stale event response `{ status: "conflict", errorCode: "VERSION_CONFLICT", serverVersion: 1, serverPayload, serverOperation: "upsert" }`.
- Read-only SQLite evidence from B confirms the rejected Outbox is retained as `superseded_at != NULL`, `last_error = VERSION_CONFLICT`, no acknowledgement; `local_sync_conflicts` contains the same event, entity, version 1, `upsert`, and nonempty local/server payloads. Its account cursor remains `0`. This is a real QA-01 structured-conflict observation, not a fixture result.
- Fresh isolated Rust `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib conflict` is 13/13 PASS. It covers the new administrator draft replacement/use-server projector path, cancelled rejection without mutation, required reason, repeat suppression, non-administrator rejection, 401/session containment, foreign conflict isolation, and cursor/dirty-order conflict preservation. This direct evidence does not substitute for the missing real EXE resolver workflow.
- The existing `ab-sync-security` Harness exits nonzero because it still asserts post-conflict `pending_count == 1`. The accepted G3 behavior instead quarantines the structured conflict immediately, so the actual Push returned `accepted_count = 0, pending_count = 0` after retaining the conflict evidence. The harness has no T10-D administrator `use_server` / `replace_draft` / convergence mode; therefore QA-02–QA-06 were **NOT RUN**, and no real resolver, audit, idempotence, illegal-state, revoked-session, fault/restart or final Pull-convergence conclusion is claimed.
- **Verdict: QA_BLOCKED.** Keep the candidate's `READY_FOR_RECHECK` status. Minimum unblocking QA work is a test-only, real WebView2/Tauri IPC driver that carries the actual conflict forward through administrator `use_server` and `replace_draft`, reuses the retained profiles/HTTPS server, and asserts PostgreSQL plus SQLite Outbox/conflict/cursor state across restart and Pull replay. It must update the stale G3 pending-count assertion rather than change production behavior. No parent task, G1, T10, T10-SEC-001, P1, Formal hold, FIX2, G2, G3 or NATIVE-008 status changes.

## T10-B/D G3 independent acceptance — 2026-10-20 — PASS / CLOSED

**Independent QA closes only the G3 structured-error/permanent-failure slice on implementation `35b9f60c0b9c5df0d4283649455f1a7d5d991631`.** QA HEAD is the containing `codex/qa-t10-bd-independent-35b9f60` documentation checkpoint. No production source was changed. This does not close parent T10, the remaining T10-B reconnect/status evidence, T10-D production conflict resolution, G1 production UI, T10-SEC-001/P1 or Formal hold. FIX2, G2 and NATIVE-008 retain their recorded CLOSED boundaries.

- Candidate is a direct child of the approved baseline `7b2d29cc61f7f67eb366d01de61c98f3bccf2995`; the QA worktree was clean and independent on E:. Shared schema has optional `errorCode`, `serverPayload` and `serverOperation`; source review and server Vitest confirm `FORBIDDEN`, `VALIDATION_REJECTED` and `VERSION_CONFLICT` classification.
- Fresh E:-target Rust: permanent/retry/structured conflict 1/1 PASS; existing unstructured conflict remains pending 1/1 PASS; FIX2 session rejection 1/1 PASS; Pull failure/replay/restart cursor 1/1 PASS. The SQL assertions show permanent `superseded_at` plus `INVALID_PAYLOAD`, structured conflict `VERSION_CONFLICT` plus preserved server payload, and later retryable Outbox work remains pending.
- Fresh server/shared checks: `service.test.ts` 16/16 PASS; shared/server strict typecheck and changed-file Prettier PASS. `cargo fmt --check`, `cargo clippy -j 1 --lib --tests` and release `cargo check -j 1 --release --bin HonsenProcure` exit0 (pre-existing warnings only).
- Minimal real database proof: disposable WSL2 PostgreSQL16, loopback-only Compose project, `postgres-store.test.ts` 39/39 PASS. QA-only direct store check proves a conflict's original and duplicate eventId replay each return `{ serverPayload: { nameZh: 'initial' }, serverOperation: 'upsert' }`, while the persisted entity remains `initial`; a service check returns `VALIDATION_REJECTED`. Compose resources are removed after this checkpoint.
- **Verdict:** PASS / CLOSED for this bounded G3 slice. No migration, production database, EXE matrix, NATIVE-002–008 rerun, push or merge. **DEFERRED:** full T10-B/T10-D acceptance requirements above.

## T10-A/G2 independent acceptance — 2026-10-19 — PASS / CLOSED

**Independent QA signs G2 CLOSED on implementation `6e0a2a61fdf0967d75dc5edec3eed5e350056ef5` only.** The approved16-field formal Pull scope, compatible preissue progression, frozen replay, rollback/cursor and existing Outbox/conflict retention now have fresh directed and real Windows dual-EXE evidence. This does not close all of T10-A/E, G1 production conflict UI, T10, T10-SEC-001, original P1 or Formal hold; those boundaries remain OPEN. NATIVE-008 remains CLOSED. Older builder READY and independent FIX2 records below remain historical.

### Exact baseline and independent boundary

- Test-time Git HEAD = full candidate above, parent `13b22ffe8aa294535f9036eda32d7cfc81f6481f`; management checkpoint `25a56af`. Fresh managed QA worktree `C:/Users/This PC/.codex/worktrees/g2-independent-qa/Honsen materials`, branch `codex/qa-g2-formal-pull`. Final QA HEAD is the containing local QA evidence/document commit (full SHA in delivery). No production Rust, main, migrations, shared contracts, server routes/auth/sync, frontend or dependency/lockfile changed.
- QA adds only one test-only `g2-formal-pull` driver/mode and conditional serialized-response diagnostics in `native-test-server.ts`. It returns the original production response unchanged. No mock IPC, substitute sync client, new failure injection, Harness refactor, G3 work or new task ID. Read `AGENTS.md`, latest memory/BUILD/closure scope, protocol, implementation checkpoint, connected Rust/HTTP registry code and tests before verification.
- C: ~150MB free required E: QA-owned target/TEMP/native/profile artifacts. Cached dependencies previously installed with Node24.18.0/committed lock and Rust build caches were reused; QA rebuilt/relinked its own tests and debug EXE at this source path. Shared/frontend dependency code is unchanged across13b22ff→6e0a2a6, not a new frontend acceptance. WSL normal user `honsen-dev`, Docker29.9.0/Compose5.6.0/Buildx0.38.0 verified; only loopback disposable PostgreSQL test credentials/service used.
- Initial Harness seed writes only schema/accounts/master-data fixtures, no order/event/conflict/formal data; both order tables are asserted empty before creation. Synthetic PostgreSQL country/project codes are aligned to those fixtures before orders exist, and scope bindings are initialized. Every order/pricing/submission/approval/issue thereafter uses production Rust commands and normal HTTPS Push/Pull. Driver SQLite opens are exclusively `readOnly:true`; no second-client business write manufactures projection.

### Fresh directed results

| Check                                                                                                                            | Independent result / evidence                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test --lib g2_pull_ -- --nocapture`                                                                                       | PASS12/12,69 unrelated filtered,79.98s; `rust-g2.log`. Checks exact values on file SQLite, production issuer Outbox→consumer, both approved/confirmed, same/stale/reordered/staged restart, legacy same-version backfill, malformed16-field bundles, frozen arithmetic, collision/cursor rollback, divergence and nonempty dirty Outbox/conflict retention. |
| Existing confirmed projection, page/cursor/conflict and per-account failure/restart cursor tests, each filtered by its full name | PASS1/1 each, total3/3; three full-test-name `.log` files. No unrelated full Rust suite.                                                                                                                                                                                                                                                                    |
| `cargo fmt --check`; QA native `cargo build --bin honsen-procure-test-profile --bin HonsenProcure`                               | PASS; existing linker-output warning. New EXE SHA256 `c676ef6d5d8a358e41dca554be35166705dcbd5a9191bfbc34680677b8d0e227`, identical bytes in two independent device directories. Builder release/lint/full-suite evidence is not relabeled fresh QA.                                                                                                         |
| Test-host server lint/typecheck, new driver syntax/Oxlint/Prettier, PowerShell parser, scoped docs/reference/status/diff checks  | PASS; logs/checkpoint retain boundaries. No server/API/UI/full native suite rerun.                                                                                                                                                                                                                                                                          |
| `run-native-https-smoke.ps1 -Mode g2-formal-pull`                                                                                | PASS / exit0, **native-smoke-20261019145156**, completed **2026-10-19T14:53:14.685Z**. Real Windows EXE/WebView2/Tauri/Rust, SQLite, Windows Credential Manager, Fastify HTTPS and disposable PostgreSQL.                                                                                                                                                   |
| Independent post-exit read-only HTTP-log→SQLite re-match                                                                         | PASS16/16, original snapshot string/namespace, active later price, new-session replay/cursor and Outbox retained; `read-only-rematch.log`.                                                                                                                                                                                                                  |

Artifact root: `E:/Project/honsen-g2-independent-qa-artifacts`. [Final native result](E:/Project/honsen-g2-independent-qa-artifacts/native/native-smoke-20261019145156.test.json), [actual serialized response diagnostics](E:/Project/honsen-g2-independent-qa-artifacts/native/native-smoke-20261019145156-server-sync.test.jsonl), `native-harness-4.log`, receiver screenshot, two retained file databases and separate copied EXE directories share this run prefix.

### Exact16-field values

The following values are from the actual serialized HTTP200 response for order `15f21031-4d65-405c-adf2-e51a0e0ed0b3`, not fixture expectations alone. All match Rust-decoded SQLite projection and readback before restart, after restart and after empty Pull. Catalog-only manual metadata and manual-only catalog ID are genuinely null in the wire and SQL; non-null counterpart fields below rule out all-null/default success. Frozen integer amounts remain strings at the wire/readback boundary; they are never replaced by recalculation against current catalog values.

| Header field           | Observed value                                                                                                              | HTTP→DTO→SQL→readback |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `documentType`         | `OPA`                                                                                                                       | PASS                  |
| `formalDocumentNo`     | `TEST-CI-TEST-OPA-20261019-OPA-YBZMYWCJ-1`                                                                                  | PASS                  |
| `formalInstallationId` | `90212501-a5b4-4df2-aeae-bcf2ff4f7192`                                                                                      | PASS                  |
| `formalSequence`       | `1`                                                                                                                         | PASS                  |
| `formallyIssuedAt`     | `1792421583`                                                                                                                | PASS                  |
| `formalSnapshotJson`   | 3342 UTF-8 bytes; SHA256 `8972d0799b3f9a5d5c53af716303e70be259582244e8c93ca5d8b146e4eff466`; exact original string equality | PASS                  |

| Frozen line field                  | Catalog CNY→XOF                        | Manual XOF→XOF                                        | Result |
| ---------------------------------- | -------------------------------------- | ----------------------------------------------------- | ------ |
| `ownerQuoteSource`                 | `catalog_price`                        | `manual_reference`                                    | PASS   |
| `ownerCatalogPriceId`              | `10000000-0000-4000-8000-000000000007` | `null`                                                | PASS   |
| `ownerManualReferenceReason`       | `null`                                 | `Synthetic manual reference for independent G2 proof` | PASS   |
| `ownerManualReferenceActorId`      | `null`                                 | `10000000-0000-4000-8000-000000000011`                | PASS   |
| `ownerManualReferenceAt`           | `null`                                 | `1792421575`                                          | PASS   |
| `ownerSourceUnitPriceMinor`        | `1234`                                 | `1000`                                                | PASS   |
| `ownerLockedExchangeRateDecimal`   | `76.5`                                 | `1`                                                   | PASS   |
| `ownerConvertedReferenceUnitMinor` | `944`                                  | `1000`                                                | PASS   |
| `ownerMarkupJson`                  | `{"kind":"fixed_minor","minor":"20"}`  | `{"kind":"percent_basis_points","basisPoints":1000}`  | PASS   |
| `ownerFinalUnitPriceMinor`         | `964`                                  | `1100`                                                | PASS   |

Original `formalSnapshotJson` is preserved byte-for-byte; raw string is retained in native JSON/JSONL. The independent comparison reads actual SQL columns, not the snapshot as a substitute for persisted line values.

### Real two-device sequence and matching

- Separate `native-smoke-20261019145156-device-a/HonsenProcure.exe` and `-device-b/HonsenProcure.exe`, PIDs **42056/41052/41088** (A/B/restarted A). Consumer A installation **`d477db5d-7114-47a0-a2cb-67de4f47c43f`**, issuer B **`90212501-a5b4-4df2-aeae-bcf2ff4f7192`**; same A profile/installation survives restart, issuing namespace stays B. Consumer `next_formal_sequence=1` remains unchanged; Pull never allocates its own number.
- Engineer A (account ending0011) saves two-line draft, explicitly selects catalog/manual pricing and submits, with actual accepted Push versions1/2/3. Purchaser B (ending0013) normally Pulls pending order, confirms as a different actor, Pushes version4, then formally issues and Pushes version5. No self-approval override or forged formal event. A first Pulls confirmed state, then the formal event.
- Formal response **`req-k`**, HTTP200, requested cursor4→5, session **`78d0139c-e541-4bc8-9b0a-d4cc2c1ae520`** is tied to consumer A/account0011/its installation. Formal Pull `appliedCount=1`; trusted detail command returns the same formal number; server registry has exactly one matching order registration.
- B publishes the synthetic supplier through production command, then a later CNY catalog quote **9999** through normal command/Push. A's normal Pull applies the master changes through cursor7. Old frozen source **1234**, rate **76.5**, converted **944**, fixed markup **20** and final **964** remain; manual1000/1/1000/10%/1100 also remains.
- A locks/exits, then restarts the same EXE/profile, authenticates with actual password and local/cloud CAPTCHA, and rereads persisted fields/detail. New session **`45447bb3-df53-4504-a33d-5270c9d61bb6`**, replay **`req-u`** HTTP200, cursor7→7, zero changes/appliedCount0. All order/line rows and the existing **3** acknowledged Outbox rows remain exactly unchanged across restart/replay; native conflicts remain0. The nonempty conflict/pending-Outbox case is covered by the fresh Rust regression, not falsely inferred from native zero conflicts. `consoleErrors=[]`.

### Integrity, failed setup evidence and verdict limits

Invalid/incomplete formal input fails without cursor advancement; duplicate-number SQLite error and pre-cursor fault roll the complete page back (orders/items/staging0, cursor0). Divergent issued data retains original snapshot/cursor. Missing references retain durable staging; approved/confirmed and legacy issued-status-only backfill pass. Existing unique indexes/triggers remain enabled, line data is written before the formal header lock, and page staging/projection/cursor share the production transaction. No migration or business/Outbox/conflict cleanup.

Earlier runs retained: `...144405` fails before any EXE because workspace desktop dependencies were not mapped; `...144710` creates/prices/submits successfully then the new QA driver calls an incorrect command name (corrected to registered `pull_sync`); `...144853` passes every production assertion but the new driver's finally waits on an already SIGTERM-exited old PID. A minimal Node child-process probe proves `exitCode=null,signalCode=SIGTERM`; cleanup now checks both. Only this run's owned driver/Vite processes were stopped to allow normal disposable teardown. **Only final ...145156 exit0 is acceptance evidence.** No assertion was weakened, production defect repaired, historical evidence erased or full NATIVE matrix run. Final task-local Compose project has no remaining containers; only standard temporary private certificate/PFX/CER were removed.

**Verdict: PASS; G2 CLOSED for the approved16-field OPA formal Pull scope on6e0a2a6. Minimal production repair: none. BLOCKER: none within G2.** DEFERRED: G1 production conflict UI, G3–G10/HPA/SPO/new provenance/attachment fields and all incomplete parent criteria remain in original tasks. WARNING/skipped: full NATIVE002–008, unrelated Rust/server/API/DOM suites, independent release/frontend build and broader T08/G7 amount/print/business acceptance are outside this unchanged boundary. No push/merge/deployment or parent/security/Formal closure; stop for user ordering.

## Current G2 builder handoff — 2026-10-19 — READY_FOR_RECHECK (not independent acceptance)

This development branch starts from production `13b22ff` and carries management checkpoint `25a56af`. That checkpoint's independent FIX2 verdict is **PASS / G1-QA-001 CLOSED on F**, backed by `native-smoke-20261019115437`, Rust management4/4/session5/5 and API/barrier15/15; full signoff/request/session evidence remains in `25a56af:docs/agent-coordination/QA_REPORT.md` and the original worktree. The older READY/FAIL records below are historical, not the current FIX2 status. Auth code is unchanged by G2.

G2's containing local implementation commit is **READY_FOR_RECHECK only**: six formal header/ten frozen owner-line fields, compatible approved/confirmed/legacy-issued progression, immutable replay and frozen serialization order, staged dependencies and atomic page/cursor rollback. New file-SQLite Rust tests12/12 and existing directly related confirmed/cursor/conflict/restart tests3/3 pass. One scoped read-only builder review found three edge cases, reproduced RED then repaired and included in final12/12; this review grants no independent closure. Full commands, final affected Rust gates, evidence and skips: latest `memory.md` and [BUILD-TASKS](../BUILD-TASKS.md#t10-a--g2-implementation-checkpoint--2026-10-19--ready_for_recheck).

No fresh EXE/HTTPS G2 two-client run is claimed. Independent QA must verify the exact new SHA, all16 fields and bounded retry/immutability/cursor protections, using one original issue→Push→Pull proof if needed; do not rerun NATIVE002–008 or begin a broad audit. G2 is not CLOSED. **G1 production UI/T10/T10-SEC-001/P1/Formal hold OPEN; NATIVE-008 CLOSED.** No migration, server trust/registry/number allocation, renderer or Toolbox contract change.

## G1-QA-001-FIX2 Integration Owner — 2026-10-19 — READY_FOR_RECHECK

**Builder verification, pending independent QA. G1-QA-001 = READY_FOR_RECHECK; G1 = OPEN.** This supersedes readiness status only; the independent failure below and all original evidence remain historical facts. Production conflict UI lifecycle acceptance remains separately BLOCKED. NATIVE-008 stays CLOSED; T10, T10-SEC-001, P1 and Formal hold stay OPEN.

### Baseline and minimal scope

- Repair starts at **`b0a6069e1439203fd9259b8cc3e619ac6eb70c2c`**, whose production implementation is **`85d0565a5b695a94da7bd5aa861178bfcbc77a52`**. Continued the clean tracked QA worktree `E:/Project/honsen-g1-qa-independent-85d0565` on new task branch `codex/g1-qa001-fix2`, preserving its untracked `.honsen-native-qa/`. Fetched `origin/main` `5139cc8` remains an ancestor; caller `50378dd` and its two original evidence directories are untouched. The repair SHA is the local commit containing this section and tested changes; full hash is supplied in delivery.
- Root cause: registered Tauri commands `list_managed_authorizations`, `change_managed_authorization` (grant/revoke), and `replace_managed_authorization` called `authorization_management_token`, which discarded the trusted request generation. Their 401 branches only returned `NoActiveSession`, leaving local permission active. This was reproduced through the real EXE before implementation: **`native-smoke-20261019111346`** got management 401, then `get_authorization_context` unexpectedly succeeded; security assertion and failed result remain retained.
- Production change is confined to `apps/desktop/src-tauri/src/lib.rs`. Test changes: G1 CDP driver, existing PowerShell G1 result assertions, test-only auth barrier/test and disposable HTTPS host diagnostics. No migration, dependency/lockfile, shared or server production protocol, business/outbox/conflict/history deletion, Toolbox contract, G2/G3 or unrelated renderer change. Toolbox sources were read in required order; existing T15 installer/Runner/manifest/registry/release/E2E gaps remain unchanged.

### Session and cache boundary

`authorization_management_request` captures the existing private `SyncRequest { OnlineSession { account_id, generation }, token }` under the connection mutex, reusing the enabled/idle/administrator guard and vault credential; offline-only sessions cannot manage grants. No renderer identity or generation is accepted. `authorization_management_response` sends only actual HTTP401 through the unchanged **`reject_sync_session`**. It compares the captured identity, sets sticky invalidation and detaches online authority before SQLite DELETE in the same lock. DELETE failure still closes permission. A stale response returns payload-free `sync_account_boundary` without changing B/A2 or their token. 400/403/409/500 retain local authority and preserve structured input/forbidden/transport errors.

List results are generation-checked again after awaited JSON decoding. Successful self-grant changes refresh using the original captured session, never the account that happens to be current after await. Context get/list/select hold the connection lock through current permission/account validation and cache SQL. The same lock check now also covers historical-order reads and order/country scope-cache guards; the auxiliary reviewer found this related precheck/query race and confirmed the minimal repair. Existing role and session lookups were extracted for reuse, not replaced with another invalidator. Cache rows, saved business records, Outbox and conflicts are retained. A read that acquires the lock before invalidation linearizes before rejection; a subsequent read cannot reuse the old snapshot.

### Fresh checks on final code

| Command / scope                                                                                             | Result     | Evidence / limit                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib management_ -- --nocapture`             | PASS 4/4   | Current401, known context selection, source denial/data retention; late A→B and A1→A2 with same token/time; nonauth400/403/409/500; DELETE-trigger failure retains row but denies cache/scope/history entry.                                                                                          |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`                                        | PASS 69/69 | Fresh rerun after final cache-guard repair; existing offline, owner, migration, cursor/retry and snapshot tests retained.                                                                                                                                                                             |
| `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`                                       | PASS       | Final code.                                                                                                                                                                                                                                                                                           |
| `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --release --bin HonsenProcure -j 2`          | PASS       | Final check exit0. Cold unrestricted compilation first failed in `aws-lc-sys`/`cl.exe` exit2; bounded two-job retry passed, then final check passed again. Temporary compiler output redirected to task-local E: directory; no cache/evidence cleanup. Existing unused-symbol/linker warnings remain. |
| Server `src/auth/service.test.ts src/authorization/service.test.ts src/scripts/native-auth-barrier.test.ts` | PASS 15/15 | Existing management API/service tests plus barrier6/6, including both new management phases. Production AuthService/routes unchanged.                                                                                                                                                                 |
| `npm run test --workspace @honsen/desktop`                                                                  | PASS 11/11 | Existing store/lifecycle regressions.                                                                                                                                                                                                                                                                 |
| Focused navigation Playwright: cached scope switching + administrator binding management                    | PASS 2/2   | `test-results/g1-fix2-20261019`, HTML `playwright-report/g1-fix2-20261019`; fixture IPC DOM only, not native authorization or production conflict UI.                                                                                                                                                 |
| `npm run lint`; `npm run typecheck`; `npm run build --workspace @honsen/desktop`                            | PASS       | Existing App effect and bundle-size warnings remain.                                                                                                                                                                                                                                                  |
| Driver `node --check`/Oxlint; changed driver/barrier/test Prettier; `git diff --check`                      | PASS       | No unrelated formatting sweep.                                                                                                                                                                                                                                                                        |
| Actual EXE G1 mode, final **`native-smoke-20261019112134`**                                                 | PASS       | Completed `2026-10-19T11:24:07.111Z`; details below.                                                                                                                                                                                                                                                  |

Initial `native-smoke-20261019111146` stopped at an existing UI auto-Push/manual-Push race: server had already accepted the event before explicit Push returned0. It is not counted as a security RED or PASS. Controlled fixture/recovery steps now use real password/CAPTCHA `online_login` while renderer remains logged out, avoiding the scheduler race without weakening the acceptedCount assertion. The actual security RED `...111346`, intermediate PASS `...111646` (before the reviewer cache-guard addition), and final PASS `...112134` are all retained. Only the final run accepts the final code.

### Final real-EXE evidence — native-smoke-20261019112134

Actual debug `HonsenProcure.exe` PIDs **`44004` (producer), `36052` (tested profile)**; real WebView2 → registered production Rust/Tauri commands, SQLite, Windows Credential Manager, Fastify HTTPS and isolated PostgreSQL. Shared tested profile is `native-smoke-20261019112134-account-a.test.sqlite`, installation **`b6c8c06b-4adc-4b90-bed2-904b78b1e2b8`**. No Mock IPC, direct SQLite writes or HTTP sync-client substitution. PostgreSQL writes are limited to initial synthetic account/scope fixture setup; the app generates all business/outbox/conflict state. Session evidence below comes from read-only lookup by the actual bearer hash; no token/hash/password is logged.

| Current rejected request   | Actual request ID | Revoked session ID                     | Immediate local result                                                                                                                   |
| -------------------------- | ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET / bindings (list)      | `req-2a`          | `96d7619e-83aa-4bfb-9be6-4a3e255d84e7` | 401; context get/list, known-scope selection and conflict list/known-ID resolver all `reauthentication_required`; sourceDisclosed=false. |
| PUT / bindings (grant)     | `req-2g`          | `0f56bb0e-b91c-493e-9072-dfe2e2869c97` | Same denial after real401.                                                                                                               |
| DELETE / bindings (revoke) | `req-2m`          | `acef2005-2690-4bff-bd87-c6779753e2ef` | Same denial after real401.                                                                                                               |
| PATCH / bindings (replace) | `req-2s`          | `39693f76-edde-4d8e-b97e-843d1fa2b8a7` | Same denial after real401.                                                                                                               |

Each is the first rejected request after a normal second-EXE login revokes the tested B session; pre-rejection local contexts and B's real nonempty conflict list were verified. The driver requires exactly one matching method/route/session observation and actual401, then checks every denial before recording PASS.

- **Late A→B:** `management-late-account/req-2w`, ready `11:23:56.570Z`, release `11:24:00.755Z`, actual401 for old A session `e0347c5d-dd35-4a77-a695-df64415c2bcf` (revoked `11:23:57.746Z`). B had completed normal login before release, new session `a6edb513-e0db-4531-8f9d-5c2874937efa`. Old command returns `sync_account_boundary`; B's nonempty contexts/conflict list are unchanged, valid known scope remains selectable, and real Push returns its normal pending conflict result with HTTP200.
- **Late A1→A2:** `management-late-same-account/req-36`, ready `11:24:03.835Z`, release `11:24:06.425Z`, actual401 for A1 `e438b602-f3e3-4869-979f-554ed0f1a26c` (revoked `11:24:04.970Z`). Replacement A2 `8628decf-5720-4156-bc4b-c5b1f6167237` has a different session ID on the same installation. Old command returns `sync_account_boundary`; A2 keeps contexts, scope selection and successful Push authorization preflight.
- Prior G1 current-revocation/source-denial and held Pull `req-1g`/`req-1z` assertions also pass. `consoleErrors=[]`. Final explicit lock leaves local permission closed. Production conflict UI lifecycle is still BLOCKED, unchanged.

Artifacts remain untracked under `.honsen-native-qa/native-smoke-20261019112134*` and ignored `test-results/`. Normal-user WSL2 Docker29.9.0/Compose5.6.0/Buildx0.38.0; Node24.18.0 with fresh `npm ci`/unchanged lockfile. Every own run-named disposable Compose project was scoped down with volumes; prior evidence was not removed.

### Remaining gates and handoff

- **BLOCKER for closure:** independent QA must recheck this repair; builder results do not close G1-QA-001.
- **DEFERRED:** production conflict UI lifecycle evidence remains a separate G1 item; G2/G3, broader unrelated business-command authorization/write concurrency and parent acceptance are not undertaken or accepted here.
- **WARNING / deliberate skips:** NATIVE-002–008 and unrelated full server/DOM suites were not rerun per requested scope. SQLite-delete failure is Rust failure-injection evidence, not a native SQLite manipulation. Existing compiler/lint/bundle warnings persist. One read-only auxiliary reviewer found the cache-consumer race above; after repair, no remaining Critical/Important finding within this slice.

Stop at **READY_FOR_RECHECK**. No push, merge, deployment or next-child execution. Independent recheck should run the management Rust filter/full lib, relevant API/barrier tests, and fresh `-Mode g1-conflict-origin`, inspecting all four management401 session matches plus both held management requests. Historical records below are preserved.

## G1-QA-001 Independent Final Recheck — 2026-10-19 — FAIL / OPEN

**QA HEAD:** `85d0565a5b695a94da7bd5aa861178bfcbc77a52`; **independent baseline:** `bfa6752ccd64a6b39c36bdab96e1cb4c611ada5d`. The tested detached worktree was clean before the run. This recheck did not modify production code, migrations, protocol, dependencies, or prior evidence. G1 remains OPEN; the production conflict UI lifecycle gate remains separately BLOCKED.

- Fresh real-EXE run `native-smoke-20261019090425` completed `2026-10-19T09:06:06.824Z` (Harness PID `29624`; observed `HonsenProcure.exe` PIDs `9232`, `33936`). It used real WebView2 → production Tauri commands, SQLite, Credential Manager, Fastify HTTPS, and disposable PostgreSQL.
- **PASS:** a revoked current session's `list_sync_conflicts` and known-ID resolution both returned `reauthentication_required`; `revokedSessionAccess={ denied:true, conflictCount:null, sourceDisclosed:false }`. The conflict was `fbfac217-ce58-4970-83b0-c6ed5f8a3722`.
- **PASS:** delayed A→B matched barrier run/phase/request `native-smoke-20261019090425/late-account/req-1n`: ready `09:05:52.190Z`, released `09:05:57.398Z`, actual server 401, old command `sync_account_boundary`; B retained its nonempty owned conflict list and normal Push (`lateAccountPreserved=PASS`). Delayed A1→A2 likewise matched `late-same-account/req-26`, ready `09:06:03.443Z`, released `09:06:05.980Z`, actual 401 and `sync_account_boundary` (`lateSameAccountPreserved=PASS`). The two replacement sessions have distinct recorded installation/origin tuples; no stale request reactivated or revoked either replacement.
- **PASS:** `cargo test --lib rejected_sync_session` passed 5/5, including SQLite `local_session` DELETE failure remaining closed. `native-auth-barrier.test.ts` passed 3/3. The Harness completed successfully and scoped Compose teardown removed its project.
- **FAIL / actual authorization-management gap:** `list_managed_authorizations`, `change_managed_authorization`, and `replace_managed_authorization` map an HTTP 401 directly to `NoActiveSession` without `reject_sync_session`; a revoked administrator can make one of those calls first, then `authorization_context`, `list_authorization_contexts`, or `select_authorization_context` still reads/writes the unexpired SQLite authorization cache because `local_session` and `session_invalidated` remain active. This is a reachable same-class local authorization disclosure/persistence issue, not covered by the successful Push/Pull invalidation test.

Minimal reproduction: authenticate an administrator online; revoke that token by normally logging in again elsewhere; invoke `list_managed_authorizations` and receive 401/`reauthentication_required`; immediately invoke `list_authorization_contexts` and observe cached project/department/team values. Minimal repair: snapshot the private `OnlineSession` with the management token, require it before/after await, and on a matching 401 call the existing account+generation-conditional `reject_sync_session`; add a regression proving the cached-context commands fail while late old A cannot invalidate B or A2. Preserve business/outbox/conflict rows and do not weaken offline-login policy.

## G1-QA-001 Integration Owner repair — 2026-10-19 — READY_FOR_RECHECK

**Builder evidence only: G1-QA-001 is READY_FOR_RECHECK, not independently CLOSED. G1 remains OPEN after the independent FAIL below.** Historical failing evidence is retained. Production conflict-UI lifecycle proof is still BLOCKED. T10, T10-SEC-001, original P1 and Formal hold remain OPEN; NATIVE-008 remains CLOSED.

### Baseline, root cause and scope

- Started at independent QA checkpoint **`bfa6752ccd64a6b39c36bdab96e1cb4c611ada5d`**, containing application **`fbdb14b6afac217688de6cb138514d1bd593cdc8`**. Continued the designated `E:/Project/honsen-g1-integration` worktree on **`codex/g1-session-invalidation`**. Initial tracked tree clean; existing untracked `.honsen-native-qa/` preserved. Fetched `origin/main` (`5139cc8f7d5a70cddb80b3ce5665100a316c9656`, already ancestor), without merging or moving QA/Builder branches. Caller `50378dd` worktree remains untouched.
- Root cause confirmed before editing: authorization-refresh/Push/Pull 401 returned `NoActiveSession` but left SQLite `local_session` active, so the trusted conflict authorizer still allowed source access. The separate online marker contained only account ID; deleting by account after an await could revoke a replacement session of that account. UI hiding or unconditional logout cannot fix this.
- Only application file changed: `apps/desktop/src-tauri/src/lib.rs`. No SQLite migration, business/outbox/conflict deletion, shared protocol, dependency, production server route, credential naming, Toolbox identity/contract, G2/G3, formal-number or frozen-snapshot change. Five upstream Toolbox sources were read in required order; documented installer/Runner/manifest/registry/release gaps remain T15, untouched.
- Implementation SHA is the local checkpoint containing this section and its tested code/tests (parent `bfa6752`); full SHA is supplied in delivery / `git log -1 --format=%H` on this branch. All results below are fresh against that source, not acceptance of main or another worktree.

### Session identity and atomic authority

`OnlineSession { account_id, generation }` is Rust-private; every successful online activation generates a new UUID, even for the same account/time/token. `SyncRequest` snapshots that identity and its OS-vault token before the first await. No renderer-supplied identity/generation is trusted; tokens are not exposed in diagnostics.

`LocalConnection` keeps the SQLite connection, online identity and sticky `session_invalidated` flag under **one connection mutex**. Online activation holds it through vault token installation, the SQLite session transaction and generation publication. Lock/logout/failed reauthentication detach authority under that lock. Launch starts closed; persisted rows or token/cache reload alone cannot reactivate it. Explicit validated password/CAPTCHA offline login retains the existing 24-hour policy and permits local access, not online sync.

Production Push/Pull, including authorization-context preflight, carry the same identity through HTTPS. An actual 401 compares request identity with current identity and SQLite account **under that lock**. A match sets the closed flag and clears online identity before deleting only the session row; a deletion error leaves authority closed. Conflict list/known-ID owner checks hold the same lock: no unlocked interval between invalidating authority and disabling later reads. An already-started read linearizes before this transition; subsequent reads fail. Mismatch returns payload-free `sync_account_boundary`, does not clear a new session/token and is not misreported as the new account requiring reauthentication. ACK, Pull-page/cursor and authorization-cache commits also check captured generation under this lock before their transaction; stale success cannot restore or project under a replacement session.

### Fresh targeted checks

| Command / test                                                                                                                                                       | Result                               | Evidence and limit                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust filter `rejected_sync_session`                                                                                                                                  | PASS 5/5                             | All five behavioral assertions first failed against no-op rejection, then passed: current refusal/no loss; late A→B; same-account new generation with same token; legitimate reauthentication; SQLite DELETE failure closed. Unit fixtures are not native proof. |
| Rust `failed_reauthentication_detaches_previous_local_conflict_access`                                                                                               | PASS 1/1                             | First reproduced source access after failed login; fixed login entry detachment, then passed.                                                                                                                                                                    |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`                                                                                                 | PASS 65/65                           | Existing owner, conflict, retry, ACK, cursor/rollback and installation checks retained; six new tests.                                                                                                                                                           |
| `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`; `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --release --bin HonsenProcure` | PASS                                 | No new release test command; existing unused-symbol/linker warnings only.                                                                                                                                                                                        |
| `src/scripts/native-auth-barrier.test.ts`                                                                                                                            | PASS 3/3                             | Configuration/phase fail-closed, held old request, unblocked new request and bound successful release. No claim of initial RED for this helper.                                                                                                                  |
| PostgreSQL `src/sync/g1-origin.integration.test.ts`                                                                                                                  | PASS 3/3                             | Fresh 02:25:21 UTC run; actual Fastify/AuthService/PostgreSQL, trusted identity/origin containment.                                                                                                                                                              |
| `src/sync/api.test.ts` + `src/sync/service.test.ts`                                                                                                                  | PASS 19/19                           | Fresh 02:25:29 UTC run.                                                                                                                                                                                                                                          |
| Selected `src/sync/postgres-store.test.ts`                                                                                                                           | PASS 5/5                             | Fresh 02:25:30 UTC; prior QA idempotency/origin/quarantine/scope/Pull-order pattern; 34 deliberately filtered, not counted PASS.                                                                                                                                 |
| `npm run test --workspace @honsen/desktop`                                                                                                                           | PASS 11/11                           | Store/lifecycle regressions.                                                                                                                                                                                                                                     |
| Focused navigation conflict Playwright DOM                                                                                                                           | PASS 2/2                             | New `test-results/g1-qa001-202610190221`, HTML `playwright-report/g1-qa001-202610190221`; fixture/mock IPC only, not native authority or real conflict UI.                                                                                                       |
| `npm run lint`; `npm run typecheck`; `npm run build --workspace @honsen/desktop`                                                                                     | PASS                                 | Existing App effect and bundle-size warnings retained.                                                                                                                                                                                                           |
| Driver `node --check`, targeted Oxlint/Prettier; new helper/test Prettier; `git diff --check`                                                                        | PASS                                 | No lockfile change, assertion weakening or unrelated formatting sweep.                                                                                                                                                                                           |
| Actual EXE `native-smoke-20261019022252`                                                                                                                             | PASS for QA-001 native command slice | Completed `2026-10-19T02:24:41.003Z`; below. Not full G1/UI acceptance.                                                                                                                                                                                          |

DB batch used disposable Compose `honsen-g1-qa001-20261019`, `.env.test`, loopback 54329 and fresh Node `SELECT 1`; scoped `down --volumes` completed, project `ps -a` empty. Native run's project also empty. Separate normal-user foreground WSL holder used for ENV-002; no production DB, `.env` or deployment credential used.

### Actual EXE evidence — `native-smoke-20261019022252`

Real task-local **debug `HonsenProcure.exe`**, WebView2→registered production Tauri commands, SQLite, Windows Credential Manager, Fastify HTTPS and isolated PostgreSQL. No mock IPC, direct SQLite writes or standalone HTTP sync client. Same profile `native-smoke-20261019022252-account-a.test.sqlite`, installation `32c8c9a8-2657-4340-926b-b43239f4d059`; producer installation `260e3f91-1013-4906-8201-abeeb6902cb7`. A=`...0013`, B=`...0012`. Conflict `2c437b7c-f1fd-4b6e-b40e-0f5625eee43e` comes from real business mutation/outbox/Push/Pull.

1. **Current rejection:** another real EXE normally logs A in, revoking old token. Old Pull returns `reauthentication_required`; its immediate list returns the same denial, **`denied=true, conflictCount=null, sourceDisclosed=false`**. Known-ID resolver also returns `reauthentication_required`; no separate detail-read API was fabricated. Explicit reauthentication recovers original conflict, legitimate resolution, server v2 and SQLite audit/history. Explicit lock also denies list/known ID.
2. **Late A→B:** HTTPS barrier holds actual A Pull `req-1p`, ready `02:24:25.296Z`. Producer normally logs A in to revoke it; same tested profile locks A and completes B login before release `02:24:30.312Z`. Ordinary AuthService produces actual **HTTP 401**. Old command returns `sync_account_boundary`, not a B logout. B's full nonempty real conflict list stays exactly unchanged, lacks A's source marker, denies A's known ID and can still Push its own pending conflict. `lateAccountPreserved=PASS`.
3. **Late A1→A2:** actual held Pull `req-28`, ready `02:24:37.279Z`; same profile completes replacement A login before release `02:24:39.856Z`. Actual **401**, old command `sync_account_boundary`; A2 lists authorized state, reads sync status and completes Push authorization preflight. A2 still cannot process B's conflict. `lateSameAccountPreserved=PASS`.

Both held results require one matching run/phase/request-ID observation and actual server401; timeout, synthetic401, failed login or locked replacement cannot count PASS. `consoleErrors=[]`. Existing A→B→A, forged IPC selectors, foreign-dirty Pull, conflict preservation/legal recovery and explicit-lock assertions remain. Same-account Rust test additionally proves identity does not rely on timestamp/token changes.

Untracked artifacts retained: `.honsen-native-qa/native-smoke-20261019022252.test.json`, `...-server-sync.test.jsonl`, profiles/WebView data and `...test.json-late-B.png`; logs `test-results/native-smoke-20261019022252-*`. Do not commit vault/profile data. Initial `native-smoke-20261019021931` already passed current rejection but stopped preparing B's new race fixture: administrator alone correctly lacked cloud project bindings. Final fixture grants both synthetic accounts explicit test project/scope bindings before normal refresh; no production permission/assertion loosened. That failed run and all prior QA evidence remain.

### Test-only boundary, review and remaining issues

- Added `native-auth-barrier.ts` and unit test, imported **only** by `native-test-server.ts`, not production server or desktop Rust. Absolute `.test` prefix/run ID, two armed phases, one request each, 15s deadline below Rust20s timeout, run/phase-bound release. Delays real handler, never manufactures response or bypasses auth. Release adds no switch/IPC; existing release profile guards remain fail-closed.
- One read-only auxiliary security reviewer: no Critical/Important within this slice; not independent Fixer acceptance. Minor deferred: wrong-run/wrong-phase release unit cases (implementation checks exist; valid release tested).
- **BLOCKER:** independent Fixer must reproduce QA-001 before accepting/closing it. G1 production conflict-view mount/teardown/stale-data proof still BLOCKED; no renderer change or cache-clear PASS claimed. Home screenshot is not a previously visible source lifecycle test.
- **DEFERRED / security:** standalone authorization-management list/change/replace HTTPS still return `NoActiveSession` on401 without matching invalidation. A revoked admin invoking one first can retain local permission until sync/context rejection. Cannot restore a session already invalidated here. Concrete remaining G1/G5 lifecycle gap, outside this Push/Pull repair; needs separate authorized scope/recheck. No all-auth-entry-points claim.
- **DEFERRED:** G2/G3/full resolver/formal projection/parent gates. **WARNING:** full unchanged server/all-DOM and NATIVE002–008 matrix intentionally not rerun; no production conflict UI, native idle-duration or native legacy proof claimed. Existing lint/compiler/bundle warnings remain.

### Independent recheck commands

Use original Windows user PowerShell7, Node24.18.0/committed-lockfile dependencies, ignored disposable `.env.test`, separate foreground normal-user WSL holder (see earlier QA). Review checkpoint Rust diff, then on this branch:

```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib rejected_sync_session -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib failed_reauthentication -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --release --bin HonsenProcure
npm run test --workspace @honsen/server -- src/scripts/native-auth-barrier.test.ts
# Fresh scoped Compose PostgreSQL; TEST_DATABASE_URL from .env.test, not .env.
npm run test --workspace @honsen/server -- src/sync/g1-origin.integration.test.ts --no-file-parallelism
npm run test --workspace @honsen/server -- src/sync/api.test.ts src/sync/service.test.ts --no-file-parallelism
npm run test --workspace @honsen/desktop
# New output and HTML dirs; these DOM tests use fixture IPC.
npx playwright test tests/e2e/navigation.spec.ts --grep 'administrator resolves a sync conflict|cross-account conflict resolution' --workers=1 --output=test-results/<new-qa-run>
npm run lint
npm run typecheck
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode g1-conflict-origin
git diff --check
```

Require all three native transitions/source denial, not just coreResult/counts; inspect actual server401 observations. Checkpoint contains only selected repair/tests/records. No push, merge, deploy, business deletion or prior evidence cleanup. **Stop for independent Fixer; do not begin another child.**

## G1 Independent Security QA — 2026-10-19 — FAIL / OPEN

**G1 must NOT be CLOSED.** The owner boundary passes the exercised tests, but the real EXE still discloses conflict sources after a known server-session rejection. Production conflict-UI residue acceptance is separately BLOCKED. This section supersedes the READY_FOR_RECHECK handoff below; T10, T10-SEC-001, original P1 and Formal hold remain OPEN. NATIVE-008 remains CLOSED.

### Baseline and review

- Actual execution HEAD / tested application implementation: **`fbdb14b6afac217688de6cb138514d1bd593cdc8`**, parent **`be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95`**. Reviewed the full application/test diff against that parent, source owner protection `031ad670b90903c280f7b01567e7d6753bd8a3c9`, and the G1 audit definition. Source is not an ancestor: its guard was minimally adapted, not blindly cherry-picked.
- Continued the initially clean, user-specified `E:/Project/honsen-g1-integration` worktree on separate QA branch **`codex/g1-security-recheck`**. Reused dependency/compiler caches, not previous test results. Every DB run/profile below is fresh. `origin/main` fetched successfully; `5139cc8` is an ancestor. Builder branch retained. Caller `E:/Project/Honsen materials` remains at `50378ddc0f52bcf2432199f0a6c6c38bf61dcb0c` with its original two untracked evidence directories untouched.
- The final local QA checkpoint contains only the native test slice and task records; its full SHA is supplied in the delivery. **No application, migration, shared protocol, server implementation or dependency/lockfile changed.** Application-source diff against `fbdb14b` is empty. No auxiliary agent used this round.
- PASS (bounded code review): `lib.rs::require_conflict_resolution`, `list_sync_conflicts`, `resolve_sync_conflict` authorize trusted local account/enabled/idle/role under the same connection mutex as owner SQL/transaction. List and ID lookup join outbox owner, exclude foreign/NULL owners, and deny before supersession/version/projection/requeue/audit. Missing/foreign IDs have the same payload-free error. Strict resolver input rejects account/device/installation selectors. Source `031ad67` owner protection was not lost; list protection and same-lock authorization are additional hardening. No new TOCTOU found within this boundary.
- PASS (bounded server review/tests): `app.ts` authenticates bearer session; `SyncService` supplies actor/account/installation from that session; `PostgresSyncStore` checks attested event origin before replay. Client account/device/installation/header fields cannot replace the trusted actor. Authorized shared global business data remains shared; different installations are not universally denied. There is **no separate conflict-detail read endpoint**: list returns both source JSONs; known-ID denial is tested through the actual resolver, not a fabricated detail API.
- FAIL (lifecycle boundary): `lib.rs:5703` authorization-refresh 401, and sync 401 branches, return `NoActiveSession` without invalidating local session. The new conflict authorizer at `lib.rs:1798` still sees that cached account as active. See G1-QA-001 below. This is not evidence that B accessed A's source; it is a revoked A session retaining protected renderer access after learning authentication failed.

### Fresh independent results (execution HEAD `fbdb14b`)

| Command / acceptance                                                                                                                                                 | Fresh result                                                                                 | Scope / evidence                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib conflict_ -- --nocapture`                                                                        | PASS 5/5                                                                                     | Owner/NULL containment, source list isolation, forged input, competing-login lock, RFQ conflict preservation; 54 name-filtered. Unit fixtures insert conflict rows; not native business proof.                                       |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`                                                                                                 | PASS 59/59                                                                                   | Owner/cursor/rollback/retry/account guards, idle/disabled sync sessions and catalog resolution retained. Not proof of invalidation after an actual server 401.                                                                       |
| `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`; `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --release --bin HonsenProcure` | PASS                                                                                         | Existing linker/release unused-symbol warnings only. No Rust changes this round.                                                                                                                                                     |
| PostgreSQL `src/sync/g1-origin.integration.test.ts`                                                                                                                  | PASS 3/3, 00:16:16 UTC start                                                                 | Actual PostgreSQL/Fastify/AuthService/store; foreign source/forged selectors, same-installation different account, replacement installation/new event plus revoked old token. Sessions created by fixture, not password-login tests. |
| `src/sync/api.test.ts` + `src/sync/service.test.ts`                                                                                                                  | PASS 19/19, 00:16:31 UTC                                                                     | API/service authorization and protocol checks.                                                                                                                                                                                       |
| Selected `src/sync/postgres-store.test.ts`                                                                                                                           | PASS 5/5, 00:16:32 UTC                                                                       | Pattern `is.idempotent.and.records                                                                                                                                                                                                   | does.not.return.an.event.result                                                                                                                                                               | quarantined.legacy | bound.countries | does.not.skip.a.pending.Push`; 34 deliberately name-filtered, not counted PASS. |
| `npm run test --workspace @honsen/desktop`                                                                                                                           | PASS 11/11                                                                                   | Relevant store/lifecycle tests.                                                                                                                                                                                                      |
| `npx playwright test tests/e2e/navigation.spec.ts --grep 'administrator resolves a sync conflict                                                                     | cross-account conflict resolution' --workers=1 --output=test-results/g1-securityqa-20261019` | PASS 2/2                                                                                                                                                                                                                             | Fresh fixture/mock IPC DOM only. HTML output `playwright-report/g1-securityqa-20261019`; no prior evidence output directory reused. Does not exercise account switch or native authorization. |
| `npm run lint`; `npm run typecheck`; `npm run build --workspace @honsen/desktop`                                                                                     | PASS                                                                                         | Existing `App.tsx:242` effect warning and bundle-size warning retained.                                                                                                                                                              |
| New driver `node --check`, targeted Oxlint/Prettier; `git diff --check`                                                                                              | PASS                                                                                         | Test-only harness syntax/style; no safety assertion weakened.                                                                                                                                                                        |
| Actual EXE command/account-switch slice `native-smoke-20261019002504`                                                                                                | PASS for bounded A–D / explicit lock                                                         | Real WebView2, production Tauri IPC, Windows Credential Manager, SQLite, Fastify HTTPS and disposable PostgreSQL. **Not full G1 PASS.**                                                                                              |
| Extended actual EXE `native-smoke-20261019002730`                                                                                                                    | **FAIL**                                                                                     | Second real A login revokes old A session; old Pull rejects, but old conflict-list source read succeeds. Assertion kept RED. UI-conflict residue remains BLOCKED.                                                                    |

Node `v24.18.0`. WSL2 normal user `honsen-dev`; Docker 29.9.0 / Compose 5.6.0 / Buildx 0.38.0 verified. Focused DB batch used disposable project `honsen-g1-securityqa-20261019`, verified Node `SELECT 1` before suites, and ran scoped `down --volumes`. Native runs likewise used separate run-named projects, certificates and new profiles; final project checks are empty. No existing QA/E2E/DB evidence was removed.

### Actual EXE proof and failure

New **test-only** `tests/native/g1-conflict-origin.mjs` is selected by the added PowerShell `-Mode g1-conflict-origin`. It attaches Playwright CDP to actual task-local **debug** `HonsenProcure.exe` WebView2, checks real Tauri internals, drives normal login/lock controls and invokes registered production commands. It never replaces IPC or issues sync HTTP directly. No Rust test hooks/new release command/renderer mock were added. The driver has test-profile/loopback/test-DB/path guards, uses task-local WebView storage, never writes SQLite, and is not packaged in the release. An initial synthetic PostgreSQL role grant makes B an administrator, so owner denial is not masked by a missing role. All conflict creation uses `save_material` + transactional outbox + real Push/Pull. Later read-only SQLite inspection checks the actual resolution audit.

Run **`native-smoke-20261019002504`**, completed `2026-10-19T00:26:17.061Z`:

- A=`...0013` (purchaser+administrator), B=`...0012` (administrator fixture). Producer uses a distinct profile; the tested A→B→A switch always keeps **`native-smoke-20261019002504-account-a.test.sqlite`**, installation **`a2c9d6d0-18fc-451c-9cd1-0edcaae0f6c1`**.
- A's real stale business event becomes conflict **`85b658f8-5afb-4d49-9d6f-4872896a92ab`**; own list returns exact local/server source markers. No SQLite conflict insertion.
- B's list is `[]`, including forged top-level selectors. Both `keep_local` and `use_server` for A's known ID, and an unknown ID, return exactly `{code:"sync_account_boundary"}`. Resolver `accountId`, `deviceId`, `installationId` fail Tauri input deserialization. Error text contains neither source marker.
- B's legitimate new business event Push succeeds; A's pending event is not sent as B. Pull into A's foreign-dirty local entity fails `sync_account_boundary`, not an ordinary business conflict. Server origin rows show separate producer installation `8dbd4484-d044-4fde-bb04-12de3980c026` and the shared profile's legitimate A/B origins. HTTP forgery-on-wire evidence is separately the 3/3 suite above, not overstated as arbitrary HTTP bodies sent by the EXE.
- Returning to A returns the original complete conflict list unchanged. A's real `keep_local` succeeds, server reaches v2, SQLite audit retains A/reason. Explicit lock rejects list and resolver with `reauthentication_required`. Zero page/console errors.
- Evidence: `.honsen-native-qa/native-smoke-20261019002504.test.json`; corresponding `test-results/*-server-sync.test.jsonl`; actual B screenshot `.honsen-native-qa/native-smoke-20261019002504.test.json-B.png` inspected. Source markers absent in that Home screenshot, **but A's source was never rendered in a production conflict panel**, so it cannot prove removal of cached sensitive conflict UI.

Run **`native-smoke-20261019002730`** preserves the same assertions and additionally uses the second real EXE to **normally log into A**, revoking the first token through `PostgresAuthStore.createSession`. No direct session-table mutation or clock mock. The first EXE's `pull_sync` returns `{code:"reauthentication_required"}`. Immediately afterward its real `list_sync_conflicts` succeeds:

```json
{ "denied": false, "conflictCount": 1, "sourceDisclosed": true }
```

The harness subsequently explicitly locks/re-authenticates A, verifies legal resolution/audit/v2 and explicit-lock denial, then **fails** the retained security assertion `G1 revoked session can still read conflict source after server authentication rejection`. Native exit status is 1, with `coreResult:"FAIL"`. Evidence: `.honsen-native-qa/native-smoke-20261019002730.test.json` (`revokedSessionAccess`, 12 safe denials, `consoleErrors:[]`) and `test-results/native-smoke-20261019002730-client.log`. **The earlier bounded PASS does not override this final FAIL.** This is known online revocation after an authenticated rejection, not ordinary permitted offline sign-in within 24 hours.

### Findings, missing acceptance and smallest next action

1. **BLOCKER / G1-QA-001 / P1 / OPEN — Known invalid online session retains local source access.** Root path: 401 only returns an error; conflict list authorizes unchanged `local_session`. Server trusted identity/origin checks worked. Minimal recommendation (not implemented): atomically invalidate only the matching rejected account/session in trusted Rust, disable that session's protected access, preserve outbox/conflict/history, notify UI to clear the matching account's sensitive state. A late A response must not lock a newly active B; add that race regression. Do not ban valid same-account replacement installations or change permitted offline login policy. Then rerun this RED native mode and focused boundary tests. Related to existing G5 session-revocation acceptance, not G2 formal projection or G3 business-error retry work; nevertheless it fails this round's explicit G1 authentication-invalid gate.
2. **BLOCKER / UI evidence — Not independently accepted.** `App.tsx` mounts `SyncConflictPanel` only through `?test=sync-conflict`; `SyncConflictFixturePage` supplies mock data/IPC. `tauriSyncApi` has no production caller. Panel effect has no account/session key, teardown cancellation or clearing on auth change; no real production mounting lifecycle exists to accept. This is an evidence/integration gap, **not a claimed reproduced B source leak**. Need an authorized production conflict-view/account-lifecycle integration and real A-source-visible → lock/B → A exercise (including late list responses); do not silently implement full G4/order resolution in this QA turn. Known-ID read surface must stay permission checked if added.
3. **DEFERRED:** G2/G3, full order resolver, formal projection/number/snapshot, legacy recovery policy and parent acceptance. Native NULL-owner containment remains unit/migration proof only; do not manufacture native legacy ownership. No new P0 cross-account disclosure was demonstrated; G1's complete no-P1 gate fails because of item 1.

### Reproduction / limits / handoff

Use Windows PowerShell 7 in this worktree, with Node from `.nvmrc`, installed lockfile dependencies and ignored disposable `.env.test`. Keep a **separate ordinary-user foreground WSL session** alive (`wsl.exe -d Ubuntu -- bash -lc 'exec tail -f /dev/null'`) during native testing, then stop only that holder. Launch the harness from the original Windows user so CurrentUser certificate store and Credential Manager are available:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode g1-conflict-origin
```

Current expected result: **FAIL on G1-QA-001**, not READY/CLOSED. It must not be made green by removing revocation, permitting that read, changing expected disclosure, hiding UI, or weakening ownership assertions. After a repair, require denied list/ID handling following actual server rejection, unchanged B session on a delayed A failure, legitimate A/B and replacement-installation operations, and genuine conflict UI teardown evidence before considering CLOSED. DB suite commands remain in the handoff below and were independently executed above.

Retained setup failures: initial unmodified `wslpath` call stripped backslashes (both Windows shells); the only common harness adaptation normalizes its two path inputs to forward slashes. First container/HTTPS attempt `native-smoke-20261019002042` hit WSL `57P03` startup; separate foreground holder fixed environment persistence. A WSL-launched Windows shell lacked `Cert:\CurrentUser\My` (no EXE run). New driver run `...002211` timed out at cold WebView initial render (5s); bounded startup diagnostic/30s condition wait retained the same heading assertion. Run `...002347` correctly rejected a material fixture with `version=0`; changed fixture to the existing valid `version=1`, leaving server base-version calculation and production validation untouched. Run `...002504` passed the bounded slice; final `...002730` fails the genuine auth-invalid gate. No production fix attempted.

Toolbox's five upstream sources were read in required order and compared with local integration documentation before the test work: approved identity unchanged; installer/Runner/manifest/registry/release E2E gaps remain T15. No contract conflict was changed. Unchanged full server/all-DOM suites and NATIVE-002–008 were not rerun; no production sync implementation changed to justify those reruns. No real EXE idle-duration wait, native legacy migration fixture or production conflict detail/view test is claimed. Raw native artifacts stay untracked in this QA worktree; only explicit test/docs paths enter the checkpoint. No push, main merge, deployment, old evidence cleanup or business DB access.

## G1 Integration Owner handoff — 2026-10-18 — READY_FOR_RECHECK

**This is Integration Owner evidence, not independent Fixer/native acceptance. G1 is not CLOSED. T10, T10-SEC-001, original P1 and Formal hold remain OPEN; NATIVE-008 remains CLOSED.**

### Baseline and minimal adaptation

Caller: `50378ddc0f52bcf2432199f0a6c6c38bf61dcb0c`, `codex/t10-closure-gap-audit`, with its two original untracked evidence directories untouched. Work: isolated `E:/Project/honsen-g1-integration`, `codex/g1-conflict-origin`, starting exactly at **`be20d760bdee5f0146dc8f9e3d2ef6fe8de3ff95`** (Q). Fetched main `5139cc8f7d5a70cddb80b3ce5665100a316c9656` is already its ancestor. No main merge or source-worktree mutation occurred.

Source `031ad670b90903c280f7b01567e7d6753bd8a3c9` has parent/common ancestor `f0cbe71a8d8afddc42ad4aaa3987dc911874e96d`. Q includes that migration-alias prerequisite and owner/cursor migrations 0046/0047, but not source conflict containment. Source UI files match their Q versions before integration; Rust/docs contain later combined changes. **Partial reuse with minimal adaptation**, not blind cherry-pick: reused source owner join/containment, Rust regression, safe UI denial/row retention and DOM fixture. Added list filtering and resolver input rejection required by this task.

Final native local boundary: the existing private authorizer now reads active account, enabled state, idle lifetime and admin/super-admin role under the **same connection lock held through list/resolve ownership SQL and the business transaction**. This closes the role-borrowing account-switch interleaving found by the single read-only auxiliary reviewer; its recheck found no remaining issue. Both choices deny foreign and NULL-owner records before supersede/version/projection/outbox/audit changes. Unknown/resolved IDs return the same generic `sync_account_boundary`, without source payload/identity. Resolver input rejects unknown `accountId`, `deviceId`, `installationId`; the IPC list accepts no identity selector. Existing server session/origin/scope checks are unchanged. No installation filter was added to local conflicts and no all-different-installations rejection was introduced.

The generic Pull test formerly switched to an unrelated administrator to resolve the original account's conflict. It now uses the originating administrator, following the source patch; new negative tests explicitly cover the formerly allowed cross-account path, rather than weakening assertions. Authorized globally shared business data remains shared under the PRD; local pending conflict provenance is not a replacement for server read authorization.

**Implementation SHA: the local checkpoint commit containing this section and its tested code/tests; parent Q.** The exact SHA is supplied in delivery and discoverable with `git log -1 --format=%H -- apps/desktop/src-tauri/src/lib.rs` on this branch. Results apply to that implementation, not caller HEAD/main.

### Executed checks and security coverage

| Check / test                                                                              | Result and boundary                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conflict_listing_excludes_other_account_and_legacy_payloads`                             | Own admin sees its exact local/server source; B and NULL-owner sources absent.                                                                                                                                                                             |
| Source-derived `conflict_resolution_never_changes_another_accounts_or_legacy_event_owner` | Both choices deny A-owned/NULL-owner under B and deny unknown ID; original rows retained. Own admin local choice preserves owner/base=1/payload/resolution actor and reason. Existing adapted Pull test covers own admin server choice.                    |
| `conflict_resolution_input_rejects_forged_identity_fields`                                | All three forged identity fields rejected at deserialization; legitimate input accepted.                                                                                                                                                                   |
| `conflict_authorization_holds_the_account_lock_during_a_competing_login`                  | Channel-controlled real offline login cannot replace the engineer while the held connection authorizes it; engineer denied, administrator authorized after release. No test-only production callbacks.                                                     |
| `cargo test --lib conflict_ -- --nocapture`                                               | Final **5/5 PASS**, including existing RFQ dirty-conflict test. Original Q first failed the three new source/list/input assertions for the intended reasons.                                                                                               |
| `cargo test --lib`; `cargo check --bins`; `cargo fmt --check`                             | Final **59/59 PASS**, bin check/fmt PASS; owner/cursor/migrations/replay/dirty-entity guards retained. No real EXE build/run claimed.                                                                                                                      |
| `src/sync/g1-origin.integration.test.ts`                                                  | Real PostgreSQL/Fastify/AuthService/PostgresAuthStore/SyncService/PostgresSyncStore **3/3 PASS**, final run 19:04:18 UTC. Synthetic sessions bypass password-login setup only; no mock auth/store.                                                         |
| HTTP case: unauthorized engineer + forged account/device/installation/known conflict ID   | No source or cursor movement; exact generic validation results; origin/conflict retained; accepted replay creates one change-log row, stale conflict replay one conflict row. Existing Rust foreign-dirty Pull test retains local account/cursor boundary. |
| HTTP case: two authorized accounts, same installation                                     | Isolates account-origin comparison: B cannot replay A's event even when scope permits; authorized global Pull and new B event succeed, recorded as B. This is distinct from an earlier engineer/no-binding rejection.                                      |
| HTTP case: same account, replacement installation                                         | Old token 401; same old event ID rejected under existing attested-origin rule; new event accepted@2 and Pull versions 1/2 succeed with new trusted origin. Preserves one-active-online-session policy.                                                     |
| `sync/api.test.ts` + `sync/service.test.ts`                                               | **19/19 PASS**, final run 19:04:27 UTC.                                                                                                                                                                                                                    |
| Five selected `sync/postgres-store.test.ts` tests                                         | **5/5 PASS**, 19:04:28 UTC: idempotent version/conflict, pending-Push cursor order, foreign origin, legacy quarantine, bound-country Pull. **34 deliberately name-filtered**, not absent-DB skips and not counted as PASS.                                 |
| `npm run lint`; `npm run typecheck`                                                       | PASS; one existing `App.tsx:242` React effect warning retained.                                                                                                                                                                                            |
| Desktop production build / unit                                                           | PASS / **11/11 PASS**; existing bundle-size warning.                                                                                                                                                                                                       |
| Focused navigation DOM                                                                    | **2/2 PASS**: own conflict success and cross-account denial with row/error retained, no page error. Screenshots under this worktree's `test-results/`. Uses mock IPC fixture; not native security evidence.                                                |
| Code / new-doc-section Prettier; `git diff --check`                                       | PASS; historical QA tables retained verbatim to avoid unrelated formatting changes.                                                                                                                                                                        |

Node `v24.18.0`; committed lock retained. Normal WSL2 user `honsen-dev`, Docker/Compose/Buildx verified. Every official DB batch first passed Windows Node `SELECT 1`, used fresh disposable PostgreSQL 16 project `honsen-g1-20261018`, and kept the foreground WSL session alive. Scoped `down --volumes` ran afterward; `compose ps -a` is empty. No business database or pre-existing QA/E2E data was opened or cleaned.

Setup failures, not PASS: first npm install omitted the lock's Windows Rolldown optional binding; `npm ci --include=optional` repaired it without dependency/lock change. Initial `node -e` PowerShell probe lost quoting before tests; replaced with temporary file-based probe. One fresh cold migration exceeded the 10-second hook while Rust compiled; this test's bounded setup timeout is now 30 seconds, without changing assertions; final 3/3 passed. Temporary runners were moved outside Playwright's disposable output location after its normal results reset. No original user evidence was affected.

Toolbox preflight read the five mandated upstream sources in order and compared local integration documentation: identity matches; installer/Runner/manifest/registry/release E2E remain existing gaps. Upstream documented launch/apply compatibility gaps remain T15 work; no contract fields/logic changed. No migrations, shared sync protocol, server production code, G2/G3 or complete order-conflict workflow changed.

### Independent Fixer commands and native limit

Use a fresh worktree at the delivered SHA, Node from `.nvmrc`, `npm ci --include=optional`. Prepare ignored `.env.test` containing only disposable test database/user/password and `POSTGRES_TEST_PORT=54329`. Q does not track `.env.test.example` despite older docs; this batch copied the caller's existing local example, never `.env`/deployment credentials. Do not commit test credentials.

Keep a normal-user WSL2 terminal open in this worktree's WSL path throughout Windows checks:

```sh
docker compose --project-name honsen-g1-fixer --env-file .env.test -f compose.test.yaml up -d --wait
```

Run in a separate PowerShell at the corresponding Windows worktree:

```powershell
$g1Test = ConvertFrom-StringData (Get-Content -Raw .env.test)
$env:TEST_DATABASE_URL = 'postgresql://{0}:{1}@127.0.0.1:{2}/{3}' -f $g1Test.POSTGRES_TEST_USER, $g1Test.POSTGRES_TEST_PASSWORD, $g1Test.POSTGRES_TEST_PORT, $g1Test.POSTGRES_TEST_DATABASE
npm.cmd run test --workspace @honsen/server -- src/sync/g1-origin.integration.test.ts src/sync/api.test.ts src/sync/service.test.ts --no-file-parallelism
Push-Location apps/server
node ../../node_modules/vitest/vitest.mjs run src/sync/postgres-store.test.ts --no-file-parallelism -t 'is.idempotent.and.records|does.not.return.an.event.result|quarantined.legacy|bound.countries|does.not.skip.a.pending.Push'
Pop-Location
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --bins
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build --workspace @honsen/desktop
npm.cmd run test --workspace @honsen/desktop
npx.cmd playwright test tests/e2e/navigation.spec.ts --grep 'administrator resolves a sync conflict|cross-account conflict resolution' --workers=1
git diff --check
```

Then, in the still-open WSL terminal:

```sh
docker compose --project-name honsen-g1-fixer --env-file .env.test -f compose.test.yaml down --volumes
```

**Independent real EXE evidence remains necessary before G1 CLOSED.** Existing `pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode ab-sync-security` is the relevant bounded regression for allowed own-conflict listing/origin/isolation. It **does not** prove same-profile A/B-admin foreign/NULL-owner resolution denial. Fixer must additionally drive the real EXE trusted commands: create an A-owned conflict through actual mutations/Push/Pull, switch the same installation to B, verify source absent and known/unknown-ID denial without mutation, return to A for valid resolution, verify owner/base/reason. Legacy cases need a preserved migration fixture. No G1-specific native mode is currently registered; record a native-automation blocker if safe driving is unavailable, rather than substitute unit/HTTP/mock DOM. Do not mechanically rerun NATIVE-003–008.

**READY_FOR_RECHECK = implemented, locally checked and available for independent review; not CLOSED or complete native security acceptance.** Full unchanged server, all-DOM and native chaos suites were intentionally not repeated. Existing Rust linker-output warnings remain. No push, main merge or deployment.

**Date:** 2026-10-16  
**QA branch:** `codex/qa-b203c70-server`  
**Verified baseline:** `b203c70fd83a5dbcdb01fcaf9184d5b9fa9bbd13`  
**Delivered implementation:** `8293ed5172f8caa5dd149cec278ea09f0f1a852e`

## Scope and baseline

- PASS — `git merge-base --is-ancestor 8293ed5172f8caa5dd149cec278ea09f0f1a852e b203c70fd83a5dbcdb01fcaf9184d5b9fa9bbd13` returned `0`; the supplied clean handoff contains the delivered implementation.
- PASS — QA ran in an independent worktree from `b203c70`; the source worktree's pre-existing untracked native/E2E SQLite data was not copied, opened, altered or removed.
- PASS — Node `v24.18.0`, WSL Ubuntu Docker Engine 29.9.0, Compose 5.6.0 and Buildx 0.38.0 were verified. `npm ci` completed with 0 vulnerabilities.

## Fresh PostgreSQL evidence

Each official run used the isolated Compose project `honsen-qa-b203c70-20261016` and first executed:

```text
docker compose --project-name honsen-qa-b203c70-20261016 --env-file .env.test -f compose.test.yaml down --volumes
docker compose --project-name honsen-qa-b203c70-20261016 --env-file .env.test -f compose.test.yaml up -d --wait
```

The PostgreSQL 16 container was healthy before execution. Its only database was the test-only `POSTGRES_TEST_DATABASE`; no production connection string, existing E2E SQLite database, `honsen-dev`, or other Compose project was used.

| Check                                                               | Result                                                                                                                                                                                                                                                    | Evidence                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Full server Vitest suite                                            | PASS — 14 files, 92/92 tests                                                                                                                                                                                                                              | `test-results/qa-b203c70-server-full-fresh.log`     |
| Builder's combination group                                         | PASS — 6 files, 57/57 tests                                                                                                                                                                                                                               | `test-results/qa-b203c70-server-combination-57.log` |
| Migration chain `001`–`006` including both ordered `005` migrations | PASS — `migration-runner.test.ts` validates the migrated foundation and repeatable runner                                                                                                                                                                 | combination group                                   |
| Formal registry backfill and rollback                               | PASS — `formal-issue-migration.test.ts` proves legacy rows are retained and duplicate legacy formal numbers abort under a savepoint without leaving the registry table                                                                                    | combination group                                   |
| RFQ / formal frozen-state regression                                | PASS — `postgres-store.test.ts`, `formal-issue.test.ts`, and `formal-issue-hardening.test.ts`                                                                                                                                                             | combination group                                   |
| Cross-account and installation-origin isolation                     | PASS — store test rejects replay result retrieval from another authenticated account/origin; legacy unattested origin fails closed. Full suite additionally covers binding Push installation to the authenticated session rather than request `deviceId`. | full suite and combination group                    |

Official command used for the full suite:

```text
node ../../node_modules/vitest/vitest.mjs run
```

It was invoked from `apps/server` by a temporary ignored QA runner while Compose and the Windows Node process shared one foreground WSL session. This avoids the known host lifecycle interruption without changing application code or test behavior.

## Failure classification

- ENVIRONMENT (not a product failure): two initial full-suite attempts received PostgreSQL `57P01`/`57P03` because the local WSL Docker host stopped after its launching session exited. Their later assertion failures were cascading connection failures, not data pollution or implementation regressions.
- PASS after mitigation: the official fresh-container full run had no connection interruption, no skipped PostgreSQL tests, and no failures. The 57-test targeted rerun was also clean.
- DATA POLLUTION: not observed in either official run. Both began after scoped `down --volumes`; no existing user E2E data was cleaned.

## Acceptance boundary

This report accepts only the completed server/migration verification batch. It does **not** close P1 or Formal integration holds and provides **no** evidence to close `T10-SEC-001`: real Tauri A/B login, Push/Pull conflict/replay, old-token and reconnect isolation remain a separate native-client batch. No application source, schema, migration or security rule was changed by QA.

## Native Tauri / A-B HTTP QA — 2026-10-16

At the time of the original native attempt, application source remained byte-identical to `b203c70` (`git diff --quiet b203c70 -- apps packages` returned 0); the later infrastructure repair below adds only test-profile/test-server plumbing.

| Native acceptance item                                 | Result  | Actual evidence                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated native test profile                           | PASS    | `honsen-procure-test-profile seed` created only the new `.honsen-native-qa/ab-http.test.sqlite` profile and its synthetic A/B/purchaser accounts. Existing E2E profiles were not opened or cleaned.                                 |
| Real Tauri host launch                                 | PASS    | `npm run desktop:dev --workspace @honsen/desktop` ran `HonsenProcure.exe`; Windows reported title `Honsen Procure — TEST PROFILE`, nonzero main-window handle and `Responding=True`. See `test-results/qa-b203c70-native-host.log`. |
| Real native window automation                          | BLOCKED | The Computer Use inventory returned `apps: []` twice although the test-profile process/window was live. No UI field, CAPTCHA, login or mocked browser substitute was used.                                                          |
| A/B online login, logout, switch and session isolation | BLOCKED | Requires a targetable native window and a trusted HTTPS server.                                                                                                                                                                     |
| Untrusted `deviceId` origin test                       | BLOCKED | Native request cannot reach the isolated HTTP-only server. The previous server-only result remains separate evidence and is not counted here.                                                                                       |
| A/B Push, Pull, conflict query and replay containment  | BLOCKED | Same trusted-HTTPS/native-window blockers.                                                                                                                                                                                          |
| Old-token revocation/switch denial                     | BLOCKED | Same trusted-HTTPS/native-window blockers.                                                                                                                                                                                          |
| Offline mutation, reconnect, cursor recovery and retry | BLOCKED | Native UI could not be operated; no simulated Playwright result is substituted.                                                                                                                                                     |
| RFQ/Formal desktop regression                          | BLOCKED | Normal UI flow cannot be operated; no mock/Playwright result is substituted.                                                                                                                                                        |

The concrete transport blocker is structural, not an assertion failure: desktop `api_endpoint_from` and every cloud client use HTTPS only, while `apps/server/src/index.ts` provides only `http://127.0.0.1:3000`. The QA host has no `mkcert`, Caddy, OpenSSL, pre-trusted localhost/Honsen root certificate, or permitted trusted HTTPS test endpoint. Creating/trusting a root certificate would change host security settings and was not done.

**T10-SEC-001 remains OPEN.** This batch proves the test-profile host can launch, but it provides no native A/B HTTP evidence for the required isolation, replay, revocation or reconnection paths.

## Native HTTPS / controlled-host infrastructure repair — 2026-10-16

The prior native result remains valid for UI automation: Computer Use reported `apps: []` while a real test-profile window was live, so normal native-window driving is still unavailable here. This repair deliberately does not substitute Playwright, a mocked Tauri IPC, or a standalone HTTP client.

| Item                                         | Result  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated HTTPS endpoint                      | PASS    | `apps/server/src/scripts/native-test-server.ts` starts the real Fastify routes/services against a disposable loopback PostgreSQL database whose name must include `test`. It has no production entry point.                                                                                                                                                                                                                                     |
| Certificate trust boundary                   | PASS    | `tests/native/run-native-https-smoke.ps1` creates a one-day `localhost`/`127.0.0.1` leaf certificate in CurrentUser\My, exports it only to the ignored QA directory, and injects its PEM only via `HONSEN_PROCURE_TEST_TLS_CA_PEM` and `open_test_path`. No system Root trust, `danger_accept_invalid_certs`, or production-profile override is used. Final run verified no temporary PFX/CER and no matching certificate-store entry remained. |
| Native controlled harness                    | PASS    | `HONSEN_PROCURE_NATIVE_SMOKE=online-login` is accepted only after the existing test-profile guard has required an absolute `.test.sqlite` database. It invokes the real local CAPTCHA, cloud CAPTCHA, `online_login`, OS test credential vault, SQLite migration/persistence and HTTPS client; it cannot select a production profile.                                                                                                           |
| Actual HonsenProcure.exe HTTPS + login smoke | PASS    | Command below seeded `native-smoke-20261016172717.test.sqlite`, then the compiled `target/debug/HonsenProcure.exe` authenticated `engineer-a` through `https://localhost:3443`. Result JSON records the expected fixed synthetic user ID and username.                                                                                                                                                                                          |
| Full native A/B UI matrix                    | BLOCKED | Computer Use still exposes no Windows app target, and this controlled non-UI smoke intentionally covers only transport/login plumbing. It is a harness for the next Fixer batch, not evidence for Push/Pull/replay/revocation/reconnect or RFQ/Formal UI acceptance.                                                                                                                                                                            |

Reproducible command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Final run artifacts (ignored test data/logs):

- `.honsen-native-qa/native-smoke-20261016172717.test.json`
- `.honsen-native-qa/native-smoke-20261016172717.test.sqlite`
- `test-results/native-smoke-20261016172717-server.log`
- `test-results/native-smoke-20261016172717-server-error.log` (0 bytes)
- `test-results/native-smoke-20261016172717-client.log`

Focused validation: server typecheck PASS; Rust TLS trust-boundary unit test PASS (1/1); full desktop Rust suite PASS (53/53); `cargo check --bin HonsenProcure` PASS. The smoke run itself PASSed. A non-test-profile smoke invocation exited 101 before creating its sentinel directory. The temporary WSL PostgreSQL Compose project was removed with `down --volumes`; no existing E2E profile was opened or removed.

**T10-SEC-001 remains OPEN.** The new evidence closes only the trusted-endpoint/native-login infrastructure blocker. It does not establish A/B Push/Pull conflict/replay, token revocation, reconnect isolation or RFQ/Formal desktop behavior, and does not release P1 or Formal holds.

## Native HTTPS A/B login-switch smoke — 2026-10-16

This narrow follow-up extends the existing test-only controlled host without attempting Computer Use or substituting Playwright, a mock, or an independent HTTP client. The compiled `HonsenProcure.exe` opens two separately seeded absolute `.test.sqlite` profiles (and therefore two independently derived test credential-vault namespaces/installations) and calls the production local CAPTCHA, cloud CAPTCHA, `online_login`, `lock`, secure credential-vault and HTTPS authorization-refresh paths.

| Scenario                        | Result | Actual assertion                                                                                                                                     |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile A login as `engineer-a` | PASS   | Real local/cloud CAPTCHA and `online_login` completed through the isolated Fastify HTTPS server.                                                     |
| Profile B login as `engineer-b` | PASS   | A second independently seeded SQLite profile authenticated with its own installation identity.                                                       |
| B switches to `engineer-a`      | PASS   | A new server session was created through the production Rust client flow.                                                                            |
| A's replaced token              | PASS   | `refresh_authorization_https` on profile A returned `AuthError::NoActiveSession` after B's A-login revoked the earlier server session.               |
| B logout/session guard          | PASS   | After `lock`, B's `refresh_authorization_https` returned `AuthError::NoActiveSession`; no protected request was sent with a retained online session. |

The harness first exposed a test-infrastructure isolation defect: the two test SQLite profiles used one OS credential-vault service and the same account ID would overwrite the other profile's test token. Commit `028ed6fbfa9df220010eb0c3271de7e75b7419b9` scopes test credential services to the SHA-256 of the absolute `.test.sqlite` path, while retaining the production service names and clearing the former legacy test names. This is needed for a valid multi-profile assertion; it does not relax TLS, authentication, installation ID, transaction, cursor, approval, soft-delete, or snapshot rules.

Reproducible command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Latest successful run: `native-smoke-20261016173505`.

- Result: `.honsen-native-qa/native-smoke-20261016173505.test.json`
- Client process log: `test-results/native-smoke-20261016173505-client.log`
- HTTPS server log: `test-results/native-smoke-20261016173505-server.log`
- Server error log: `test-results/native-smoke-20261016173505-server-error.log` (0 bytes)
- Compose logs: `test-results/native-smoke-20261016173505-compose.log` and `test-results/native-smoke-20261016173505-compose-error.log`

Focused checks: `cargo fmt --check` PASS, `cargo test --lib` PASS (54/54), `cargo build --bin HonsenProcure --bin honsen-procure-test-profile` PASS, and the native A/B command above PASS. The temporary Compose project was removed with scoped `down --volumes`; only new ignored QA profiles and their public PEM evidence remain. No production database, existing E2E data, Root trust, global TLS bypass, push, PR, or main merge was used.

**T10-SEC-001 remains OPEN; P1 and Formal holds remain OPEN.** This result is evidence only for A/B authentication/session replacement and local logout isolation. Native `deviceId` source integrity, Push/Pull, conflicts, replay, offline/reconnect/cursor/retry, and RFQ/Formal flows are deliberately not claimed and remain the next matrix batch.

## Native A/B synchronization-security harness checkpoint — 2026-10-17

This batch extended the existing controlled, real-client harness only. It invokes the compiled debug `HonsenProcure.exe`, two fresh absolute test-profile SQLite files, the OS credential vault, the production Rust local-auth/sync functions, an isolated PostgreSQL Fastify HTTPS service, and the test-profile PEM trust path. It does not use Playwright, a mocked Tauri command, or a standalone HTTP client.

| Scenario                                       | Result  | Evidence                                                                                                                                                                                     |
| ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A/B independently seeded installations         | BLOCKED | The harness asserts different SQLite installation UUIDs before sync; execution reached both native logins but could not retain A's credential-vault token after B login.                     |
| Forged `deviceId` retains authenticated origin | BLOCKED | The harness changes only A's test SQLite `installation_id`, then checks the server-recorded `origin_installation_id` response header after an actual Rust Push. It was not reached.          |
| A/B Push/Pull isolation                        | BLOCKED | A's project binding and B's zero-binding Pull assertion were prepared but not reached.                                                                                                       |
| A/B conflict-query isolation                   | BLOCKED | The actual purchaser stale-Push/local-conflict path was prepared but not reached.                                                                                                            |
| Post-commit failure, replay and idempotency    | BLOCKED | The HTTPS test server is configured to return a single 503 only after its real Push handler commits, then accepts the same Rust outbox event on retry; the native client did not reach Push. |

The actual reproducible run was:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Run `native-smoke-20261017083543` used a new scoped Compose PostgreSQL service and stopped with the result JSON:

```text
account A lost its protected session after login: NoActiveSession;
state=Ok((Some(engineer-a UUID), Some(engineer-a UUID), false))
```

The result proves that A's SQLite local session and in-memory online-account marker still point to A, but its OS credential-vault sync token is absent after B's login. The A/B paths are distinct: profile SHA-256 prefixes were `a184106b` and `411b7fc5`, yielding distinct `S-...` credential services, and the underlying Windows keyring target is `account_uuid.service`. The original longer names, a 24-character scoped name, and the current 10-character scoped name all reproduced the same loss. This is a **native-test-harness BLOCKER**, not evidence of a server account-isolation defect; no Push request was made and no product security assertion has been relaxed.

Artifacts retained for reproduction:

- `.honsen-native-qa/native-smoke-20261017083543.test.json`
- `.honsen-native-qa/native-smoke-20261017083543-account-a.test.sqlite`
- `.honsen-native-qa/native-smoke-20261017083543-account-b.test.sqlite`
- `test-results/native-smoke-20261017083543-{client,server,server-error,compose,compose-error}.log`

Fresh focused checks: `cargo fmt --check` PASS; credential-service isolation and test-installation replacement Rust tests PASS (2/2); `npm run lint --workspace @honsen/server` PASS; `npm run typecheck --workspace @honsen/server` PASS. The native command itself is FAIL/BLOCKED at credential retention, so it is not counted as an acceptance pass. The temporary Compose project was removed with its own scoped `down --volumes`; existing E2E data, production databases, production TLS policy, P1 and Formal state were not changed.

**T10-SEC-001 remains OPEN; P1 and Formal holds remain OPEN.** Before another run, the Integration Owner must diagnose the Windows keyring process/profile behavior with a minimal vault-level reproduction or provide an approved native vault isolation mechanism. Do not replace this with HTTP/Playwright evidence.

## Integration Owner Windows keyring investigation — 2026-10-17

| Check                                              | Result          | Evidence                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test-profile keyring target/service A/B round trip | PASS            | `honsen-procure-test-profile.exe vault-probe` writes, reads, distinguishes and deletes two synthetic 43-character base64url-shaped tokens using the same `S-<profile SHA>` services and fixed account UUID.       |
| Real `HonsenProcure.exe` A login token readback    | FAIL            | Run `native-smoke-20261017094219` fails immediately after A login, before B opens: local session, in-memory online account and `last_authenticated_user_id` are all A, while `load_sync_token(A)` returns `None`. |
| B overwrite / test cleanup / server revocation     | NOT CAUSAL      | The failure occurs before B login, `clear_test_profile` invocation, protected request, or server-session validation.                                                                                              |
| Explicit profile-first keyring target experiment   | FAIL / reverted | A test-only `Entry::new_with_target` target with profile hash first reproduced the same native A failure. It was not retained as a product or harness semantic change.                                            |

The minimum root-cause evidence is therefore: `cache_sync_access_token(A, accessToken)` returned success and updated SQLite `last_authenticated_user_id=A`; an immediate vault read by the same live `HonsenProcure.exe` returned `NoEntry`. The same process's profile, account, token shape and default keyring naming were independently successful in the test-profile executable. There is no application call site that deletes a sync credential between those two operations. The remaining differentiation is executable/process-specific Windows Credential Manager behavior, not a service/account/target collision and not an expected server revocation.

Reproducible commands:

```text
cargo build --bin HonsenProcure --bin honsen-procure-test-profile
honsen-procure-test-profile.exe vault-probe
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Relevant artifacts:

- `.honsen-native-qa/native-smoke-20261017094219.test.json`
- `test-results/native-smoke-20261017094219-{client,server,server-error,compose,compose-error}.log`

Fresh local validation: `cargo fmt --check` PASS; `cargo test --lib` PASS (55/55); both native binaries build PASS. The script is FAIL as above, so A/B switch, old-token rejection, logout clearing, and sync matrix are not re-accepted in this batch. No production TLS, credential policy, database, existing E2E data, server suite, P1 or Formal state changed.

**T10-SEC-001, P1 and Formal remain OPEN.** Fixer must independently reproduce this process-specific vault failure before accepting a platform-appropriate repair; no HTTP/Playwright/Mock substitution is acceptable.

## Independent Fixer Windows Credential Manager readback diagnosis — 2026-10-17

| Check                                           | Result | Evidence                                                                                                                                                                    |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real `HonsenProcure.exe`: same Entry write/read | PASS   | Test-profile-only `vault-readback` wrote and read a controlled synthetic token through one `keyring::Entry`.                                                                |
| Real `HonsenProcure.exe`: recreated Entry read  | FAIL   | The identical target immediately returned `NoEntry` after recreating `Entry`; final result is `.honsen-native-qa/native-vault-readback-final-20261017151305.test.json`.     |
| Production wrapper write/read                   | FAIL   | `cache_sync_access_token` returned success, then `load_sync_token` (which creates a fresh Entry) returned absent in the same EXE/process.                                   |
| Console probe with recreated Entries            | FAIL   | `test-results/native-vault-probe-final-20261017151306-client.log` records `No matching entry found in secure storage`; the earlier probe had only proved same-object reads. |
| Credential Manager metadata                     | FAIL   | Read-only `cmdkey /list:<controlled-target>` found no stored credential after the controlled failed run. No existing credential was queried or deleted.                     |

The corrected minimum root cause is not an A/B collision, application deletion, session revocation, TLS, or a Tauri-specific target difference. In this Windows user/session, `keyring` 3.6.3 reports successful `CredWriteW` for a controlled Generic credential, but a fresh `CredReadW` for the same exact `account.service` target returns `NoEntry`. `keyring` maps that result from Win32 `ERROR_NOT_FOUND` (1168). The test uses only a fixed synthetic account, a synthetic token whose SHA-256 prefix (not its value) is emitted, a new absolute `.test.sqlite` profile, and a hashed process-context marker.

No application workaround was accepted: retaining the original `Entry` would merely hide the fault inside one process and would fail the required restart/persistence boundary. The diagnostic entry is accepted only in debug/test-profile mode and deletes its own controlled credential on every completed probe path. Production credential service names, TLS, authentication, SQLite token policy and server code are unchanged.

Reproducible commands:

```text
cargo build --bin HonsenProcure --bin honsen-procure-test-profile
# Set HONSEN_PROCURE_PROFILE=test, an absolute new *.test.sqlite path,
# HONSEN_PROCURE_NATIVE_SMOKE=vault-readback and an absolute *.test.json result path.
HonsenProcure.exe
honsen-procure-test-profile.exe vault-probe
```

Fresh checks: `cargo fmt --check` PASS; `cargo test --lib` PASS (55/55); both native binaries build PASS. The required immediate real-EXE readback is **FAIL/BLOCKED**, so this batch provides no new A/B security acceptance evidence and no minimal application fix is safe without repairing the Windows Credential Manager/keyring environment.

**T10-SEC-001, P1 and Formal remain OPEN.**

## NATIVE-008 Integration Owner repair — 2026-10-18

The test host now waits for an observed Node `aborted`, request `close` or socket `close` event after barrier release; it does not use a fixed sleep or immediate `destroyed` read. Before teardown it writes trusted PostgreSQL event count/server version and authoritative entity version snapshots. A fresh real EXE run `native-smoke-20261018130905` force-terminated PID 30388 and records cancel=true, handler=false, `0/0/0→1/1/1`; B `native-smoke-20261018131113` force-terminated PID 29188 and records cancel=true, handler=true, `1/1/1→1/1/1`. Both use the same profile/installation/event across recovery, outbox `1→0`, Pull `0→1`, replay 0. Rust 55/55, fmt, release check and server lint/typecheck PASS. **NATIVE-008 READY_FOR_RECHECK; T10-SEC-001/P1/Formal OPEN.**

## Independent Fixer NATIVE-008 recheck — 2026-10-18

Actual isolated QA `HEAD`, implementation SHA and QA checkpoint are `ed9505953f803f8abc859ab402bbc30f896d8035` (`git merge-base --is-ancestor` PASS); it is not reachable from the caller worktree's former `74365f0` or `origin/main`. The registered mode is `push-termination-recovery` with boundaries `before-commit` and `after-commit`.

| Scenario                        | Fresh run                     | Result  | Evidence                                                                                                                                                                                                                                                        |
| ------------------------------- | ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pre-handler / pre-commit      | `native-smoke-20261018115728` | BLOCKED | Force-terminated real `HonsenProcure.exe` PID 18540; same profile/account/installation/event `7c0fc20e-727d-4dd2-8e5d-02fff84d6223` restarted. JSONL shows barrier, `499` with no origin, then one `accepted@1`; outbox `1→0`, Pull one/cursor `0→1`, replay 0. |
| B onSend / post-commit, pre-ACK | `native-smoke-20261018115952` | BLOCKED | Force-terminated real EXE PID 26628; same profile/account/installation/event `72351df2-04af-421c-89af-f140bc8e3467` restarted. Both server observations read the same `accepted@1`; outbox `1→0`, Pull one/cursor `0→1`, replay 0.                              |

`preHandler` is before the Push route/`SyncService.push`; `onSend` is after the handler awaits it and before response release. The host permits only loopback `test` databases and absolute `.signal` paths; desktop is test-profile/debug-only and release selects a fail-closed stub. The fault boundary uses ready/release conditions, not a fixed sleep.

NATIVE-008 remains **OPEN**: A releases then immediately samples `request.raw.destroyed`; process `WaitForExit` does not ensure Node has observed socket cancellation, so a delayed observation could enter the production handler. The assertion also only requires `pushes.Count -ge 1`, omitting A committed `count=0/version` and B `count=1/version`. Integration Owner must wait for cancellation acknowledgement before A proceeds and persist/assert count/version for both boundaries before Compose teardown, then rerun both EXE modes. Server lint/typecheck PASS; `cargo fmt --check` completed, but Rust library/release checks were BLOCKED by C: zero free bytes (LNK1201/OS 112). No Mock, Playwright, standalone HTTP, direct SQLite mutation, existing-E2E-data cleanup, push, merge or deployment.

## Independent Fixer NATIVE-008 repair recheck — 2026-10-18

Actual QA `HEAD` and tested implementation are `2c8c768e25903cc4ab639761f40c29e94dc6bd70`; it contains `ed9505953f803f8abc859ab402bbc30f896d8035` and the prior QA checkpoint `cb6cddb96ea26aeb7fcc61c44b5cf16d0f430c75`. The Harness whitelist registers `push-termination-recovery`, with actual `before-commit` and `after-commit` boundaries. It uses real `HonsenProcure.exe`, production Rust Push/Pull, test SQLite profiles, Windows Credential Manager, disposable PostgreSQL and loopback Fastify HTTPS; no Mock, Playwright, standalone HTTP or direct SQLite operation was used.

| Scenario                              | Fresh run                     | Native result | Evidence                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `preHandler` / before commit        | `native-smoke-20261018141717` | BLOCKED       | Real EXE PID `32912` was force-terminated after the barrier. Same profile `...141717-account-a.test.sqlite`, installation `588d451b-7001-4587-abec-88492d7709bc` and event `d5aae432-8fbf-4117-b117-3d72aef15cb3` restarted. Authoritative PostgreSQL snapshots are `0/0/0` with handler false before recovery and `1/1/1` after; Outbox `1→0`, Pull one at cursor `0→1`, replay 0. |
| B `onSend` / after commit, before ACK | `native-smoke-20261018141758` | BLOCKED       | Real EXE PID `18480` was force-terminated at the onSend barrier. Same profile `...141758-account-a.test.sqlite`, installation `cb17a5b0-bfcd-47d0-826d-db96317f79ca` and event `625ca06a-ef85-42af-8c9d-d68c3ef4d219` restarted. Authoritative snapshots remain `1/1/1` before/after replay, handler true; Outbox `1→0`, Pull one at cursor `0→1`, replay 0.                        |

The previous immediate `request.raw.destroyed` read is gone and PostgreSQL count/version/entityVersion snapshots are now queried directly from `sync_events`/`sync_entities` before Compose teardown. `preHandler` precedes Push business execution; `onSend` runs after the route commit and before payload delivery. The barrier uses ready/release conditions plus a 10-second failure timeout, not a fixed sleep. Test controls remain test-host/test-profile-only and release fail-closed.

However, the cancellation condition also resolves on `request.raw.once('close')`. In Node 24, `request.raw` is `http.IncomingMessage`; its `close` event has meant request completion rather than underlying-socket closure since Node 16. A normally completed request can therefore satisfy the Harness cancellation condition before the EXE is killed. The JSONL records only `cancellationObserved=true`, not which event fired, so the two fresh runs cannot disprove that false-positive path. **NATIVE-008 remains OPEN; neither A nor B is eligible for PASS/CLOSED.** Minimal repair: remove raw-request `close` as a success source, record and require only `aborted` or socket `close` after the release, retain timeout fail-closed, then rerun both modes.

Fresh checks PASS with C: about 0.90 GB free: `git diff --check HEAD`, `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server `npm run lint`, and server `npm run typecheck`. Existing Rust unused-item warnings remain. `T10-SEC-001`, P1 and Formal remain OPEN.

## NATIVE-008 Integration Owner cancellation-semantics repair — 2026-10-18

At QA HEAD `896c7ab`, the `IncomingMessage.close` path is removed. A test-host-only observer now listens only to request `aborted` and underlying socket `close`; it accepts a signal only while the response barrier is still held and `responseCompleted=false`. A signal after release, a completed response, or no accepted event before the 10-second condition timeout fail closed. The observer records run ID, A/B scenario, request/event IDs, EXE PID, source, observed/released timestamps, handler state, response completion and socket destruction. The PowerShell Harness supplies the PID before barrier readiness and asserts all diagnostic fields, source and ordering. `native-push-cancellation.test.ts` proves normal `IncomingMessage.close` does not resolve cancellation and a socket close after release is rejected.

The first red native run `native-smoke-20261018143000` correctly rejected a socket close 38ms before release under the obsolete direction. The repaired semantics accept that only because the response was still blocked, then preserve both timestamps. Fresh real native results: A `native-smoke-20261018143200` force-killed PID `27812`, source `socket-close`, observed `14:31:44.736Z` before release `14:31:44.762Z`, handler false, PostgreSQL `0/0/0→1/1/1`; B `native-smoke-20261018143400` force-killed PID `17644`, source `socket-close`, observed `14:32:47.829Z` before release `14:32:47.857Z`, handler true, PostgreSQL `1/1/1→1/1/1`. Both use the same profile/installation/event across restart, Outbox `1→0`, Pull `0→1`, replay 0. Runs use real `HonsenProcure.exe`, Rust Push/Pull, test SQLite, Windows Credential Manager, isolated PostgreSQL and Fastify HTTPS only.

PASS: focused server unit; server lint/typecheck; `cargo fmt --check`; `cargo test --lib` 55/55; `cargo check --release --bin HonsenProcure`; `git diff --check`. C: remained about 0.88 GB free. Production sync code is unchanged; test controls remain test-host/test-profile-only and release fail-closed. **NATIVE-008 READY_FOR_RECHECK; T10-SEC-001/P1/Formal OPEN.**

## Independent Fixer NATIVE-008 second repair recheck — 2026-10-18

Actual QA HEAD `29f2bd2d45b958b5dd71b2633ade365b539e3308` contains both `896c7ab` and the requested repair. Harness mode is explicitly registered as `push-termination-recovery`; boundaries are `before-commit` and `after-commit`. Source review confirms raw `IncomingMessage.close` is absent from the cancellation observer. It binds request `aborted` and underlying socket `close`, timestamps in the callback, accepts only while `barrierReleasedAt=null` and `responseCompleted=false`, and rejects after a 10-second condition timeout. Release does not generate acceptance because it first marks `barrierReleasedAt`.

Fresh real paths PASS: A `native-smoke-20261018143800` force-killed actual `HonsenProcure.exe` PID `39740`; event `5df6f8eb-8226-437f-a98b-1be9cc51ecc3`, socket-close `14:38:45.658Z` before release `14:38:45.687Z`, response incomplete/socket destroyed/handler false, authoritative PostgreSQL `0/0/0→1/1/1`, same profile/installation recovery, Outbox `1→0`, Pull `0→1`, replay 0. B `native-smoke-20261018144000` force-killed PID `27156`; event `a81b2067-45d2-4295-b0a0-c1a28aef0914`, socket-close `14:39:45.160Z` before release `14:39:45.195Z`, response incomplete/socket destroyed/handler true, authoritative PostgreSQL remains `1/1/1`, same profile/installation recovery, Outbox `1→0`, Pull `0→1`, replay 0. Both use real Rust Push/Pull, test SQLite, Windows Credential Manager, Fastify HTTPS and disposable PostgreSQL.

However, the new unit tests only prove ordinary `IncomingMessage.close` and post-release socket close are rejected. They do **not** exercise the implementation's required `responseCompleted=true` rejection. This is a precise assertion gap, so **A/B are BLOCKED for acceptance and NATIVE-008 remains OPEN.** Minimal repair is one focused unit: set `writableEnded` or `finished`, emit socket close while held, and assert `accepted=false` with cancellation unresolved. Fresh checks otherwise PASS: focused Vitest, server lint/typecheck, Rust fmt, Rust 55/55, release check and diff check; C: about 0.86 GB free. T10-SEC-001, P1 and Formal remain OPEN.

## NATIVE-002 native A/B conflict projection diagnosis — 2026-10-17

`native-smoke-20261017152627` failed because the harness queried B's local conflict table immediately after the stale Push. This was a **harness timing defect**, not a cross-account data leak. The shared production client intentionally records a Push acknowledgement only when `status=accepted`; a `conflict` acknowledgement contains no server payload. The next production `pull_sync_https` receives the authoritative remote entity and `apply_sync_pull_page_for_account` atomically inserts the local conflict only when the matching pending outbox event belongs to the active account.

The repair adds that required real Rust Pull before the conflict assertion and tightens the checks: stale B Push must remain pending, Pull must advance the cursor and apply exactly one remote change, B must have exactly one local conflict for the shared order, and A must still have zero local conflicts. The test-only Fastify host now records only non-secret Push metadata (event UUID, status/version, trusted actor/origin installation, and the small response body) in an ignored `.test.jsonl` file. No production SyncService, Postgres filtering, authentication, TLS, keyring naming or SQLite schema changed.

| Check                               | Result | Evidence                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A/B profiles and installations      | PASS   | Result records A installation `87a280de-8a3b-454c-9007-b43d805d0c29` and B installation `e39814fc-ffa2-4926-bbd5-fca28da03aef`; profiles are distinct absolute `.test.sqlite` files.                                                                                               |
| Forged client `deviceId`            | PASS   | A's locally forged ID `a50ab94f-4e56-4e9a-948a-94d9ac991124` differs from the server's trusted A origin installation above.                                                                                                                                                        |
| A Push post-commit retry            | PASS   | Diagnostic records one injected 503 after accepted commit and the same A event replayed as accepted at version 1.                                                                                                                                                                  |
| A/B Pull isolation                  | PASS   | B's pre-purchaser Pull remains cursor `0` with zero A changes; after B switches to purchaser, its authorized Pull receives A's one remote entity and cursor advances `0→1`.                                                                                                        |
| B stale Push and conflict ownership | PASS   | Raw B response is `status=conflict`, version 1, with actor/origin account `10000000-0000-4000-8000-000000000013` and B installation. The resulting B SQLite state contains one conflict for entity `7ded78e2-f21f-47ae-9c38-b8a6fbd1042d`, server version 1; A has zero conflicts. |

Reproducible command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Fresh real-native run: `native-smoke-20261017153555` (exit 0).

- Result and local SQLite metadata: `.honsen-native-qa/native-smoke-20261017153555.test.json`
- Sanitized raw server Push evidence: `.honsen-native-qa/native-smoke-20261017153555-server-sync.test.jsonl`
- Client/server/Compose evidence: `test-results/native-smoke-20261017153555-{client,server,server-error,compose,compose-error}.log`

Focused checks: `cargo fmt --check` PASS; `cargo test --lib` PASS (55/55); `cargo check --bin HonsenProcure --bin honsen-procure-test-profile` PASS; server `npm run lint` and `npm run typecheck` PASS. The disposable Compose database was removed with scoped `down --volumes`; existing E2E data was not removed and no production database was opened.

**NATIVE-002 is fixed as a harness defect. T10-SEC-001, P1 and Formal remain OPEN.** This is only the first native synchronization slice; offline/reconnect/cursor-retry and RFQ/Formal native acceptance have not run.

## Independent Fixer recheck: NATIVE-002 — 2026-10-17

Baseline reviewed: `87ab8e5bf18511cfa84ce97ef925502a7210e75f` is the actual HEAD and descends from the keyring repair `28441d1`. No tracked source or harness change was present for this recheck; the only working-tree entry is the preserved ignored `.honsen-native-qa/` evidence directory.

The Fixer independently executed the same real native command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

Fresh run `native-smoke-20261017153900` exited 0 after building/running real debug `HonsenProcure.exe`, two newly seeded absolute SQLite test profiles, Windows Credential Manager, ephemeral test-profile TLS trust, Fastify HTTPS and disposable PostgreSQL. It is not a Playwright, Mock or standalone HTTP-client result.

| Item                                           | Result | Independent evidence                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline / profile / installation separation   | PASS   | A installation `d1e9ba9f-5762-4072-be1d-fb940ecff600` and B installation `93872dc5-b614-4596-9603-177d0359bc6d` differ in the fresh result.                                                                                                    |
| Trusted source despite forged client device ID | PASS   | Forged A client ID differs from the Fastify-recorded trusted A installation in the sanitized Push record.                                                                                                                                      |
| Post-commit fault and replay                   | PASS   | One injected 503 carries an accepted server commit; retry of the exact event returns accepted version 1.                                                                                                                                       |
| B Push/Pull visibility isolation               | PASS   | B begins with no A project data; the authorized purchaser phase Pull advances only after B's own stale event is pending.                                                                                                                       |
| Conflict projection account boundary           | PASS   | Raw B result is `conflict@1`, with B purchaser account/installation as origin. The test requires `accepted_count=0`, `pending_count=1`, Pull `applied_count=1`, nonzero cursor, B local conflict count 1/entity match, and A conflict count 0. |
| Server/client errors                           | PASS   | Client and server-error logs are zero bytes; Compose report contains normal create/healthy lifecycle output only.                                                                                                                              |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017153900.test.json`
- `.honsen-native-qa/native-smoke-20261017153900-server-sync.test.jsonl`
- `test-results/native-smoke-20261017153900-{client,server,server-error,compose,compose-error}.log`

### Next minimal native scenario

**BLOCKED as-is, but ready for a bounded harness extension:** existing native modes are `online-login`, `ab-login-switch`, `ab-sync-security` and `vault-readback`; none injects a Pull transport fault, controls an EXE restart, or asserts durable per-account cursor recovery. Existing Rust unit tests cover Pull failure/replay/cursor behavior, but are not native acceptance evidence. The next smallest valid test-profile slice is one native A/B reconnect mode plus one Fastify test-only first-Pull fault: make real `pull_sync_https` return `SyncTransport`, assert the SQLite account cursor is unchanged, restart the real EXE against the same profile, retry Pull and require one durable projection/cursor advance with no duplicate. This preserves HTTPS, SQLite, OS credential vault and production Rust sync paths. RFQ/Formal is explicitly outside that next slice.

**T10-SEC-001, P1 and Formal remain OPEN.**

## Native Pull transport interruption / restart recovery — 2026-10-17

The native harness now has a deliberately narrow `pull-recovery` mode. In the isolated Fastify HTTPS test host only, `HONSEN_PROCURE_TEST_FAIL_FIRST_PULL_RESPONSE=1` changes the first real `GET /api/sync/pull` response to HTTP 503 after the normal route has run. The actual debug `HonsenProcure.exe` still calls production `LocalAuthService::pull_sync_https`; neither the harness nor the host writes the profile SQLite database or simulates a Rust response. The mode is compiled only with `debug_assertions`, requires the existing absolute test-profile database guard, and the release binary returns unavailable.

Fresh run command:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-recovery
```

Fresh real-native run `native-smoke-20261017154749` exited 0 using an ephemeral loopback PostgreSQL database, Fastify HTTPS with per-run test-profile certificate trust, Windows Credential Manager and the same absolute A SQLite profile for both EXE processes.

| Pull phase                            | Result | Evidence                                                                                                                                                                                                      |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First real Pull after accepted Push   | PASS   | Server JSONL records `GET /api/sync/pull`, requested cursor `0`, injected HTTP `503`; the first EXE result requires `SyncTransport`, zero projections and durable cursor `0→0`.                               |
| Exit then restart same EXE/profile    | PASS   | The second real `HonsenProcure.exe` opens the same profile and credentials, executes production Pull at cursor `0`, projects exactly one entity and persists cursor `0→1`.                                    |
| Repeated real Pull                    | PASS   | Server sees cursor `1`; the result requires zero new projections, cursor remains `1`, and the already-projected entity remains server version `1`.                                                            |
| Existing A/B native safety regression | PASS   | `native-smoke-20261017154824` retains different installations, trusted-origin protection for forged device ID, post-commit 503 idempotent replay, Push/Pull account isolation and B-only conflict projection. |

Artifacts (ignored, non-secret test evidence):

- `.honsen-native-qa/native-smoke-20261017154749-pull-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261017154749-pull-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017154749-server-sync.test.jsonl`
- `test-results/native-smoke-20261017154749-{client,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261017154824.test.json` and `.honsen-native-qa/native-smoke-20261017154824-server-sync.test.jsonl`

Focused checks: `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --bin HonsenProcure`, `cargo check --release --bin HonsenProcure`, and server `npm run lint` / `npm run typecheck` all PASS. The scoped disposable Compose projects were removed with their volumes; no production database or pre-existing E2E data was opened or deleted.

**This adds the required native Pull-fault/restart cursor evidence but is not independent Fixer acceptance. T10-SEC-001, P1 and Formal remain OPEN; RFQ/Formal native and broader offline/reconnect cases remain outstanding.**

## Independent Fixer recheck: Native Pull recovery — 2026-10-17

Baseline rechecked: actual HEAD is `bc80b09e303d09e338a629736dbbc783cbc940f0`, and `git merge-base --is-ancestor bc80b09 HEAD` returned 0. The only untracked path before and after execution is the deliberately ignored `.honsen-native-qa/` evidence directory; no application code changed in this recheck.

The Fixer independently ran the two required native commands against fresh disposable PostgreSQL/Fastify HTTPS instances. Both commands build and execute the real debug `HonsenProcure.exe`, use newly seeded absolute SQLite test profiles and Windows Credential Manager, and use an ephemeral test-profile CA. They are not HTTP-client, Mock, Playwright, or renderer tests.

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-recovery
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode ab-sync-security
```

| Item                                            | Result | Independent evidence                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test-only fault boundary                        | PASS   | `native-test-server.ts` returns one 503 only when `HONSEN_PROCURE_TEST_FAIL_FIRST_PULL_RESPONSE=1`; it does not write profile SQLite. Release `cargo check --release --bin HonsenProcure` passes with the debug-only smoke entry unavailable.                                                            |
| First real Pull and cursor preservation         | PASS   | `native-smoke-20261017155533` records `pullFailure=PASS`, zero projected changes and cursor `0→0`; sanitized HTTPS JSONL records `GET /api/sync/pull`, cursor `0`, status `503`, `injectedTransportFault=true`.                                                                                          |
| Actual EXE exit / restart, not in-process reuse | PASS   | The script synchronously invokes `HonsenProcure.exe` once, fails on any nonzero exit, then invokes it a second time only after the first result file is read. The second result uses the same profile/account/installation, starts at cursor `0`, projects exactly one remote entity and persists `0→1`. |
| Real replay without duplicate/rollback          | PASS   | The third production Pull is recorded at cursor `1`; the recovered result requires zero new projections and cursor `1→1` while the entity remains server version 1.                                                                                                                                      |
| Existing A/B safety assertions                  | PASS   | Fresh `native-smoke-20261017155623` records different A/B installations, forged A device ID different from trusted A origin, same-event post-commit 503 replay, B trusted conflict origin, exactly one B SQLite conflict and zero A conflicts.                                                           |
| Focused release/server guards                   | PASS   | `cargo fmt --check`, release `cargo check --bin HonsenProcure`, server lint and server typecheck all pass. The release check has only pre-existing debug-test unused-symbol warnings.                                                                                                                    |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017155533-pull-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261017155533-pull-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017155533-server-sync.test.jsonl`
- `test-results/native-smoke-20261017155533-{client,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261017155623.test.json`
- `.honsen-native-qa/native-smoke-20261017155623-server-sync.test.jsonl`
- `test-results/native-smoke-20261017155623-{client,server,server-error,compose,compose-error}.log`

The per-run test containers and loopback listeners were absent after completion. No production database, pre-existing E2E profile, production TLS/keyring policy, push, merge or deployment was used.

**NATIVE-003 is independently verified for this bounded Pull-fault/restart scenario. T10-SEC-001, P1 and Formal remain OPEN: this is not complete T10 acceptance, and RFQ/Formal plus remaining offline/reconnect variants are still unexecuted.**

## Native offline edit / Push recovery — 2026-10-17

The native harness now has one additional debug/test-profile-only `offline-push-recovery` mode. It deliberately executes three separate real `HonsenProcure.exe` process phases: an online A baseline Pull, an EXE that waits until the script has stopped the isolated loopback Fastify HTTPS process before creating a requisition draft and attempting production Push, and a new EXE after that HTTPS host restarts. The test code calls the same `save_requisition_draft`, `push_pending_https` and `pull_sync_https` Rust production functions; its only new desktop accessors are debug-only read-only checks for outbox acknowledgement and local order status. No test directly writes SQLite, sends an independent HTTP request, or mocks a sync response.

The fresh full run used a new disposable PostgreSQL/Fastify HTTPS instance and `native-smoke-20261017161207` profile. The runner verified that port 3443 was no longer listening before releasing the offline EXE. The same A profile and installation then crossed the restart boundary.

| Step                      | Result | Evidence                                                                                                                                                                                                  |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Online A baseline         | PASS   | Real HTTPS Pull applied 0 at cursor `0`; baseline account/installation are recorded in the offline result.                                                                                                |
| Offline business mutation | PASS   | Real Rust draft save leaves local purchase order status `draft` and exactly one pending `purchase_order` outbox event.                                                                                    |
| Disconnected Push         | PASS   | With the loopback HTTPS host stopped, production Push returns `SyncTransport`; event remains unacknowledged/pending `1`, cursor stays `0`.                                                                |
| Exit/restart retention    | PASS   | A new real EXE on the same profile retains the exact event, local draft and pending count.                                                                                                                |
| Reconnected Push/replay   | PASS   | Real Push accepts one event then reports pending `0`; a second Push sends no event. Sanitized server JSONL contains exactly one accepted POST for the event, trusted A account and original installation. |
| Authoritative Pull        | PASS   | Real Pull projects one change, local status remains `draft`, remote version is 1 and cursor advances `0→1`.                                                                                               |
| Existing A/B regression   | PASS   | Fresh `native-smoke-20261017161438` retains independent installations, forged-device trusted origin, post-commit replay, account isolation and B-only conflict checks.                                    |

Reproducible command (the current interactive PowerShell command remains supported):

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode offline-push-recovery
```

Evidence:

- `.honsen-native-qa/native-smoke-20261017161207-offline-push.test.json`
- `.honsen-native-qa/native-smoke-20261017161207-offline-push-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017161207-server-sync.test.jsonl`
- `test-results/native-smoke-20261017161207-{client,client-error,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261017161438.test.json`

Focused quality checks: Rust `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server lint and server typecheck PASS. Existing debug-only unused-symbol warnings remain in the release check. The two early harness-only attempts are not acceptance evidence: a WSL Compose health race and then a quoted server restart argument were diagnosed; after the minimal harness correction, the fresh run above passed. All temporary Compose projects were removed with their scoped volumes; no production database, existing E2E data, production TLS/keyring policy, push, merge or deployment was touched.

**NATIVE-004 is ready for independent Fixer recheck. T10-SEC-001, P1 and Formal remain OPEN; this is only the offline-edit/Push-recovery slice, not complete native T10 acceptance.**

## Independent Fixer recheck: NATIVE-004 — 2026-10-17

Reviewed baseline: actual `HEAD` was `b16f3061ce28d43b2b82ff8cbdd4f6d59c1ae91e`; `git merge-base --is-ancestor b16f306 HEAD` returned 0. Before the rerun, the only worktree entry was the preserved ignored `.honsen-native-qa/` evidence directory. The Fixer made no business-code change.

The Fixer independently executed the real native scenario using a fresh disposable PostgreSQL/Fastify HTTPS instance, a newly generated test-profile certificate, a new absolute SQLite profile and Windows Credential Manager:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode offline-push-recovery
```

Fresh run `native-smoke-20261017161819` completed successfully. It builds and starts the debug `HonsenProcure.exe` twice; it is neither a standalone HTTP client nor a Mock/Playwright result. The actual loopback HTTPS process is stopped before the first EXE creates its draft, then a second EXE opens the same profile only after the HTTPS service is restarted.

| Boundary                                     | Result | Fresh evidence                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile/session continuity                   | PASS   | Offline and recovered results have the same A account, installation, profile path, entity and event UUIDs.                                                                                                                                                                                                                                          |
| Offline SQLite mutation and failed Push      | PASS   | The first real EXE records local `draft`, outbox pending `1→1`, cursor `0→0`, and Rust `SyncTransport` after the script confirmed port 3443 was unavailable. The debug-only read-only rusqlite assertions check the actual local order/outbox; no direct SQLite write exists in the harness.                                                        |
| Process exit/restart retention               | PASS   | The recovery phase is a new EXE process and requires the same pending event/local draft before any Push.                                                                                                                                                                                                                                            |
| Recovered Push and idempotency               | PASS   | The recovery EXE acknowledges the retained event (`1→0`); its second production Push sends no event. Sanitized server JSONL contains exactly one HTTP 200 Push for that event.                                                                                                                                                                      |
| Trusted server event / authority convergence | PASS   | The sole server event records A's matching account and installation, `accepted` version 1; real Pull projects one change, keeps local `draft`, and persists cursor `0→1`.                                                                                                                                                                           |
| Test-only and release boundary               | PASS   | `HONSEN_PROCURE_TEST_FAIL_FIRST_{PUSH,PULL}_RESPONSE` is read only by `apps/server/src/scripts/native-test-server.ts`; this mode sets both to `0` and obtains its offline failure by stopping the isolated host. The native test entry and state accessors are `debug_assertions`-only; release `cargo check --release --bin HonsenProcure` passes. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017161819-offline-push.test.json`
- `.honsen-native-qa/native-smoke-20261017161819-offline-push-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261017161819-server-sync.test.jsonl`
- `test-results/native-offline-push-fixer-20261017161818.{log,error.log}`

Independent focused verification: `cargo test --lib` PASS (55/55), `cargo check --release --bin HonsenProcure` PASS, `git diff --check` PASS. The release check has existing debug-test unused-symbol warnings. No listener or native Compose project remained after the run. The host lacks a standalone SQLite CLI, so SQLite file state was validated through the real EXE's debug-only read-only rusqlite checks plus the phase result files, not claimed as an external CLI inspection.

**NATIVE-004 is independently CLOSED for this bounded offline draft/Push recovery scenario. T10-SEC-001, P1 and Formal remain OPEN: this does not cover all reconnect failure forms or RFQ/Formal native workflows, and is not complete T10 acceptance.**

## Native Push partial-success batch — 2026-10-17

### T10 reliability matrix

| Failure boundary                                         | Native evidence                                                                                    | Status                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| Request cannot reach service before Push                 | NATIVE-004: actual loopback HTTPS host stopped; retained draft/outbox then restart recovery.       | COVERED                         |
| Service commits but Push response is lost                | NATIVE-002: test-host post-commit 503 and same-event replay.                                       | COVERED                         |
| One Push batch has accepted and conflict results         | NATIVE-005 independently closed.                                                                   | COVERED                         |
| First Pull transport failure / restart                   | NATIVE-003: 503, cursor unchanged, process restart, one projection.                                | COVERED                         |
| Pull after a full 500-change page then transport failure | NATIVE-006 independently closed.                                                                   | COVERED                         |
| Local cursor persistence write fails                     | Atomic SQLite unit coverage exists; no sanctioned real-disk fault injection in the native harness. | NOT COVERED                     |
| EXE terminates during an in-flight request               | Not covered; existing tests terminate only after a completed failed/successful operation boundary. | NOT COVERED                     |
| Duplicate-event idempotency                              | NATIVE-002/NATIVE-004 cover accepted replay; NATIVE-005 covers retained conflict replay.           | COVERED for these bounded forms |

The selected smallest high-risk gap is partial Push acknowledgement: the protocol permits a batch to contain safe accepted and retained conflict results, and the client must never acknowledge every local event merely because the HTTP request returned 200.

The first RED run added only the `push-partial-batch` test-script mode and invoked the real EXE. Fresh `native-smoke-20261017162327` failed at the pre-existing production test-mode whitelist with `unknown native smoke mode`; no business action ran. This proves the new scenario was not inherited from a prior native PASS. The subsequent narrow implementation is debug/test-profile-only: it opens the existing second profile, uses production `save_requisition_draft`, `push_pending_https` and `pull_sync_https`, and adds test-server diagnostics for all event IDs in an already-real Fastify Push request. Production sync code, TLS, session/installation checks, SQLite transaction behavior and server result semantics are unchanged.

Fresh real-native GREEN command:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode push-partial-batch
```

Fresh run `native-smoke-20261017162543` builds/runs real debug `HonsenProcure.exe`, isolated PostgreSQL, Fastify HTTPS, two newly seeded absolute SQLite profiles and Windows Credential Manager. A first A event establishes server version 1. Purchaser B then creates a valid new draft followed by a stale copy of A's entity, and sends both with one real production Push request.

| Assertion                           | Result | Fresh evidence                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partial server result is genuine    | PASS   | The one B Push request has two event IDs; Fastify's actual SyncService response is `accepted@1` for B's new order and `conflict@1` for B's stale event.                                                                                                                           |
| Client acknowledgement is selective | PASS   | Real Rust result is accepted `1`, pending `1`; debug-only read-only checks require the accepted outbox record acknowledged and the conflict record unacknowledged.                                                                                                                |
| Pull preserves conflict evidence    | PASS   | B's real Pull applies two remote changes, cursor `0→2`, projects the accepted order at version 1 and creates exactly one local conflict for the stale event.                                                                                                                      |
| Retained conflict replay            | PASS   | A repeated production Push sends only the stale event and returns accepted `0`, pending `1`; it is not silently discarded.                                                                                                                                                        |
| Test/release boundary and cleanup   | PASS   | No fault-response variable is enabled; the test uses service validation, not a response Mock. `cargo check --release --bin HonsenProcure` passes and release smoke entry returns unavailable. The disposable Compose project and loopback listeners were absent after completion. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017162327.test.json` and `test-results/native-push-partial-red-20261017162327-{log,error.log}` (expected RED)
- `.honsen-native-qa/native-smoke-20261017162543-push-partial-batch.test.json`
- `.honsen-native-qa/native-smoke-20261017162543-server-sync.test.jsonl`
- `test-results/native-push-partial-green-20261017162542.{log,error.log}`
- `test-results/native-smoke-20261017162543-{client,server,server-error,compose,compose-error}.log`

Focused checks: Rust `cargo fmt --check`, `cargo test --lib` (55/55), debug and release `cargo check --bin HonsenProcure`, server lint/typecheck and `git diff --check` PASS. Existing debug-only release warnings remain. No production database, existing E2E data, production TLS/keyring policy, push, merge or deployment was touched.

**NATIVE-005 is READY_FOR_RECHECK. T10-SEC-001, P1 and Formal remain OPEN; full-page Pull interruption, durable-cursor write failure, in-flight termination and RFQ/Formal native flows remain outside this one slice.**

## Independent Fixer recheck: NATIVE-005 — 2026-10-17

Baseline checked: actual `HEAD` was `ae1bfc9c336ad91e068bf4e15895314eeeb5a901`; `git merge-base --is-ancestor ae1bfc9 HEAD` returned 0. The only pre-existing worktree path was the preserved ignored `.honsen-native-qa/` evidence directory. Code review confirms `eventIds` is appended only to the test-only Fastify `.test.jsonl` diagnostic; it does not enter SyncService, authentication, acknowledgement or persistence decisions. The original RED evidence is a missing debug smoke-mode registration (`unknown native smoke mode`), not a business failure.

The Fixer independently used a new disposable PostgreSQL/Fastify HTTPS instance, a newly generated test-profile certificate, new A/B absolute SQLite profiles, Windows Credential Manager and real debug `HonsenProcure.exe`:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode push-partial-batch
```

Fresh run `native-smoke-20261017162947` completed without using the Builder's prior result. The native result contains distinct profiles and B installation `5b3239a9-c8cd-44e2-bc2f-5b7c651f1fff`; server/client error logs are zero bytes and no loopback listener or Compose project remained after cleanup.

| Boundary                                       | Result | Independent evidence                                                                                                                                       |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A establishes authoritative remote record      | PASS   | First A Push event `08ed1564-8f42-47f3-a71f-e6ae29770a74` is accepted at server version 1.                                                                 |
| One real B batch contains two different events | PASS   | The single B POST contains `00699ad8-4fc2-46c5-ae04-637cb4a99a92` and `8500243f-ed29-415b-b551-22a434a59778`.                                              |
| Actual mixed server response                   | PASS   | Fastify JSONL records HTTP 200 with the first event `accepted@1` and the second `conflict@1`; no fault-response variable was enabled.                      |
| Selective outbox acknowledgement               | PASS   | Real Rust result is accepted `1`, pending `1`; debug-only read-only rusqlite checks require accepted acknowledged and conflict unacknowledged.             |
| Authoritative Pull and cursor                  | PASS   | Real Pull applies 2 changes and persists B cursor `0→2`; it retains exactly one local conflict.                                                            |
| Conflict-only replay                           | PASS   | The final POST has only `8500243f-ed29-415b-b551-22a434a59778`, returns conflict, and reports accepted `0`, pending `1`; the accepted event is not resent. |
| Release/test boundary                          | PASS   | Release `cargo check --release --bin HonsenProcure` passes; test entry is unavailable outside `debug_assertions`.                                          |

Artifacts:

- `.honsen-native-qa/native-smoke-20261017162947-push-partial-batch.test.json`
- `.honsen-native-qa/native-smoke-20261017162947-server-sync.test.jsonl`
- `test-results/native-push-partial-fixer-20261017162946.{log,error.log}`
- `test-results/native-smoke-20261017162947-{client,server,server-error,compose,compose-error}.log`

Fresh focused checks: `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server lint/typecheck and `git diff --check` PASS. Existing debug-test unused-symbol warnings remain in the release check. No Mock, Playwright, standalone HTTP client, production database, existing E2E data, production TLS/keyring policy, push, merge or deployment was used.

**NATIVE-005 is independently CLOSED for the bounded partial-Push scenario. T10-SEC-001, P1 and Formal remain OPEN: full-page Pull interruption, cursor-write fault, in-flight process termination and RFQ/Formal native workflows remain unverified.**

## Native second-page Pull interruption / restart — 2026-10-18

NATIVE-006 adds only a debug/test-profile entry, read-only SQLite state accessors, and a test-only Fastify `onSend` fault boundary. It does not alter `pull_sync_https`, SQLite projection, cursor handling, authentication, TLS, credential-vault naming, or production server behavior. The new mode invokes the existing production Rust `save_requisition_draft`, `push_pending_https`, and `pull_sync_https` functions through real `HonsenProcure.exe` processes. No test writes SQLite directly or substitutes an HTTP client.

The RED run `native-smoke-20261018010204` added only the test-script mode and failed at the existing native-mode whitelist (`unknown native smoke mode`) before any business action. The earlier `native-smoke-20261018010115` did not reach a native process because the disposable WSL PostgreSQL loopback startup timed out; it is environment evidence only, not acceptance evidence.

Fresh run:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-page-recovery
```

`native-smoke-20261018010425` used a new disposable PostgreSQL/Fastify HTTPS host, generated test certificate, two absolute test SQLite profiles, and Windows Credential Manager. A real B EXE created 501 purchase-order drafts and production Push accepted all 501 with no retained outbox row. A separate real A EXE used production Pull: the first HTTP page at cursor `0` returned 500 changes/next cursor `500` and committed 500 local remote entities. The test host then returned its single 503 only for A's real second request at cursor `500`; the production Pull returned `SyncTransport`, while the already committed boundary remained cursor `500`, projection count 500, and A outbox 0. That EXE exited. A new A EXE using exactly the same profile/installation recovered over HTTPS, projected the final one change and persisted cursor `500→501`; a final Pull returned 0 changes and left both cursor and local entity count at 501.

| Boundary                                 | Result | Evidence                                                                                                                                        |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| B production creation/Push of 501 events | PASS   | B account `...0013`, distinct installation/profile; accepted `501`, pending outbox `0`.                                                         |
| A page 1 production Pull                 | PASS   | HTTPS GET `cursor=0`: 200, 500 changes, next cursor `500`; local cursor/projection `0→500`.                                                     |
| A page 2 deterministic transport fault   | PASS   | HTTPS GET `cursor=500`: one test-host 503; Rust `SyncTransport`; local cursor/projection remain `500`/500.                                      |
| Same-profile A EXE restart/recovery      | PASS   | HTTPS GET `cursor=500`: 200, one change, next cursor `501`; local cursor `500→501`, 501 entities.                                               |
| Replay                                   | PASS   | HTTPS GET `cursor=501`: 200, zero changes, cursor/entity count remain 501.                                                                      |
| Outbox and partial commit safety         | PASS   | A outbox is 0 before/after interruption/recovery; page 1 is the established production transaction boundary, not a speculative rollback target. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261018010425-pull-page-producer.test.json`
- `.honsen-native-qa/native-smoke-20261018010425-pull-page-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261018010425-pull-page-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261018010425-server-sync.test.jsonl`
- `test-results/native-pull-page-green-20261018011200.{log,error.log}`
- `test-results/native-smoke-20261018010425-{client,server,server-error,compose,compose-error}.log`

Focused checks: Rust `cargo fmt --check` and `cargo test --lib` (55/55), server lint/typecheck and `git diff --check` PASS. The release guard is run with the final implementation before checkpoint. No production database, pre-existing E2E data, production TLS/keyring policy, push, merge or deployment was touched; scoped Compose resources and loopback listeners were absent after the run.

**NATIVE-006 is READY_FOR_RECHECK. T10-SEC-001, P1 and Formal remain OPEN. This slice does not cover durable-cursor write faults, abrupt EXE termination in-flight, or RFQ/Formal native workflows.**

## Independent Fixer recheck: NATIVE-006 — 2026-10-18

Baseline checked: actual `HEAD` was `1a5d71960507c5adc48b4bddd1bf84e016b07b77`; `git merge-base --is-ancestor 1a5d719 HEAD` returned 0. The only pre-existing worktree artifact was the ignored native-evidence directory. The Fixer made no application-code change.

Fresh independent execution:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode pull-page-recovery
```

Fresh run `native-smoke-20261018112034` started the real debug `HonsenProcure.exe` three times with a new disposable PostgreSQL/Fastify HTTPS endpoint, generated test certificate, new A/B absolute SQLite profiles, and Windows Credential Manager. It is not a standalone HTTP, Mock, Playwright, or prior-result replay.

| Check                    | Result | Fresh evidence                                                                                                                                                                                                   |
| ------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B production Push        | PASS   | B account `...0013` accepted 501 real outbox events, pending 0; JSONL has six accepted Push batches totaling 501 events.                                                                                         |
| A page 1                 | PASS   | HTTPS GET `cursor=0` returned 200 / 500 changes / next `500`; A durable cursor and projections are both 500.                                                                                                     |
| A page 2 fault           | PASS   | Actual HTTPS GET `cursor=500` received the only injected 503; Rust returned `SyncTransport`, while A remains cursor 500, 500 projected, outbox 0.                                                                |
| A restart recovery       | PASS   | New A EXE retains the same profile and installation, then GET `cursor=500` projects 1 / advances to 501.                                                                                                         |
| Replay                   | PASS   | GET `cursor=501` returns zero changes; cursor and entity count both remain 501.                                                                                                                                  |
| Production safety guards | PASS   | Fault env is consumed only by `native-test-server.ts`; test entry/accessors are `debug_assertions`; release build uses the fail-closed smoke implementation. Cursor/account/projection assertions remain strict. |

Fresh quality checks: Rust `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server lint/typecheck and `git diff --check` PASS. Release check reports only the existing debug-test unused-symbol warnings. The scoped Compose project was removed; ports 3443/54329 had no listener afterward.

Artifacts:

- `.honsen-native-qa/native-smoke-20261018112034-pull-page-producer.test.json`
- `.honsen-native-qa/native-smoke-20261018112034-pull-page-interrupted.test.json`
- `.honsen-native-qa/native-smoke-20261018112034-pull-page-recovered.test.json`
- `.honsen-native-qa/native-smoke-20261018112034-server-sync.test.jsonl`
- `test-results/native-pull-page-fixer-20261018012000.{log,error.log}`
- `test-results/native-smoke-20261018112034-{client,server,server-error,compose,compose-error}.log`

**NATIVE-006 is independently CLOSED for this bounded paged-Pull interruption/restart scenario. T10-SEC-001, P1 and Formal remain OPEN: this does not cover cursor-write faults, in-flight EXE termination, or RFQ/Formal native workflows.**

## Native Cursor-write failure / transaction recovery — 2026-10-18

NATIVE-007 audits `LocalAuthService::apply_sync_pull_page_for_account`: remote entity/conflict projection, staged business projection, the account-scoped cursor upsert, and `transaction.commit()` all occur in one SQLite transaction. The test-only debug hook is placed immediately before that production cursor upsert and performs one intentionally invalid cursor-state insert (`last_pull_cursor = NULL`), so SQLite rejects the write and drops the uncommitted transaction. It is compiled only under `debug_assertions`; the release smoke function is fail-closed.

Fresh native execution:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode cursor-write-recovery
```

Run `native-smoke-20261018112716` used a new disposable PostgreSQL/Fastify HTTPS endpoint, generated test certificate, Windows Credential Manager, and distinct A/B absolute test SQLite profiles. A real B `HonsenProcure.exe` created the source requisition and production Push accepted exactly one event. A first real A EXE received the actual HTTPS Pull page `cursor=0`, then the cursor-boundary injection fired; Rust returned `AuthError::Database`, while read-only native checks report cursor `0→0`, remote projection `0→0`, and pending outbox `0`. That EXE exited. A second real A EXE with the same profile and installation performed production Pull, projected one event and persisted cursor `0→1`; its replay Pull projected zero and left cursor/entity count at `1`.

| Boundary                         | Result | Evidence                                                                                                                                                  |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B production source event        | PASS   | One accepted production Push; B account/profile/installation differ from A.                                                                               |
| A cursor-write failure           | PASS   | Real HTTPS `GET cursor=0` completed; debug hook confirms it triggered; Rust result is `Database`.                                                         |
| Atomicity                        | PASS   | Before/after failure: A cursor 0, projected entities 0, pending outbox 0. Cursor cannot be ahead of durable projection.                                   |
| Same-profile EXE restart         | PASS   | New A EXE pulls one event/cursor `0→1`; no SQL file mutation or test HTTP client is used.                                                                 |
| Replay stability                 | PASS   | HTTPS `GET cursor=1` returns zero changes; cursor and entity count stay 1.                                                                                |
| Release/test boundary            | PASS   | `cargo check --release` compiles no injection state and resolves the native test entry to fail-closed.                                                    |
| Existing A/B security regression | PASS   | Fresh `native-smoke-20261018112931` retains separate installations, trusted forged-device origin, account/conflict isolation and Push replay idempotency. |

Artifacts:

- `.honsen-native-qa/native-smoke-20261018112716-cursor-write-{producer,fault,recovered}.test.json`
- `.honsen-native-qa/native-smoke-20261018112716-server-sync.test.jsonl`
- `test-results/native-smoke-20261018112716-{client,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261018112931.test.json`
- `test-results/native-smoke-20261018112931-{client,server,server-error,compose,compose-error}.log`

Focused checks: `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release`, server lint/typecheck, both native commands, and `git diff --check` PASS. Release check has only pre-existing debug-test unused-symbol warnings. No production database, existing E2E data, production TLS/keyring/authentication setting, push, merge or deployment was touched.

**NATIVE-007 is READY_FOR_RECHECK. T10-SEC-001, P1 and Formal remain OPEN. In-flight process termination during a sync transaction and RFQ/Formal native workflows remain unverified.**

## Independent Fixer recheck: NATIVE-007 — 2026-10-18

Baseline checked: actual `HEAD` was `c90480fb1ec0507e2b084d1fd806a5fae423fc72`; `git merge-base --is-ancestor c90480f HEAD` returned 0. The only pre-existing worktree artifact was the ignored native-evidence directory. The Fixer made no application-code change.

Fresh independent commands:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode cursor-write-recovery
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1 -Mode ab-sync-security
```

`native-smoke-20261018114610` created a fresh disposable PostgreSQL/Fastify HTTPS endpoint, generated local certificate, two new absolute SQLite profiles, and used Windows Credential Manager plus three separate real debug `HonsenProcure.exe` processes. B's production draft/Push made one accepted event (trusted B installation). A's first real `GET /api/sync/pull?cursor=0` completed with one change, then the debug-only transaction-internal NOT NULL write fired immediately before the production cursor upsert. The native fault result records `faultTriggered=true`, `AuthError::Database`, cursor `0→0`, projection `0→0`, outbox `0`. The original A EXE exited; a separate A EXE using exactly that A profile/installation pulled the event once/cursor `0→1`, then replayed zero changes/cursor `1→1`.

| Check                                 | Result | Fresh evidence                                                                                                                                              |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B real Push creates source            | PASS   | One server HTTP 200 `accepted@1`, B account `...0013`, B installation `b580e5c5-…`.                                                                         |
| A real Pull + Cursor-boundary fault   | PASS   | Two actual HTTPS GETs at cursor 0; fault result records `faultTriggered=true` and complete transaction rollback.                                            |
| Atomic Cursor/projection/outbox state | PASS   | At failure, Cursor 0, remote entities 0, A outbox 0; no Cursor advance or partial projection.                                                               |
| Exit / same-profile restart recovery  | PASS   | New A EXE retains installation `6a622c7d-…`, projects exactly 1 and advances 0→1.                                                                           |
| Replay                                | PASS   | GET cursor 1 returns zero; Cursor and entity count stay 1.                                                                                                  |
| A/B security regression               | PASS   | Fresh `native-smoke-20261018114720`: separate installations, forged-device trusted origin, account/conflict isolation and Push replay idempotency all PASS. |
| Production-release guard              | PASS   | `cargo check --release --bin HonsenProcure` compiles the non-debug fail-closed smoke function; injection fields/methods are `cfg(debug_assertions)`.        |

Artifacts:

- `.honsen-native-qa/native-smoke-20261018114610-cursor-write-{producer,fault,recovered}.test.json`
- `.honsen-native-qa/native-smoke-20261018114610-server-sync.test.jsonl`
- `test-results/native-smoke-20261018114610-{client,server,server-error,compose,compose-error}.log`
- `.honsen-native-qa/native-smoke-20261018114720.test.json`
- `test-results/native-smoke-20261018114720-{client,server,server-error,compose,compose-error}.log`

Fresh focused checks: `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, server lint/typecheck and `git diff --check` PASS. Release output contains only existing debug-test unused-symbol warnings. No Mock, standalone HTTP client, Playwright, direct SQLite edit, production database, existing E2E data, production TLS/keyring/authentication policy, push, merge or deployment was used.

**NATIVE-007 is independently CLOSED for the bounded Cursor-write failure/restart transaction scenario. T10-SEC-001, P1 and Formal remain OPEN: abrupt process termination while a transaction is in-flight and RFQ/Formal native workflows remain unverified.**

## NATIVE-008 Push in-flight termination — 2026-10-18

Fresh real-EXE pre-commit run `native-smoke-20261018115151` reached a test-host `preHandler` barrier, forcibly terminated the recorded EXE PID, then released the host; it emitted 499 and no server event. Same profile/installation/event ID restart accepted once, cleared Outbox and Pull projected once. Fresh post-commit run `native-smoke-20261018115314` reached `onSend` after commit/before ACK, forcibly terminated PID `40376`, then restarted same profile/event ID; server idempotency accepted no duplicate, Outbox cleared and Pull projected once. Barriers require absolute `.signal` paths, the loopback test DB, and are absent from production server/release. Rust 55/55, fmt, release check and server lint/typecheck PASS. **NATIVE-008 READY_FOR_RECHECK; T10-SEC-001/P1/Formal OPEN.**

## Independent Fixer final NATIVE-008 recheck — 2026-10-18

Actual independent QA `HEAD` is `03f432ab102b42d2b41e5b2a546b57c5e74f7762`; `git merge-base --is-ancestor 03f432a HEAD` and the corresponding check for tested implementation `29f2bd2d45b958b5dd71b2633ade365b539e3308` both pass. The only pre-existing worktree artifact is the ignored `.honsen-native-qa/` evidence directory.

Code review confirms `rejects socket close after response completion` emits the actual underlying socket `close` to the production Harness observer with the barrier still held and `responseCompleted=true`; its accepted state stays absent. That state and Promise resolution occur in the same single accepted branch, so the cancellation Promise cannot resolve and no accepted cancellation timestamp can exist. The rejected observation retains its diagnostic callback timestamp. The test uses no fixed sleep and calls `dispose()` to remove listeners. Existing protection still excludes `IncomingMessage.close`, rejects socket close after barrier release, accepts only held-barrier/incomplete-response `aborted` or socket-close events, and `waitForPushBarrier` fails closed after 10 seconds.

Fresh `npx vitest run src/scripts/native-push-cancellation.test.ts` is 2/2 PASS. Registered Harness mode is `push-termination-recovery`. Independent real EXE A run `native-smoke-20261018151230` force-killed PID `29296`: event `8be3c1e6-2bfe-4a17-a9b9-9bf9310175ec`, socket-close `15:12:45.958Z` before release `15:12:45.985Z`, held at observation, `responseCompleted=false`, `socketDestroyed=true`, handler=false, isolated PostgreSQL `0/0/0→1/1/1`; same profile/installation/event restart yields Outbox `1→0`, Pull `0→1`, replay 0. Independent B `native-smoke-20261018151430` force-killed PID `30068`: event `8b74f214-e245-4cce-80bf-cda431dea9f3`, socket-close `15:13:24.647Z` before release `15:13:24.677Z`, held/response incomplete/socket destroyed, handler=true, PostgreSQL `1/1/1→1/1/1`; same profile/installation/event recovery has Outbox `1→0`, Pull `0→1`, replay 0. JSON/JSONL evidence is retained beneath `.honsen-native-qa/`.

`npm run lint`, `npm run typecheck`, `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, and `git diff --check` pass; release output has only existing unused-symbol warnings. C: retained about 0.86 GB free. **NATIVE-008 is independently CLOSED. T10-SEC-001, P1 and Formal remain OPEN.**

## NATIVE-008 Integration Owner completed-response socket-close regression — 2026-10-18

Actual checkout began at QA `HEAD` `8d0cf1bc8deb80f77e0b774893f78e7330ac81b9`, which contains tested repair `29f2bd2d45b958b5dd71b2633ade365b539e3308`. The only code change is test-host cancellation-observer visibility and cleanup plus the explicitly named test `rejects socket close after response completion`. It creates the production observer, keeps the barrier held, sets `responseCompleted=true`, emits the underlying socket `close`, and asserts the listener produces only `accepted=false`, leaves the accepted-cancellation state (and therefore its accepted `cancellationObservedAt` and Promise resolution) absent, and removes its remaining listeners. It does not use a timed non-resolution guess or change the production acceptance condition.

Fresh `npx vitest run src/scripts/native-push-cancellation.test.ts` passes 2/2. Harness mode was read from its `ValidateSet`: `push-termination-recovery`. Fresh real EXE A run `native-smoke-20261018144530` force-killed PID `39252`: event `50248770-9f39-44e0-a0f3-5b19dfb5efdc`, same profile/installation on restart, observed `socket-close` at `14:44:58.164Z` while held (`barrierReleasedAt=null`), `responseCompleted=false`, `socketDestroyed=true`, handler=false; the authoritative isolated-PostgreSQL snapshot is `0/0/0` before recovery and `1/1/1` after. Outbox is `1→0`, Pull is `0→1`, replay is 0. Fresh B run `native-smoke-20261018144700` force-killed PID `34564`: event `9ae08a4b-4da3-41de-99c9-1a402dfab9e6`, same profile/installation, socket-close at `14:45:36.952Z` before release at `14:45:36.982Z`, `responseCompleted=false`, `socketDestroyed=true`, handler=true; PostgreSQL remains `1/1/1→1/1/1`, Outbox `1→0`, Pull `0→1`, replay 0. JSON/JSONL evidence remains under `.honsen-native-qa/` for both run IDs.

`npm run lint`, `npm run typecheck`, `cargo fmt --check`, `cargo test --lib` (55/55), `cargo check --release --bin HonsenProcure`, and `git diff --check` pass. C: had about 0.86 GB free; no evidence or worktree was removed. Release emits only existing unused-symbol warnings. **NATIVE-008 READY_FOR_RECHECK. T10-SEC-001, P1 and Formal remain OPEN.**

## Windows Credential Manager backend repair — 2026-10-17

Root cause: desktop declared `keyring = "3.6.3"` with only its empty default feature set. Cargo therefore compiled keyring without `windows-native`; `cargo tree -e features -i keyring` showed no `windows-sys` or `byteorder` beneath keyring. That selected keyring's in-process mock credential implementation, which explains why a single `Entry` worked while a new Entry or process returned `NoEntry`.

The minimal repair is `keyring = { version = "3.6.3", features = ["windows-native"] }`. It retains the existing `account.service` target, Generic credential type, Enterprise persistence, username, production service names and token encoding; it only enables keyring's documented Windows Credential Manager backend. No Windows policy, TLS behavior, database, or authentication rule changed.

| Scenario                                     | Result                | Evidence                                                                                                                                                                                                      |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Win32 Generic, Enterprise persistence | PASS                  | Same-process and child-process `CredReadW` read the same SHA-256 digest after `CredWriteW`, Type=1, Persist=3, Win32 status=0.                                                                                |
| Direct Win32 keyring-shaped credential       | PASS                  | Exact UTF-16 blob, `account.service` target, UUID username and `keyring v3.6.3` comment pass same/cross-process read.                                                                                         |
| Direct Win32 LocalMachine control            | PASS                  | Persist=2 same/cross-process control also passes; no policy was changed or adopted by production code.                                                                                                        |
| Corrected keyring `vault-probe`              | PASS                  | New Entry reads both independent profile targets after write.                                                                                                                                                 |
| Real `HonsenProcure.exe` immediate readback  | PASS                  | `vault-readback` direct/reopened/wrapped write/read all pass.                                                                                                                                                 |
| Real EXE exit/restart readback               | PASS                  | One EXE writes a runtime-generated synthetic token; a second EXE reads it from the same absolute test profile; a third EXE deletes only that controlled target.                                               |
| A/B profile isolation harness                | BLOCKED / new failure | The existing real HTTPS harness now passes the former credential barrier but fails later at `account B conflict query did not contain only its own stale event`. No sync assertion is accepted from that run. |

Commands and evidence:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/invoke-windows-credential-readback.ps1 -Persist Enterprise -KeyringShape
cargo test --lib
cargo build --bin HonsenProcure --bin honsen-procure-test-profile
powershell -NoProfile -ExecutionPolicy Bypass -File tests/native/run-native-https-smoke.ps1
```

- Direct Win32: `test-results/windows-credential-api-20261017152337-{enterprise,local-machine}.json` and `test-results/windows-credential-api-keyring-shape-20261017152403.json`.
- Real immediate readback: `.honsen-native-qa/native-vault-fixed-20261017152532-exe.test.json`.
- Real restart boundary: `.honsen-native-qa/native-vault-restart-20261017152623-{write,read,clear}.test.json`.
- A/B native HTTPS run: `.honsen-native-qa/native-smoke-20261017152627.test.json`, with server/client/Compose logs in `test-results/native-smoke-20261017152627-*`.

Fresh Rust library validation passed 55/55; `cargo check --release --bin HonsenProcure` also passed after placing the pre-existing A/B smoke behind the same debug-only release guard as the vault entry. The native sync harness is not recorded as PASS because its conflict assertion failed after credentials were repaired. No token plaintext was written to SQLite, logs or ordinary files; direct Win32 evidence prints only controlled target metadata and token digests.

**T10-SEC-001, P1 and Formal remain OPEN.**
