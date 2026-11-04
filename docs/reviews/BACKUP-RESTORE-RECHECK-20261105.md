# Backup and historical restore recheck — 2026-11-05

Source inspected: `f5631ea39aa59414c6b4194b502a4a46f2c82ecb`. Read-only review and disposable test execution; no business, migration, deployment or Toolbox contract changes.

## Fresh execution

- WSL normal user `honsen-dev` and Docker were usable. Existing native PostgreSQL on 54329 was left untouched.
- Task-owned PostgreSQL16 Alpine container used `--network none`, no host binding and a read-only repository mount. EXIT cleanup removed it.
- Existing `tests/deploy/test-backup-retention.sh` exited1: `realpath: -m: No such file or directory`. Alpine BusyBox lacks the GNU option required by the production Linux backup script. This is an environment mismatch, not acceptance.
- Existing basic backup test also exited1 at `mktemp: : Invalid argument` under Alpine. No production script was modified to conceal this failure.
- Attempted `postgres:16-bookworm` download did not finish after several minutes without progress; bounded cancellation returned exit1. No image was available for execution.
- Available Node24.18.0 Bookworm image was inspected in a disposable network-none container: GNU realpath exists, but psql, pg_dump, pg_restore and PostgreSQL installation are absent. It cannot independently execute these restore tests.

No current-candidate backup/restore PASS is claimed. No COS credentials or objects were accessed. No production database or existing container was modified.

## Minimal next execution

1. Obtain a Debian PostgreSQL16 test image with GNU coreutils. Run the existing retention test in a private container; it checks same-second uniqueness, verified retention, failed dump/list preservation, symlink boundaries and lock refusal.
2. Run `tests/deploy/test-business-restore.sh` with two private PG16 clusters sharing an isolated network namespace on internal5432/5433, distinct system identifiers and no host bindings. Generate its synthetic SQL using the current checkout's `business-restore-model.mjs`. It validates all real migrations, exact public-table content hashes, historical relationships and immutable guards.
3. Build the current server/shared runtime, then run `authenticated-restore-readback.mjs` with explicit expected cluster identities. Historical db2ad11 runtime evidence is insufficient for current-source acceptance. This verifies restored password/CAPTCHA login and scoped API Pull, but remains separate from HTTPS and installed Windows native acceptance.
4. Complete installed native history/object recovery through actual IPC, HTTPS and attachment download with independently authorized object scope. Do not substitute database fixtures or HTTP readback for this gate.

Ignored orchestration drafts are in `.cache/agent-evidence/`: `debian-retention-controller.sh`, `business-restore-controller.sh`, `business-model.sql`. Review before execution; these are not delivered test results.

BLOCKER: fresh full retention/restore evidence requires the compatible disposable runtime. Installed security, native restored history/object consistency and original Toolbox qualified live launch/apply/worker, UAC cancellation and actual caller gates remain open. Previously passed installation P1 was not rerun.

## Successful environment repair and fresh results

The initial failures above remain historical evidence. A subsequent permitted disposable-container dependency installation (`apk add --no-cache coreutils`, GNU9.11-r0) supplied the actual GNU tools; no commands or assertions were mocked, and no host WSL/Docker installation changed.

- Existing `test-backup-retention.sh`: exit0 PASS — same-second unique backups, newest10 retention, failed dump/list preservation, unmanaged/symlink safety, lock refusal and no-clobber collision.
- Existing `test-business-restore.sh`: exit0 PASS — current checkout migrations, parser-valid synthetic formal history, distinct PostgreSQL16 cluster identities, all public content equality, historical relationships and immutable guards.
- Both test runs used task-owned containers, no host port bindings, no persistent data volumes and read-only repository mounts. The business restore source installed coreutils on bridge then disconnected before target creation and actual restore; the target shared only the source network namespace on internal5433. No native54329 access occurred. EXIT traps removed all owned containers.
- Source business/schema boundary remains `f5631ea39aa59414c6b4194b502a4a46f2c82ecb`; the intervening `83fd7b3` changes only this report. The synthetic SQL was generated from that current checkout, not a historical release package.

