// Explicit object grants avoid broad PostgreSQL default privileges on future objects.
const fs = require('node:fs')
const { createHash } = require('node:crypto')
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
    for (const entry of policy[name]) {
      const allowed =
        entry.kind === 'table'
          ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
          : entry.kind === 'sequence'
            ? ['USAGE', 'SELECT']
            : []
      if (
        entry.kind === 'routine' &&
        entry.name === 'guard_category_business_code' &&
        Array.isArray(entry.privileges) &&
        entry.privileges.length === 0
      )
        continue
      if (
        !/^[a-z_][a-z0-9_]*$/.test(entry.name || '') ||
        !Array.isArray(entry.privileges) ||
        !entry.privileges.length ||
        entry.privileges.some((p) => !allowed.includes(p))
      )
        throw new Error('Invalid API object grant')
    }
  }
  if (process.argv[2] === '--check') return
  const snapshotPath = process.env.MIGRATION_OBJECT_SNAPSHOT
  if (!snapshotPath || !path.isAbsolute(snapshotPath))
    throw new Error('Missing protected migration object snapshot')
  const client = new Client({ connectionString: process.env.POSTGRES_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    const objects =
      await client.query(`SELECT 'relation' AS class, c.oid::text, n.nspname AS schema, c.relname AS name,
      CASE WHEN c.relkind = 'S' THEN 'sequence' ELSE 'table' END AS kind
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p','v','m','S') AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
        AND n.nspname <> 'information_schema'
      UNION ALL
      SELECT 'routine', p.oid::text, n.nspname, p.proname, 'routine'
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname <> 'information_schema'
      UNION ALL
      SELECT 'type', t.oid::text, n.nspname, t.typname, 'unsupported'
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE t.typtype IN ('e','d','r','m') AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
        AND n.nspname <> 'information_schema'`)
    if (process.argv[2] === '--snapshot') {
      fs.writeFileSync(snapshotPath, JSON.stringify(objects.rows), {
        mode: 0o600,
      })
      await client.query('COMMIT')
      return
    }
    const before = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    if (!Array.isArray(before))
      throw new Error('Invalid migration object snapshot')
    const priorOids = new Set(
      before.map((object) => `${object.class}:${object.oid}`),
    )
    const approved = new Set(
      Object.values(policy)
        .flat()
        .map((entry) => `${entry.kind}:${entry.name}`),
    )
    for (const object of objects.rows) {
      if (
        !priorOids.has(`${object.class}:${object.oid}`) &&
        (object.schema !== 'public' ||
          !approved.has(`${object.kind}:${object.name}`))
      ) {
        throw new Error(
          'Migration created an object without a reviewed API grant',
        )
      }
    }
    const roleState = await client.query(
      'SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1',
      [role],
    )
    if (
      roleState.rowCount !== 1 ||
      Object.values(roleState.rows[0]).some(Boolean)
    )
      throw new Error('API role is not safely fenced')
    const schema = await client.query(
      `SELECT has_schema_privilege($1, 'public', 'CREATE') AS api_create,
      EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
        WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE') AS public_create`,
      [role],
    )
    if (schema.rows[0].api_create || schema.rows[0].public_create)
      throw new Error('Untrusted CREATE on public schema')
    const routine =
      await client.query(`SELECT p.prosrc, p.prosecdef, p.prokind, p.pronargs,
      p.prorettype = 'pg_catalog.trigger'::regtype AS returns_trigger,
      l.lanname, pg_get_userbyid(p.proowner) AS owner, current_user AS creator
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname='public' AND p.proname='guard_category_business_code'`)
    const f = routine.rows[0]
    if (
      routine.rowCount !== 1 ||
      f.prosecdef ||
      f.prokind !== 'f' ||
      f.pronargs !== 0 ||
      !f.returns_trigger ||
      f.lanname !== 'plpgsql' ||
      f.owner !== f.creator ||
      createHash('sha256').update(f.prosrc).digest('hex') !==
        '0e108cae4881ce96d38426d0ce8486d1ae8eda16efd6e0487e188b24ff30ad5c'
    )
      throw new Error(
        'Category trigger function is not the reviewed invoker function',
      )
    const trigger =
      await client.query(`SELECT count(*)::int AS count FROM pg_trigger t
      WHERE t.tgrelid='public.sync_entities'::regclass AND t.tgname='guard_category_business_code'
        AND t.tgfoid='public.guard_category_business_code()'::regprocedure
        AND t.tgenabled='O' AND t.tgtype=23 AND NOT t.tgisinternal`)
    if (trigger.rows[0].count !== 1)
      throw new Error('Category uniqueness trigger is missing or disabled')
    await client.query(
      'ALTER FUNCTION public.guard_category_business_code() SET search_path = pg_catalog, public, pg_temp',
    )
    await client.query(
      `REVOKE ALL ON FUNCTION public.guard_category_business_code() FROM PUBLIC, "${role}"`,
    )
    const creator = await client.query(
      'SELECT current_user AS migration_creator',
    )
    const audit = [`migration_creator=${creator.rows[0].migration_creator}`]
    const quotedRole = `"${role}"`
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`)
    for (const entries of Object.values(policy)) {
      for (const entry of entries) {
        if (entry.kind === 'routine') continue
        const obj = await client.query(
          'SELECT c.oid, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2',
          ['public', entry.name],
        )
        if (obj.rowCount !== 1) throw new Error('API grant object missing')
        audit.push(
          `grant_object=${entry.name} owner=${obj.rows[0].owner} privileges=${entry.privileges.join(',')}`,
        )
        await client.query(
          `GRANT ${entry.privileges.join(', ')} ON ${entry.kind.toUpperCase()} public."${entry.name}" TO ${quotedRole}`,
        )
      }
    }
    await client.query('COMMIT')
    process.stdout.write(`${audit.join('\n')}\n`)
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
