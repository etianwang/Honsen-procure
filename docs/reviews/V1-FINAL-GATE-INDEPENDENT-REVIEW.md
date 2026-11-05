# Independent final gate review — 2026-11-06

Independent reviewer: final QA agent, separate from builders. Review checkpoint `04a00be91da63f296ce314aa24103d910887091e`; B driver changes were still uncommitted. This is evidence review, not new installed execution or final acceptance of those changes.

| Decision                | Independent opinion                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| SERVER_V1_READY         | Supported only for frozen ZIP owning03c2c82 and its documented Linux/API scope; no new deployment authorization |
| WINDOWS_NATIVE_QA_READY | BLOCKED / partial host-debug G1 evidence                                                                        |
| TOOLBOX_RELEASE_READY   | BLOCKED                                                                                                         |
| V1_FINAL_RELEASE_READY  | BLOCKED                                                                                                         |

## Candidate identity and unchanged boundary

Independently recomputed frozen ZIP SHA256 `59fa0cfdb7176034c816015bd1fa55613244c7091bf9317507b61addc9e223cd`. Owning source is `03c2c82b7a0a34cc4f360a293478e58fd529c8f3`, SQL migration count17/latest014 per package ledger. Tracked server/shared diff from that source to review HEAD is empty. Pending native-test-server diagnostics are test-only; `deploy/baota/prepare-runtime.cjs` explicitly removes its compiled script. Documentation, tests and debug constructor repair do not justify rebuilding this frozen production ZIP.

Windows release source `20ebacfa6779baa2bea0ef761c220e0ea79efed5`, local014 built, not installed. Independently recomputed Setup `4242155528954c56272fd07d7aa49434b4063b4a28492c5ea193ebd01f8d6ae7`, main `51bbe6801b2dda7843c9fcbdba1abd4ec41e2e4cf630691e23fa69e99a820579`, Runner `ca343b5673df25815219b61c47cde5bd0f195e98104894f04acf2b0e1603ab00`. No unified fully accepted Windows/Linux candidate exists. Future documentary HEAD is not a new binary source.

## Actual evidence assessment

[COS report](V1-FINAL-GATE-COS-20261106.md) correctly separates three original live cases, frozen-package module HTTP, owned-object restoration, PostgreSQL archive restoration, and native gaps. Raw `.cache/final-cos/package-evidence/object-restore-proof.json` independently inspected: three exact owned keys each show DELETE204, missing404, restored200 and expected sizes/hashes. Restored API log records three-object PASS. Constructor-prefix launcher imports actual ZIP modules; it is not standard production index/default-prefix execution. VersionId=null restoration is not pinned non-null version recovery. Cleanup and scope are explicit. No evidence attribution correction required for A.

B raw `.honsen-native-qa/native-smoke-20261106042300.test.json` independently inspected: corePASS,38 trusted-command denials, actual late401 four cases, management401 four cases, replacement-session preservation, origin records and owner recovery. Debug source boundary is baseline0b78424 plus f3e6af8 legacy debug fixture constructor repair; debug EXE reported hash `26d1e3173284dc9c5ba146e75be5e18dacf379929cfba39ac38c4febd38ba35b`. This is host debug WebView2/Tauri IPC with synthetic profiles, not installed014 security acceptance. Prior42000 missing-CDP,42100 premature login-readiness,42200 obsolete blanket-pause failures remain historical failed attempts, not silently relabelled PASS.

Reviewed replacement assertions in `tests/native/g1-conflict-origin.mjs`: B begins without A cursor, advances its own cursor, and complete A cursor/lastSuccess/outbox/dual conflict payload snapshot remains equal. Known-ID/forged-account/device refusals and 401/relogin remain. Replacing blanket multi-account Pull pause is consistent with approved per-account cursor semantics and does not weaken the account isolation requirement. Execution supports this bounded G1 core, not the entire original security matrix.

Required evidence correction: raw `uiConflictResidue` says production panel is not mounted. B confirms a panel exists but was not navigated. Correct interpretation is **conflict UI not exercised**; retain original raw, annotate reporting rather than using its wording as product fact.

[C report](INSTALL-TOOLBOX-UAC-FINAL-GATE-20261106.md) accurately retains policy rejection, current014 build-only status, exact historical012/013 boundaries, stable404, missing actual caller apply, launch argument conflict and actual UAC absence. Host admin consent0 cannot establish genuine UAC cancellation. Wizard cancellation cannot substitute. No conflict repair or new test-channel approval was present at review time.

## Classified remaining issues

- BLOCKER: complete installed native/security matrix, native historical restoration and two-client original/derived COS byte recovery remain unproven by reviewed evidence. API archive restoration cannot replace these.
- BLOCKER: authenticated business-data012→013 upgrade and migration preservation remain NOT RUN; historical initialized-empty SQLite retention is narrower.
- BLOCKER: actual Toolbox discovery/launch/download/hash/apply/Runner/install/restart chain lacks compatible caller and qualified asset; stable404 is a failed readiness check. Contract conflict changes require approval.
- BLOCKER: genuine UAC prompt cancellation and current installed lifecycle remain blocked by environment/policy. Do not bypass rejected execution routes.
- DEFERRED: further B attachment runs or later approved caller/channel work require their own exact source/hash/environment review; they are not preaccepted here.
- WARNING: G1 raw panel wording needs the correction above. Reviewed bounded PASS does not automatically close a security/Formal hold.

Documentation-only independent review: no application test rerun or environment mutation performed, no secret configuration read, no production data access. Final recommendation: preserve frozen server package and bounded COS/G1 evidence, keep final release blocked, resolve the concrete installed/native/Toolbox/UAC evidence gates before any stable release.
