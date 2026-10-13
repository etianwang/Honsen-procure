import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null
const actorId = '00000000-0000-4000-8000-000000000011'

describe.skipIf(!pool)('PostgresSyncStore', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
    await pool!.query(
      `INSERT INTO users
         (id, business_code, username, password_hash, ui_locale, is_enabled)
       VALUES ($1, 'SYNC-TEST', 'sync-test-user', 'fixture', 'zh-CN', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [actorId],
    )
  })

  afterAll(async () => {
    await pool!.end()
  })

  it('is idempotent and records an optimistic-concurrency conflict without overwriting', async () => {
    const store = new PostgresSyncStore(pool!)
    const entityId = randomUUID()
    const firstEvent = {
      eventId: randomUUID(),
      entityType: 'material' as const,
      entityId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: { nameZh: 'fixture material' },
    }

    const accepted = await store.pushEvent({
      event: firstEvent,
      installationId: randomUUID(),
      actorId,
    })
    expect(accepted).toMatchObject({ status: 'accepted', serverVersion: 1 })

    const replay = await store.pushEvent({
      event: firstEvent,
      installationId: randomUUID(),
      actorId,
    })
    expect(replay).toEqual(accepted)

    const conflict = await store.pushEvent({
      event: {
        ...firstEvent,
        eventId: randomUUID(),
        payload: { nameZh: 'other' },
      },
      installationId: randomUUID(),
      actorId,
    })
    expect(conflict).toMatchObject({ status: 'conflict', serverVersion: 1 })

    const entity = await pool!.query<{
      version: string
      payload_json: { nameZh: string }
    }>(
      `SELECT version, payload_json FROM sync_entities
       WHERE entity_type = 'material' AND entity_id = $1`,
      [entityId],
    )
    expect(entity.rows[0]).toMatchObject({
      version: '1',
      payload_json: { nameZh: 'fixture material' },
    })
    const conflicts = await pool!.query(
      'SELECT 1 FROM sync_conflicts WHERE event_id = $1',
      [conflict.eventId],
    )
    expect(conflicts.rowCount).toBe(1)
  })

  it('pulls supplier and price changes only from an engineer’s bound countries', async () => {
    const store = new PostgresSyncStore(pool!)
    const [countryA, countryB, projectA, projectB] = Array.from(
      { length: 4 },
      () => randomUUID(),
    )
    const [supplierA, supplierB, priceA, priceB] = Array.from(
      { length: 4 },
      () => randomUUID(),
    )
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    for (const [countryId, projectId] of [
      [countryA, projectA],
      [countryB, projectB],
    ]) {
      await pool!.query(
        `INSERT INTO countries (id, business_code, name, time_zone)
         VALUES ($1, $2, 'fixture country', 'UTC')`,
        [countryId, `SYNC-C-${countryId}`],
      )
      await pool!.query(
        `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair)
         VALUES ($1, $2, $3, 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr')`,
        [projectId, countryId, `SYNC-P-${projectId}`],
      )
    }
    await pool!.query(
      'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
      [actorId, projectA],
    )
    for (const [entityType, entityId, payload] of [
      ['supplier', supplierA, { countryId: countryA, name: 'A' }],
      ['supplier', supplierB, { countryId: countryB, name: 'B' }],
      [
        'material_price',
        priceA,
        { supplierId: supplierA, unitPriceMinor: '1' },
      ],
      [
        'material_price',
        priceB,
        { supplierId: supplierB, unitPriceMinor: '2' },
      ],
    ] as const) {
      const result = await store.pushEvent({
        event: {
          eventId: randomUUID(),
          entityType,
          entityId,
          operation: 'upsert',
          baseVersion: 0,
          payload,
        },
        installationId: randomUUID(),
        actorId,
      })
      expect(result.status).toBe('accepted')
    }
    const engineer = { id: actorId, roles: ['engineer' as const] }
    const permitted = await store.pullChanges({
      actor: engineer,
      cursor,
      limit: 20,
    })
    expect(permitted.changes.map((change) => change.entityId)).toEqual([
      supplierA,
      priceA,
    ])
    const purchaser = await store.pullChanges({
      actor: { id: actorId, roles: ['purchaser'] },
      cursor,
      limit: 20,
    })
    expect(purchaser.changes.map((change) => change.entityId)).toEqual([
      supplierA,
      supplierB,
      priceA,
      priceB,
    ])
    await pool!.query(
      'UPDATE user_project_bindings SET deleted_at = NOW() WHERE user_id = $1 AND project_id = $2',
      [actorId, projectA],
    )
    const revoked = await store.pullChanges({
      actor: engineer,
      cursor,
      limit: 20,
    })
    expect(revoked.changes).toEqual([])
    expect(revoked.nextCursor).toBe(cursor)
  })
})
