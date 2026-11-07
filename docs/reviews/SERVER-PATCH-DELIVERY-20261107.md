# Server Patch delivery — 2026-11-07

Scope: existing T15 server deployment reliability, explicitly requested minimal monorepo Patch mechanism. No remote upgrade, database/business schema change, Windows installation or Toolbox contract change.

## Implementation

Full Linux build pins an exact 40-character source SHA. The existing quality workflow emits a Baota ZIP only after its original gates. Patch comparison uses verified BASE/TARGET runtime artifacts, including dependency files, SQL, metadata, type, mode, size and SHA-256; it does not use a TypeScript Git diff.

The Patch includes four diff lists, complete BASE/TARGET inventories and Manifest identities, changed payload, SHA256SUMS, guarded extraction/staging/atomic-exchange tooling and [Chinese operator commands](../SERVER-PATCH-BAOTA.zh-CN.md). It never ships `.env`, private keys or business data and rejects a changed start.mjs. Unknown local files remain; new-path collisions refuse. Historical SQL changes, missing runtime identity, shared-bundle mismatch and incompatible runtime versions require full deployment review. New migrations need exact hash-bound compatibility review and use the existing controlled runner. No Seed or password recovery is invoked.

prepare refuses a live listener/application process, validates the entire BASE, copies into a fresh sibling stage, applies only declared changes and verifies the entire TARGET. activate independently rechecks stopped state, dump structure, complete application backup equality, checksums, maintenance database identity/owner and exact recorded migrations before Linux atomic directory exchange. Old files remain in the former stage; there is no automatic old API restart or database restore.

## Evidence status

BASE for local isolated verification: `569fac83ceb3f8f44446c34a2640b4e812dc689b`, complete ZIP SHA `faeeeb3402e7ada51cbf265f039f6ef327e8e7e01b2f18e326d6ba8e5f69a4b0`. This is NOT evidence that the server currently runs this version.

Focused Windows release tests:33PASS,8 explicit Linux/POSIX SKIP. Independent Ubuntu core20PASS covered earlier exact code; final27/helper and actual artifact runtime tests are pending. Existing failed runs and subsequent security regressions are retained. No runtime or CI success is claimed before actual execution.

BLOCKER: real deployed BASE Manifest and file/type/mode/link evidence; actual pinned TARGET full artifact, Patch archive and Ubuntu BASE→Patch→TARGET runtime history verification. The current user SSH screenshot proves a logged-in terminal, not its running application SHA. Read-only collection has been supplied; remote configuration/PM2/database remain unchanged.

DEFERRED: external live COS, native two-SQLite-client and full Alpha/production gates. Missing external attachment proof remains NOT RUN, not a fabricated PASS. Final hashes, exact commands, logs and cleanup will be appended after verification. No company-wide or stable release is authorized by this report.

## Initial actual artifact failure and bounded repair

Implementation candidate7c7c9a04260dd87683388179eeaab951c0565e98 produced a real full TARGET and a real Patch ZIP. Independent extraction rejected the Patch: build-patch.sh excluded every basename SHA256SUMS, accidentally omitting payload/SHA256SUMS from the archive checksum list. That archive is failed evidence, not a distributable candidate. Repair changes only the wrapper exclusion to the root ./SHA256SUMS; a Linux dynamic regression builds two fixture ZIPs, calls the complete wrapper, re-extracts its actual output and verifies the payload checksum entry and BASE. Independent regression PASS. No integrity check was disabled.

Independent Ubuntu24.04.5/Node24.22.1 focused core/helpers27PASS0SKIP; wrapper regression adds1PASS. The original tools image lacked Python/client tools; its5helper failures were preserved, then a local-only Ubuntu derivative was built with Python3/PGclient16/zip/unzip/tar/openssl and all helpers passed. No host/server packages were changed. Actual direct-core BASE569→TARGET7c same-database runtime passed API accounts/HPA, dump/tar, owner migration checks, atomic exchange and historical retention. Readiness404 and rewritten-link fixture failures were retained and fixed only in tests. This proof did not use the final Patch ZIP, so final acceptance now requires a rebuilt exact-SHA ZIP and the harness explicit EXTRACTED_PATCH_ZIP path. A simultaneous script-edit/run syntax failure was also preserved; files are frozen before the next run.

## Actual CLI stopped-process correction

627 actual archive verification passed after the checksum repair, but real CLI prepare failed API_RUNNING: its own --live argv was interpreted as an application process. The smallest repair excludes only process.pid; the port3000 check and every other Node process remain enforced. Two real Linux CLI regressions verify self-only exclusion and another Node live-argument denial. Independent final Ubuntu core/tools/wrapper/CLI30PASS0SKIP; Windows skips remain explicit. The final runtime harness now calls prepare/verify-target/activate from the actual extracted Patch tools, not repository functions; its database is honsen_procure only inside a newly owned disposable private Compose instance, with successful-create ownership flags before cleanup. No remote database is used. Final pinned artifacts and results follow.
