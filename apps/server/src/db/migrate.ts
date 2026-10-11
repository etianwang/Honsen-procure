import { runMigrations } from './migration-runner.js'
import { createPostgresPool, waitForDatabase } from './pool.js'

const databaseUrl = process.env.POSTGRES_URL
if (!databaseUrl) throw new Error('POSTGRES_URL is required to run migrations.')

const pool = createPostgresPool(databaseUrl)
try {
  await waitForDatabase(pool)
  await runMigrations(pool)
} finally {
  await pool.end()
}
