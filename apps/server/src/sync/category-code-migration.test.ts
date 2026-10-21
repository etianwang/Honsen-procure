import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.TEST_DATABASE_URL

describe.skipIf(!databaseUrl)(
  'category code migration with historical duplicates',
  () => {
    it('preserves duplicate IDs and references while preventing a new claimant', async () => {
      const pool = new Pool({ connectionString: databaseUrl })
      const client = await pool.connect()
      const schema = `t04_${randomUUID().replaceAll('-', '')}`
      const ids = [randomUUID(), randomUUID(), randomUUID()]
      try {
        await client.query(`CREATE SCHEMA "${schema}"`)
        await client.query(`SET search_path TO "${schema}"`)
        await client.query(
          'CREATE TABLE sync_events (event_id uuid PRIMARY KEY)',
        )
        await client.query(
          'CREATE TABLE sync_entities (entity_type text NOT NULL, entity_id uuid NOT NULL, payload_json jsonb NOT NULL, PRIMARY KEY (entity_type, entity_id))',
        )
        await client.query(
          'CREATE TABLE material_reference (id uuid PRIMARY KEY, category_id uuid NOT NULL)',
        )
        for (const id of ids.slice(0, 2)) {
          await client.query(
            "INSERT INTO sync_entities VALUES ('material_category', $1, $2)",
            [id, { businessCode: 'HISTORIC', id }],
          )
          await client.query('INSERT INTO material_reference VALUES ($1, $2)', [
            randomUUID(),
            id,
          ])
        }
        const sql = await readFile(
          new URL(
            '../../migrations/007_category_code_conflict.sql',
            import.meta.url,
          ),
          'utf8',
        )
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('COMMIT')
        await expect(
          client.query(
            "INSERT INTO sync_entities VALUES ('material_category', $1, $2)",
            [ids[2], { businessCode: 'HISTORIC', id: ids[2] }],
          ),
        ).rejects.toMatchObject({
          code: '23505',
          constraint: 'material_category_business_code_unique',
        })
        const rows = await client.query(
          'SELECT entity_id FROM sync_entities ORDER BY entity_id',
        )
        expect(rows.rows.map((row) => row.entity_id).sort()).toEqual(
          ids.slice(0, 2).sort(),
        )
        expect(
          (
            await client.query(
              'SELECT count(*) AS count FROM material_reference',
            )
          ).rows[0].count,
        ).toBe('2')
      } finally {
        await client.query('RESET search_path')
        client.release()
        await pool.end()
      }
    })
  },
)
