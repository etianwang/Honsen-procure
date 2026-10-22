# Independent Linux deployment QA: 7e84b91

Production commit: `7e84b9141728084f635a048f3f76e3b1a191be4a`. QA changes are
confined to the test driver and QA workflow; production deployment files are
unchanged. The tests run only on a disposable GitHub-hosted Linux runner.

## P1: interrupted controller can expose live traffic

Run [39803468619](https://github.com/etianwang/Honsen-procure/actions/runs/39803468619),
job 119910584060, executes the real `deploy/linux/deploy.sh` with PostgreSQL 16,
systemd, real Node API and Nginx. In `interrupt_live`, the QA driver waits for
the live ingress include, sends SIGKILL to the controller, then probes HTTPS.
The process exits 137, the persistent PostgreSQL deployment lock remains held,
yet HTTPS responds 200 and the systemd API is active. The test reports
`unsafe: interrupted deployment left live ingress` and exits 1. The deployment
has not completed its success/audit/lock-release sequence. The in-flight ingress
child can continue after its controller is killed. This breaks the requirement
to remain in maintenance after interrupted deployment; subsequent writes can
make an operator's recovery-point assumptions unsafe.

Repair requires a fail-closed process supervisor or equivalent durable protocol
covering controller termination and in-flight ingress switching; a shell EXIT
trap alone cannot catch SIGKILL. Re-run the actual fault and successful release
on the repaired production SHA, including interruption around traffic activation.

## P1: newly migrated tables may be inaccessible to the new API role

Run [39804242427](https://github.com/etianwang/Honsen-procure/actions/runs/39804242427),
job 119913062749, stages the existing migration `006_formal_issue_registry.sql`
as pending on an isolated PostgreSQL 16 database. The new API role has access to
the existing tables, but no default privilege grant for tables created by the
migration owner. The real controller applies the migration, starts the API,
passes its readiness probe and reports success with traffic enabled. An actual
connection as the new API role then fails with `permission denied for table
formal_issue_registry`. The test exits 1. The release gate does not establish
that the new role can use newly created business objects before enabling traffic.
Provisioning appropriate default privileges may prevent this situation, but the
controller does not verify that prerequisite. Validate the required access for
the target role and repeat this pending-migration scenario on the repaired SHA.

## Other observations from the same run

The earlier interruption after `old_stopped` retained maintenance, masked API,
and the persistent deployment lock. Old API, writable old role, unknown writer,
backup failure, migration failure, API startup failure, readiness failure,
traffic failure, success, local concurrent controller and repeat scenarios ran
before the interruption failure. Nginx/systemd component integration passed.
The success fixture at that run started with migrations already applied, so it
does not prove a pending migration was applied; the follow-up QA driver stages
existing migration 006 as pending before the success scenario. The follow-up run
executed the migration and exposed the permissions failure described above.

The migration-lock tests passed 3/3 and the independent role-fencing and
deployment-lock checks completed on isolated PostgreSQL. Artifact tampering was
rejected. The restore exercise used a separate PostgreSQL cluster and private
backup files; the policy retains all backups rather than deleting recovery points.
The run with the pending migration failed before its repeat scenario; the repeat
and migration-drift rejection passed in the earlier run with no pending migration.
The production workflow had previously passed at the exact production SHA; its
independent rerun must be checked separately for its current result.

The loopback SSHFS target exercises the transport contract only. BT panel
integration, actual offsite storage and production topology remain separate
production gates. No production database or host was accessed.
