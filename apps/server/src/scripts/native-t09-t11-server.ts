import { CosError, CosStorage } from '../attachments/cos.js'
import { AttachmentService } from '../attachments/service.js'
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
  ['10000000-0000-4000-8000-000000000011', 'engineer-a', ['engineer']],
  ['10000000-0000-4000-8000-000000000012', 'engineer-b', ['engineer']],
  [
    '10000000-0000-4000-8000-000000000013',
    'purchaser',
    ['purchaser', 'administrator'],
  ],
] as const
const nativeScope = {
  countryId: '10000000-0000-4000-8000-000000000001',
  projectId: '10000000-0000-4000-8000-000000000002',
  departmentId: '10000000-0000-4000-8000-000000000003',
  teamId: '10000000-0000-4000-8000-000000000004',
}

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
await waitForNativeDatabase(pool)
await runMigrations(pool)
for (const [id, username, roles] of accounts) {
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
  for (const role of roles)
    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, role],
    )
}
await pool.query(
  `INSERT INTO countries (id, business_code, name, time_zone)
   VALUES ($1, 'NATIVE-TEST-COUNTRY', 'Native test country', 'UTC')
   ON CONFLICT (id) DO NOTHING`,
  [nativeScope.countryId],
)
await pool.query(
  `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair)
   VALUES ($1, $2, 'NATIVE-TEST-PROJECT', 'Native test project', 'Test site', 'Test procurement', 'XOF', 'zh_fr')
   ON CONFLICT (id) DO NOTHING`,
  [nativeScope.projectId, nativeScope.countryId],
)
await pool.query(
  `INSERT INTO departments (id, business_code, name)
   VALUES ($1, 'NATIVE-TEST-DEPARTMENT', 'Native test department')
   ON CONFLICT (id) DO NOTHING`,
  [nativeScope.departmentId],
)
await pool.query(
  `INSERT INTO teams (id, department_id, business_code, name)
   VALUES ($1, $2, 'NATIVE-TEST-TEAM', 'Native test team')
   ON CONFLICT (id) DO NOTHING`,
  [nativeScope.teamId, nativeScope.departmentId],
)
await pool.query(
  `INSERT INTO user_project_bindings (user_id, project_id)
   VALUES ($1, $2) ON CONFLICT (user_id, project_id) DO UPDATE SET deleted_at = NULL`,
  [accounts[0][0], nativeScope.projectId],
)
await pool.query(
  `INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (user_id, project_id, department_id, team_id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()`,
  [
    accounts[0][0],
    nativeScope.projectId,
    nativeScope.departmentId,
    nativeScope.teamId,
  ],
)

const nativeApp = Fastify({
  logger: false,
  https: { pfx: readFileSync(pfxPath), passphrase: pfxPassphrase },
}) as unknown as FastifyInstance
let reversalFaultUsed = false
nativeApp.addHook('onSend', async (request, reply, payload) => {
  const events = (
    request.body as
      | {
          events?: Array<{
            entityType?: string
            payload?: { status?: string }
            eventId?: string
          }>
        }
      | undefined
  )?.events
  const reversal = events?.find(
    (event) =>
      event.entityType === 'procurement_expenditure' &&
      event.payload?.status === 'reversed',
  )
  if (
    request.url === '/api/sync/push' &&
    reply.statusCode === 200 &&
    reversal &&
    !reversalFaultUsed
  ) {
    reversalFaultUsed = true
    console.log(
      JSON.stringify({
        fault: 'post-commit-reversal-503',
        eventId: reversal.eventId,
      }),
    )
    reply.code(503)
    return JSON.stringify({
      error: 'isolated native test post-commit response fault',
    })
  }
  return payload
})
const cos = CosStorage.fromEnvironment(process.env)
if (!cos) throw new Error('COS_TEST_CONFIGURATION_MISSING')
const prefix = required('HONSEN_TEST_COS_PREFIX')
if (!/^honsen-procure-tests\/[0-9a-f-]{36}\/$/.test(prefix))
  throw new Error('INVALID_TEST_PREFIX')
if (process.argv.includes('--cleanup')) {
  const rows = await pool.query<{
    object_key: string
    version_id: string | null
    byte_length: string
    checksum: string
    content_type: string
  }>(
    'SELECT object_key,version_id,byte_length,checksum,content_type FROM attachments WHERE object_key LIKE $1',
    [prefix + '%'],
  )
  for (const row of rows.rows) {
    if (!row.object_key.startsWith(prefix))
      throw new Error('UNOWNED_TEST_OBJECT')
    let version = row.version_id
    try {
      version = (
        await cos.inspect(
          row.object_key,
          Number(row.byte_length),
          row.checksum,
          row.content_type,
        )
      ).versionId
    } catch (error) {
      if (error instanceof CosError && error.code === 'COS_HEAD_404') continue
      throw error
    }
    const status = await cos.removeOwnedTestObject(row.object_key, version)
    if (status !== 204) throw new Error('TEST_OBJECT_CLEANUP_FAILED')
  }
  console.log(JSON.stringify({ cleanup: 'PASS', objects: rows.rowCount }))
  await pool.end()
  process.exit(0)
}
const app = createApp(
  new AuthService(new PostgresAuthStore(pool), { verify: argon2.verify }),
  new MasterDataService(new PostgresMasterDataStore(pool)),
  new SyncService(new PostgresSyncStore(pool)),
  new AuthorizationService(new PostgresAuthorizationStore(pool)),
  new AttachmentService(pool, cos, prefix),
  nativeApp,
)
app.addHook('onClose', async () => pool.end())
await app.listen({ host: '127.0.0.1', port })
console.log('T09/T11 isolated native HTTPS server listening')
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
async function waitForNativeDatabase(
  pool: ReturnType<typeof createPostgresPool>,
) {
  await waitForDatabase(pool)
}
