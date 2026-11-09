import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null
const migration = new URL(
  '../../migrations/006_formal_issue_registry.sql',
  import.meta.url,
)

describe.skipIf(!pool)('formal issue registry migration', () => {
  afterAll(async () => {
    await pool!.end()
  })

  it('backfills prior issued rows without changing them', async () => {
    const client = await pool!.connect()
    const schema = `formal_${randomUUID().replaceAll('-', '')}`
    try {
      await client.query('BEGIN')
      await client.query(`CREATE SCHEMA ${schema}`)
      await client.query(`SET LOCAL search_path TO ${schema}`)
      await client.query(
        'CREATE TABLE sync_entities (entity_type text, entity_id uuid, payload_json jsonb)',
      )
      const orderId = randomUUID()
      const installationId = randomUUID()
      const payload = {
        documentType: 'OPA',
        formalDocumentNo: 'fixture-OPA-1',
        formalInstallationId: installationId,
        formalSequence: '1',
        formalSnapshotJson: '{"lines":[]}',
      }
      await client.query(
        `INSERT INTO sync_entities VALUES ('purchase_order', $1, $2)`,
        [orderId, payload],
      )
      await client.query(await readFile(migration, 'utf8'))
      const registered = await client.query<{
        order_id: string
        formal_document_no: string
        formal_snapshot_json: { lines: unknown[] }
      }>(
        'SELECT order_id, formal_document_no, formal_snapshot_json FROM formal_issue_registry',
      )
      expect(registered.rows).toEqual([
        {
          order_id: orderId,
          formal_document_no: 'fixture-OPA-1',
          formal_snapshot_json: { lines: [] },
        },
      ])
      expect(
        (await client.query('SELECT payload_json FROM sync_entities')).rows[0]
          ?.payload_json,
      ).toEqual(payload)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('fails atomically on old duplicate numbers and retains both old rows', async () => {
    const client = await pool!.connect()
    const schema = `formal_${randomUUID().replaceAll('-', '')}`
    try {
      await client.query('BEGIN')
      await client.query(`CREATE SCHEMA ${schema}`)
      await client.query(`SET LOCAL search_path TO ${schema}`)
      await client.query(
        'CREATE TABLE sync_entities (entity_type text, entity_id uuid, payload_json jsonb)',
      )
      const payload = {
        documentType: 'OPA',
        formalDocumentNo: 'duplicate-OPA-1',
        formalInstallationId: randomUUID(),
        formalSequence: '1',
        formalSnapshotJson: '{}',
      }
      await client.query(
        `INSERT INTO sync_entities VALUES
           ('purchase_order', $1, $3), ('purchase_order', $2, $3)`,
        [randomUUID(), randomUUID(), payload],
      )
      await client.query('SAVEPOINT before_migration')
      await expect(
        client.query(await readFile(migration, 'utf8')),
      ).rejects.toMatchObject({ code: '23505' })
      await client.query('ROLLBACK TO SAVEPOINT before_migration')
      expect((await client.query('SELECT 1 FROM sync_entities')).rowCount).toBe(
        2,
      )
      expect(
        (
          await client.query(
            "SELECT to_regclass('formal_issue_registry') AS registry",
          )
        ).rows[0]?.registry,
      ).toBeNull()
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
})
