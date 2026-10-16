import argon2 from 'argon2'
import Fastify, { type FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { createApp } from '../app.js'
import { AuthService } from '../auth/service.js'
import { AuthorizationService } from '../authorization/service.js'
import { PostgresAuthorizationStore } from '../authorization/postgres-store.js'
import { runMigrations } from '../db/migration-runner.js'
import { createPostgresPool, waitForDatabase } from '../db/pool.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { PostgresMasterDataStore } from '../master-data/postgres-store.js'
import { MasterDataService } from '../master-data/service.js'
import { PostgresSyncStore } from '../sync/postgres-store.js'
import { SyncService } from '../sync/service.js'

const accounts = [
  ['10000000-0000-4000-8000-000000000011', 'engineer-a', 'engineer'],
  ['10000000-0000-4000-8000-000000000012', 'engineer-b', 'engineer'],
  ['10000000-0000-4000-8000-000000000013', 'purchaser', 'purchaser'],
] as const

const databaseUrl = required('HONSEN_PROCURE_TEST_DATABASE_URL')
const pfxPath = required('HONSEN_PROCURE_TEST_TLS_PFX')
const pfxPassphrase = required('HONSEN_PROCURE_TEST_TLS_PFX_PASSWORD')
const port = Number.parseInt(
  process.env.HONSEN_PROCURE_TEST_TLS_PORT ?? '3443',
  10,
)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('HONSEN_PROCURE_TEST_TLS_PORT must be 1024-65535')
const parsedDatabaseUrl = new URL(databaseUrl)
if (
  !['127.0.0.1', 'localhost', '::1'].includes(parsedDatabaseUrl.hostname) ||
  !parsedDatabaseUrl.pathname.toLowerCase().includes('test')
) {
  throw new Error(
    'native test server requires a loopback database whose name includes test',
  )
}

const pool = createPostgresPool(databaseUrl)
await waitForDatabase(pool)
await runMigrations(pool)
for (const [id, username, role] of accounts) {
  const password = required(
    `HONSEN_TEST_${username.replace('-', '_').toUpperCase()}_PASSWORD`,
  )
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  await pool.query(
    `INSERT INTO users (id, business_code, username, password_hash, ui_locale, requires_password_change)
     VALUES ($1, $2, $3, $4, 'zh-CN', FALSE)
     ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash,
       is_enabled = TRUE, requires_password_change = FALSE, deleted_at = NULL`,
    [id, `NATIVE-${username.toUpperCase()}`, username, passwordHash],
  )
  await pool.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, role],
  )
}

const nativeApp = Fastify({
  logger: false,
  https: { pfx: readFileSync(pfxPath), passphrase: pfxPassphrase },
}) as unknown as FastifyInstance
const app = createApp(
  new AuthService(new PostgresAuthStore(pool), { verify: argon2.verify }),
  new MasterDataService(new PostgresMasterDataStore(pool)),
  new SyncService(new PostgresSyncStore(pool)),
  new AuthorizationService(new PostgresAuthorizationStore(pool)),
  nativeApp,
)
app.addHook('onClose', async () => pool.end())
await app.listen({ host: '127.0.0.1', port })
console.log(`native test HTTPS server listening on https://localhost:${port}`)

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
