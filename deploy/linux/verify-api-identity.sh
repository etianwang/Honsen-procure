#!/usr/bin/env bash
# Read the unit's own environment without printing its credential.
set -euo pipefail
[[ $# == 2 && $1 =~ ^[1-9][0-9]*$ && $2 =~ ^[a-z_][a-z0-9_]*$ ]] || exit 2
endpoint=$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT current_database() || '|' || coalesce(inet_server_addr()::text, 'unix') || '|' || coalesce(inet_server_port()::text, 'unix')")
actual=$(node - "$1" <<'JS'
const { readFileSync } = require('node:fs')
const { Client } = require('pg')
async function main() {
  const env = readFileSync(`/proc/${process.argv[2]}/environ`, 'utf8').split('\0')
  const urls = env.filter((entry) => entry.startsWith('POSTGRES_URL='))
  if (urls.length !== 1) throw new Error('invalid environment')
  const client = new Client({ connectionString: urls[0].slice('POSTGRES_URL='.length) })
  await client.connect()
  const result = await client.query("SELECT current_user || '|' || current_database() || '|' || coalesce(inet_server_addr()::text, 'unix') || '|' || coalesce(inet_server_port()::text, 'unix') AS identity")
  process.stdout.write(result.rows[0].identity)
  await client.end()
}
main().catch(() => { process.stderr.write('Cannot verify API database identity\n'); process.exit(1) })
JS
)
[[ $actual == "$2|$endpoint" ]] || { echo 'API role or database differs from deployment target' >&2; exit 1; }
