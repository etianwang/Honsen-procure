import argon2 from 'argon2'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createApp } from '../app.js'
import { AuthService, hashToken } from '../auth/service.js'
import { AuthorizationService } from '../authorization/service.js'
import { PostgresAuthorizationStore } from '../authorization/postgres-store.js'
import { runMigrations } from '../db/migration-runner.js'
import { createPostgresPool, waitForDatabase } from '../db/pool.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { PostgresMasterDataStore } from '../master-data/postgres-store.js'
import { MasterDataService } from '../master-data/service.js'
import { PostgresSyncStore } from '../sync/postgres-store.js'
import { SyncService } from '../sync/service.js'
import {
  observeNativePushCancellation,
  type NativePushCancellationObservation,
} from './native-push-cancellation.js'
import { createNativeAuthBarrier } from './native-auth-barrier.js'

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
const diagnosticPath = process.env.HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH
if (
  diagnosticPath &&
  (!isAbsolute(diagnosticPath) || !diagnosticPath.endsWith('.test.jsonl'))
) {
  throw new Error(
    'HONSEN_PROCURE_TEST_DIAGNOSTICS_PATH must be an absolute .test.jsonl path',
  )
}
const pushBarrier = process.env.HONSEN_PROCURE_TEST_PUSH_BARRIER
const pushBarrierReadyPath =
  process.env.HONSEN_PROCURE_TEST_PUSH_BARRIER_READY_PATH
const pushBarrierReleasePath =
  process.env.HONSEN_PROCURE_TEST_PUSH_BARRIER_RELEASE_PATH
const pushBarrierPidPath = process.env.HONSEN_PROCURE_TEST_PUSH_BARRIER_PID_PATH
const nativeTestRunId = process.env.HONSEN_PROCURE_TEST_RUN_ID
if (
  pushBarrier &&
  pushBarrier !== 'before-commit' &&
  pushBarrier !== 'after-commit'
)
  throw new Error(
    'HONSEN_PROCURE_TEST_PUSH_BARRIER must be before-commit or after-commit',
  )
if (
  pushBarrier &&
  (!pushBarrierReadyPath ||
    !pushBarrierReleasePath ||
    !pushBarrierPidPath ||
    !nativeTestRunId ||
    !isAbsolute(pushBarrierReadyPath) ||
    !isAbsolute(pushBarrierReleasePath) ||
    !isAbsolute(pushBarrierPidPath) ||
    !pushBarrierReadyPath.endsWith('.signal') ||
    !pushBarrierReleasePath.endsWith('.signal') ||
    !pushBarrierPidPath.endsWith('.pid'))
)
  throw new Error(
    'native Push barrier requires absolute ready/release .signal paths, EXE .pid path and run ID',
  )

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
const waitForAuthBarrier = createNativeAuthBarrier(
  process.env.HONSEN_PROCURE_TEST_AUTH_BARRIER_PREFIX,
  nativeTestRunId,
)
const authBarrierObservations = new Map<
  string,
  Awaited<ReturnType<typeof waitForAuthBarrier>>
