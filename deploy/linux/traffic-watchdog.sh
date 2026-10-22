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
  event recovery_started || :
  if ! bash "$script_dir/switch-ingress.sh" maintenance; then
    systemctl stop "$NGINX_UNIT" || :
  fi
  systemctl mask --runtime --now honsen-procure.service || :
  rm -f /run/honsen-procure/deployment-ready
  event recovery_finished || :
  touch "$guard/failed"
}
# A restart means the preceding service failed; never resume a live switch.
if ! mkdir "$guard/started" 2>/dev/null; then recover; exit 0; fi
if ! alive; then recover; exit 0; fi
setsid bash "$script_dir/switch-ingress.sh" live &
child=$!
for _ in {1..2400}; do
  if ! alive; then
    kill -KILL -- "-$child" 2>/dev/null || :
    wait "$child" 2>/dev/null || :
    recover
    exit 0
  fi
  if ! kill -0 "$child" 2>/dev/null; then
    if ! wait "$child"; then recover; exit 0; fi
    touch "$guard/ready"
    break
  fi
  sleep .05
done
if [[ ! -e $guard/ready ]]; then
  kill -KILL -- "-$child" 2>/dev/null || :
  wait "$child" 2>/dev/null || :
  recover
  exit 0
fi
for _ in {1..2400}; do
  if [[ -f $guard/committed ]]; then event committed || :; exit 0; fi
  if ! alive; then recover; exit 0; fi
  sleep .05
done
recover
