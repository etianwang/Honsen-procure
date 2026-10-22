# Linux deployment gate (unfinished)

**The controller is not independently accepted and must not be used for a
production release.** It requires both `--execute` and `DEPLOY_AUTHORIZED=yes`
in a root-owned mode-600 configuration, in addition to its safety checks.
The V1 target is one Linux host, BT Nginx as the only public ingress, and a
dedicated systemd unit for the API. Do not also manage that API with PM2.

## Database and backups

Build the release in a root-owned directory whose contents and ancestors are
not writable by other users. Run `node deploy/linux/create-artifact-manifest.cjs
RELEASE_DIR OUTPUT` with an output path outside the release. It records the Git
commit and hashes release files, including ignored build outputs and
dependencies, and rejects symlinks outside the release. Transfer the printed
manifest SHA-256 through a trusted independent channel and configure it in the
protected deployment configuration. A digest supplied alongside an untrusted
bundle does not authenticate that bundle. The controller checks the manifest
digest and complete inventory before proceeding. Keep the release immutable
from verification through execution.

The protected writer inventory is a required operator attestation, not fleet
discovery. Before each release, inspect scheduled jobs, manual scripts, other
hosts, direct database clients and all credentials. The sample inventory starts
unapproved; only attest an empty `otherWriters` list after every other entry has
been stopped and prevented from reconnecting. Freeze privileged database
administration until release or explicit recovery. Record the actual hostname,
roles and single systemd API manager. SQL fencing independently checks database
login roles and sessions; the inventory cannot prove that an undisclosed
superuser or copied credential does not exist. If this cannot be established,
do not release. Restrict the JSON file to root ownership and mode 600.

Use separate application login roles for old and new releases and a dedicated
deployment administrator. The administrator must be the only trusted identity
allowed to change role privileges, database ownership, or the deployment lock
while a release is in progress. A systemd service environment must use the new
application role; never put credentials in this repository or in audit logs.
The migration runner requires a direct PostgreSQL session, not a transaction
pool. `verify-database.sh` checks that its Node connection and the libpq
connection used by the lock and backup target the same primary and database.
The example configuration is `deploy.env.example`; create the real file outside
the checkout, owned by root with mode 600. Export libpq environment variables in
that file, and use dedicated secrets files or a protected environment. The
example is intentionally not a working production configuration.

`api-grant-policy.json` records reviewed object-specific grants for migrations.
The migration connection's actual role applies those grants after migration;
the audit records that role, object owners and granted privileges. New migration
files require an explicit policy entry before migration can proceed. Default
privileges do not replace this review: they depend on the object creator and
could grant more access than a particular object needs. Readiness checks the
policy using the running API's own database credentials. Historical objects
not listed in the policy still require separately provisioned permissions.
The controller snapshots database object identities before migration and rejects
new or recreated tables, views and sequences without a corresponding policy.
It also blocks newly created routines and user-defined types until the grant
policy is extended and independently reviewed for those object kinds.

The controller draft requires a local private backup and a verified copy on a
different mounted filesystem. It additionally requires a remote filesystem and
an explicit operator assertion that it is offsite. The assertion is not proof
of physical location. The intended restore check restores into a temporary
database on a separate PostgreSQL cluster, compares row counts in the migration
history and two sync tables, and removes the temporary database. It deliberately
does not establish full production recovery or verify role grants.

Backups must be mode 600 and stored under directories inaccessible to other
users. The controller requires the conservative `retain-all` policy: it never
deletes completed backups, including the last verified copy. Set the minimum
approved retention period and separately enforce durable offsite retention;
the controller cannot verify a storage provider's retention policy or physical
location. Removal requires a separate reviewed recovery and retention process. The
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

The final ingress switch is supervised by a separate transient systemd service.
The controller retains the database deployment lock until the supervisor has
verified the completed release and exited successfully. Recovery takes the
existing host lock and checks the current host token before changing ingress;
this fallback relies on the V1 single-deployment-host boundary. A database
connection failure does not by itself transfer ownership of the durable lock.
It watches the controller and attempts to return ingress to maintenance, mask
the API and disable its database role if the controller disappears or times
out. A failed watchdog restart also enters recovery. The recovery audit and
durable database lock still require operator inspection. This is not evidence of
recovery after an entire host or systemd failure; verify that case and actual BT
configuration before production. The API unit's readiness marker is under
`/run`, and therefore must be re-established deliberately after a reboot.

Application rollback and database recovery are different operations. An older
application must not be started against an upgraded schema without a separately
validated compatibility result. Restoring a database overwrites newer changes:
identify and record the restore point, assess changes since that point, and
obtain explicit human authorization before any production restore. No automatic
database downgrade is supported.
