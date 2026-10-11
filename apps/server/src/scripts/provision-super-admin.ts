import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createPostgresPool, waitForDatabase } from '../db/pool.js'

const inputSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(12).max(1024),
  businessCode: z.string().trim().min(1).max(64),
})

const [username, password, businessCode] = process.argv.slice(2)
const input = inputSchema.parse({ username, password, businessCode })
const databaseUrl = process.env.POSTGRES_URL
if (!databaseUrl)
  throw new Error('POSTGRES_URL is required to provision a user.')

const pool = createPostgresPool(databaseUrl)
await waitForDatabase(pool)
const client = await pool.connect()
try {
  const id = randomUUID()
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
  })
  await client.query('BEGIN')
  await client.query(
    `INSERT INTO users (id, business_code, username, password_hash, ui_locale)
     VALUES ($1, $2, $3, $4, 'zh-CN')`,
    [id, input.businessCode, input.username, passwordHash],
  )
  await client.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'super_administrator')`,
    [id],
  )
  await client.query(
    `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action, reason)
     VALUES ($1, $2, 'user', $2, 'initial_super_administrator_provisioned', 'Deployment provisioning')`,
    [randomUUID(), id],
  )
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
