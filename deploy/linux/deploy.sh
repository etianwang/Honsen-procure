#!/usr/bin/env bash
# Deployment is restricted to a dedicated host and a dedicated direct DB administrator.
set -euo pipefail
umask 077
# This controller is an incomplete checkpoint. Do not remove this guard until
# the integration and failure-path acceptance tests in the handoff pass.
echo 'Deployment controller is not validated and is disabled; see memory.md.' >&2
exit 1
[[ $(id -u) == 0 ]] || { echo 'root is required' >&2; exit 1; }
[[ $# == 1 && -f $1 && ! -L $1 && $(stat -c %u "$1") == 0 && $(stat -c %a "$1") == 600 ]] || { echo 'root-owned mode-600 configuration required' >&2; exit 1; }
# Configuration is trusted root-owned shell input.
source "$1"
: "${POSTGRES_URL:?}" "${PGDATABASE:?}" "${OLD_ROLE:?}" "${NEW_ROLE:?}" "${RELEASE_DIR:?}" "${RELEASE_SHA:?}" "${BACKUP_DIR:?}" "${EXTERNAL_BACKUP_DIR:?}" "${AUDIT_DIR:?}" "${NGINX_BIN:?}" "${NGINX_UNIT:?}" "${INGRESS_INCLUDE:?}" "${INGRESS_HOST:?}" "${INGRESS_PORT:?}"
: "${RESTORE_SERVICE:?}" "${PGSERVICEFILE:?}" "${PGPASSFILE:?}" "${BACKUP_RETENTION_DAYS:?}" "${OFFSITE_STORAGE_ATTESTED:?}"
: "${RELEASE_MANIFEST:?}" "${RELEASE_MANIFEST_SHA256:?}"
: "${WRITER_INVENTORY:?}"
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $OFFSITE_STORAGE_ATTESTED == yes && $BACKUP_RETENTION_DAYS =~ ^[1-9][0-9]*$ ]] || { echo 'offsite location and retention must be explicitly confirmed' >&2; exit 1; }
[[ $RELEASE_SHA =~ ^[0-9a-f]{40}$ && $RELEASE_DIR == /* && -d $RELEASE_DIR && -d $AUDIT_DIR ]] || exit 2
[[ $(git -C "$RELEASE_DIR" rev-parse HEAD) == "$RELEASE_SHA" && -z $(git -C "$RELEASE_DIR" status --porcelain --untracked-files=no) ]] || { echo 'release source mismatch or dirty' >&2; exit 1; }
node "$script_dir/verify-artifact.cjs" "$RELEASE_DIR" "$RELEASE_SHA" "$RELEASE_MANIFEST" "$RELEASE_MANIFEST_SHA256"
node "$script_dir/verify-writer-inventory.cjs" "$WRITER_INVENTORY" "$OLD_ROLE" "$NEW_ROLE" "$(hostname -f)"
[[ $OLD_ROLE =~ ^[a-z_][a-z0-9_]*$ && $NEW_ROLE =~ ^[a-z_][a-z0-9_]*$ && $OLD_ROLE != "$NEW_ROLE" ]] || exit 2
export POSTGRES_URL PGDATABASE NGINX_BIN NGINX_UNIT INGRESS_INCLUDE INGRESS_HOST INGRESS_PORT RESTORE_SERVICE PGSERVICEFILE PGPASSFILE
exec 9>/run/lock/honsen-procure-deploy.lock
flock -n 9 || { echo 'another deployment is running' >&2; exit 1; }
# Both clients must target the same primary before any durable lock or mutation.
(cd "$RELEASE_DIR" && bash "$script_dir/verify-database.sh")
# The database lock remains after any interrupted or failed deployment. Recovery
# requires an operator to inspect the entire deployment before releasing it.
lock_token=$(cat /proc/sys/kernel/random/uuid)
bash "$script_dir/deployment-lock.sh" acquire "$lock_token"
log=$(mktemp "$AUDIT_DIR/deploy-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX.log")
chmod 600 "$log"
[[ $(stat -c %a "$log") == 600 ]] || exit 1
operator=$(id -un "${SUDO_UID:-0}")
log_event() { printf '%s operator=%s sha=%s step=%s\n' "$(date -u +%FT%TZ)" "$operator" "$RELEASE_SHA" "$1" >> "$log"; }
phase=preflight
failed() {
  result=$?
  if (( result != 0 )); then
    # Audit failure must not prevent the remaining fail-closed actions.
    set +e
    log_event "failed:$phase" || echo 'cannot write deployment audit' >&2
    if [[ $phase != preflight ]]; then
      if ! bash "$script_dir/switch-ingress.sh" maintenance >/dev/null 2>&1; then
        systemctl stop "$NGINX_UNIT" >/dev/null 2>&1 || log_event ingress_stop_failed
      fi
      systemctl mask --runtime --now honsen-procure.service >/dev/null 2>&1 || log_event api_stop_failed
      rm -f -- /run/honsen-procure/deployment-ready
      PGCONNECT_TIMEOUT=5 PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=2000' \
        psql -X -v ON_ERROR_STOP=1 -v role="$NEW_ROLE" -f "$script_dir/disable-role.sql" >/dev/null 2>&1 || log_event new_role_disable_failed
    fi
    echo "deployment failed at $phase; audit: $log" >&2
  fi
}
trap failed EXIT
log_event start
[[ -f "$RELEASE_DIR/apps/server/dist/index.js" && -f "$RELEASE_DIR/node_modules/tsx/dist/cli.mjs" ]] || { echo 'built server or migration runtime missing' >&2; exit 1; }
bash "$script_dir/verify-systemd.sh" "$RELEASE_DIR/deploy/linux/honsen-procure.service"
export RELEASE_SHA RELEASE_MANIFEST_SHA256 RELEASE_DIR OLD_ROLE NEW_ROLE
if bash "$script_dir/verify-completed.sh" /var/lib/honsen-procure/deployment.sha /opt/honsen-procure/current; then
  log_event already_deployed
  bash "$script_dir/deployment-lock.sh" release "$lock_token"
  trap - EXIT
  printf 'version already deployed; audit: %s\n' "$log"
  exit 0
else
  status=$?
  [[ $status == 3 ]] || { echo 'recorded deployment failed verification' >&2; exit 1; }
fi
db_version=$(psql -X -Atqc 'SHOW server_version_num')
[[ $db_version =~ ^16[0-9]{4}$ ]] || { echo 'PostgreSQL 16 required' >&2; exit 1; }
log_event "postgres_version:$db_version"
if [[ -L /opt/honsen-procure/current ]]; then
  prior=$(git -C /opt/honsen-procure/current rev-parse HEAD)
  [[ $prior =~ ^[0-9a-f]{40}$ ]] || exit 1
  log_event "previous_sha:$prior"
elif [[ -e /opt/honsen-procure/current ]]; then
  echo 'current release is not a symlink' >&2; exit 1
fi
[[ -d $BACKUP_DIR && -d $EXTERNAL_BACKUP_DIR ]] || exit 1
offsite_type=$(findmnt -n -o FSTYPE --target "$EXTERNAL_BACKUP_DIR")
[[ $offsite_type == nfs || $offsite_type == nfs4 || $offsite_type == cifs || $offsite_type == fuse.sshfs ]] || { echo 'offsite backup must use a supported remote filesystem' >&2; exit 1; }
log_event "backup_retention_days:$BACKUP_RETENTION_DAYS"
phase=maintenance
bash "$script_dir/switch-ingress.sh" maintenance
log_event maintenance
phase=stop_old
systemctl mask --runtime --now honsen-procure.service
[[ $(systemctl show -p LoadState --value honsen-procure.service) == masked ]] || { echo 'API unit could not be masked' >&2; exit 1; }
bash "$script_dir/verify-stopped.sh"
log_event old_stopped
phase=fence
psql -X -v ON_ERROR_STOP=1 -v old_role="$OLD_ROLE" -v new_role="$NEW_ROLE" -f "$script_dir/fence-writers.sql" >/dev/null
log_event writers_fenced
phase=backup
backup=$(bash "$script_dir/backup.sh" "$BACKUP_DIR")
external=$(bash "$script_dir/verify-external-backup.sh" "$backup" "$EXTERNAL_BACKUP_DIR")
bash "$script_dir/verify-restore.sh" "$external" >> "$log" 2>&1
log_event backup_verified
log_event "backup_local:$backup"
log_event "backup_external:$external"
phase=migration
(cd "$RELEASE_DIR" && npm run migrate --workspace @honsen/server >/dev/null 2>&1)
# A second pass verifies all migration checksums and is also the idempotence gate.
(cd "$RELEASE_DIR" && npm run migrate --workspace @honsen/server >/dev/null 2>&1)
[[ $(psql -X -Atqc "SELECT (to_regclass('public.schema_migrations') IS NOT NULL AND to_regclass('public.sync_entities') IS NOT NULL AND to_regclass('public.sync_events') IS NOT NULL)::int") == 1 ]]
log_event migration_verified
phase=activate
psql -X -v ON_ERROR_STOP=1 -v old_role="$OLD_ROLE" -v new_role="$NEW_ROLE" -f "$script_dir/activate-new-role.sql" >/dev/null
mkdir -p /run/honsen-procure
ln -sT "$RELEASE_DIR" /opt/honsen-procure/.current-next
mv -Tf /opt/honsen-procure/.current-next /opt/honsen-procure/current
: > /run/honsen-procure/deployment-ready
systemctl unmask --runtime honsen-procure.service
systemctl start honsen-procure.service
phase=readiness
systemctl is-active --quiet honsen-procure.service
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/auth/captcha >/dev/null
api_pid=$(systemctl show -p MainPID --value honsen-procure.service)
bash "$script_dir/verify-running-release.sh" "$api_pid" "$RELEASE_DIR"
(cd "$RELEASE_DIR" && bash "$script_dir/verify-api-identity.sh" "$api_pid" "$NEW_ROLE")
[[ $(psql -X -v role="$NEW_ROLE" -At <<'SQL'
SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND usename = :'role';
SQL
) -gt 0 ]]
log_event readiness_passed
phase=traffic
bash "$script_dir/switch-ingress.sh" live
install -d -m 700 -o root -g root /var/lib/honsen-procure
marker=$(mktemp /var/lib/honsen-procure/.deployment.XXXXXXXX)
printf '%s\n%s\n' "$RELEASE_SHA" "$RELEASE_MANIFEST_SHA256" > "$marker"
chmod 600 "$marker"
mv -f -- "$marker" /var/lib/honsen-procure/deployment.sha
log_event traffic_activated
bash "$script_dir/deployment-lock.sh" release "$lock_token"
trap - EXIT
log_event success || { echo "deployment is live but audit finalization failed: $log" >&2; exit 1; }
printf 'deployment succeeded; audit: %s\n' "$log"
