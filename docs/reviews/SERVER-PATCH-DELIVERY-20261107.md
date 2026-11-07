# Server Patch delivery — 2026-11-07

Scope: existing T15 server deployment reliability, explicitly requested minimal monorepo Patch mechanism. No remote upgrade, database/business schema change, Windows installation or Toolbox contract change.

Current conclusion: implementation, real artifact checks and independent core business upgrade verification PASS. The received real6b baseline is identified, but strict file drift, a locally added starter and changed shared-contract boundary block direct Patch installation; full candidate review is required. See [received baseline assessment](SERVER-BASELINE-6B18850-20261107.md). Dedicated live COS verification is NOT RUN. No full V1/Alpha gate closes.

Final delivery TARGET is green-CI `930807729d2fe48f9a4beedf093c109b08eeaa3b`, using the actual downloaded GitHub Actions Linux ZIP. The earlier6f evidence below is retained history; the final930 artifact and its separate actual CLI runtime proof are recorded in the last section.

## Implementation

Full Linux build pins an exact 40-character source SHA. The existing quality workflow emits a Baota ZIP only after its original gates. Patch comparison uses verified BASE/TARGET runtime artifacts, including dependency files, SQL, metadata, type, mode, size and SHA-256; it does not use a TypeScript Git diff.

The Patch includes four diff lists, complete BASE/TARGET inventories and Manifest identities, changed payload, SHA256SUMS, guarded extraction/staging/atomic-exchange tooling and [Chinese operator commands](../SERVER-PATCH-BAOTA.zh-CN.md). It never ships `.env`, private keys or business data and rejects a changed start.mjs. Unknown local files remain; new-path collisions refuse. Historical SQL changes, missing runtime identity, shared-bundle mismatch and incompatible runtime versions require full deployment review. New migrations need exact hash-bound compatibility review and use the existing controlled runner. No Seed or password recovery is invoked.

prepare refuses a live listener/application process, validates the entire BASE, copies into a fresh sibling stage, applies only declared changes and verifies the entire TARGET. activate independently rechecks stopped state, dump structure, complete application backup equality, checksums, maintenance database identity/owner and exact recorded migrations before Linux atomic directory exchange. Old files remain in the former stage; there is no automatic old API restart or database restore.

## Evidence status

BASE for local isolated verification: `569fac83ceb3f8f44446c34a2640b4e812dc689b`, complete ZIP SHA `faeeeb3402e7ada51cbf265f039f6ef327e8e7e01b2f18e326d6ba8e5f69a4b0`. This is NOT evidence that the server currently runs this version.

The initial Windows and Ubuntu results below are historical development evidence. Final independent Ubuntu release suite44PASS0SKIP includes all core, Python archive/exchange, wrapper and actual CLI regressions. Actual final ZIP runtime was separately executed twice, by builder and independent reviewer. Existing failed runs and subsequent security regressions are retained.

Baseline receipt has now been received and matched to original6b Manifest/checksum identities. Strict runtime eligibility fails and the shared boundary has changed, as detailed in the received-baseline assessment. No remote upgrade, PM2, configuration or database command was executed.

BLOCKER for the requested complete attachment case: dedicated COS upload/download/SHA256 proof is NOT RUN without configuration; the isolated before/after disabled-attachments503 behavior was checked instead. DEFERRED: native two-SQLite-client and full Alpha/production gates. No company-wide or stable release is authorized by this report.

## Initial actual artifact failure and bounded repair

Implementation candidate7c7c9a04260dd87683388179eeaab951c0565e98 produced a real full TARGET and a real Patch ZIP. Independent extraction rejected the Patch: build-patch.sh excluded every basename SHA256SUMS, accidentally omitting payload/SHA256SUMS from the archive checksum list. That archive is failed evidence, not a distributable candidate. Repair changes only the wrapper exclusion to the root ./SHA256SUMS; a Linux dynamic regression builds two fixture ZIPs, calls the complete wrapper, re-extracts its actual output and verifies the payload checksum entry and BASE. Independent regression PASS. No integrity check was disabled.

Independent Ubuntu24.04.5/Node24.22.1 focused core/helpers27PASS0SKIP; wrapper regression adds1PASS. The original tools image lacked Python/client tools; its5helper failures were preserved, then a local-only Ubuntu derivative was built with Python3/PGclient16/zip/unzip/tar/openssl and all helpers passed. No host/server packages were changed. Actual direct-core BASE569→TARGET7c same-database runtime passed API accounts/HPA, dump/tar, owner migration checks, atomic exchange and historical retention. Readiness404 and rewritten-link fixture failures were retained and fixed only in tests. This proof did not use the final Patch ZIP, so final acceptance now requires a rebuilt exact-SHA ZIP and the harness explicit EXTRACTED_PATCH_ZIP path. A simultaneous script-edit/run syntax failure was also preserved; files are frozen before the next run.

## Actual CLI stopped-process correction