The compatible-runtime blocker is resolved for these two tests. The earlier BLOCKER sentence applies only to the pre-repair attempt. Authenticated restored API readback, HTTPS/native installed historical/object recovery and Toolbox final gates remain open. These successful script tests do not substitute for those gates. No production deployment, Release or merge occurred.

## Final frozen-source authenticated restore — PASS

Exact application source: `187d42b9ad62bedb3fde4d47670a04bc4a92f1a1`. Fresh Node24.18.0 Bookworm disposable runtime copied only current server/shared source, migrations, test drivers and committed dependency manifests. Linux `npm ci --ignore-scripts`, explicit `npm rebuild argon2`, shared build and server build all passed. No historical runtime package was used. Two npm advisories (low/moderate) remain warnings; no dependency rewrite occurred.

After build, the Node container disconnected from bridge. Two new PG16 clusters shared that isolated network namespace on internal5432/5433; no host binding or persistent volume. Existing hardened authenticated driver checked distinct expected cluster identities before fixture creation, then generated synthetic account/history, dumped/restored the archive, started the actual built API and authenticated through password/arithmetic CAPTCHA. Login200 and scoped Pull200 passed. Exact SPO formal number/frozen snapshot, original300XOF payment,50XOF reversal/net250 and attachment metadata/reference all survived. Object bytes, HTTPS and Windows native were not tested by this driver.

Controller exit0. All three owned containers were removed by EXIT cleanup. Runtime manifest has125 files; independent byte SHA-256 comparison against the frozen checkout found zero mismatches. Safe proof: `AUTHENTICATED-RESTORE-20261105.json`; manifest: `AUTHENTICATED-RESTORE-20261105.sha256`, SHA-256 `4676d514e16c55108c90234bb08433aa36d52ee48b490b2a196138e8d260f31c`.

An earlier dirty-tree authenticated run also reached business PASS but had no source manifest and a final Windows docker-cp fchmodat2 permission failure. It is not used as frozen-SHA evidence. The final run exported via docker-exec/cat and captured actual source hashes, resolving the artifact step without changing tests.

## Installed security prerequisite — actual check

Read-only checks on this host: `C:/Windows/System32/WindowsSandbox.exe` does not exist; `Get-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM` reports `Disabled`. Existing `sandbox-runner-security.ps1` needs a fresh same-source NSIS package and a disposable Sandbox; its guest and installed security scripts explicitly require `WDAGUtilityAccount` and guest HKLM registration. Therefore that installed Runner negative suite was not executed on the host, and debug-native results are not substituted. No Windows feature, host HKLM registration or user data was modified. This does not automatically close or retest installation P1, installed business security, restored native/object consistency or Toolbox final joint gates.

## Final OPA-repair source independent rerun — PASS

After the independently identified OPA first-Push defect was repaired, a new runtime was built from frozen source `854186c3d22540d81ee39c2af49c3128e20c10f6`. The187d42 run and its original result/manifest above remain preserved; they were not relabeled.

Fresh Linux npm ci, Argon2 rebuild, shared/server production builds and the full independent-cluster authenticated restore driver all passed exit0. Real password/CAPTCHA login200, scoped Pull200, exact SPO formal snapshot/number, payment300/reversal50/net250 and attachment-reference preservation passed again. No object bytes, TLS or installed native acceptance is claimed. All three owned containers were removed; native54329 was not used.

The new actual runtime source manifest contains125 files, independently compared byte-for-byte to the frozen checkout with zero SHA-256 mismatches. Manifest SHA-256: `40251ae17aff82aad7ae2fcd84a469d345196a7b5000c855492a1692e0ef9b01`. Safe result and manifest: `AUTHENTICATED-RESTORE-854186C-20261105.json` and `AUTHENTICATED-RESTORE-854186C-20261105.sha256`.
