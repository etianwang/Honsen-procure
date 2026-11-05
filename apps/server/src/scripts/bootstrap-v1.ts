import { applyApprovedV1TaxConfig } from './v1-tax-config.js'
import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createPostgresPool } from '../db/pool.js'

// Bootstrap credentials are supplied through stdin, never arguments or package defaults.
const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '')
if (password.length < 8 || password.length > 1024)
  throw new Error('Bootstrap password must contain 8–1024 characters')
const url = process.env.POSTGRES_URL
if (!url)
  throw new Error('POSTGRES_URL required (migration/seed owner connection)')
const pool = createPostgresPool(url)
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('honsen:v1:bootstrap'))",
  )
  const existing = await client.query(
    'SELECT id FROM users WHERE username=$1',
    ['admin'],
  )
  if (existing.rowCount) {
    const owned = await client.query(
      "SELECT 1 FROM audit_entries WHERE actor_id=$1 AND action='initial_super_administrator_provisioned' AND reason='V1 bootstrap; password change recommended'",
      [existing.rows[0].id],
    )
    if (owned.rowCount !== 1)
      throw new Error(
        'Existing admin was not initialized by this bootstrap; refusing changes',
      )
    const taxConfiguration = await applyApprovedV1TaxConfig(
      client,
      existing.rows[0].id,
    )
    // A repeat never resets passwords or rewrites historical master data.
    console.log(
      JSON.stringify({
        status: 'already_initialized',
        passwordReset: false,
        taxConfiguration,
      }),
    )
    await client.query('COMMIT')
  } else {
    const count = await client.query<{ count: string }>(
      'SELECT count(*) FROM users',
    )
    if (count.rows[0]?.count !== '0')
      throw new Error('Bootstrap requires an empty account database')
    const admin = randomUUID()
    await client.query(
      "INSERT INTO users(id,business_code,username,password_hash,ui_locale,requires_password_change) VALUES($1,'ADMIN','admin',$2,'zh-CN',FALSE)",
      [admin, await argon2.hash(password, { type: argon2.argon2id })],
    )
    await client.query(
      "INSERT INTO user_roles(user_id,role) VALUES($1,'super_administrator')",
      [admin],
    )
    const publish = async (kind: string, id: string, payload: unknown) => {
      await client.query(
        'INSERT INTO sync_entities(entity_type,entity_id,version,is_deleted,payload_json,updated_by) VALUES($1,$2,1,FALSE,$3,$4)',
        [kind, id, payload, admin],
      )
      await client.query(
        "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES($1,$2,'upsert',1,$3,$4)",
        [kind, id, payload, admin],
      )
    }
    const countries = new Map<string, string>()
    for (const [code, name, zone] of [
      ['CI', '科特迪瓦', 'Africa/Abidjan'],
      ['CM', '喀麦隆', 'Africa/Douala'],
    ]) {
      const id = randomUUID()
      countries.set(code!, id)
      await client.query(
        'INSERT INTO countries(id,business_code,name,time_zone) VALUES($1,$2,$3,$4)',
        [id, code, name, zone],
      )
      await publish('country', id, {
        kind: 'country',
        id,
        business_code: code,
        name,
        time_zone: zone,
        is_active: true,
        version: 1,
      })
    }
    for (const [code, country, name, currency] of [
      ['BETHEL2', 'CI', 'Bethel2办公楼', 'XOF'],
      ['KERENE', 'CI', 'Kerene别墅', 'XOF'],
      ['MINREX', 'CM', 'Minrex数据中心', 'XAF'],
    ]) {
      const id = randomUUID()
      await client.query(
        "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1,$2,$3,$4,$4,'项目部',$5,'zh_fr')",
        [id, countries.get(country!), code, name, currency],
      )
      await publish('project', id, {
        kind: 'project',
        id,
        country_id: countries.get(country!),
        business_code: code,
        name,
        site: name,
        department_name: '项目部',
        default_currency: currency,
        default_language_pair: 'zh_fr',
        is_active: true,
        version: 1,
      })
    }
    for (const [code, name] of [
      ['PCS', '个'],
      ['M', '米'],
      ['M2', '平方米'],
      ['M3', '立方米'],
      ['KG', '千克'],
      ['T', '吨'],
      ['SET', '套'],
      ['BOX', '箱'],
      ['BAG', '袋'],
      ['ROLL', '卷'],
      ['BUCKET', '桶'],
      ['PAIR', '对'],
      ['BAR', '根'],
      ['UNIT', '台'],
    ]) {
      const id = randomUUID()
      await client.query(
        'INSERT INTO units(id,business_code,name) VALUES($1,$2,$3)',
        [id, code, name],
      )
      const payload = {
        kind: 'unit',
        id,
        business_code: code,
        name,
        is_active: true,
        version: 1,
      }
      await client.query(
        "INSERT INTO sync_entities(entity_type,entity_id,version,is_deleted,payload_json,updated_by) VALUES('unit',$1,1,FALSE,$2,$3)",
        [id, payload, admin],
      )
      await client.query(
        "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES('unit',$1,'upsert',1,$2,$3)",
        [id, payload, admin],
      )
    }
    await client.query(
      "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES(gen_random_uuid(),$1,'user',$1,'initial_super_administrator_provisioned','V1 bootstrap; password change recommended')",
      [admin],
    )
    const taxConfiguration = await applyApprovedV1TaxConfig(client, admin)
    await client.query('COMMIT')
    console.log(
      JSON.stringify({
        status: 'initialized',
        countries: 2,
        projects: 3,
        units: 14,
        sites: 0,
        passwordChangeRecommended: true,
        taxConfiguration,
      }),
    )
  }
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
