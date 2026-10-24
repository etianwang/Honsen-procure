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
      `GRANT SELECT ON user_project_bindings, user_project_scope_bindings, projects, departments, teams TO "${role}"`,
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
    const archiveRoutines = [
      [
        'preserve_procurement_expenditure()',
        'procurement_expenditures',
        'procurement_expenditures_immutable',
      ],
      [
        'preserve_attachment_archive()',
        'attachments',
        'attachment_archive_immutable',
      ],
      ['canonical_procurement_payment(jsonb,uuid,timestamptz)', null, null],
    ]
    for (const [signature, table, triggerName] of archiveRoutines) {
      const identity = await db.query(
        "SELECT prosecdef,proconfig,pg_get_userbyid(proowner) AS owner,pg_get_functiondef(oid) AS definition,EXISTS(SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,has_function_privilege($1,oid,'EXECUTE') AS api_execute FROM pg_proc WHERE oid=$2::regprocedure",
        [role, `public.${signature}`],
      )
      assert.equal(identity.rows[0].prosecdef, false)
      assert.equal(identity.rows[0].owner, fn.rows[0].owner)
      assert.equal(identity.rows[0].public_execute, false)
      assert.equal(identity.rows[0].api_execute, table === null)
      assert.deepEqual(identity.rows[0].proconfig, [
        'search_path=pg_catalog, public, pg_temp',
      ])
      await db.query(`ALTER FUNCTION public.${signature} SECURITY DEFINER`)
      result = run(['deploy/linux/grant-api.cjs'])
      assert.notEqual(
        result.status,
        0,
        `${signature} must remain SECURITY INVOKER`,
      )
      await db.query(`ALTER FUNCTION public.${signature} SECURITY INVOKER`)
      if (table) {
        await db.query(
          `ALTER TABLE public.${table} DISABLE TRIGGER ${triggerName}`,
        )
        result = run(['deploy/linux/grant-api.cjs'])
        assert.notEqual(
          result.status,
          0,
          `${triggerName} must stay enabled and bound`,
        )
        await db.query(
          `ALTER TABLE public.${table} ENABLE TRIGGER ${triggerName}`,
        )
      }
      const replacement = table
        ? `CREATE OR REPLACE FUNCTION public.${signature} RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END;$$`
        : "CREATE OR REPLACE FUNCTION public.canonical_procurement_payment(payload jsonb,actor uuid,recorded_at timestamptz) RETURNS jsonb LANGUAGE SQL STABLE AS $$SELECT '{}'::jsonb$$"
      await db.query(replacement)
      result = run(['deploy/linux/grant-api.cjs'])
      assert.notEqual(
        result.status,
        0,
        `${signature} body must match the reviewed hash`,
      )
      await db.query(identity.rows[0].definition)
    }
    await db.query(
      'CREATE FUNCTION public.canonical_procurement_payment() RETURNS integer LANGUAGE sql AS $$SELECT 1$$',
    )
    result = run(['deploy/linux/grant-api.cjs'])
    assert.notEqual(
      result.status,
      0,
      'unreviewed routine overload must fail closed',
    )
    await db.query('DROP FUNCTION public.canonical_procurement_payment()')
    result = run(['deploy/linux/grant-api.cjs'])
    assert.equal(result.status, 0, result.stderr)
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
    const country = randomUUID(),
      project = randomUUID(),
      order = randomUUID(),
      payment = randomUUID(),
      attachment = randomUUID()
    await db.query(
      "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1::uuid,$1::text,'Fixture','UTC')",
      [country],
    )
    await db.query(
      "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1::uuid,$2,$1::text,'Fixture','Fixture','Fixture','XOF','zh_fr')",
      [project, country],
    )
    await db.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('purchase_order',$1,1,$2,$3)",
      [order, { projectId: project, countryId: country }, user],
    )
    await db.query(`SET ROLE "${role}"`)
    await db.query(
      "INSERT INTO procurement_expenditures(id,order_id,project_id,country_id,currency,amount_minor,status,created_by,created_at,payload_json) VALUES($1,$2,$3,$4,'XOF',1,'recorded',$5,1,'{}')",
      [payment, order, project, country, user],
    )
    await db.query('SELECT * FROM procurement_expenditures WHERE id=$1', [
      payment,
    ])
    await assert.rejects(
      db.query(
        'UPDATE procurement_expenditures SET amount_minor=2 WHERE id=$1',
        [payment],
      ),
      (e) => e.code === '42501',
    )
    await assert.rejects(
      db.query('DELETE FROM procurement_expenditures WHERE id=$1', [payment]),
      (e) => e.code === '42501',
    )
    await db.query(
      "INSERT INTO attachments(id,order_id,owner_type,owner_id,project_id,country_id,original_name,content_type,byte_length,checksum,object_key,status,uploaded_by,created_at,payload_json) VALUES($1::uuid,$2,'purchase_order',$2,$3,$4,'fixture.pdf','application/pdf',1,$5,$1::text,'pending_upload',$6,1,'{}')",
      [attachment, order, project, country, 'a'.repeat(64), user],
    )
    await db.query('SELECT * FROM attachments WHERE id=$1 FOR UPDATE', [
      attachment,
    ])
    await db.query(
      'SELECT order_id,status FROM attachments WHERE id=$1 FOR SHARE',
      [attachment],
    )
    await assert.rejects(
      db.query(
        "UPDATE attachments SET original_name='changed.pdf' WHERE id=$1",
        [attachment],
      ),
      (e) => e.code === '42501',
    )
    await db.query(
      "UPDATE attachments SET status='uploaded',version_id='fixture-version' WHERE id=$1",
      [attachment],
    )
    await assert.rejects(
      db.query("UPDATE attachments SET status='pending_upload' WHERE id=$1", [
        attachment,
      ]),
      (e) => e.code === 'P0001',
    )
    await assert.rejects(
      db.query('DELETE FROM attachments WHERE id=$1', [attachment]),
      (e) => e.code === '42501',
    )
    await db.query(
      "INSERT INTO attachment_audit(attachment_id,actor_id,action) VALUES($1,$2,'verified')",
      [attachment, user],
    )
    await db.query('SELECT * FROM attachment_audit WHERE attachment_id=$1', [
      attachment,
    ])
    await assert.rejects(
      db.query('DELETE FROM attachment_audit WHERE attachment_id=$1', [
        attachment,
      ]),
      (e) => e.code === '42501',
    )
    assert.equal(
      (
        await db.query(
          'SELECT public.canonical_procurement_payment($1,$2,NOW()) AS payload',
          [{ orderId: order }, user],
        )
      ).rows[0].payload.countryId,
      country,
    )
    await db.query('RESET ROLE')
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
      assert.equal(
        (
          await shadow.query(
            'SELECT public.canonical_procurement_payment($1,$2,NOW()) AS payload',
            [{ orderId: order }, user],
          )
        ).rows[0].payload.countryId,
        country,
        'temporary shadow table must not change canonical payment country',
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
    await db.query(
      "INSERT INTO catalog_sync_quarantine(source_key,entity_type,entity_id,server_version,original_payload,reason) VALUES ('grant-test','supplier',$1,1,'{}','MANUAL_REVIEW_REQUIRED')",
      [randomUUID()],
    )
    await db.query('SELECT * FROM catalog_sync_quarantine')
    await db.query(
      "UPDATE catalog_sync_quarantine SET resolved_at=NOW() WHERE source_key='grant-test'",
    )
    await assert.rejects(
      db.query(
        "DELETE FROM catalog_sync_quarantine WHERE source_key='grant-test'",
      ),
      (e) => e.code === '42501',
      'API must retain original catalog quarantine evidence',
    )
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
