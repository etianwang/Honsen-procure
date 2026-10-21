import assert from 'node:assert/strict'
import { copyFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
const {
  QA_SQLITE_SOURCE: source,
  QA_SQLITE_TEST_DB: path,
  QA_PROFILE_EXE: exe,
} = process.env
assert.ok(source && path && exe && path.endsWith('.test.sqlite'))
copyFileSync(source, path, 1)
const tables = [
  'local_material_categories',
  'local_materials',
  'local_master_data_audit_entries',
  'local_sync_outbox',
]
const snapshot = (db) =>
  Object.fromEntries(
    tables.map((t) => [
      t,
      db
        .prepare(`SELECT * FROM ${t} ORDER BY rowid`)
        .all()
        .map((r) => ({ ...r })),
    ]),
  )
let db = new DatabaseSync(path)
db.exec(
  `DROP TABLE local_category_code_repair_events; DROP TABLE local_category_code_repairs; DROP TABLE local_remote_category_repair_intents; DROP TABLE local_sync_projection_quarantine; DELETE FROM local_schema_migrations WHERE version IN ('0050_sync_projection_quarantine','0051_local_category_code_repairs','0052_remote_category_repair_intents'); CREATE TRIGGER qa_fail BEFORE INSERT ON local_schema_migrations WHEN NEW.version='0050_sync_projection_quarantine' BEGIN SELECT RAISE(ABORT,'injected'); END;`,
)
const before = snapshot(db)
for (const t of tables) assert.ok(before[t].length > 0, `${t} fixture is empty`)
db.close()
const env = {
  ...process.env,
  HONSEN_PROCURE_TEST_DB_PATH: path,
  HONSEN_TEST_ENGINEER_A_PASSWORD: randomUUID(),
  HONSEN_TEST_ENGINEER_B_PASSWORD: randomUUID(),
  HONSEN_TEST_PURCHASER_PASSWORD: randomUUID(),
}
const failed = spawnSync(exe, ['seed'], { env, encoding: 'utf8' })
assert.notEqual(failed.status, 0)
db = new DatabaseSync(path)
assert.deepEqual(snapshot(db), before)
assert.equal(
  db
    .prepare(
      "SELECT count(*) n FROM sqlite_master WHERE name='local_sync_projection_quarantine'",
    )
    .get().n,
  0,
)
db.exec('DROP TRIGGER qa_fail')
db.close()
const upgraded = spawnSync(exe, ['seed'], { env, encoding: 'utf8' })
assert.equal(upgraded.status, 0, upgraded.stderr)
db = new DatabaseSync(path)
assert.deepEqual(snapshot(db), before)
assert.equal(
  db
    .prepare(
      "SELECT count(*) n FROM local_schema_migrations WHERE version IN ('0050_sync_projection_quarantine','0051_local_category_code_repairs','0052_remote_category_repair_intents')",
    )
    .get().n,
  3,
)
db.close()
console.log(
  'PASS: native SQLite upgrade failure rolled back; category, material, audit and outbox rows survived successful upgrade',
)
