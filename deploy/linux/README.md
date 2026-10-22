# Linux deployment gate (unfinished)

**The controller is disabled and must not be used for a release.** The helper
scripts are checkpoints, not an independently accepted deployment procedure.
The V1 target is one Linux host, BT Nginx as the only public ingress, and a
dedicated systemd unit for the API. Do not also manage that API with PM2.

## Database and backups

Use separate application login roles for old and new releases and a dedicated
deployment administrator. The administrator must be the only trusted identity
allowed to change role privileges, database ownership, or the deployment lock
while a release is in progress. A systemd service environment must use the new
application role; never put credentials in this repository or in audit logs.
The migration runner requires a direct PostgreSQL session, not a transaction
pool. `verify-database.sh` checks that its Node connection and the libpq
connection used by the lock and backup target the same primary and database.

The controller draft requires a local private backup and a verified copy on a
different mounted filesystem. It additionally requires a remote filesystem and
an explicit operator assertion that it is offsite. The assertion is not proof
of physical location. The intended restore check restores into a temporary
database on a separate PostgreSQL cluster, compares row counts in the migration
history and two sync tables, and removes the temporary database. It deliberately
does not establish full production recovery or verify role grants.

Backups must be mode 600 and stored under directories inaccessible to other
users. Set an approved retention period and arrange durable offsite retention;
the controller draft does not delete expired backups or verify a storage
provider's retention policy. Do not remove a backup needed for recovery. The
separate restore cluster must be disposable, contain no production data, and
allow the verifier to create and drop its uniquely named verification database.
Use libpq service and password files; restrict the password file to mode 600.

## Failure and lock recovery

The PostgreSQL deployment lock is persistent. A failed or interrupted
controller leaves the lock in `honsen_deployment.controller_lock`, even when
the database connection is lost. This is intentional: no new controller may
start until an operator checks maintenance state, API processes, database
roles, the migration history, the latest backup and the audit log. A privileged
administrator can inspect the row with:

```sql
SELECT token, acquired_at FROM honsen_deployment.controller_lock;
```

Only after confirming that no earlier controller is still running and that its
effects are understood may the operator use `deployment-lock.sh release TOKEN`
with the same direct database configuration. Record the authorization and
reason in the release audit. Do not delete the row to clear an unknown live
deployment. The implementation of full failure handling is still incomplete.

Application rollback and database recovery are different operations. An older
application must not be started against an upgraded schema without a separately
validated compatibility result. Restoring a database overwrites newer changes:
identify and record the restore point, assess changes since that point, and
obtain explicit human authorization before any production restore. No automatic
database downgrade is supported.
