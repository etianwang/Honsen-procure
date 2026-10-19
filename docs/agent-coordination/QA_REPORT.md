# Independent QA Report

## G1-QA-001-FIX2 independent recheck — 2026-10-19

**Independent verdict: PASS; G1-QA-001 CLOSED on candidate `13b22ff` for the bounded management401 cache-leak repair.** Independent Security QA `fix2_independent_qa` inspected the code, fresh logs and artifacts, ran its own read-only matching assertions (exit0), and explicitly authorized this defect's closure. No scoped correctness/security finding remains. This is not merge authorization or acceptance of main/management HEAD. G1 production conflict UI lifecycle remains separately OPEN/BLOCKED. NATIVE-008 CLOSED; G1, T10, T10-SEC-001, original P1 and Formal hold OPEN.

### Baselines and independence

- Management baseline: `e5e46362e51966d3fb3da1e040c42f866ff0a40e`; documentation checkpoint is the local commit containing this report, not a production integration.
- Tested QA HEAD: **`13b22ffe8aa294535f9036eda32d7cfc81f6481f`**, direct parent **`b0a6069e1439203fd9259b8cc3e619ac6eb70c2c`**; earlier implementation **`85d0565a5b695a94da7bd5aa861178bfcbc77a52`**. `b0a6069` independently failed management401; `13b22ff` builder PASS/READY was not closure.
- Fresh independent tree: `E:/Project/honsen-g1-fix2-independent-recheck`, branch `codex/qa-g1-fix2-recheck`, tracked-clean before and after tests. Native worktree creation initially succeeded on C:, but low disk space and unsupported cross-volume move required a separate E: Git worktree; the unused clean C: tree and every existing worktree/evidence directory were retained. No candidate code/test/schema changed. Cached dependency build outputs were copied into this tree only; Cargo rebuilt/relinked its own Rust tests and EXE. `npm ci`, Node24.18.0, unchanged lockfile; task-local E: temporary/cache directories.
- A fresh-context, read-only Independent Security QA reviewer (`fix2_independent_qa`) evaluated the source and fresh artifacts separately from the Integration Owner and returned PASS/CLOSED authority. No builder assertion or broad historical test result is treated as independent acceptance.
- This management branch lacked QA_REPORT/BUG_QUEUE at e5e46362. Historical reports are retained in immutable Git objects `b0a6069:docs/agent-coordination/QA_REPORT.md`, `13b22ff:docs/agent-coordination/QA_REPORT.md` and corresponding `BUG_QUEUE.md`; no historical record is replaced/deleted. Original artifacts remain in their recorded worktrees.

### Direct code boundary

Actual commands are `list_managed_authorizations`, `change_managed_authorization` (grant/revoke), `replace_managed_authorization`. GET/PUT/DELETE/PATCH capture the existing trusted `SyncRequest` account+generation/token before await, and only actual401 uses unchanged `reject_sync_session`. Current generation comparison, sticky closed permission, online-session removal and SQLite session DELETE share one connection lock; failure to DELETE cannot restore permission. Stale responses return `sync_account_boundary` without mutating B/A2. Context get/list/select and affected history/scope-cache reads validate permission under their query lock. Non401 business/transport errors do not revoke. No second invalidator, renderer identity trust, data/outbox/conflict cleanup or server trust-model change.

### Fresh directed checks

