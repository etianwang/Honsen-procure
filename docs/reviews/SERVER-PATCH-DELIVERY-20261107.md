# Server Patch delivery — 2026-11-07

Scope: existing T15 server deployment reliability, explicitly requested minimal monorepo Patch mechanism. No remote upgrade, database/business schema change, Windows installation or Toolbox contract change.

Current conclusion: implementation, real artifact checks and independent core business upgrade verification PASS; current-server installation remains BLOCKED pending real BASE evidence. Dedicated live COS verification is NOT RUN. No full V1/Alpha gate closes.

## Implementation

Full Linux build pins an exact 40-character source SHA. The existing quality workflow emits a Baota ZIP only after its original gates. Patch comparison uses verified BASE/TARGET runtime artifacts, including dependency files, SQL, metadata, type, mode, size and SHA-256; it does not use a TypeScript Git diff.

The Patch includes four diff lists, complete BASE/TARGET inventories and Manifest identities, changed payload, SHA256SUMS, guarded extraction/staging/atomic-exchange tooling and [Chinese operator commands](../SERVER-PATCH-BAOTA.zh-CN.md). It never ships `.env`, private keys or business data and rejects a changed start.mjs. Unknown local files remain; new-path collisions refuse. Historical SQL changes, missing runtime identity, shared-bundle mismatch and incompatible runtime versions require full deployment review. New migrations need exact hash-bound compatibility review and use the existing controlled runner. No Seed or password recovery is invoked.

prepare refuses a live listener/application process, validates the entire BASE, copies into a fresh sibling stage, applies only declared changes and verifies the entire TARGET. activate independently rechecks stopped state, dump structure, complete application backup equality, checksums, maintenance database identity/owner and exact recorded migrations before Linux atomic directory exchange. Old files remain in the former stage; there is no automatic old API restart or database restore.

## Evidence status

BASE for local isolated verification: `569fac83ceb3f8f44446c34a2640b4e812dc689b`, complete ZIP SHA `faeeeb3402e7ada51cbf265f039f6ef327e8e7e01b2f18e326d6ba8e5f69a4b0`. This is NOT evidence that the server currently runs this version.

The initial Windows and Ubuntu results below are historical development evidence. Final independent Ubuntu release suite44PASS0SKIP includes all core, Python archive/exchange, wrapper and actual CLI regressions. Actual final ZIP runtime was separately executed twice, by builder and independent reviewer. Existing failed runs and subsequent security regressions are retained.

BLOCKER: real deployed BASE Manifest and file/type/mode/link evidence. The current user SSH screenshot proves a logged-in terminal, not its running application SHA. Read-only collection has been supplied; no remote upgrade, PM2, configuration or database command was executed.

BLOCKER for the requested complete attachment case: dedicated COS upload/download/SHA256 proof is NOT RUN without configuration; the isolated before/after disabled-attachments503 behavior was checked instead. DEFERRED: native two-SQLite-client and full Alpha/production gates. No company-wide or stable release is authorized by this report.

## Initial actual artifact failure and bounded repair

Implementation candidate7c7c9a04260dd87683388179eeaab951c0565e98 produced a real full TARGET and a real Patch ZIP. Independent extraction rejected the Patch: build-patch.sh excluded every basename SHA256SUMS, accidentally omitting payload/SHA256SUMS from the archive checksum list. That archive is failed evidence, not a distributable candidate. Repair changes only the wrapper exclusion to the root ./SHA256SUMS; a Linux dynamic regression builds two fixture ZIPs, calls the complete wrapper, re-extracts its actual output and verifies the payload checksum entry and BASE. Independent regression PASS. No integrity check was disabled.

Independent Ubuntu24.04.5/Node24.22.1 focused core/helpers27PASS0SKIP; wrapper regression adds1PASS. The original tools image lacked Python/client tools; its5helper failures were preserved, then a local-only Ubuntu derivative was built with Python3/PGclient16/zip/unzip/tar/openssl and all helpers passed. No host/server packages were changed. Actual direct-core BASE569→TARGET7c same-database runtime passed API accounts/HPA, dump/tar, owner migration checks, atomic exchange and historical retention. Readiness404 and rewritten-link fixture failures were retained and fixed only in tests. This proof did not use the final Patch ZIP, so final acceptance now requires a rebuilt exact-SHA ZIP and the harness explicit EXTRACTED_PATCH_ZIP path. A simultaneous script-edit/run syntax failure was also preserved; files are frozen before the next run.

## Actual CLI stopped-process correction

627 actual archive verification passed after the checksum repair, but real CLI prepare failed API_RUNNING: its own --live argv was interpreted as an application process. The smallest repair excludes only process.pid; the port3000 check and every other Node process remain enforced. Two real Linux CLI regressions verify self-only exclusion and another Node live-argument denial. Independent final Ubuntu core/tools/wrapper/CLI30PASS0SKIP; Windows skips remain explicit. The final runtime harness now calls prepare/verify-target/activate from the actual extracted Patch tools, not repository functions; its database is honsen_procure only inside a newly owned disposable private Compose instance, with successful-create ownership flags before cleanup. No remote database is used. Final pinned artifacts and results follow.

## Final exact artifacts and actual runtime

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
