import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

const url = process.env.TEST_DATABASE_URL
if (
  !url ||
  new URL(url).hostname !== '127.0.0.1' ||
  new URL(url).port !== '55440' ||
  new URL(url).pathname !== '/t04_sync_test'
)
  throw new Error('T04 QA requires its dedicated loopback database')
const pool = new Pool({ connectionString: url })
const actorId = randomUUID()
const a = randomUUID()
const b = randomUUID()
const categoryId = randomUUID()
const service = new SyncService(new PostgresSyncStore(pool))
const actorA = {
  id: actorId,
  roles: ['administrator' as const],
  installationId: a,
}
const actorB = {
  id: actorId,
  roles: ['administrator' as const],
  installationId: b,
}

describe('T04 dedicated PostgreSQL sync QA', () => {
  beforeAll(async () => {
    await runMigrations(pool)
    await pool.query(
      "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
      [actorId, `T04-${actorId}`, `t04-${actorId}`],
    )
  })
  afterAll(async () => {
    await pool.end()
  })
  it('persists category events, replays safely and returns them to another installation', async () => {
    const payload = {
      id: categoryId,
      businessCode: 'T04-QA',
      name: 'Fixture',
      isActive: true,
      version: 1,
    }
    const first = {
      eventId: randomUUID(),
      entityType: 'material_category' as const,
      entityId: categoryId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload,
    }
    const push = (event: typeof first) =>
      service.push(actorA, { deviceId: a, events: [event] })
    const firstResult = await push(first)
    expect(firstResult.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect((await push(first)).results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const stored = await pool.query(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'material_category' AND entity_id = $1",
      [categoryId],
    )
    expect(stored.rows[0].payload_json).toEqual(payload)
    const pulled = await service.pull(actorB, { cursor: '0', limit: 500 })
    expect(
      pulled.changes.find((change) => change.entityId === categoryId)?.payload,
    ).toEqual(payload)
    const next = {
      ...first,
      eventId: randomUUID(),
      baseVersion: 1,
      payload: { ...payload, name: 'Revised', isActive: false, version: 2 },
    }
    expect((await push(next)).results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const second = await service.pull(actorB, {
      cursor: pulled.nextCursor,
      limit: 500,
    })
    expect(
      second.changes.find((change) => change.entityId === categoryId)?.payload,
    ).toEqual(next.payload)
    expect(
      (await service.pull(actorB, { cursor: second.nextCursor, limit: 500 }))
        .changes,
    ).toHaveLength(0)
    const count = await pool.query(
      "SELECT count(*)::int AS count FROM sync_entities WHERE entity_type = 'material_category' AND entity_id = $1",
      [categoryId],
    )
    expect(count.rows[0].count).toBe(1)
    const denied = await service.push(
      { ...actorA, roles: ['purchaser'] },
      { deviceId: a, events: [{ ...next, eventId: randomUUID() }] },
    )
    expect(denied.results[0]).toMatchObject({
      status: 'validation_error',
      errorCode: 'FORBIDDEN',
    })
    const legacyId = randomUUID()
    const legacy = {
      eventId: randomUUID(),
      entityType: 'material_category' as const,
      entityId: legacyId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        kind: 'material_category',
        id: legacyId,
        business_code: 'T04-LEGACY',
        name: 'Legacy',
        is_active: true,
        version: 1,
      },
    }
    expect(
      (await service.push(actorA, { deviceId: a, events: [legacy] }))
        .results[0],
    ).toMatchObject({ status: 'accepted', serverVersion: 1 })
    const legacyPull = await service.pull(actorB, {
      cursor: second.nextCursor,
      limit: 500,
    })
    expect(
      legacyPull.changes.find((change) => change.entityId === legacyId)
        ?.payload,
    ).toEqual(legacy.payload)
  })
})
