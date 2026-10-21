import { Pool } from 'pg'
import { runMigrations } from '../apps/server/src/db/migration-runner.js'
const pool1 = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const pool2 = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const results = await Promise.allSettled([
  runMigrations(pool1),
  runMigrations(pool2),
])
console.log(
  JSON.stringify(
    results.map((r) =>
      r.status === 'fulfilled'
        ? { status: r.status }
        : { status: r.status, message: String(r.reason) },
    ),
  ),
)
await pool1.end()
await pool2.end()
if (results.some((r) => r.status === 'rejected')) process.exitCode = 1
