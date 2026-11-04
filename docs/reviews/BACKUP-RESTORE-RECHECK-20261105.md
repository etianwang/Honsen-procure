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
