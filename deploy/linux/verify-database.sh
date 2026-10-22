#!/usr/bin/env bash
# Verify the libpq lock/backup target and Node migration target are the same primary.
set -euo pipefail
: "${PGDATABASE:?}" "${POSTGRES_URL:?}"
export POSTGRES_URL
expected=$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT system_identifier::text || ':' || current_database() || ':' || (NOT pg_is_in_recovery())::text FROM pg_control_system()")
actual=$(node <<'JS'
const { Client } = require('pg')
const client = new Client({ connectionString: process.env.POSTGRES_URL })
async function main() {
  await client.connect()
  const result = await client.query("SELECT system_identifier::text || ':' || current_database() || ':' || (NOT pg_is_in_recovery())::text AS identity FROM pg_control_system()")
  process.stdout.write(result.rows[0].identity)
  await client.end()
}
main().catch(() => { process.stderr.write('Cannot verify migration database identity\n'); process.exit(1) })
JS
)
[[ $expected == *:true && $actual == "$expected" ]] || { echo 'lock and migration databases differ or are not primary' >&2; exit 1; }
