# Authenticated restored API history readback — 2026-11-04

Status: PASS for real restored API password/CAPTCHA authentication and scoped business-history Pull. Full native/installed/COS recovery remains OPEN.

Production runtime artifact is the unchanged exact-db2ad11 Linux build recorded in LINUX-CANDIDATE-20261104.md (package SHA070a7e2a...). Server/shared/migrations/build-input diff db2ad11→100011d is empty. New test fixture/driver belongs to this report's containing later test checkpoint, not to the immutable runtime package; production source100011d was not modified.

## Actual execution

New `tests/deploy/authenticated-restore-readback.mjs` ran through the existing tsx loader in the digest-pinned official Node24 Linux image. It extracted the protected runtime package, imported the **production source** migration runner and executed all16 migrations on a fresh disposable sourcePG database. It generated a random synthetic password only in process memory and used real Argon2 hashing; only the salted hash entered the database archive. A live Node process retained the password during restoration; no password/token/raw login response was written to evidence or environment files.

Fixture uses actual tables and shared-schema-valid payloads: enabled purchaser account with first-change completed; project, country, department/team and active project/scope bindings; a parent order and supplier; parser-valid numbered closed SPO with immutable draft-time formal snapshot and formal registry; original300XOF payment,50XOF reversal with original reference; uploaded attachment metadata/reference with synthetic object key. Matching sync_entities and server_change_log records allow the production scoped Pull path to read the archived history.

This is a directly seeded archive fixture; it does not independently establish original approval provenance or server Push acceptance of each historical mutation. It does establish those archived records survive and are readable by their legitimate restored account.

The source database was pg_dump'ed in custom format, archive listing validated, then restored with pg_restore to a different PostgreSQL cluster. Distinct system identifiers and16 restored migration records were asserted. Both clusters used private internal localhost ports5432/5433 in a Docker-only shared network namespace, with no host bindings or54329 access. No existing database was modified.

After actual restoration, the runtime's production-equivalent `node --import=tsx apps/server/dist/index.js` started against the target. The test requested a fresh arithmetic CAPTCHA, solved its displayed question, and performed the normal password/CAPTCHA login with a new installation UUID. Login HTTP200. An authenticated `/api/sync/pull?cursor=0&limit=100` returned HTTP200. Shared response/payment/attachment schemas and exact comparisons verified:

- Exact SPO payload, formal number and immutable snapshot preserved.
- Original payment300 and reversal50 preserved with relationship (net250XOF).
- Exact attachment owner/order/project/country/key/hash metadata preserved.

Safe proof: adjacent AUTHENTICATED-RESTORE-20261104.json. Raw H-drive evidence `H:/Honsen/artifacts/linux/authenticated-restore-20261104/{readback.log,restore.log,authenticated-restore-result.json}`. Safe ignored orchestration scripts start.sh/restore.sh are in that directory. Exit0 for the restore and Node readback. The test file was subsequently Prettier-formatted without semantic changes; current SHA-256 `ea07718483e7a817abd7df9581c59f075e549e4117e1d56f8753867bb3a52b97`. Formatting and diff checks pass.

## Cleanup and exact limits

Owned Node/sourcePG/targetPG containers were removed after capture; their transient database files/archive/password hash disappeared with the containers. No COS credentials were mounted, objects uploaded, host environment installed, production service deployed or Release published.

This service ran HTTP on isolated loopback behind no external ingress. It is **not HTTPS or a Windows native client** acceptance. The attachment object key is a synthetic reference and its bytes were not backed up/restored/downloaded. Full signed-in Windows native history readback, actual attachment object consistency, application restore UI/retention, security/governance and complete release gates remain OPEN. This evidence does not reuse the installed EXE hash as the debug native EXE or vice versa.

## Independent review hardening and exact final re-run

The test now refuses execution outside a Docker container and requires explicit, distinct expected source/target PostgreSQL system identifiers. It compares each actual system identifier **before creating the fixture database**, so HONSEN_DEPLOY_TEST alone cannot accidentally run it against a developer PostgreSQL instance. The ignored controller creates the two task-owned network-none clusters itself and supplies their identities. No default identity or fallback connection is accepted.

API child cleanup checks exitCode/signalCode before waiting. It sends SIGTERM only to its own child, waits at most5seconds, then bounded SIGKILL/3seconds if necessary; already-exited children do not hang on a missed exit event.

After these changes, a fresh full actual backup/independent-cluster restore/API login/Pull run passed exit0. Exact final test SHA-256 `de001ff80d90258bdd5d0dc342b8eb4fb916994a6d000d846eb95faf4deb8dc9`. Final raw evidence `H:/Honsen/artifacts/linux/authenticated-restore-hardened-20261104/{controller.sh,readback.log,restore.log,authenticated-restore-result.json}`. The safe committed JSON is this final run and includes isolatedContainerVerified/expectedClusterIdsMatched=true. All three owned containers were removed by the controller EXIT trap.

Negative guards also executed: Windows host with HONSEN_DEPLOY_TEST=1 refused as non-container; isolated Node container without expected cluster IDs refused before connecting. Both exit1, recorded in the original evidence guard-negative.log and final missing-cluster-guard.log. The first successful pre-hardening run is retained under its original directory rather than rewritten as final evidence.
