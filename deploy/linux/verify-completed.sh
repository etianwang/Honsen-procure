#!/usr/bin/env bash
# Exit 3 means this SHA has not been recorded; any other failure is unsafe.
set -euo pipefail
: "${RELEASE_SHA:?}" "${RELEASE_DIR:?}" "${OLD_ROLE:?}" "${NEW_ROLE:?}" "${INGRESS_INCLUDE:?}" "${INGRESS_HOST:?}" "${INGRESS_PORT:?}"
[[ $# == 2 ]] || exit 2
marker=$1
current=$2
[[ -e $marker ]] || exit 3
[[ -f $marker && ! -L $marker && $(stat -c %u "$marker") == 0 && $(stat -c %a "$marker") == 600 ]] || exit 1
recorded=$(cat "$marker")
[[ $recorded =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ $recorded == "$RELEASE_SHA" ]] || exit 3
[[ -L $current && $(readlink -f "$current") == $(readlink -f "$RELEASE_DIR") ]] || exit 1
systemctl is-active --quiet honsen-procure.service
pid=$(systemctl show -p MainPID --value honsen-procure.service)
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
(cd "$RELEASE_DIR" && bash "$script_dir/verify-api-identity.sh" "$pid" "$NEW_ROLE")
[[ $(cat "$INGRESS_INCLUDE") == $'# honsen-procure managed ingress\nproxy_pass http://127.0.0.1:3000;' ]] || exit 1
status=$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' --resolve "$INGRESS_HOST:$INGRESS_PORT:127.0.0.1" "https://$INGRESS_HOST:$INGRESS_PORT/api/auth/captcha")
[[ $status == 200 ]]
roles=$(psql -X -qAt -v ON_ERROR_STOP=1 -v old_role="$OLD_ROLE" -v new_role="$NEW_ROLE" <<'SQL'
SELECT (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'old_role' AND NOT rolcanlogin)
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'new_role' AND rolcanlogin)
    AND EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND usename = :'new_role'))::int;
SQL
)
[[ $roles == 1 ]]
