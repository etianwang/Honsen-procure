# V1 final QA — recovery

Status: PARTIAL. Fresh real PostgreSQL archive restoration and authenticated API readback PASS. Restored debug-native HPA login/Push/Pull subsequently PASS within the additional slice below; full document history, COS-byte restore and business-data application upgrade remain OPEN.

## Exact source and execution boundary

Recovery began at `f1420cbc3f2ad19afede1bf86bae5e82d96d1044`; documentation commits advanced HEAD to `b1d66441d02fd9ec1161fe990e595d714238c851` during execution. Independent owning comparison over apps/server, packages/shared and tests/deploy showed no changes. Fresh copied Linux runtime contains125 source/test files; all SHA-256 values match the current checkout. Manifest SHA-256: `40251ae17aff82aad7ae2fcd84a469d345196a7b5000c855492a1692e0ef9b01`. The attached manifest is actual runtime content, not an inferred historical build. No Windows EXE was exercised by this database/API slice; no EXE hash or native PASS is claimed.

## Fresh checks performed

- `tests/deploy/test-business-restore.sh`: PASS exit0. Two task-owned PostgreSQL16 Alpine clusters, distinct system identifiers, current real migrations with checksums, synthetic closed SPO/formal registry/payment/reversal/attachment-reference fixture, pg_dump custom archive, pg_restore, exact deterministic all-public-table content hashes, historical FK relationships, immutable ledger update refusal and immutable attachment deletion refusal.
- The production scripts require GNU tools. GNU coreutils9.11 was installed only inside the disposable source container; bridge was disconnected before actual business restore. No host package, Docker/WSL configuration or production script changed.
- Fresh Node24.18.0 Bookworm runtime: committed-lock npm ci, explicit Argon2 rebuild, shared build and server production build all PASS. Low/moderate npm advisories retained; no dependency changes.
- `tests/deploy/authenticated-restore-readback.mjs`: PASS exit0. Two new private PG16 clusters and a fresh current-source API process, explicit expected distinct cluster IDs checked before fixture creation, actual archive restore, real password/arithmetic-CAPTCHA login HTTP200 and scoped Pull HTTP200. Exact SPO formal number and frozen snapshot, original300XOF payment/reversal50/net250 and attachment metadata/reference preserved. No passwords, tokens or password hashes were written to result evidence.
- Runtime source manifest:125 files, zero current-checkout mismatches. Safe result: [API result](V1-FINAL-QA-RECOVERY-api.json); [source manifest](V1-FINAL-QA-RECOVERY-sources.sha256).

Ignored task orchestration/evidence directory: `.cache/host-native-qa/recovery/`. Commands ran through ordinary WSL user honsen-dev and task-owned network-isolated containers, with no host port bindings or persistent data volumes. EXIT cleanup removed all recovery containers. Agent A's security PostgreSQL/API ports were not accessed or changed. The previous retained installed-auth backend was separately cleaned only after root authorization and prior coordination with A; its own Compose down--volumes exited0 and selected listeners returned zero before handoff.

## Acceptance still required

| Item                                                             | Actual result                  | Classification / impact                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Cross-cluster real schema/archive/content restoration            | PASS                           | Bounded database restore proof only                                                                                           |
| Restored account password/CAPTCHA and API scoped historical Pull | PASS                           | HTTP API, not Windows native/TLS proof                                                                                        |
| Restored real Windows native login and Push/Pull                 | PARTIAL: HPA debug-native PASS | Full document/payment/object and installed acceptance remain BLOCKER; see additional native slice below                       |
| Historic OPA/HPA/SPO frozen snapshots after restore              | PARTIAL                        | SPO API and HPA debug-native preserved; OPA native archive restore remains open                                               |
| Payment/reversal/net amount after restore                        | PASS database/API              | Native readback remains part of the open native item                                                                          |
| Authorized COS prefix object bytes and SHA-256 after restore     | NOT RUN                        | BLOCKER: this fixture contains only synthetic object reference; no COS credentials were read or objects touched by this slice |
| Upgrade application with restored business data                  | NOT RUN                        | BLOCKER: no package/EXE upgrade executed by this slice; old install/P1 evidence not transferred                               |

