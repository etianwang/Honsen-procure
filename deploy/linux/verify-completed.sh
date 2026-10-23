#!/usr/bin/env bash
# Exit 3 means this SHA has not been recorded; any other failure is unsafe.
set -euo pipefail
: "${RELEASE_SHA:?}" "${RELEASE_MANIFEST_SHA256:?}" "${RELEASE_DIR:?}" "${OLD_ROLE:?}" "${NEW_ROLE:?}" "${INGRESS_INCLUDE:?}" "${INGRESS_HOST:?}" "${INGRESS_PORT:?}"
[[ $# == 2 ]] || exit 2
marker=$1
current=$2
[[ -e $marker ]] || exit 3
[[ -f $marker && ! -L $marker && $(stat -c %u "$marker") == 0 && $(stat -c %a "$marker") == 600 ]] || exit 1
mapfile -t records < "$marker"
[[ ${#records[@]} == 2 ]] || exit 1
recorded=${records[0]}
[[ $recorded =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ $recorded == "$RELEASE_SHA" ]] || exit 3
[[ ${records[1]} == "$RELEASE_MANIFEST_SHA256" && $RELEASE_MANIFEST_SHA256 =~ ^[0-9a-f]{64}$ ]] || { echo 'same commit has a different artifact digest' >&2; exit 1; }
[[ -L $current && $(readlink -f "$current") == $(readlink -f "$RELEASE_DIR") ]] || exit 1
systemctl is-active --quiet honsen-procure.service
pid=$(systemctl show -p MainPID --value honsen-procure.service)
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
bash "$script_dir/verify-running-release.sh" "$pid" "$RELEASE_DIR"
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
# This check is read-only: a repeat must not apply a newly missing migration.
(cd "$RELEASE_DIR" && node <<'JS'
const fs = require('node:fs')
const crypto = require('node:crypto')
const { Client } = require('pg')
async function main() {
  const files = fs.readdirSync('apps/server/migrations').filter(name => name.endsWith('.sql')).sort()
  const client = new Client({ connectionString: process.env.POSTGRES_URL })
  try {
    await client.connect()
    const rows = (await client.query('SELECT name, checksum FROM public.schema_migrations ORDER BY name')).rows
    if (rows.length !== files.length) throw new Error('migration count differs')
    for (let i = 0; i < files.length; i++) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(`apps/server/migrations/${files[i]}`)).digest('hex')
      if (rows[i].name !== files[i] || rows[i].checksum !== digest) throw new Error('migration history differs')
    }
  } finally { await client.end() }
}
main().catch(() => { process.stderr.write('deployment migration history does not match release\n'); process.exitCode = 1 })
JS
)
