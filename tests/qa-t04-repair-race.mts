import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { runMigrations } from '../apps/server/src/db/migration-runner.js'
import { PostgresSyncStore } from '../apps/server/src/sync/postgres-store.js'
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
try {
  await runMigrations(pool)
  const actorId = randomUUID(),
    ids = [randomUUID(), randomUUID(), randomUUID()],
    code = `DUP-${randomUUID()}`
  await pool.query(
    "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES ($1,'QA','qa','synthetic','en-US')",
    [actorId],
  )
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL session_replication_role = 'replica'")
    for (const id of ids) {
      await client.query(
        "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_category',$1,1,$2,$3)",
        [id, { id, businessCode: code, name: 'QA', version: 1 }, actorId],
      )
      await client.query(
        'INSERT INTO category_code_quarantine(entity_id,business_code) VALUES ($1,$2)',
        [id, code],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  const store = new PostgresSyncStore(pool),
    actor = {
      id: actorId,
      roles: ['administrator' as const],
      installationId: randomUUID(),
    },
    newBusinessCode = `FIX-${randomUUID()}`
  const requests = ids.slice(0, 2).map((categoryId) => ({
    requestId: randomUUID(),
    categoryId,
    expectedVersion: 1,
    newBusinessCode,
    reason: 'QA concurrency',
  }))
  const outcomes = await Promise.allSettled(
    requests.map((request) => store.repairCategory({ actor, request })),
  )
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1)
  const winner = outcomes.findIndex((x) => x.status === 'fulfilled')
  const replay = await store.repairCategory({
    actor,
    request: requests[winner]!,
  })
  assert.equal(replay.categoryId, requests[winner]!.categoryId)
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM sync_entities WHERE entity_type='material_category' AND payload_json->>'businessCode'=$1",
        [newBusinessCode],
      )
    ).rows[0].n,
    1,
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_entries WHERE action='repair_business_code'",
      )
    ).rows[0].n,
    1,
  )
  console.log(
    'PASS: competing repairs produce one owner and one audit; exact request replay returns original result',
  )
} finally {
  await pool.end()
}
