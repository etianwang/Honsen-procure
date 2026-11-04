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