627 actual archive verification passed after the checksum repair, but real CLI prepare failed API_RUNNING: its own --live argv was interpreted as an application process. The smallest repair excludes only process.pid; the port3000 check and every other Node process remain enforced. Two real Linux CLI regressions verify self-only exclusion and another Node live-argument denial. Independent final Ubuntu core/tools/wrapper/CLI30PASS0SKIP; Windows skips remain explicit. The final runtime harness now calls prepare/verify-target/activate from the actual extracted Patch tools, not repository functions; its database is honsen_procure only inside a newly owned disposable private Compose instance, with successful-create ownership flags before cleanup. No remote database is used. Final pinned artifacts and results follow.

## Earlier 6f exact artifacts and actual runtime

| Item                   | Value                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| BASE full source       | 569fac83ceb3f8f44446c34a2640b4e812dc689b — isolated local baseline only                  |
| TARGET full source     | 6f3d446d8b592f84f18a81d6c0b6f30004ba073a                                                 |
| BASE Manifest SHA256   | bda0aa56347a29c5198841bf6ebcee900729920e6c7e222b3d92410ed4c49f89                         |
| TARGET Manifest SHA256 | 2fddde6911ea6829f90a02c94ddabeed07a6381da8f54d8028136d9441ceeb51                         |
| TARGET ZIP             | 3,558,103 bytes; SHA256 adef341e8747a8ff04c2aaa8b022cc1d95409852f8018aa262f3d587feeb36c9 |
| Patch ZIP              | 607,073 bytes; SHA256 23f4b48562eeaf03a850375ac33dd548f09296dba8c6f0cbb83068cb41717f3d   |
| Runtime differences    | 4 added / 6 modified / 0 deleted / 2,591 unchanged entries; about83% less transfer       |
| SQL/shared/server code | no new migrations; latest016; shared7229e6… and server entry22ac9f… unchanged from BASE  |

Deliverables are under `.cache/server-patch-delivery-6f3d446/`: full ZIP, Patch ZIP, complete four-list diff JSON, operator instructions and relative-name SHA256SUMS. The Patch name includes full BASE and TARGET SHA. Full is retained as a recovery candidate; no database rollback compatibility is inferred. Both ZIPs have no actual.env/private key/SQLite data. Target package inventory is2601entries, Patch21entries. Changed start.mjs is rejected; this actual patch does not include it.

Actual wrapper ZIP was guard-extracted, all internal checksum entries verified, then used for real CLI verify-base/prepare/verify-target and runtime activation. Builder and independent reviewer both ran `tests/deploy/test-server-patch.sh BASE TARGET NEW_WORK VERIFIED_EXTRACTED_PATCH` under the normal WSL user with a disposable Ubuntu24.04/Node24.22.1 tools container and isolated PostgreSQL16.15 Compose service. The explicit archive mode outputs EXTRACTED_PATCH_ZIP_CLI_PREPARE_ACTIVATE, not a repository-function simulation.

PASS: BASE migrations/Seed exactly once in the disposable fixture; normal HTTPS/CAPTCHA two-account creation and scope; formal HPA; running-API preparation refusal; stopped CLI preparation; all TARGET known files/type/mode/link hashes; unchanged local.env/operator data; existing controlled incremental runner without repeated Seed; real readable pg_dump and matching tar backup; maintenance owner read-only migration verification; Linux atomic exchange retaining old tree; TARGET from the original live path; existing session and order/history byte equality; relogin; idempotent Push/Pull; immutable formal snapshot rejection; receiving permission denial/success and second-account readback. This is API-session proof, not two native SQLite clients. Actual COS remains NOT RUN as stated above.

Logs: `.cache/server-patch-runtime-6f3d446-builder/runtime.log`, `.cache/server-patch-runtime-6f3d446-C-independent/runtime.log`, `.cache/server-patch6f-artifact-verification.log`, `.cache/release44-root-context.log`. Both owners removed only their disposable database/role/containers/networks/runtime directories and exact generated credentials/TLS/dump/tar files; evidence ZIPs/logs remain. Owned native artifact directories were realpath checked before removal; keeper stopped. No other local or remote resources were stopped/deleted.

## CI context and cleanup repair

Initial6f CI42362638282 passed42 release cases and failed2 real CLI cases because the ordinary GitHub runner cannot inspect all global/proc entries. The production guard correctly refuses unreadable processes. CI now runs release tools under explicit maintenance visibility, matching the operator requirement; independent Ubuntu root-context44PASS validates it without weakening the tool. No production change followed6f.

Subsequent CI42363061967 encountered an unrelated existing protected-admin fixture teardown race: pg-pool.end may resolve before backend sockets close, and DROP DATABASE WITH FORCE can emit unhandled57P01. A test-only repair waits up to5seconds for only the owned UUID database to drain, then ordinary DROP; timeout fails instead of force disconnecting. Independent focused PostgreSQL6PASS plus server format/type/lint/build PASS. No error swallowing, SQL migration change, production-account change or artifact rebuild. The original failure remains evidence. The next quality result is recorded separately; do not label those failed runs green. Only workflow, excluded test source and progress records differ from exact6f deployment/runtime tools.

## Final green-CI GitHub artifact and delivery