| Check                                                                                                       | Result / evidence                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib management_ -- --nocapture`             | PASS4/4: current401/context selection/source and data retention; stale B/A2; 400/403/409/500 no revoke; DELETE trigger failure retains row but denies sensitive reads. `.honsen-native-qa/fix2-independent-rust-management.log` in QA tree. |
| Same Cargo command with filter `rejected_sync_session`                                                      | PASS5/5: existing invalidator generation, fail-closed and reauthentication regressions. `fix2-independent-rust-session.log`.                                                                                                                |
| Server `src/auth/service.test.ts src/authorization/service.test.ts src/scripts/native-auth-barrier.test.ts` | PASS15/15; `fix2-independent-api.log`.                                                                                                                                                                                                      |
| Existing `run-native-https-smoke.ps1 -Mode g1-conflict-origin`                                              | PASS, fresh **`native-smoke-20261019115437`**, completed `2026-10-19T11:57:28.912Z`; Harness PID7240, EXE PIDs3428/13116. Real WebView2/Tauri/Rust, SQLite, Credential Manager, Fastify HTTPS, disposable WSL2 PostgreSQL.                  |

EXE SHA256: `803098A2523F665508D99AD0524F2195897AC1EE1940894B55DC1DFFD2A6F9BA`. The driver uses production commands, not Mock IPC or a substitute sync client. Only initial synthetic account/scope setup writes PostgreSQL; its SQLite evidence access is read-only. Revocation is caused by normal second login, not manual session deletion. Docker29.9.0/Compose5.6.0/Buildx0.38.0 run as normal WSL user `honsen-dev`.

### Real current401 matching

Tested profile installation `539d6a97-1628-4aa0-b014-5c2f910024e3`; target account ends `0012`. Each command is the first rejection observed after its session was revoked. Before each request the local contexts and real nonempty conflict list are usable.

| HTTP / command  | Request  | Matched rejected session               | Local result immediately after401                                                                                                     |
| --------------- | -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET / list      | `req-29` | `9c87be50-c222-426d-9d44-e00c4fac9458` | Context get/list, known scope selection, conflict list and known-ID resolution all `reauthentication_required`; sourceDisclosed=false |
| PUT / grant     | `req-2f` | `d68b049e-c699-4c91-8ed5-33ff9340980d` | Same denial                                                                                                                           |
| DELETE / revoke | `req-2l` | `c01973b5-7407-4974-b389-0b417a82dabf` | Same denial                                                                                                                           |
| PATCH / replace | `req-2r` | `87c03ac3-d5d7-45e3-a423-b9716c23215a` | Same denial                                                                                                                           |

Each session match has exactly one corresponding server diagnostic with HTTP401 and non-null `revoked_at`. Credentials/token hashes are not logged.

The independent reviewer cross-matched all four requests and **24 ordered management/following-read denials**, all payload-free `reauthentication_required`. It separately matched both late-response barrier files by run/phase/request and proved revocation between ready/release, different replacement sessions and retained current authority. Its read-only SQLite check found materials4, total Outbox4, total conflicts2 (unresolved1), scope snapshots3, session0; no business/evidence cleanup manufactured the result.

### Late-response session isolation

- **A→B management:** phase `management-late-account`, `req-2v`; old A session `63cbde7a-20db-4d45-a9fc-1151a7fa8a13`, ready `11:57:19.145Z`, revoked `11:57:19.859Z`, released `11:57:22.683Z`, actual401. B logged in before release as `8a122942-b5cd-4a0e-8362-70f447c008b7`. Old command returns `sync_account_boundary`; B retains nonempty contexts, known-scope selection and its nonempty conflict list. Real Push remains HTTP200 with the normal pending-conflict result, not a fabricated empty-list PASS.
- **A1→A2 management:** phase `management-late-same-account`, `req-35`; A1 `4d52d183-df1f-4094-8240-157d442c0bc4`, ready `11:57:25.609Z`, revoked `11:57:26.865Z`, released `11:57:28.203Z`, actual401. A2 `3ddefa19-c44b-43ea-8435-c1738c7fdfe9` is a distinct session on the same account/installation. Old command returns `sync_account_boundary`; A2 retains contexts, selection and normal Push authorization.
- Existing held Pull A/B/A2 regressions also pass. `revokedSessionAccess={denied:true,code:reauthentication_required,conflictCount:null,sourceDisclosed:false}`, `consoleErrors=[]`. Driver's final explicit lock closes local permission; independent read-only SQLite observation after process exit: session rows0, authorization-cache rows3, pending Outbox1, unresolved conflicts1. Cached evidence/data remain; there is no permission-bearing session.

Artifacts: [native result](E:/Project/honsen-g1-fix2-independent-recheck/.honsen-native-qa/native-smoke-20261019115437.test.json), [server diagnostics](E:/Project/honsen-g1-fix2-independent-recheck/.honsen-native-qa/native-smoke-20261019115437-server-sync.test.jsonl), plus same-prefix screenshots, barriers, SQLite files and ignored `test-results/` logs. Normal Harness teardown removed only this run's disposable Compose container/network/volume and temporary PFX/CER/private certificate. `docker ps -a` filtered by its exact project label is empty; previous evidence remains.

### Scope limits

No production/test changes, new task numbers, G2 implementation, full NATIVE matrix, unrelated suite or Harness refactor. Existing69/69 full-lib, release/lint/typecheck/build and fixture-DOM evidence at unchanged13b22ff remains builder evidence; not rerun or upgraded into this independent verdict. DELETE failure is fresh Rust failure-injection proof, not native SQLite tampering. Production conflict UI lifecycle remains separately unaccepted; no security/parent/Formal hold is closed by these command-level checks. G2 preparation is limited to the existing [T10-A scope](../BUILD-TASKS.md#t10-a--g2-preparation--2026-10-19-scope-only-not-implementation).
