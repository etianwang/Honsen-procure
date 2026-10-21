import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Pool } from 'pg'
const dir = process.env.QA_NATIVE_RESULT_DIR
const result = JSON.parse(readFileSync(`${dir}/close-ab.test.json`, 'utf8'))
const id = result.steps.realUiRepair.categoryId
const db = new DatabaseSync(`${dir}/close-a.test.sqlite`, { readOnly: true })
const intents = db
  .prepare(
    'SELECT request_id,status FROM local_remote_category_repair_intents WHERE category_id=?',
  )
  .all(id)
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
try {
  const remote = await pool.query(
    'SELECT request_id FROM category_code_repairs WHERE category_id=$1',
    [id],
  )
  assert.equal(intents.length, 1)
  assert.equal(intents[0].status, 'accepted')
  assert.equal(remote.rows.length, 1)
  assert.equal(intents[0].request_id, remote.rows[0].request_id)
  console.log(
    'PASS: exactly one durable request ID accepted locally and recorded on server after dropped response',
  )
} finally {
  db.close()
  await pool.end()
}
