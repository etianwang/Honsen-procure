# Independent P1 recheck — 1e71f13f

- Production SHA: `1e71f13f5068742950ef6efbb94a918d727e251e`.
- Driver SHA: `08e7a011587c566de5c52e460c70448e1927bc0d`.
- [Focused Linux run 39821662332](https://github.com/etianwang/Honsen-procure/actions/runs/39821662332): success; Ubuntu 24.04 hosted VM, systemd, Nginx, Node 24, PostgreSQL 16. The `p1-recheck.log` file is the actual driver output. Driver command is in `.github/workflows/qa-p1-recheck.yml`.
- Earlier [run 39821394816](https://github.com/etianwang/Honsen-procure/actions/runs/39821394816) failed due to the QA driver searching prior scenarios' audit files for `old_stopped`; it killed the next controller before that controller reached the intended checkpoint. The driver was corrected to select a newly created audit file and rerun. This is a harness failure, not evidence of a production defect.

## P1-01 — original reproduced defect CLOSED for tested 006 migration

On an isolated database, existing migration `006_formal_issue_registry.sql` was made pending, then the actual controller applied it. The actual new login role read the new table, and a transaction inserted and updated a valid row. The role also called `nextval` on the existing `server_change_log_sequence_seq`. The transaction rolled back. The test removed INSERT permission after role activation: readiness failed, Nginx returned 503 and the API was masked. Normal release, grant-policy rejection of unreviewed objects, and same-SHA repeat succeeded.

Acceptance limitation: migration 006 does not create a sequence. The sequence tested already existed, so this run does not prove that a sequence newly created by a pending migration receives the correct privileges. Do not infer that requested case from this result.

## P1-02 — original reproduced defect CLOSED in tested isolation

Real controller and supervisor: SIGKILL and SIGTERM before handoff, during lock release after supervisor completion, and after release; SIGKILL during live activation; supervisor SIGKILL during activation and confirmation; stale supervisor during a second deployment; concurrent controller rejection; PostgreSQL stop and restart. The live interruption produced HTTP 503 and persistent lock count 1. The lock-release wrapper verified the supervisor was no longer active. The stale supervisor abandoned recovery when it no longer owned the lock. The database-outage case restored PostgreSQL, observed recovery completion, disabled the new role, and retained the lock. Success and same-SHA repeat passed. Full host reboot recovery was not exercised.

## Decision and remaining gates

The two original reproductions did not recur in this isolated environment. Overall requested acceptance remains **incomplete**: fresh sequence creation by migration and full host reboot recovery are not proven. Recommend completing those targeted checks before final code review, rather than representing this run as complete acceptance. Production CI `quality` was successful for this SHA. BT panel production topology and actual offsite storage remain untested; loopback SSHFS only exercises the transport contract. No production host or database was accessed; no merge was performed.
