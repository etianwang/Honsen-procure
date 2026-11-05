import { createPostgresPool } from '../db/pool.js'
import { applyApprovedV1TaxConfig } from './v1-tax-config.js'
const url = process.env.POSTGRES_URL
if (!url)
  throw new Error('POSTGRES_URL migration/seed owner connection required')
const pool = createPostgresPool(url)
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('honsen:v1:bootstrap'))",
  )
  const account = await client.query<{ id: string }>(
    "SELECT u.id FROM users u JOIN audit_entries a ON a.actor_id=u.id WHERE u.username='admin' AND a.action='initial_super_administrator_provisioned' AND a.reason='V1 bootstrap; password change recommended'",
  )
  if (account.rowCount !== 1)
    throw new Error('Approved bootstrap provenance missing')
  const result = await applyApprovedV1TaxConfig(client, account.rows[0]!.id)
  await client.query('COMMIT')
  console.log(JSON.stringify(result))
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
