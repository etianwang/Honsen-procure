'use strict'
const { Client } = require('pg')
const { randomUUID, createHash } = require('node:crypto')
const { readFileSync, readdirSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const assert = require('node:assert/strict')

async function main() {
  const source = process.env.TEST_DATABASE_URL
  if (!source || !process.env.TMPDIR)
    throw new Error('isolated TEST_DATABASE_URL and TMPDIR required')
  const admin = new Client({ connectionString: source })
  await admin.connect()
  const name = `t04_${randomUUID().replaceAll('-', '')}`
  const role = `t04_${randomUUID().replaceAll('-', '')}`
  const url = new URL(source)
  url.pathname = `/${name}`
  const tmp = mkdtempSync(path.join(process.env.TMPDIR, 't04-grant-'))
  let db
  const run = (args, extra = {}) =>
    spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POSTGRES_URL: url.toString(),
        NEW_ROLE: role,
        MIGRATION_OBJECT_SNAPSHOT: path.join(tmp, 'objects.json'),
        ...extra,
      },
      encoding: 'utf8',
    })
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    await admin.query(`CREATE ROLE "${role}" NOLOGIN`)
    db = new Client({ connectionString: url.toString() })
    await db.connect()
    await db.query(
      'CREATE TABLE schema_migrations (name text primary key, checksum text, applied_at timestamptz default now())',
    )
    const names = readdirSync('apps/server/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
    for (const n of names.filter((n) => n < '007_')) {
      const sql = readFileSync(path.join('apps/server/migrations', n), 'utf8')
      await db.query('BEGIN')
      await db.query(sql)
      await db.query(
        'INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)',
        [n, createHash('sha256').update(sql).digest('hex')],
      )
      await db.query('COMMIT')
    }
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    await db.query(
      `GRANT SELECT ON user_project_bindings, projects TO "${role}"`,
    )
    await db.query(
      `GRANT SELECT, INSERT, UPDATE ON sync_entities, sync_events, audit_entries TO "${role}"`,
    )
    let result = run(['deploy/linux/grant-api.cjs', '--check'])
    assert.equal(result.status, 0, result.stderr)
    result = run(['deploy/linux/grant-api.cjs', '--snapshot'])
    assert.equal(result.status, 0, result.stderr)
    result = run([
      'node_modules/tsx/dist/cli.mjs',
      'apps/server/src/db/migrate.ts',
    ])
    assert.equal(result.status, 0, result.stderr)
    await db.query(
      'CREATE FUNCTION public.unreviewed() RETURNS integer LANGUAGE sql AS $$SELECT 1$$',
    )
    result = run(['deploy/linux/grant-api.cjs'])
    assert.notEqual(result.status, 0, 'unreviewed function must be rejected')
    await db.query('DROP FUNCTION public.unreviewed()')
    await db.query(
      'ALTER FUNCTION public.guard_category_business_code() SECURITY DEFINER',
    )
    result = run(['deploy/linux/grant-api.cjs'])
    assert.notEqual(result.status, 0, 'security definer must be rejected')
    await db.query(
      'ALTER FUNCTION public.guard_category_business_code() SECURITY INVOKER',
    )
    await db.query(`GRANT CREATE ON SCHEMA public TO "${role}"`)
    result = run(['deploy/linux/grant-api.cjs'])
    assert.notEqual(
      result.status,
      0,
      'API schema creation privilege must be rejected',
    )
    await db.query(`REVOKE CREATE ON SCHEMA public FROM "${role}"`)
    result = run(['deploy/linux/grant-api.cjs'])
    assert.equal(result.status, 0, result.stderr)
    await db.query(
      'ALTER TABLE public.sync_entities DISABLE TRIGGER guard_category_business_code',
    )
    result = run(['deploy/linux/grant-api.cjs'])
    assert.notEqual(
      result.status,
      0,
      'disabled category trigger must be rejected',
    )
    await db.query(
      'ALTER TABLE public.sync_entities ENABLE TRIGGER guard_category_business_code',
    )
    const fn = await db.query(
      "SELECT prosecdef, proconfig, pg_get_userbyid(proowner) AS owner, EXISTS (SELECT 1 FROM aclexplode(COALESCE(proacl, acldefault('f', proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc WHERE oid='public.guard_category_business_code()'::regprocedure",
    )
    assert.equal(fn.rows[0].prosecdef, false)
    assert.equal(
      fn.rows[0].owner,
      (await db.query('SELECT current_user')).rows[0].current_user,
    )
    assert.equal(fn.rows[0].public_execute, false)
    assert.equal(
      (
        await db.query(
          "SELECT has_function_privilege($1, 'public.guard_category_business_code()', 'EXECUTE') AS allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    )
    assert.deepEqual(fn.rows[0].proconfig, [
      'search_path=pg_catalog, public, pg_temp',
    ])
    const user = randomUUID(),
      a = randomUUID(),
      b = randomUUID()
    await db.query(
      "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES ($1,$2,$2,'test','en-US')",
      [user, `u_${user}`],
    )
    await db.query('BEGIN')
    await db.query("SET LOCAL session_replication_role = 'replica'")
    await db.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_category',$1,1,$2,$3), ('material_category',$4,1,$5,$3)",
      [
        a,
        {
          id: a,
          businessCode: 'LEGACY',
          name: 'Fixture',
          isActive: true,
          version: 1,
        },
        user,
        b,
        {
          id: b,
          businessCode: 'LEGACY',
          name: 'Fixture',
          isActive: true,
          version: 1,
        },
      ],
    )
    await db.query(
      "INSERT INTO category_code_quarantine(entity_id,business_code) VALUES ($1,'LEGACY'),($2,'LEGACY')",
      [a, b],
    )
    await db.query('COMMIT')
    result = run(
      ['node_modules/tsx/dist/cli.mjs', 'tests/deploy/test-t04-store.mts'],
      { TEST_ACTOR: user, TEST_CATEGORY: b },
    )
    assert.equal(result.status, 0, result.stderr)
    process.stdout.write(result.stdout)
    const c = randomUUID(),
      d = randomUUID()
    await db.query(`SET ROLE "${role}"`)
    await db.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_category',$1,1,$2,$3)",
      [c, { businessCode: 'ONE' }, user],
    )
    await assert.rejects(
      db.query(
        "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_category',$1,1,$2,$3)",
        [d, { businessCode: 'ONE' }, user],
      ),
      (e) => e.code === '23505',
    )
    const shadow = new Client({ connectionString: url.toString() })
    await shadow.connect()
    try {
      await shadow.query(`SET ROLE "${role}"`)
      await shadow.query(
        'CREATE TEMP TABLE sync_entities(entity_type text, entity_id uuid, payload_json jsonb)',
      )
      await assert.rejects(
        shadow.query(
          "INSERT INTO public.sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_category',$1,1,$2,$3)",
          [randomUUID(), { businessCode: 'ONE' }, user],
        ),
        (e) => e.code === '23505',
        'temporary shadow table must not bypass uniqueness',
      )
    } finally {
      await shadow.end()
    }
    await db.query('SELECT * FROM category_code_quarantine')
    await db.query('SELECT * FROM category_code_repairs')
    await assert.rejects(
      db.query('CREATE TABLE public.forbidden(id int)'),
      (e) => e.code === '42501',
    )
    await db.query('RESET ROLE')
    const owners = await db.query(
      "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('category_code_quarantine','category_code_repairs','category_code_quarantine_pkey','category_code_repairs_pkey')",
    )
    assert.equal(owners.rowCount, 4)
    assert(owners.rows.every((row) => row.owner === fn.rows[0].owner))
    await db.query(`REVOKE UPDATE ON category_code_quarantine FROM "${role}"`)
    await db.query(`SET ROLE "${role}"`)
    await assert.rejects(
      db.query("UPDATE category_code_quarantine SET status='resolved'"),
      (e) => e.code === '42501',
    )
    console.log('T04 deployment grants and trigger: PASS')
  } finally {
    if (db) await db.end()
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
    await admin.query(`DROP ROLE IF EXISTS "${role}"`)
    await admin.end()
    rmSync(tmp, { recursive: true, force: true })
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
