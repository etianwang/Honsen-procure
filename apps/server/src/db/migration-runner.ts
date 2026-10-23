import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'

const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
)

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect()
  let failed = false
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended('honsen-procure:migrations', 0))",
    )
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    )
    await client.query(
      'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT',
    )
    const applied = (
      await client.query<{ name: string; checksum: string | null }>(
        'SELECT name, checksum FROM schema_migrations',
      )
    ).rows
    const names = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort()

    for (const name of names) {
      const sql = await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        'utf8',
      )
      const checksum = createHash('sha256').update(sql).digest('hex')
      const prior = applied.find((migration) => migration.name === name)
      if (prior) {
        if (prior.checksum && prior.checksum !== checksum) {
          throw new Error(`migration checksum mismatch: ${name}`)
        }
        if (!prior.checksum) {
          await client.query(
            'UPDATE schema_migrations SET checksum = $2 WHERE name = $1 AND checksum IS NULL',
            [name, checksum],
          )
        }
        continue
      }
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    await client.query(
      "SELECT pg_advisory_unlock(hashtextextended('honsen-procure:migrations', 0))",
    )
  } catch (error) {
    failed = true
    throw error
  } finally {
    client.release(failed)
  }
}
