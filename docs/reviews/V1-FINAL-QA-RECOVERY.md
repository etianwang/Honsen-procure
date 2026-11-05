# V1 final QA — recovery

Status: PARTIAL. Fresh real PostgreSQL archive restoration and authenticated API readback PASS. Actual restored Windows native login/Push/Pull, all-document history, COS bytes and business-data application upgrade remain OPEN.

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

| Item                                                             | Actual result     | Classification / impact                                                                                                                       |
| ---------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-cluster real schema/archive/content restoration            | PASS              | Bounded database restore proof only                                                                                                           |
| Restored account password/CAPTCHA and API scoped historical Pull | PASS              | HTTP API, not Windows native/TLS proof                                                                                                        |
| Restored real Windows native login and Push/Pull                 | NOT RUN           | BLOCKER: requires dedicated restored HTTPS native driver and coordinated EXE/backend handoff; current API driver's finally cleans its backend |
| Historic OPA/HPA/SPO frozen snapshots after restore              | PARTIAL           | SPO preserved; OPA/HPA not present in this synthetic archive fixture. BLOCKER for complete document-history acceptance                        |
| Payment/reversal/net amount after restore                        | PASS database/API | Native readback remains part of the open native item                                                                                          |
| Authorized COS prefix object bytes and SHA-256 after restore     | NOT RUN           | BLOCKER: this fixture contains only synthetic object reference; no COS credentials were read or objects touched by this slice                 |
| Upgrade application with restored business data                  | NOT RUN           | BLOCKER: no package/EXE upgrade executed by this slice; old install/P1 evidence not transferred                                               |

No parent milestone, Formal/security hold or release gate is closed. Production deployment, Release publication, main modification and merge remain outside authorization. This report records an independently deliverable evidence slice and preserves the required remaining native/object/upgrade work.
