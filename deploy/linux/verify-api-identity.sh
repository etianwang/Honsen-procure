#!/usr/bin/env bash
# Read the unit's own environment without printing its credential.
set -euo pipefail
[[ $# == 2 && $1 =~ ^[1-9][0-9]*$ && $2 =~ ^[a-z_][a-z0-9_]*$ ]] || exit 2
endpoint=$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT current_database() || '|' || coalesce(inet_server_addr()::text, 'unix') || '|' || coalesce(inet_server_port()::text, 'unix')")
actual=$(node - "$1" <<'JS'
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Client } = require('pg')
async function main() {
  const env = readFileSync(`/proc/${process.argv[2]}/environ`, 'utf8').split('\0')
  const urls = env.filter((entry) => entry.startsWith('POSTGRES_URL='))
  if (urls.length !== 1) throw new Error('invalid environment')
  const client = new Client({ connectionString: urls[0].slice('POSTGRES_URL='.length) })
  await client.connect()
  const result = await client.query("SELECT current_user || '|' || current_database() || '|' || coalesce(inet_server_addr()::text, 'unix') || '|' || coalesce(inet_server_port()::text, 'unix') AS identity")
  // The registry uses SELECT FOR UPDATE and INSERT in the sync path.
  const check = await client.query(`SELECT has_schema_privilege(current_user, 'public', 'USAGE')
    AND COALESCE(has_table_privilege(current_user, to_regclass('public.formal_issue_registry'), 'SELECT'), false)
    AND COALESCE(has_table_privilege(current_user, to_regclass('public.formal_issue_registry'), 'INSERT'), false)
    AND COALESCE(has_table_privilege(current_user, to_regclass('public.formal_issue_registry'), 'UPDATE'), false)
    AND COALESCE(has_table_privilege(current_user, to_regclass('public.server_change_log'), 'SELECT'), false)
    AND COALESCE(has_table_privilege(current_user, to_regclass('public.server_change_log'), 'INSERT'), false)
    AND COALESCE(has_sequence_privilege(current_user, to_regclass('public.server_change_log_sequence_seq'), 'USAGE'), false) AS ok`)
  if (!check.rows[0].ok) throw new Error('API database privileges incomplete')
  const policy = JSON.parse(readFileSync(resolve('deploy/linux/api-grant-policy.json'), 'utf8'))
  for (const entries of Object.values(policy)) {
    for (const entry of entries) {
      for (const privilege of entry.privileges) {
        const fn = entry.kind === 'table' ? 'has_table_privilege' : 'has_sequence_privilege'
        const access = await client.query(`SELECT ${fn}(current_user, to_regclass($1), $2) AS allowed`, [`public.${entry.name}`, privilege])
        if (!access.rows[0].allowed) throw new Error('API database privileges incomplete')
      }
    }
  }
  await client.query('SELECT order_id FROM public.formal_issue_registry LIMIT 1')
  await client.query('SELECT sequence FROM public.server_change_log LIMIT 1')
  process.stdout.write(result.rows[0].identity)
  await client.end()
}
main().catch(() => { process.stderr.write('Cannot verify API database identity\n'); process.exit(1) })
JS
)
[[ $actual == "$2|$endpoint" ]] || { echo 'API role or database differs from deployment target' >&2; exit 1; }
