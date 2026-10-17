import argon2 from 'argon2'
import Fastify, { type FastifyInstance } from 'fastify'
import { appendFileSync, readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
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
  ['10000000-0000-4000-8000-000000000013', 'purchaser', ['purchaser', 'administrator']],
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
const diagnosticPath = process.env.HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH
if (
  diagnosticPath &&
  (!isAbsolute(diagnosticPath) || !diagnosticPath.endsWith('.test.jsonl'))
) {
  throw new Error(
    'HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH must be an absolute .test.jsonl path',
  )
}

function writeDiagnostic(value: Record<string, unknown>) {
  if (diagnosticPath)
    appendFileSync(diagnosticPath, `${JSON.stringify(value)}\n`, 'utf8')
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
let failedFirstPushResponse = false
nativeApp.addHook('onSend', async (request, reply, payload) => {
  if (request.method !== 'POST' || request.url !== '/api/sync/push') return payload
  const eventId = (
    request.body as { events?: Array<{ eventId?: string }> } | undefined
  )?.events?.[0]?.eventId
  let origin: {
    actor_id: string
    origin_account_id: string
    origin_installation_id: string
    result_status: string
    server_version: string | null
  } | undefined
  if (eventId) {
    const origins = await pool.query<{
      actor_id: string
      origin_account_id: string
      origin_installation_id: string
      result_status: string
      server_version: string | null
    }>(
      `SELECT actor_id, origin_account_id, origin_installation_id, result_status, server_version
       FROM sync_events WHERE event_id = $1`,
      [eventId],
    )
    origin = origins.rows[0]
    if (origin)
      reply.header(
        'x-honsen-test-origin-installation-id',
        origin.origin_installation_id,
      )
  }
  const servicePayload =
    typeof payload === 'string'
      ? payload
      : payload instanceof Uint8Array
        ? Buffer.from(payload).toString('utf8')
        : JSON.stringify(payload)
  if (
    process.env.HONSEN_PROCURE_TEST_FAIL_FIRST_PUSH_RESPONSE === '1' &&
    !failedFirstPushResponse
  ) {
    failedFirstPushResponse = true
    reply.code(503)
    writeDiagnostic({
      route: 'POST /api/sync/push',
      eventId,
      serverStatus: 503,
      injectedPostCommitFault: true,
      servicePayload,
      origin,
    })
    return JSON.stringify({ error: 'native test post-commit transport fault' })
  }
  writeDiagnostic({
    route: 'POST /api/sync/push',
    eventId,
    serverStatus: reply.statusCode,
    servicePayload,
    origin,
  })
  return payload
})
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

async function waitForNativeDatabase(pool: ReturnType<typeof createPostgresPool>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await waitForDatabase(pool)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw lastError
}
