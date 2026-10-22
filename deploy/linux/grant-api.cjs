// Explicit object grants avoid broad PostgreSQL default privileges on future objects.
const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

async function main() {
  const role = process.env.NEW_ROLE
  if (!/^[a-z_][a-z0-9_]*$/.test(role || ''))
    throw new Error('Invalid API role')
  const policy = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'api-grant-policy.json'), 'utf8'),
  )
  const migrations = fs
    .readdirSync(path.resolve('apps/server/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
  if (JSON.stringify(migrations) !== JSON.stringify(Object.keys(policy).sort()))
    throw new Error('Migration has no reviewed API grant policy')
  const historical = new Set([
    '001_auth_and_master_data.sql',
    '002_project_defaults_and_master_data.sql',
    '004_authorization_scopes.sql',
    '005_nullable_project_default_contact.sql',
    '005_sync_event_origin.sql',
  ])
  for (const name of migrations) {
    if (
      !Array.isArray(policy[name]) ||
      (!policy[name].length && !historical.has(name))
    )
      throw new Error('Migration has no explicit object grant')
  }
  if (process.argv[2] === '--check') return
  const client = new Client({ connectionString: process.env.POSTGRES_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    const roleState = await client.query(
      'SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1',
      [role],
    )
    if (
      roleState.rowCount !== 1 ||
      Object.values(roleState.rows[0]).some(Boolean)
    )
      throw new Error('API role is not safely fenced')
    const creator = await client.query(
      'SELECT current_user AS migration_creator',
    )
    process.stdout.write(
      `migration_creator=${creator.rows[0].migration_creator}\n`,
    )
    const quotedRole = `"${role}"`
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`)
    for (const entries of Object.values(policy)) {
      if (!Array.isArray(entries)) throw new Error('Invalid API grant policy')
      for (const entry of entries) {
        const allowed =
          entry.kind === 'table'
            ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
            : entry.kind === 'sequence'
              ? ['USAGE', 'SELECT']
              : []
        if (
          !/^[a-z_][a-z0-9_]*$/.test(entry.name || '') ||
          !Array.isArray(entry.privileges) ||
          !entry.privileges.length ||
          entry.privileges.some((p) => !allowed.includes(p))
        )
          throw new Error('Invalid API object grant')
        const obj = await client.query(
          'SELECT c.oid, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2',
          ['public', entry.name],
        )
        if (obj.rowCount !== 1) throw new Error('API grant object missing')
        process.stdout.write(
          `grant_object=${entry.name} owner=${obj.rows[0].owner} privileges=${entry.privileges.join(',')}\n`,
        )
        await client.query(
          `GRANT ${entry.privileges.join(', ')} ON ${entry.kind.toUpperCase()} public."${entry.name}" TO ${quotedRole}`,
        )
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}
main().catch((error) => {
  process.stderr.write(`API grant policy failed: ${error.message}\n`)
  process.exitCode = 1
})
