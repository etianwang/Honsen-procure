# Payment, reversal and COS native regression — 2026-11-04

Result: **PASS** for the existing affected native regression chain at application source `100011d41383bac4a7533c388572b4ac65bb97ee`. Exact tested EXE SHA-256 `fde98259b5b31c2ffab97b40a104ffa6f3ef24490a172a80973feb956221d190`. Two copied real Windows client EXEs use independent installation identities and SQLite profiles, production IPC, isolated HTTPS/PostgreSQL and the authorized COS test namespace. HPA was already exercised by this same source's SPO run and was not mechanically rerun separately.

Raw evidence: `.cache/native-20261104081113/evidence.test.json`; safe selected results and storage-boundary readback are adjacent JSON. Runner log `.cache/payment-100-runner-retry.log`. Source `baseSha` remains100011d; `workingTreeDirty=true` is recorded truthfully because uncommitted evidence documents existed. Application/package/build/deploy input diff against100011d was empty; no production source changed during this frozen-source run. Later containing evidence commits are not the application source SHA.

## Actual results

- Payment and reversal: native writes, post-commit retry, offline/restart and conflict resolution preserve both original conflicting records, receive server acknowledgment, and both effective ledgers equal250XOF. Server ledger count6; reversalPostCommitRetry true.
- Files: native PDF voucher A→B and receipt PNG B→A download/readback hashes match. Actual `tests/fixtures/heic/gradient-512.heic` creates a JPEG preview and preserves the source HEIC for the other client; hashes and attachment IDs are in safe JSON. Receipt import uses the client with its actual receipt row; arbitrary-device receipt creation/projection is not claimed.
- Real native normal payment UI assertion passes, including the persisted payment row and effective paid total. Snapshot/receipt unchanged true. Existing negative attachment-scope assertions run in the same driver; this is not the full installed security matrix.

## COS authorization and cleanup

The existing ignored `cos.txt` was read only into the controlled test-server process. Required fields were present; nonsecret bucket `honsen-materials-1308426049` and region `eu-frankfurt` exactly matched authorization before execution. No credential was printed, copied into guest shares, committed, packaged or changed. Native child-process environments exclude COS secrets.

Only fresh authorized prefix `honsen-procure-tests/496d1d0b-41df-4ae4-b4cc-c5719039fa9c/` was used. The standard runner generates the UUID prefix; the server rejects other prefix shapes. Independent read-only test-database inspection found exactly4 owned object references, all under that one prefix. Cleanup selected only those database-owned keys, checked exact ownership and metadata, and returned `PASS objects4`; no historic bucket object listing or operation occurred. `.cache/native-20261104081113/storage-scope-readback.test.json` retains the safe boundary result and `.cache/native-20261104081113/cleanup.log` retains actual cleanup output.

The first startup attempt failed before business execution with PostgreSQL `read ECONNRESET` while the new local service/forwarder was settling. Its retained directory is `.cache/native-20261104080931`; cleanup was PASS objects0. Only the owned disposable service was recreated; real SQL SELECT1 readiness was verified before the successful run. No business assertion, authorization check or financial expectation changed to make the run pass.

## Cleanup and limits

Owned project `honsen-payment-native-final-20261104` was removed with repository Compose `down --volumes`; container/network removal was confirmed. The keeper was stopped only after its PID, executable name and project command marker matched. Final1420/3443/54329/9241/9242/9251/9252 listener check returned none. The54329 lease was handed to Agent B for its independent PostgreSQL suite. Synthetic SQLite, screenshots and raw evidence remain locally retained.

This closes the affected same-host native regression, not installed Release-package acceptance, two physical host coverage, all security/revocation scenarios, physical printing or V1 as a whole. No production data, main/PR merge, Release or deployment was modified. Earlier a3c995b results remain historical evidence for that source; this report provides a new actual run for100011d instead of transferring their status silently.

## Subsequent independent evidence recheck

Fresh read-only raw-versus-safe JSON/Markdown checks PASS: source100011d, actual copied EXE hashes,250XOF effective ledgers, preserved/acknowledged conflict originals, ledger count6, original HEIC preservation and native UI assertions agree. The saved storage-scope database readback has one authorized UUID prefix under the specified bucket/region and exactly4 object references; actual cleanup.log agrees with PASS objects4. Nothing in this recheck lists or contacts COS, reopens PostgreSQL or reruns an accepted business workflow. The JSON records the bounded recheck rather than treating saved evidence as a new service test.

This evidence does not cover native cancellation/revision/resend, all roles' closed-order immutability or historical attachment-access/retention permissions. In particular, successful cross-client receipt/photo operations on authorized open synthetic orders do not establish access rules for closed records, revoked identities or arbitrary devices without receipt projection. Those security/history gates remain open and cannot inherit this regression PASS.