No parent milestone, Formal/security hold or release gate is closed. Production deployment, Release publication, main modification and merge remain outside authorization. This report records an independently deliverable evidence slice and preserves the required remaining native/object/upgrade work.

## Additional actual restored Windows HPA slice

Fresh run `native-smoke-20261105090710` exercised real Windows debug EXEs with isolated SQLite profiles. Application build source `f1420cbc3f2ad19afede1bf86bae5e82d96d1044`; actual runner HEAD was documentation checkpoint `5dbd7f369bc7d79d2b2a5444ca7326d39a8bc738`. Both copied EXEs SHA-256 `74774bfe641c851a5762fc7b6f39f8b7f6771f88b9b040e5a1d8c9d99c160769`. Owning apps/packages comparison against f1420cb is empty. Dirty files were the new test harness and another agent's report, explicitly retained in safe evidence; no clean-worktree claim. This is not installed0.1.13 evidence.

The test reuses the existing native HPA workflow: legitimate password/local+cloud CAPTCHA login, real IPC draft/submit/independent approval/issue, authoritative HTTPS Push acknowledgment and replay. Only then it stops both owned clients, dumps their actual server database and restores the archive into a newly initialized independent PG16 cluster. Source system ID `7704611432940658722`, target `7704611613567561762`, archive SHA-256 `6fb777f3c68757741e61987d58aa34393731bc8c4d6d1ae9ae5bb24031e574d3`.

A new strict-CA HTTPS API3446 used only the restored database on loopback54330. Both real EXE profiles restarted and authenticated normally; actual Push replay accepted zero duplicates and left zero pending. Consumer Pull retrieved the restored HPA;12 frozen fields matched. Subsequent material/supplier/current-price changes on the restored backend did not rewrite the formal snapshot, and another EXE restart plus cursor replay preserved the durable rows. The driver result is PASS, with5 real EXE launches and distinct installations. No client SQLite business rows were written by the test; SQLite reads captured evidence. The existing helper initializes synthetic test profiles, but all tested HPA operations and restored logins use actual trusted IPC/HTTPS.

Important failure chronology: attempt1 stopped before login because the caller supplied invalid test-mode1; actual trusted guard rejected it. Attempt2 reached real issue/Push but failed at Windows→WSL multiline command quoting before restoration; changed orchestration to stdin `bash -s`, preserving tests. Attempt3 completed the entire native business driver PASS, but the unchanged generic PowerShell validator expected3 launches instead of the recovery workflow's5, so the wrapper exited1. The recovery-specific validator now additionally requires5 launches, restored-login/Push booleans, distinct cluster IDs and archive SHA format; it passed against the saved real attempt3 result. No claim is made that the original attempt3 wrapper exited0, and no additional business rerun was used to erase that failure.

Safe native result: [native HPA restore](V1-FINAL-QA-RECOVERY-native-hpa.json). Reproducible test-only generator: `tests/native/prepare-hpa-restored.mjs`, reusing the original HPA driver/runner and producing ignored artifacts under `.cache/host-native-qa/recovery`. All owned source/target containers, API processes, WebViews and Vite were cleaned; source Compose down--volumes exited0 before stopping its keeper. Fresh selected listener checks returned none.

## Additional independent COS byte control

Existing opt-in `cos-live.test.ts` freshly exercised one randomly owned object inside the authorized `honsen-procure-tests/` namespace: synthetic63-byte PDF PUT200, GET200, SHA-256 match, incorrect signature403 and exact owned-object cleanup204. Credentials came only from the four permitted COS fields in root cos.txt into that one controlled process; none were printed, committed or copied into the artifact. Safe result: [COS byte control](V1-FINAL-QA-RECOVERY-cos-bytes.json).

This separate object-control test is not native attachment recovery or a backup of object bytes. HPA native restoration is now a bounded PASS; OPA/SPO native historical restore, payment/reversal native restored totals, COS object-byte restore through the native attachment workflow and business-data application upgrade remain BLOCKER/open. No original parent or final gate is closed.
