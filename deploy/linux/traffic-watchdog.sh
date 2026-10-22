#!/usr/bin/env bash
# Runs in a systemd transient service, independently of the deploying shell.
set -uo pipefail
config=$1 parent=$2 start=$3 guard=$4 audit=$5
source "$config"
export NGINX_BIN NGINX_UNIT INGRESS_INCLUDE INGRESS_HOST INGRESS_PORT
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
event() { printf '%s step=traffic_watchdog:%s\n' "$(date -u +%FT%TZ)" "$1" >> "$audit"; }
alive() {
  [[ -r /proc/$parent/stat ]] || return 1
  local stat
  stat=$(cat "/proc/$parent/stat") || return 1
  [[ $(awk '{print $3}' <<< "$stat") != Z && $(awk '{print $22}' <<< "$stat") == "$start" ]]
}
recover() {
  event "recovery_started:$1" || :
  if ! bash "$script_dir/switch-ingress.sh" maintenance; then
    systemctl stop "$NGINX_UNIT" || event ingress_stop_failed || :
  fi
  systemctl mask --runtime --now honsen-procure.service || event api_stop_failed || :
  rm -f /run/honsen-procure/deployment-ready
  rm -f /var/lib/honsen-procure/deployment.sha
  if ! PGCONNECT_TIMEOUT=5 PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=2000' \
    psql -X -v ON_ERROR_STOP=1 -v role="$NEW_ROLE" -f "$script_dir/disable-role.sql" >/dev/null 2>&1; then
    event new_role_disable_failed || :
  fi
  event recovery_finished || :
  touch "$guard/failed"
}
# A restart means the preceding service failed; never resume a live switch.
if ! mkdir "$guard/started" 2>/dev/null; then recover watchdog_restart; exit 0; fi
if ! alive; then recover controller_lost; exit 0; fi
setsid bash "$script_dir/switch-ingress.sh" live &
child=$!
for _ in {1..2400}; do
  if ! alive; then
    kill -KILL -- "-$child" 2>/dev/null || :
    wait "$child" 2>/dev/null || :
    recover controller_lost
    exit 0
  fi
  if ! kill -0 "$child" 2>/dev/null; then
    if ! wait "$child"; then recover live_switch_failed; exit 0; fi
    printf '%s\n' "$$" > "$guard/ready"
    break
  fi
  sleep .05
done
if [[ ! -e $guard/ready ]]; then
  kill -KILL -- "-$child" 2>/dev/null || :
  wait "$child" 2>/dev/null || :
  recover live_switch_timeout
  exit 0
fi
for _ in {1..2400}; do
  if [[ -f $guard/committed ]]; then
    if event committed; then exit 0; fi
    recover audit_failed
    exit 0
  fi
  if ! alive; then recover controller_lost; exit 0; fi
  sleep .05
done
recover commit_timeout