>()
nativeApp.addHook('onRequest', async (request) => {
  if (
    request.method === 'GET' &&
    (request.url.startsWith('/api/sync/pull') ||
      request.url.startsWith('/api/authorization/bindings/'))
  ) {
    const observation = await waitForAuthBarrier(request.id)
    if (observation) authBarrierObservations.set(request.id, observation)
  }
})
let pushBarrierUsed = false
let pushTerminationSnapshotRecorded = false
let pushTerminationEvidence: PushTerminationEvidence | undefined
type PushTerminationEvidence = NativePushCancellationObservation & {
  runId: string
  scenario: 'A' | 'B'
  requestId: string
  eventId: string
  exePid: string
  handlerExecuted: boolean
}
async function recordPushTerminationSnapshot(
  eventId: string,
  entityId: string | undefined,
  snapshot: 'before-recovery' | 'after-recovery',
  handlerExecuted: boolean,
  evidence: PushTerminationEvidence,
) {
  const event = await pool.query<{ count: string; version: string | null }>(
    `SELECT COUNT(*)::text AS count, MAX(server_version)::text AS version
     FROM sync_events WHERE event_id = $1`,
    [eventId],
  )
  const entity = entityId
    ? await pool.query<{ version: string | null }>(
        `SELECT MAX(version)::text AS version FROM sync_entities WHERE entity_id = $1`,
        [entityId],
      )
    : { rows: [{ version: null }] }
  writeDiagnostic({
    route: 'POST /api/sync/push',
    terminationSnapshot: snapshot,
    eventId,
    eventCount: event.rows[0]?.count ?? '0',
    eventVersion: event.rows[0]?.version ?? '0',
    entityVersion: entity.rows[0]?.version ?? '0',
    handlerExecuted,
    cancellationObserved: true,
    runId: evidence.runId,
    scenario: evidence.scenario,
    requestId: evidence.requestId,
    exePid: evidence.exePid,
    cancellationSource: evidence.cancellationSource,
    cancellationObservedAt: evidence.cancellationObservedAt,
    barrierReleasedAt: evidence.barrierReleasedAt,
    responseCompleted: evidence.responseCompleted,
    socketDestroyed: evidence.socketDestroyed,
  })
}
async function waitForPushBarrier(
  request: { raw: NodeJS.EventEmitter },
  reply: { raw: { writableEnded?: boolean; finished?: boolean } },
  boundary: string,
  eventId: string,
  entityId: string | undefined,
) {
  if (!pushBarrier || pushBarrier !== boundary || pushBarrierUsed) return false
  pushBarrierUsed = true
  const requestId = randomUUID()
  const scenario = boundary === 'before-commit' ? 'A' : 'B'
  const raw = request.raw as NodeJS.EventEmitter & {
    socket?: NodeJS.EventEmitter & { destroyed?: boolean }
  }
  const observer = observeNativePushCancellation({
    raw,
    response: reply.raw,
    onObservation: (observation) => {
      writeDiagnostic({
        route: 'POST /api/sync/push',
        cancellationObservation: true,
        runId: nativeTestRunId,
        scenario,
        requestId,
        eventId,
        exePid: readFileSync(pushBarrierPidPath!, 'utf8').trim(),
        handlerExecuted: boundary === 'after-commit',
        ...observation,
      })
    },
  })
  if (!existsSync(pushBarrierPidPath!))
    throw new Error(
      'native Push barrier requires the EXE PID file before it becomes ready',
    )
  writeFileSync(pushBarrierReadyPath!, boundary, 'utf8')
  writeDiagnostic({
    route: 'POST /api/sync/push',
    barrier: boundary,
    barrierReached: true,
    runId: nativeTestRunId,
    scenario,
    requestId,
    eventId,
  })
  const observation = (await Promise.race([
    observer.cancellation,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'native Push cancellation was not observed while the response barrier was held',
            ),
          ),
        10_000,
      ),
    ),
  ])) as NativePushCancellationObservation
  while (!existsSync(pushBarrierReleasePath!))
    await new Promise((resolve) => setTimeout(resolve, 20))
  const barrierReleasedAt = observer.markBarrierReleased()
  writeDiagnostic({
    route: 'POST /api/sync/push',
    barrier: boundary,
    barrierReleasedAt,
    runId: nativeTestRunId,
    scenario,
    requestId,
    eventId,
  })
  pushTerminationEvidence = {
    ...observation,
    barrierReleasedAt,
    runId: nativeTestRunId!,
    scenario,
    requestId,
    eventId,
    exePid: readFileSync(pushBarrierPidPath!, 'utf8').trim(),
    handlerExecuted: boundary === 'after-commit',
  }
  await recordPushTerminationSnapshot(
    eventId,
    entityId,
    'before-recovery',
    boundary === 'after-commit',
    pushTerminationEvidence,
  )
  pushTerminationSnapshotRecorded = true
  return true
}
nativeApp.addHook('preHandler', async (request, reply) => {
  if (request.method !== 'POST' || request.url !== '/api/sync/push') return
  const event = (
    request.body as
      { events?: Array<{ eventId?: string; entityId?: string }> } | undefined
  )?.events?.[0]
  if (!event?.eventId) return
  if (
    await waitForPushBarrier(
      request,
      reply,
      'before-commit',
      event.eventId,
      event.entityId,
    )
  ) {
    reply
      .code(499)
      .send({ error: 'native test client terminated before commit' })
  }
})
let failedFirstPushResponse = false
let failedFirstPullResponse = false
let failedPullAtCursorResponse = false
const failPullAtCursor = optionalTestCursor(
  'HONSEN_PROCURE_TEST_FAIL_PULL_AT_CURSOR',
)
nativeApp.addHook('onSend', async (request, reply, payload) => {
  if (request.url.startsWith('/api/authorization/bindings/')) {
    const token = request.headers.authorization?.replace(/^Bearer /, '')
    const session = token
      ? (
          await pool.query(
            'SELECT id, user_id, installation_id, revoked_at FROM account_sessions WHERE token_hash = $1',
            [hashToken(token)],
          )
        ).rows[0]
      : undefined
    const barrier = authBarrierObservations.get(request.id)
    authBarrierObservations.delete(request.id)
    writeDiagnostic({
      route: `${request.method} ${request.url}`,
      runId: nativeTestRunId,
      requestId: request.id,
      session,
      ...(barrier ? { authBarrier: true, ...barrier } : {}),
      serverStatus: reply.statusCode,
    })
  }
  if (request.method === 'GET' && request.url.startsWith('/api/sync/pull')) {
    const authBarrier = authBarrierObservations.get(request.id)
    if (authBarrier) {
      authBarrierObservations.delete(request.id)
      writeDiagnostic({
        route: 'GET /api/sync/pull',
        authBarrier: true,
        ...authBarrier,
        serverStatus: reply.statusCode,
      })
    }
    const cursor = (request.query as { cursor?: string } | undefined)?.cursor
    if (
      process.env.HONSEN_PROCURE_TEST_FAIL_FIRST_PULL_RESPONSE === '1' &&
      !failedFirstPullResponse
    ) {
      failedFirstPullResponse = true
      reply.code(503)
      writeDiagnostic({
        route: 'GET /api/sync/pull',
        requestedCursor: cursor ?? '0',
        serverStatus: 503,
        injectedTransportFault: true,
      })
      return JSON.stringify({ error: 'native test Pull transport fault' })
    }
    if (failPullAtCursor === (cursor ?? '0') && !failedPullAtCursorResponse) {
      failedPullAtCursorResponse = true
      reply.code(503)
      writeDiagnostic({
        route: 'GET /api/sync/pull',
        requestedCursor: cursor ?? '0',
        serverStatus: 503,
        injectedTransportFault: true,
      })
      return JSON.stringify({ error: 'native test Pull page transport fault' })
    }
    const page = parsePullPage(payload)
    // Test-only evidence from the actual serialized production response, never a replacement page.
    const g2Evidence =
      process.env.HONSEN_PROCURE_TEST_G2_PULL_EVIDENCE === '1'
        ? {
            runId: nativeTestRunId,
            requestId: request.id,
            responsePage: page,
            session: (
              await pool.query(
                'SELECT id, user_id, installation_id FROM account_sessions WHERE token_hash = $1',
                [
                  hashToken(
                    request.headers.authorization?.replace(/^Bearer /, '') ??
                      '',
                  ),
                ],
              )
            ).rows[0],
          }
        : {}
    writeDiagnostic({
      route: 'GET /api/sync/pull',
      requestedCursor: cursor ?? '0',
      serverStatus: reply.statusCode,
      responseChangeCount: page?.changes?.length,
      responseNextCursor: page?.nextCursor,
      ...g2Evidence,
    })
    return payload
  }
  if (request.method !== 'POST' || request.url !== '/api/sync/push')
    return payload
  const eventIds =
    (
      request.body as { events?: Array<{ eventId?: string }> } | undefined
    )?.events?.flatMap((event) => (event.eventId ? [event.eventId] : [])) ?? []
  const eventId = eventIds[0]
  const entityId = (
    request.body as { events?: Array<{ entityId?: string }> } | undefined
  )?.events?.[0]?.entityId
  let origin:
    | {
        actor_id: string
        origin_account_id: string
        origin_installation_id: string
        result_status: string
        server_version: string | null
      }
    | undefined
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
  const afterCommitBarrierReached = eventId
    ? await waitForPushBarrier(
        request,
        reply,
        'after-commit',
        eventId,
        entityId,
      )
    : false
  if (
    pushBarrier &&
    eventId &&
    pushTerminationSnapshotRecorded &&
    !afterCommitBarrierReached &&
    reply.statusCode === 200
  ) {
    await recordPushTerminationSnapshot(
      eventId,
      entityId,
      'after-recovery',
      true,
      pushTerminationEvidence!,
    )
    pushTerminationSnapshotRecorded = false
  }
  if (
    process.env.HONSEN_PROCURE_TEST_FAIL_FIRST_PUSH_RESPONSE === '1' &&
    !failedFirstPushResponse
  ) {
    failedFirstPushResponse = true
    reply.code(503)
    writeDiagnostic({
      route: 'POST /api/sync/push',
      eventId,
      eventIds,
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
    eventIds,
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

function optionalTestCursor(name: string): string | undefined {
  const value = process.env[name]
  if (!value) return undefined
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error(`${name} must be a non-negative integer cursor`)
  return value
}

function parsePullPage(
  payload: unknown,
): { changes?: unknown[]; nextCursor?: string } | undefined {
  try {
    const text =
      typeof payload === 'string'
        ? payload
        : payload instanceof Uint8Array
          ? Buffer.from(payload).toString('utf8')
          : JSON.stringify(payload)
    return JSON.parse(text) as { changes?: unknown[]; nextCursor?: string }
  } catch {
    return undefined
  }
}

async function waitForNativeDatabase(
  pool: ReturnType<typeof createPostgresPool>,
) {
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
