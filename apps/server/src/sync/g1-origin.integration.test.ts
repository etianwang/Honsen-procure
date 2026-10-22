import { randomBytes, randomUUID } from 'node:crypto'
import { verify } from 'argon2'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { syncPullResponseSchema, syncPushResponseSchema } from '@honsen/shared'
import { createApp } from '../app.js'
import { AuthService, hashToken } from '../auth/service.js'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null

describe.skipIf(!pool)('G1 authenticated conflict-origin boundaries', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
  }, 30_000)

  afterAll(async () => {
    await pool!.end()
  })

  async function account(role: 'administrator' | 'engineer') {
    const id = randomUUID()
    await pool!.query(
      `INSERT INTO users (id, business_code, username, password_hash, ui_locale)
       VALUES ($1, $2, $2, 'fixture-not-used-for-login', 'zh-CN')`,
      [id, `G1-${id}`],
    )
    await pool!.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [id, role],
    )
    return id
  }

  async function session(accountId: string, installationId: string) {
    const token = randomBytes(32).toString('base64url')
    await new PostgresAuthStore(pool!).createSession({
      id: randomUUID(),
      accountId,
      installationId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000),
    })
    return { authorization: `Bearer ${token}` }
  }

  function app() {
    return createApp(
      new AuthService(new PostgresAuthStore(pool!), { verify }),
      undefined,
      new SyncService(new PostgresSyncStore(pool!)),
    )
  }

  it('withholds another account source despite forged identity and known conflict IDs', async () => {
    const api = app()
    const accountA = await account('administrator')
    const accountB = await account('engineer')
    const installationA = randomUUID()
    const headersA = await session(accountA, installationA)
    const headersB = await session(accountB, randomUUID())
    const cursor = (
      await pool!.query<{ cursor: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS cursor FROM server_change_log',
      )
    ).rows[0]!.cursor
    const event = {
      eventId: randomUUID(),
      entityType: 'purchase_order',
      entityId: randomUUID(),
      operation: 'upsert',
      baseVersion: 0,
      payload: {
        applicantId: accountA,
        projectId: randomUUID(),
        workflowStatus: 'draft',
        notes: 'G1 private source fixture',
      },
    }
    const push = (headers: { authorization: string }, events: unknown[]) =>
      api.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers,
        payload: { deviceId: randomUUID(), events },
      })
    try {
      const accepted = await push(headersA, [event])
      expect(accepted.statusCode).toBe(200)
      expect(
        syncPushResponseSchema.parse(accepted.json()).results[0],
      ).toMatchObject({ status: 'accepted', serverVersion: 1 })
      const stale = {
        ...event,
        eventId: randomUUID(),
        payload: { ...event.payload, notes: 'G1 competing source fixture' },
      }
      const conflict = await push(headersA, [stale])
      expect(
        syncPushResponseSchema.parse(conflict.json()).results[0],
      ).toMatchObject({ status: 'conflict', serverVersion: 1 })
      const conflictId = (
        await pool!.query<{ id: string }>(
          'SELECT id FROM sync_conflicts WHERE event_id = $1',
          [stale.eventId],
        )
      ).rows[0]!.id
      const forged = {
        accountId: accountA,
        deviceId: installationA,
        installationId: installationA,
        conflictId,
      }
      const denied = await api.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { ...headersB, 'x-installation-id': installationA },
        payload: { ...forged, events: [event, stale] },
      })
      expect(denied.statusCode).toBe(200)
      expect(syncPushResponseSchema.parse(denied.json()).results).toEqual([
        {
          eventId: event.eventId,
          status: 'validation_error',
          serverVersion: null,
          errorCode: 'FORBIDDEN',
        },
        {
          eventId: stale.eventId,
          status: 'validation_error',
          serverVersion: null,
          errorCode: 'FORBIDDEN',
        },
      ])
      const pull = await api.inject({
        method: 'GET',
        url: `/api/sync/pull?${new URLSearchParams({ cursor, ...forged })}`,
        headers: { ...headersB, 'x-installation-id': installationA },
      })
      expect(pull.statusCode).toBe(200)
      expect(syncPullResponseSchema.parse(pull.json())).toEqual({
        changes: [],
        nextCursor: cursor,
      })
      expect(pull.body).not.toContain('G1 private source fixture')
      expect(denied.body).not.toContain('G1 competing source fixture')
      const origin = await pool!.query<{
        origin_account_id: string
        origin_installation_id: string
      }>(
        'SELECT origin_account_id, origin_installation_id FROM sync_events WHERE event_id = $1',
        [event.eventId],
      )
      expect(origin.rows).toEqual([
        { origin_account_id: accountA, origin_installation_id: installationA },
      ])
      const retained = await pool!.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM sync_conflicts WHERE id = $1',
        [conflictId],
      )
      expect(retained.rows[0]?.count).toBe('1')
      const own = await api.inject({
        method: 'GET',
        url: `/api/sync/pull?cursor=${cursor}`,
        headers: headersA,
      })
      expect(
        syncPullResponseSchema
          .parse(own.json())
          .changes.map((change) => change.entityId),
      ).toEqual([event.entityId])
      const replay = await push(headersA, [event, stale])
      expect(
        syncPushResponseSchema
          .parse(replay.json())
          .results.map((result) => result.status),
      ).toEqual(['accepted', 'conflict'])
      expect(
        (
          await pool!.query<{ count: string }>(
            'SELECT COUNT(*)::text AS count FROM sync_conflicts WHERE event_id = $1',
            [stale.eventId],
          )
        ).rows[0]?.count,
      ).toBe('1')
      expect(
        (
          await pool!.query<{ count: string }>(
            'SELECT COUNT(*)::text AS count FROM server_change_log WHERE entity_id = $1',
            [event.entityId],
          )
        ).rows[0]?.count,
      ).toBe('1')
    } finally {
      await api.close()
    }
  })

  it('rejects another account replay on the same installation while preserving authorized shared Pull', async () => {
    const api = app()
    const accountA = await account('administrator')
    const accountB = await account('administrator')
    const installationId = randomUUID()
    const headersA = await session(accountA, installationId)
    const headersB = await session(accountB, installationId)
    const event = {
      eventId: randomUUID(),
      entityType: 'material',
      entityId: randomUUID(),
      operation: 'upsert',
      baseVersion: 0,
      payload: { nameZh: 'G1 authorized global material' },
    }
    const push = (headers: { authorization: string }, events: unknown[]) =>
      api.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers,
        payload: {
          accountId: accountA,
          deviceId: installationId,
          installationId,
          events,
        },
      })
    try {
      expect(
        syncPushResponseSchema.parse((await push(headersA, [event])).json())
          .results[0]?.status,
      ).toBe('accepted')
      const denied = await push(headersB, [event])
      expect(denied.statusCode).toBe(200)
      expect(syncPushResponseSchema.parse(denied.json()).results[0]).toEqual({
        eventId: event.eventId,
        status: 'validation_error',
        serverVersion: null,
        errorCode: 'VALIDATION_REJECTED',
      })
      const pull = await api.inject({
        method: 'GET',
        url: '/api/sync/pull?cursor=0&limit=500',
        headers: headersB,
      })
      expect(
        syncPullResponseSchema
          .parse(pull.json())
          .changes.find((change) => change.entityId === event.entityId)
          ?.payload,
      ).toEqual(event.payload)
      const next = {
        ...event,
        eventId: randomUUID(),
        baseVersion: 1,
        payload: { nameZh: 'G1 legitimate account B update' },
      }
      expect(
        syncPushResponseSchema.parse((await push(headersB, [next])).json())
          .results[0],
      ).toMatchObject({ status: 'accepted', serverVersion: 2 })
      const origin = await pool!.query<{
        origin_account_id: string
        origin_installation_id: string
      }>(
        'SELECT origin_account_id, origin_installation_id FROM sync_events WHERE event_id = $1',
        [next.eventId],
      )
      expect(origin.rows).toEqual([
        { origin_account_id: accountB, origin_installation_id: installationId },
      ])
    } finally {
      await api.close()
    }
  })

  it('allows new events and Pull on a replacement installation while containing old-origin replay', async () => {
    const api = app()
    const accountId = await account('administrator')
    const installationA = randomUUID()
    const installationB = randomUUID()
    const headersA = await session(accountId, installationA)
    const event = {
      eventId: randomUUID(),
      entityType: 'material',
      entityId: randomUUID(),
      operation: 'upsert',
      baseVersion: 0,
      payload: { nameZh: 'G1 shared global fixture' },
    }
    const push = (headers: { authorization: string }, events: unknown[]) =>
      api.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers,
        payload: {
          deviceId: installationA,
          installationId: installationA,
          events,
        },
      })
    try {
      expect(
        syncPushResponseSchema.parse((await push(headersA, [event])).json())
          .results[0]?.status,
      ).toBe('accepted')
      const headersB = await session(accountId, installationB)
      const oldSession = await push(headersA, [event])
      expect(oldSession.statusCode).toBe(401)
      const replay = await push(headersB, [event])
      expect(syncPushResponseSchema.parse(replay.json()).results[0]).toEqual({
        eventId: event.eventId,
        status: 'validation_error',
        serverVersion: null,
        errorCode: 'VALIDATION_REJECTED',
      })
      const next = {
        ...event,
        eventId: randomUUID(),
        baseVersion: 1,
        payload: { nameZh: 'G1 legitimate replacement installation' },
      }
      const accepted = await push(headersB, [next])
      expect(
        syncPushResponseSchema.parse(accepted.json()).results[0],
      ).toMatchObject({ status: 'accepted', serverVersion: 2 })
      const origin = await pool!.query<{ origin_installation_id: string }>(
        'SELECT origin_installation_id FROM sync_events WHERE event_id = $1',
        [next.eventId],
      )
      expect(origin.rows[0]?.origin_installation_id).toBe(installationB)
      const pull = await api.inject({
        method: 'GET',
        url: '/api/sync/pull?cursor=0&limit=500',
        headers: headersB,
      })
      expect(pull.statusCode).toBe(200)
      const changes = syncPullResponseSchema
        .parse(pull.json())
        .changes.filter((change) => change.entityId === event.entityId)
      expect(changes.map((change) => change.version)).toEqual([1, 2])
      expect(changes[1]?.payload).toEqual(next.payload)
    } finally {
      await api.close()
    }
  })
})