[Quality run42363732850](https://github.com/etianwang/Honsen-procure/actions/runs/42363732850) SUCCESS for source930807729d2fe48f9a4beedf093c109b08eeaa3b. Original formatting/lint/typecheck/unit/PostgreSQL/build, all44 release tools (maintenance visibility), deployment grants/Linux integrations, all110 renderer tests and the new Baota ZIP build/upload passed. Artifact13570439763 is named baota-server-930807729d2fe48f9a4beedf093c109b08eeaa3b. It was actually downloaded; inner ZIP SHA and Manifest were verified, not inferred from a job name. Compared with tested6f, every runtime file byte/size/type/mode and directory mode is identical except build-manifest.json/SHA256SUMS provenance. This explicit unchanged-boundary comparison is evidence, not an automatic transfer of another tree's tests.

| Final item             | Identity                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| BASE                   | 569fac83ceb3f8f44446c34a2640b4e812dc689b, still NOT a confirmed remote version           |
| TARGET                 | 930807729d2fe48f9a4beedf093c109b08eeaa3b                                                 |
| TARGET Manifest SHA256 | f59a9892e11aa50f085cee493361cd0cce8f0911d9ea3c71bdd8bce8696e08b9                         |
| GitHub full ZIP        | 3,558,104 bytes; SHA256 adf46f5a0c109a87910957d98a6e1e47a2d08516c00bc7455dfc7d060a24bc4d |
| Final Patch ZIP        | 607,095 bytes; SHA256 e8a3ecc09933a5988d8bc417abd01a1f7300857f81a09aa18d1a4d6a9c6590a9   |
| Diff JSON SHA256       | ca749665a907e4eef50252695134654021280b9aee710dcfe294e962908c530d                         |
| Difference             | 4 added,6 modified,0 deleted,2591 unchanged; no new SQL; about83% lower transfer         |

Final deliverables are `.cache/server-patch-delivery-9308077/`: the exact full and Patch ZIPs, complete .zip.diff.json, SHA256SUMS and Chinese operator instructions. Older6f/failed development artifacts remain evidence and are not substituted for this pair.

Independent reviewer built the final Patch from the actual GitHub full ZIP (no local rebuild), guard-extracted it, verified every internal sum and real CLI verify-base/prepare/verify-target. A separate fresh owned Ubuntu24.04/Node24.22.1/PostgreSQL16.15 run then used the actual930 ZIP tools for full same-database CLI prepare/activate and repeated all core HTTPS/account/HPA/session/history/idempotency/immutability/receiving checks: PASS. Log `.cache/server-patch-runtime-9308077-C-independent/runtime.log`; artifact proof `.cache/server-patch930-artifact-verification.log`. New-migration application was not needed: the existing runner verified the unchanged recorded SQL; approval/failure guards are covered by targeted tests. This does not prove arbitrary future SQL compatibility.

Owned final Compose/runtime/credentials/dump/tar/TLS/keeper resources were removed. An ownership cleanup refusal on one native temporary directory was retained; only that independently verified owned test directory was returned to its existing normal user before removal, without touching other resources. Git worktree was clean before these final records-only edits. No server SSH command completed, no remote upgrade/PM2/DB/config change, no Release/Toolbox publication.

Final disposition: local mechanism and core artifact workflow VERIFIED; current remote installation BLOCKED by missing actual BASE evidence, and the requested live COS transfer/SHA case remains NOT RUN. Only the user can provide the current terminal's non-sensitive read-only receipt; passwords are neither needed nor requested. These holds do not erase the local PASS and do prevent a claim of full remote/Alpha readiness. The final containing commit changes records only; application/deployment/test source is unchanged from green930, so no unrelated application rerun is required.

### Received real6b baseline — 2026-11-07

User supplied read-only server receipt. Original6b18850ee2e426fb68ac138fef866c4e4c718954 Manifest and SHA256SUMS digests match exactly.2232 known regular rows' content/size match the original with observed0755 modes, proven by exact canonical receipt equality; original2216 were0644. One.env.example path unreadable/missing; no real.env read.13 unknown entries include locally added start.mjs, absent from the original ZIP. Latest014 is packaged migration evidence, not a queried DB ledger. Shared bundle430714…→7229e6… and new packaged015+016 exceed same-contract Patch boundary. Actual local6b→930 create exited1 INCOMPATIBLE_FULL_DEPLOYMENT_REQUIRED with no output artifact. Strict refusal is verified, not bypassed.

Current direct-server Patch BLOCKED; change missing-baseline-source hold to confirmed baseline drift/legacy-entry/contract review hold. Use full930 as candidate, not automatic deployment; inspect actual DB migration ledger/owner/PM2/start and verify backups first. Earlier569→930 Patch remains isolated example and must not be used on this server. No chmod/unknown-file deletion/SQL/Seed/admin reset/remote upgrade performed. Details docs/reviews/SERVER-BASELINE-6B18850-20261107.md. Records-only continuation; source/artifacts/tests unchanged from green930, formatting/references/status consistency checked; containing checkpoint expected selected dirt0 afterCommitPush. Original COS/native/Alpha/Formal/Toolbox gates remain open.
