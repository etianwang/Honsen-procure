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

## Other observations from the same run

The earlier interruption after `old_stopped` retained maintenance, masked API,
and the persistent deployment lock. Old API, writable old role, unknown writer,
backup failure, migration failure, API startup failure, readiness failure,
traffic failure, success, local concurrent controller and repeat scenarios ran
before the interruption failure. Nginx/systemd component integration passed.
The success fixture at that run started with migrations already applied, so it
does not prove a pending migration was applied; the follow-up QA driver stages
existing migration 006 as pending before the success scenario.

The loopback SSHFS target exercises the transport contract only. BT panel
integration, actual offsite storage and production topology remain separate
production gates. No production database or host was accessed.
