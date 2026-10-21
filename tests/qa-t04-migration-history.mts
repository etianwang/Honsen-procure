import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Pool } from 'pg'
import { runMigrations } from '../apps/server/src/db/migration-runner.js'
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const dir = new URL('../apps/server/migrations/', import.meta.url)
try {
  await pool.query(
    'CREATE TABLE schema_migrations(name TEXT PRIMARY KEY, checksum TEXT, applied_at TIMESTAMPTZ DEFAULT NOW())',
  )
  for (const name of (await readdir(dir))
    .filter((n) => n.endsWith('.sql') && n < '007')
    .sort()) {
    const sql = await readFile(new URL(name, dir), 'utf8')
    await pool.query(sql)
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)',
      [name, createHash('sha256').update(sql).digest('hex')],
    )
  }
  const [actor, a, b, material, event, audit, installation] = Array.from(
    { length: 7 },
    () => randomUUID(),
  )
  await pool.query(
    "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES ($1,'QA','qa','synthetic','en-US')",
    [actor],
  )
  for (const id of [a, b])
    await pool.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_category',$1,1,$2,$3)",
      [id, { id, businessCode: 'QA-DUP', name: 'Synthetic' }, actor],
    )
  await pool.query(
    "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material',$1,1,$2,$3)",
    [material, { id: material, categoryId: b }, actor],
  )
  await pool.query(
    "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action) VALUES ($1,$2,'material_category',$3,'create')",
    [audit, actor, b],
  )
  await pool.query(
    "INSERT INTO sync_events(event_id,installation_id,actor_id,entity_type,entity_id,operation,base_version,result_status) VALUES ($1,$2,$3,'material_category',$4,'upsert',0,'accepted')",
    [event, installation, actor, b],
  )
  await pool.query(
    "CREATE FUNCTION fail_qa_migration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = '007_category_code_conflict.sql' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_qa BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION fail_qa_migration()",
  )
  await assert.rejects(runMigrations(pool), /injected failure/)
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='sync_events' AND column_name='result_error_code'",
      )
    ).rows[0].n,
    0,
  )
  assert.equal(
    (await pool.query('SELECT count(*)::int AS n FROM sync_entities')).rows[0]
      .n,
    3,
  )
  await pool.query(
    'DROP TRIGGER fail_qa ON schema_migrations; DROP FUNCTION fail_qa_migration()',
  )
  await runMigrations(pool)
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM category_code_quarantine WHERE business_code='QA-DUP'",
      )
    ).rows[0].n,
    2,
  )
  assert.equal(
    (
      await pool.query(
        "SELECT payload_json->>'categoryId' AS id FROM sync_entities WHERE entity_type='material' AND entity_id=$1",
        [material],
      )
    ).rows[0].id,
    b,
  )
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM audit_entries WHERE id=$1',
        [audit],
      )
    ).rows[0].n,
    1,
  )
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM sync_events WHERE event_id=$1',
        [event],
      )
    ).rows[0].n,
    1,
  )
  console.log(
    'PASS: injected migration failure rolled back; historical category UUIDs, reference, audit, event and quarantine retained',
  )
} finally {
  await pool.end()
}
