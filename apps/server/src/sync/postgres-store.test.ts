import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresMasterDataStore } from '../master-data/postgres-store.js'
import { MasterDataError } from '../master-data/service.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

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

  it('keeps RFQ snapshots immutable across retry, status transitions and stale writes', async () => {
    const store = new PostgresSyncStore(pool!)
    const service = new SyncService(store)
    const [orderId, rfqId, projectId, supplierId, itemId] = Array.from(
      { length: 5 },
      () => randomUUID(),
    )
    const deviceId = randomUUID()
    const order = await store.pushEvent({
      event: {
        eventId: randomUUID(),
        entityType: 'purchase_order',
        entityId: orderId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          projectId,
          procurementMode: 'honsen_self_purchase',
          workflowStatus: 'approved',
        },
      },
      installationId: deviceId,
      actorId,
    })
    expect(order.status).toBe('accepted')
    const payload = {
      id: rfqId,
      sourceOrderId: orderId,
      supplierId,
      supplierSnapshot: { id: supplierId, name: 'fixture supplier' },
      projectId,
      displayNo: `TEST-${rfqId}`,
      currency: 'XOF',
      status: 'draft',
      items: [
        {
          sourceItemId: itemId,
          materialSnapshot: {
            nameZh: 'fixture',
            nameFr: null,
            model: '',
            specification: '',
          },
          quantity: '2.50',
          unit: 'pcs',
          sortOrder: 0,
        },
      ],
    }
    const actor = { id: actorId, roles: ['purchaser' as const] }
    const bypassedService = await store.pushEvent({
      event: {
        eventId: randomUUID(),
        entityType: 'rfq',
        entityId: rfqId,
        operation: 'upsert',
        baseVersion: 0,
        payload: { ...payload, projectId: randomUUID() },
      },
      installationId: deviceId,
      actorId,
    })
    expect(bypassedService.status).toBe('validation_error')
    const push = (eventId: string, baseVersion: number, next: typeof payload) =>
      service.push(actor, {
        deviceId,
        events: [
          {
            eventId,
            entityType: 'rfq',
            entityId: rfqId,
            operation: 'upsert',
            baseVersion,
            payload: next,
          },
        ],
      })
    expect(
      (await push(randomUUID(), 0, { ...payload, status: 'sent' })).results[0]
        ?.status,
    ).toBe('validation_error')
    const createId = randomUUID()
    expect((await push(createId, 0, payload)).results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect((await push(createId, 0, payload)).results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(
      (await push(randomUUID(), 1, { ...payload, status: 'sent' })).results[0],
    ).toMatchObject({ status: 'accepted', serverVersion: 2 })
    expect(
      (
        await push(randomUUID(), 2, {
          ...payload,
          status: 'closed',
          items: [{ ...payload.items[0]!, quantity: '3.00' }],
        })
      ).results[0]?.status,
    ).toBe('validation_error')
    expect(
      (await push(randomUUID(), 2, { ...payload, status: 'closed' }))
        .results[0],
    ).toMatchObject({ status: 'accepted', serverVersion: 3 })
    expect(
      (await push(randomUUID(), 3, { ...payload, status: 'sent' })).results[0]
        ?.status,
    ).toBe('validation_error')
    expect(
      (await push(randomUUID(), 1, { ...payload, status: 'closed' })).results[0]
        ?.status,
    ).toBe('conflict')
    const pulled = await service.pull(actor, { cursor: '0', limit: 500 })
    const rfqs = pulled.changes.filter((change) => change.entityId === rfqId)
    expect(rfqs.map((change) => change.payload.status)).toEqual([
      'draft',
      'sent',
      'closed',
    ])
    expect(
      rfqs.every(
        (change) =>
          JSON.stringify(change.payload.items) ===
          JSON.stringify(rfqs[0]?.payload.items),
      ),
    ).toBe(true)
  })

  it('rechecks a concurrently changed parent before accepting an RFQ', async () => {
    const store = new PostgresSyncStore(pool!)
    const [orderId, rfqId, projectId, otherProjectId, supplierId, itemId] =
      Array.from({ length: 6 }, () => randomUUID())
    const deviceId = randomUUID()
    expect(
      (
        await store.pushEvent({
          event: {
            eventId: randomUUID(),
            entityType: 'purchase_order',
            entityId: orderId,
            operation: 'upsert',
            baseVersion: 0,
            payload: {
              projectId,
              workflowStatus: 'approved',
              procurementMode: 'honsen_self_purchase',
            },
          },
          installationId: deviceId,
          actorId,
        })
      ).status,
    ).toBe('accepted')

    const blocker = await pool!.connect()
    await blocker.query('BEGIN')
    try {
      await blocker.query(
        `UPDATE sync_entities SET payload_json = jsonb_set(payload_json,
        '{projectId}', to_jsonb($2::text)) WHERE entity_type = 'purchase_order' AND entity_id = $1`,
        [orderId, otherProjectId],
      )
      const attempted = store.pushEvent({
        event: {
          eventId: randomUUID(),
          entityType: 'rfq',
          entityId: rfqId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            id: rfqId,
            sourceOrderId: orderId,
            supplierId,
            supplierSnapshot: { id: supplierId, name: 'fixture supplier' },
            projectId,
            displayNo: `TEST-${rfqId}`,
            currency: 'XOF',
            status: 'draft',
            items: [
              {
                sourceItemId: itemId,
                materialSnapshot: {
                  nameZh: 'fixture',
                  nameFr: null,
                  model: '',
                  specification: '',
                },
                quantity: '1',
                unit: 'pcs',
                sortOrder: 0,
              },
            ],
          },
        },
        installationId: deviceId,
        actorId,
      })
      let waiting = false
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await pool!.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pg_stat_activity
           WHERE wait_event_type = 'Lock' AND query LIKE '%sync_entities%'`,
        )
        if (Number(result.rows[0]?.count) > 0) {
          waiting = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(waiting).toBe(true)
      await blocker.query('COMMIT')
      expect((await attempted).status).toBe('validation_error')
      expect(await store.getEntityPayload('rfq', rfqId)).toBeNull()
    } finally {
      await blocker.query('ROLLBACK')
      blocker.release()
    }
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

  it('does not skip a pending Push when another Push commits first', async () => {
    const [firstId, secondId] = [randomUUID(), randomUUID()]
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    let signalCommit!: () => void
    let releaseCommit!: () => void
    const commitReached = new Promise<void>((resolve) => {
      signalCommit = resolve
    })
    const canCommit = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    const pausedPool = {
      async connect() {
        const client = await pool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            if (sql === 'COMMIT') {
              signalCommit()
              await canCommit
            }
            return client.query(sql, values)
          },
          release() {
            client.release()
          },
        }
      },
    } as unknown as Pool
    const firstEvent = {
      eventId: randomUUID(),
      entityType: 'material' as const,
      entityId: firstId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: { nameZh: 'Earlier fixture' },
    }
    const secondEvent = {
      ...firstEvent,
      eventId: randomUUID(),
      entityId: secondId,
      payload: { nameZh: 'Later fixture' },
    }
    const first = new PostgresSyncStore(pausedPool).pushEvent({
      event: firstEvent,
      installationId: randomUUID(),
      actorId,
    })
    let second: Promise<unknown> | undefined
    try {
      await commitReached
      second = new PostgresSyncStore(pool!).pushEvent({
        event: secondEvent,
        installationId: randomUUID(),
        actorId,
      })
      let waitingForEarlierPush = false
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const lock = await pool!.query<{ waiting: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_locks
             WHERE relation = 'server_change_log'::regclass
               AND mode = 'ShareRowExclusiveLock' AND NOT granted
           ) AS waiting`,
        )
        waitingForEarlierPush = lock.rows[0]?.waiting ?? false
        if (waitingForEarlierPush) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(waitingForEarlierPush).toBe(true)
      const store = new PostgresSyncStore(pool!)
      const beforeCommit = await store.pullChanges({
        actor: { id: actorId, roles: ['engineer'] },
        cursor,
        limit: 500,
      })
      const affectedIds = new Set<string>([firstId, secondId])
      expect(
        beforeCommit.changes.filter((change) =>
          affectedIds.has(change.entityId),
        ),
      ).toEqual([])
      releaseCommit()
      expect(await first).toMatchObject({
        status: 'accepted',
        serverVersion: 1,
      })
      expect(await second).toMatchObject({
        status: 'accepted',
        serverVersion: 1,
      })
      const afterCommit = await store.pullChanges({
        actor: { id: actorId, roles: ['engineer'] },
        cursor: beforeCommit.nextCursor,
        limit: 500,
      })
      expect(
        afterCommit.changes
          .filter((change) => affectedIds.has(change.entityId))
          .map((change) => change.entityId),
      ).toEqual([firstId, secondId])
      expect(
        await store.pushEvent({
          event: firstEvent,
          installationId: randomUUID(),
          actorId,
        }),
      ).toMatchObject({ status: 'accepted', serverVersion: 1 })
      expect(
        (
          await store.pullChanges({
            actor: { id: actorId, roles: ['engineer'] },
            cursor: afterCommit.nextCursor,
            limit: 500,
          })
        ).changes.filter((change) => affectedIds.has(change.entityId)),
      ).toEqual([])
    } finally {
      releaseCommit()
      await Promise.allSettled([first, second])
    }
  })

  it('rolls back a projected Push when change-log publication fails, then retries', async () => {
    const unitId = randomUUID()
    const event = {
      eventId: randomUUID(),
      entityType: 'unit' as const,
      entityId: unitId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `UNIT-${unitId}`,
        name: 'Fixture unit',
        is_active: true,
      },
    }
    const input = { event, installationId: randomUUID(), actorId }
    const failingPool = {
      async connect() {
        const client = await pool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            if (sql.includes('INSERT INTO server_change_log'))
              throw new Error('injected change-log failure')
            return client.query(sql, values)
          },
          release() {
            client.release()
          },
        }
      },
    } as unknown as Pool
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    await expect(
      new PostgresSyncStore(failingPool).pushEvent(input),
    ).rejects.toThrow('injected change-log failure')
    const empty = await pool!.query(
      `SELECT
         (SELECT COUNT(*) FROM units WHERE id = $1) AS business,
         (SELECT COUNT(*) FROM audit_entries WHERE entity_type = 'unit' AND entity_id = $1) AS audit,
         (SELECT COUNT(*) FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1) AS synced,
         (SELECT COUNT(*) FROM sync_events WHERE event_id = $2) AS event,
         (SELECT COUNT(*) FROM server_change_log WHERE entity_type = 'unit' AND entity_id = $1) AS changes`,
      [unitId, event.eventId],
    )
    expect(empty.rows[0]).toEqual({
      business: '0',
      audit: '0',
      synced: '0',
      event: '0',
      changes: '0',
    })
    const store = new PostgresSyncStore(pool!)
    expect(await store.pushEvent(input)).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const pulled = await store.pullChanges({
      actor: { id: actorId, roles: ['engineer'] },
      cursor,
      limit: 500,
    })
    expect(
      pulled.changes.filter((change) => change.entityId === unitId),
    ).toMatchObject([{ entityType: 'unit', version: 1 }])
  })

  it('durably synchronizes validated department, team and unit outbox events', async () => {
    const store = new PostgresSyncStore(pool!)
    const service = new SyncService(store)
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const [departmentId, teamId, unitId] = Array.from({ length: 3 }, () =>
      randomUUID(),
    )
    const entityIds = new Set<string>([departmentId, teamId, unitId])
    const events = [
      {
        eventId: randomUUID(),
        entityType: 'department',
        entityId: departmentId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          kind: 'department',
          business_code: `FIXTURE-${departmentId}`,
          name: 'Procurement',
          is_active: true,
          version: 1,
        },
      },
      {
        eventId: randomUUID(),
        entityType: 'team',
        entityId: teamId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          kind: 'team',
          department_id: departmentId,
          business_code: `FIXTURE-${teamId}`,
          name: 'Field team',
          is_active: true,
          version: 1,
        },
      },
      {
        eventId: randomUUID(),
        entityType: 'unit',
        entityId: unitId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          kind: 'unit',
          business_code: `FIXTURE-${unitId}`,
          name: 'Each',
          is_active: true,
          version: 1,
        },
      },
    ]
    const request = { deviceId: randomUUID(), events }
    const actor = { id: actorId, roles: ['administrator' as const] }
    const first = await service.push(actor, request)
    expect(first.results.map((result) => result.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
    ])
    expect(await service.push(actor, request)).toEqual(first)

    const pulled = await service.pull(
      { id: actorId, roles: ['engineer'] },
      { cursor, limit: 500 },
    )
    expect(
      pulled.changes
        .filter((change) => entityIds.has(change.entityId))
        .map((change) => change.entityId),
    ).toEqual([departmentId, teamId, unitId])
    const repeated = await service.pull(
      { id: actorId, roles: ['engineer'] },
      { cursor: pulled.nextCursor, limit: 500 },
    )
    expect(
      repeated.changes.filter((change) => entityIds.has(change.entityId)),
    ).toEqual([])
    const conflict = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...events[1],
          eventId: randomUUID(),
          payload: { ...events[1]!.payload, name: 'Divergent team' },
        },
      ],
    })
    expect(conflict.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 1,
    })
    const stored = await pool!.query<{ payload_json: { name: string } }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'team' AND entity_id = $1",
      [teamId],
    )
    expect(stored.rows[0]?.payload_json.name).toBe('Field team')
  })

  it('projects unit Push into the business table without partial conflict writes', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const [unitId, duplicateId, independentId] = Array.from({ length: 3 }, () =>
      randomUUID(),
    )
    const event = {
      eventId: randomUUID(),
      entityType: 'unit' as const,
      entityId: unitId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `UNIT-${unitId}`,
        name: 'Each',
        is_active: true,
      },
    }
    const request = { deviceId: randomUUID(), events: [event] }
    const accepted = await service.push(actor, request)
    expect(accepted.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const created = await pool!.query<{
      business_code: string
      name: string
      version: string
    }>('SELECT business_code, name, version FROM units WHERE id = $1', [unitId])
    expect(created.rows[0]).toMatchObject({
      business_code: `UNIT-${unitId}`,
      name: 'Each',
      version: '1',
    })
    expect(await service.push(actor, request)).toEqual(accepted)
    const collision = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        { ...event, eventId: randomUUID(), entityId: duplicateId },
        {
          ...event,
          eventId: randomUUID(),
          entityId: independentId,
          payload: {
            ...event.payload,
            business_code: `UNIT-${independentId}`,
          },
        },
      ],
    })
    expect(collision.results.map((result) => result.status)).toEqual([
      'validation_error',
      'accepted',
    ])
    expect(
      (await pool!.query('SELECT 1 FROM units WHERE id = $1', [duplicateId]))
        .rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1",
          [duplicateId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (await pool!.query('SELECT 1 FROM units WHERE id = $1', [independentId]))
        .rowCount,
    ).toBe(1)
    const changedCode = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...event.payload, business_code: `OTHER-${unitId}` },
        },
      ],
    })
    expect(changedCode.results[0]?.status).toBe('validation_error')
    const revised = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...event.payload, name: 'Piece', is_active: false },
        },
      ],
    })
    expect(revised.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const stale = await service.push(actor, {
      deviceId: randomUUID(),
      events: [{ ...event, eventId: randomUUID() }],
    })
    expect(stale.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 2,
    })
    const retained = await pool!.query<{
      business_code: string
      name: string
      is_active: boolean
      version: string
    }>(
      'SELECT business_code, name, is_active, version FROM units WHERE id = $1',
      [unitId],
    )
    expect(retained.rows[0]).toMatchObject({
      business_code: `UNIT-${unitId}`,
      name: 'Piece',
      is_active: false,
      version: '2',
    })
    expect(
      (
        await pool!.query(
          "SELECT COUNT(*)::text AS count FROM audit_entries WHERE entity_type = 'unit' AND entity_id = $1",
          [unitId],
        )
      ).rows[0]?.count,
    ).toBe('2')
  })

  it('does not overwrite a unit changed through the master-data API', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const master = new PostgresMasterDataStore(pool!)
    const unitId = randomUUID()
    const code = `UNIT-${unitId}`
    const actor = { id: actorId, roles: ['administrator' as const] }
    const initial = {
      eventId: randomUUID(),
      entityType: 'unit' as const,
      entityId: unitId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: { business_code: code, name: 'Initial', is_active: true },
    }
    expect(
      (await service.push(actor, { deviceId: randomUUID(), events: [initial] }))
        .results[0]?.status,
    ).toBe('accepted')
    await master.saveReferenceData(
      {
        kind: 'unit',
        id: unitId,
        businessCode: code,
        name: 'REST edit',
        isActive: false,
      },
      actorId,
    )
    const staleEventId = randomUUID()
    const stale = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...initial,
          eventId: staleEventId,
          baseVersion: 1,
          payload: { ...initial.payload, name: 'Offline edit' },
        },
      ],
    })
    expect(stale.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 2,
    })
    const row = await pool!.query<{
      name: string
      is_active: boolean
      version: string
    }>('SELECT name, is_active, version FROM units WHERE id = $1', [unitId])
    expect(row.rows[0]).toMatchObject({
      name: 'REST edit',
      is_active: false,
      version: '2',
    })
    const conflict = await pool!.query<{
      server_payload_json: { name: string }
    }>('SELECT server_payload_json FROM sync_conflicts WHERE event_id = $1', [
      staleEventId,
    ])
    expect(conflict.rows[0]?.server_payload_json.name).toBe('REST edit')
  })

  it('stores the canonical unit values in business and sync records', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const unitId = randomUUID()
    const code = `UNIT-${unitId}`
    const result = await service.push(
      { id: actorId, roles: ['administrator'] },
      {
        deviceId: randomUUID(),
        events: [
          {
            eventId: randomUUID(),
            entityType: 'unit',
            entityId: unitId,
            operation: 'upsert',
            baseVersion: 0,
            payload: {
              business_code: ` ${code} `,
              name: ' Each ',
              is_active: true,
            },
          },
        ],
      },
    )
    expect(result.results[0]?.status).toBe('accepted')
    const business = await pool!.query<{ business_code: string; name: string }>(
      'SELECT business_code, name FROM units WHERE id = $1',
      [unitId],
    )
    expect(business.rows[0]).toMatchObject({
      business_code: code,
      name: 'Each',
    })
    const sync = await pool!.query<{
      payload_json: { business_code: string; name: string }
    }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1",
      [unitId],
    )
    expect(sync.rows[0]?.payload_json).toMatchObject({
      business_code: code,
      name: 'Each',
    })
  })

  it('rolls back a projected unit when its subsequent audit write fails', async () => {
    const store = new PostgresSyncStore(pool!)
    const unitId = randomUUID()
    const eventId = randomUUID()
    const missingActor = randomUUID()
    await expect(
      store.pushEvent({
        event: {
          eventId,
          entityType: 'unit',
          entityId: unitId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            business_code: `UNIT-${unitId}`,
            name: 'Rollback',
            is_active: true,
          },
        },
        installationId: randomUUID(),
        actorId: missingActor,
      }),
    ).resolves.toMatchObject({ status: 'validation_error' })
    for (const [table, clause] of [
      ['units', 'id = $1'],
      ['sync_entities', "entity_type = 'unit' AND entity_id = $1"],
      ['sync_events', 'event_id = $1'],
      ['server_change_log', "entity_type = 'unit' AND entity_id = $1"],
      ['audit_entries', "entity_type = 'unit' AND entity_id = $1"],
    ]) {
      const id = table === 'sync_events' ? eventId : unitId
      expect(
        (await pool!.query(`SELECT 1 FROM ${table} WHERE ${clause}`, [id]))
          .rowCount,
      ).toBe(0)
    }
  })

  it('projects department Push atomically and preserves codes on conflicts', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const departmentId = randomUUID()
    const duplicateId = randomUUID()
    const independentId = randomUUID()
    const event = {
      eventId: randomUUID(),
      entityType: 'department' as const,
      entityId: departmentId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `DEPT-${departmentId}`,
        name: 'Procurement',
        is_active: true,
      },
    }
    const request = { deviceId: randomUUID(), events: [event] }
    const accepted = await service.push(actor, request)
    expect(accepted.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(accepted)
    const collision = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        { ...event, eventId: randomUUID(), entityId: duplicateId },
        {
          ...event,
          eventId: randomUUID(),
          entityId: independentId,
          payload: {
            ...event.payload,
            business_code: `DEPT-${independentId}`,
          },
        },
      ],
    })
    expect(collision.results.map((result) => result.status)).toEqual([
      'validation_error',
      'accepted',
    ])
    expect(
      (
        await pool!.query('SELECT 1 FROM departments WHERE id = $1', [
          duplicateId,
        ])
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query('SELECT 1 FROM departments WHERE id = $1', [
          independentId,
        ])
      ).rowCount,
    ).toBe(1)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'department' AND entity_id = $1",
          [duplicateId],
        )
      ).rowCount,
    ).toBe(0)
    const rejectedCode = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...event.payload, business_code: `OTHER-${departmentId}` },
        },
      ],
    })
    expect(rejectedCode.results[0]?.status).toBe('validation_error')
    const revised = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...event.payload, name: 'Revised procurement' },
        },
      ],
    })
    expect(revised.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const stale = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          payload: { ...event.payload, name: 'Stale procurement' },
        },
      ],
    })
    expect(stale.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 2,
    })
    const stored = await pool!.query<{
      business_code: string
      name: string
      version: string
    }>('SELECT business_code, name, version FROM departments WHERE id = $1', [
      departmentId,
    ])
    expect(stored.rows[0]).toMatchObject({
      business_code: `DEPT-${departmentId}`,
      name: 'Revised procurement',
      version: '2',
    })
    expect(
      (
        await pool!.query(
          "SELECT COUNT(*)::text AS count FROM audit_entries WHERE entity_type = 'department' AND entity_id = $1",
          [departmentId],
        )
      ).rows[0]?.count,
    ).toBe('2')
  })

  it('projects teams only under active departments and retries dependency failures', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const [departmentId, teamId, duplicateId] = Array.from({ length: 3 }, () =>
      randomUUID(),
    )
    const team = {
      eventId: randomUUID(),
      entityType: 'team' as const,
      entityId: teamId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `TEAM-${teamId}`,
        department_id: departmentId,
        name: 'Field team',
        is_active: true,
      },
    }
    const department = {
      eventId: randomUUID(),
      entityType: 'department' as const,
      entityId: departmentId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `DEPT-${departmentId}`,
        name: 'Procurement',
        is_active: false,
      },
    }
    const request = { deviceId: randomUUID(), events: [team] }
    const batch = await service.push(actor, {
      deviceId: randomUUID(),
      events: [team, department],
    })
    expect(batch.results.map((result) => result.status)).toEqual([
      'validation_error',
      'accepted',
    ])
    expect((await service.push(actor, request)).results[0]?.status).toBe(
      'validation_error',
    )
    expect(
      (await pool!.query('SELECT 1 FROM teams WHERE id = $1', [teamId]))
        .rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'team' AND entity_id = $1",
          [teamId],
        )
      ).rowCount,
    ).toBe(0)
    const restStore = new PostgresMasterDataStore(pool!)
    await expect(
      restStore.saveReferenceData(
        {
          kind: 'team',
          id: teamId,
          businessCode: `TEAM-${teamId}`,
          departmentId,
          name: 'Field team',
          isActive: true,
        },
        actorId,
      ),
    ).rejects.toEqual(new MasterDataError('INVALID_DEFAULTS'))
    const enabled = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...department,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...department.payload, is_active: true },
        },
      ],
    })
    expect(enabled.results[0]?.status).toBe('accepted')
    const accepted = await service.push(actor, request)
    expect(accepted.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(accepted)
    const collision = await service.push(actor, {
      deviceId: randomUUID(),
      events: [{ ...team, eventId: randomUUID(), entityId: duplicateId }],
    })
    expect(collision.results[0]?.status).toBe('validation_error')
    const changedCode = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...team,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...team.payload, business_code: `OTHER-${teamId}` },
        },
      ],
    })
    expect(changedCode.results[0]?.status).toBe('validation_error')
    const revised = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...team,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...team.payload, name: 'Revised field team' },
        },
      ],
    })
    expect(revised.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const stale = await service.push(actor, {
      deviceId: randomUUID(),
      events: [{ ...team, eventId: randomUUID() }],
    })
    expect(stale.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 2,
    })
    const stored = await pool!.query<{
      department_id: string
      business_code: string
      name: string
      version: string
    }>(
      'SELECT department_id::text AS department_id, business_code, name, version FROM teams WHERE id = $1',
      [teamId],
    )
    expect(stored.rows[0]).toMatchObject({
      department_id: departmentId,
      business_code: `TEAM-${teamId}`,
      name: 'Revised field team',
      version: '2',
    })
    expect(
      (
        await pool!.query(
          "SELECT COUNT(*)::text AS count FROM audit_entries WHERE entity_type = 'team' AND entity_id = $1",
          [teamId],
        )
      ).rows[0]?.count,
    ).toBe('2')
    expect(
      (await pool!.query('SELECT 1 FROM teams WHERE id = $1', [duplicateId]))
        .rowCount,
    ).toBe(0)
    const restTeamId = randomUUID()
    expect(
      await restStore.saveReferenceData(
        {
          kind: 'team',
          id: restTeamId,
          businessCode: `TEAM-REST-${restTeamId}`,
          departmentId,
          name: 'REST field team',
          isActive: true,
        },
        actorId,
      ),
    ).toMatchObject({ id: restTeamId, isActive: true })
  })

  it('projects country Push into the business table atomically and preserves immutable codes', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const countryId = randomUUID()
    const duplicateCodeId = randomUUID()
    const request = {
      deviceId: randomUUID(),
      events: [
        {
          eventId: randomUUID(),
          entityType: 'country',
          entityId: countryId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            business_code: `SYNC-C-${countryId}`,
            name: 'Fixture country',
            time_zone: 'UTC',
            is_active: true,
            version: 1,
          },
        },
      ],
    }
    const first = await service.push(actor, request)
    expect(first.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(first)
    const row = await pool!.query<{
      name: string
      business_code: string
      version: string
    }>('SELECT name, business_code, version FROM countries WHERE id = $1', [
      countryId,
    ])
    expect(row.rows[0]).toMatchObject({
      name: 'Fixture country',
      business_code: `SYNC-C-${countryId}`,
      version: '1',
    })
    const changed = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...request.events[0]!,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: {
            ...request.events[0]!.payload,
            name: 'Revised country',
            version: 2,
          },
        },
      ],
    })
    expect(changed.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const rejected = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...request.events[0]!,
          eventId: randomUUID(),
          baseVersion: 2,
          payload: {
            ...request.events[0]!.payload,
            business_code: `OTHER-${countryId}`,
            version: 3,
          },
        },
        {
          ...request.events[0]!,
          eventId: randomUUID(),
          entityId: duplicateCodeId,
          payload: { ...request.events[0]!.payload, version: 1 },
        },
      ],
    })
    expect(rejected.results.map((result) => result.status)).toEqual([
      'validation_error',
      'validation_error',
    ])
    const stored = await pool!.query<{
      name: string
      business_code: string
      version: string
    }>('SELECT name, business_code, version FROM countries WHERE id = $1', [
      countryId,
    ])
    expect(stored.rows[0]).toMatchObject({
      name: 'Revised country',
      business_code: `SYNC-C-${countryId}`,
      version: '2',
    })
    const rejectedEntity = await pool!.query(
      "SELECT 1 FROM sync_entities WHERE entity_type = 'country' AND entity_id = $1",
      [duplicateCodeId],
    )
    expect(rejectedEntity.rowCount).toBe(0)
    const audits = await pool!.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM audit_entries WHERE entity_type = 'country' AND entity_id = $1",
      [countryId],
    )
    expect(audits.rows[0]?.count).toBe('2')
  })

  it('projects dependent projects and rejects missing countries or changed used-project country', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const [countryId, otherCountryId, projectId, orphanProjectId, orderId] =
      Array.from({ length: 5 }, () => randomUUID())
    const missingCountryId = randomUUID()
    const country = (id: string) => ({
      eventId: randomUUID(),
      entityType: 'country',
      entityId: id,
      operation: 'upsert',
      baseVersion: 0,
      payload: {
        business_code: `SYNC-C-${id}`,
        name: 'Fixture country',
        time_zone: 'UTC',
        is_active: true,
        version: 1,
      },
    })
    const setup = await service.push(actor, {
      deviceId: randomUUID(),
      events: [country(countryId), country(otherCountryId)],
    })
    expect(setup.results.map((result) => result.status)).toEqual([
      'accepted',
      'accepted',
    ])
    const project = {
      eventId: randomUUID(),
      entityType: 'project' as const,
      entityId: projectId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `SYNC-P-${projectId}`,
        name: 'Fixture project',
        country_id: countryId,
        site: 'Fixture site',
        department_name: 'Fixture department',
        default_currency: 'XOF',
        default_language_pair: 'zh_fr',
        is_active: true,
        version: 1,
      },
    }
    const request = { deviceId: randomUUID(), events: [project] }
    const first = await service.push(actor, request)
    expect(first.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(first)
    const projected = await pool!.query<{
      country_id: string
      name: string
      version: string
    }>(
      'SELECT country_id::text AS country_id, name, version FROM projects WHERE id = $1',
      [projectId],
    )
    expect(projected.rows[0]).toMatchObject({
      country_id: countryId,
      name: 'Fixture project',
      version: '1',
    })
    const orphanEvent = {
      ...project,
      eventId: randomUUID(),
      entityId: orphanProjectId,
      payload: {
        ...project.payload,
        business_code: `SYNC-P-${orphanProjectId}`,
        country_id: missingCountryId,
      },
    }
    const missing = await service.push(actor, {
      deviceId: randomUUID(),
      events: [orphanEvent],
    })
    expect(missing.results[0]?.status).toBe('validation_error')
    const noOrphan = await pool!.query('SELECT 1 FROM projects WHERE id = $1', [
      orphanProjectId,
    ])
    expect(noOrphan.rowCount).toBe(0)
    expect(
      (
        await service.push(actor, {
          deviceId: randomUUID(),
          events: [country(missingCountryId)],
        })
      ).results[0]?.status,
    ).toBe('accepted')
    const recovered = await service.push(actor, {
      deviceId: randomUUID(),
      events: [orphanEvent],
    })
    expect(recovered.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const revised = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...project,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...project.payload, name: 'Revised project', version: 2 },
        },
      ],
    })
    expect(revised.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    await pool!.query(
      "INSERT INTO sync_entities (entity_type, entity_id, version, payload_json, updated_by) VALUES ('purchase_order', $1, 1, $2, $3)",
      [orderId, { projectId }, actorId],
    )
    const changedCountry = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...project,
          eventId: randomUUID(),
          baseVersion: 2,
          payload: {
            ...project.payload,
            country_id: otherCountryId,
            version: 3,
          },
        },
      ],
    })
    expect(changedCountry.results[0]?.status).toBe('validation_error')
    const directStore = new PostgresSyncStore(pool!)
    const directChange = await directStore.pushEvent({
      event: {
        ...project,
        eventId: randomUUID(),
        baseVersion: 2,
        payload: { ...project.payload, country_id: otherCountryId, version: 3 },
      },
      installationId: randomUUID(),
      actorId,
    })
    expect(directChange.status).toBe('validation_error')
    const changedCode = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...project,
          eventId: randomUUID(),
          baseVersion: 2,
          payload: {
            ...project.payload,
            business_code: `OTHER-${projectId}`,
            version: 3,
          },
        },
      ],
    })
    expect(changedCode.results[0]?.status).toBe('validation_error')
    const retained = await pool!.query<{
      country_id: string
      business_code: string
      name: string
      version: string
    }>(
      'SELECT country_id::text AS country_id, business_code, name, version FROM projects WHERE id = $1',
      [projectId],
    )
    expect(retained.rows[0]).toMatchObject({
      country_id: countryId,
      business_code: `SYNC-P-${projectId}`,
      name: 'Revised project',
      version: '2',
    })
  })

  it('projects sites atomically and retries after a missing project arrives', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const [countryId, projectId, siteId, duplicateId] = Array.from(
      { length: 4 },
      () => randomUUID(),
    )
    const site = {
      eventId: randomUUID(),
      entityType: 'site' as const,
      entityId: siteId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `SITE-${siteId}`,
        project_id: projectId,
        name: 'Fixture site',
        is_active: true,
      },
    }
    const request = { deviceId: randomUUID(), events: [site] }
    expect((await service.push(actor, request)).results[0]?.status).toBe(
      'validation_error',
    )
    expect(
      (await pool!.query('SELECT 1 FROM sites WHERE id = $1', [siteId]))
        .rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'site' AND entity_id = $1",
          [siteId],
        )
      ).rowCount,
    ).toBe(0)
    const setup = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        { ...site, eventId: randomUUID() },
        {
          eventId: randomUUID(),
          entityType: 'country',
          entityId: countryId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            business_code: `COUNTRY-${countryId}`,
            name: 'Fixture country',
            time_zone: 'UTC',
            is_active: true,
          },
        },
        {
          eventId: randomUUID(),
          entityType: 'project',
          entityId: projectId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            business_code: `PROJECT-${projectId}`,
            country_id: countryId,
            name: 'Fixture project',
            site: 'Fixture site',
            department_name: 'Fixture department',
            default_currency: 'XOF',
            default_language_pair: 'zh_fr',
            is_active: true,
          },
        },
      ],
    })
    expect(setup.results.map((result) => result.status)).toEqual([
      'validation_error',
      'accepted',
      'accepted',
    ])
    const accepted = await service.push(actor, request)
    expect(accepted.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(accepted)
    const collision = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...site,
          eventId: randomUUID(),
          entityId: duplicateId,
        },
      ],
    })
    expect(collision.results[0]?.status).toBe('validation_error')
    const rejectedCode = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...site,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...site.payload, business_code: `OTHER-${siteId}` },
        },
      ],
    })
    expect(rejectedCode.results[0]?.status).toBe('validation_error')
    const revised = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...site,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...site.payload, name: 'Revised site' },
        },
      ],
    })
    expect(revised.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const stale = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...site,
          eventId: randomUUID(),
          entityId: siteId,
          payload: { ...site.payload, name: 'Stale site' },
        },
      ],
    })
    expect(stale.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 2,
    })
    const stored = await pool!.query<{
      project_id: string
      business_code: string
      name: string
      version: string
    }>(
      'SELECT project_id::text AS project_id, business_code, name, version FROM sites WHERE id = $1',
      [siteId],
    )
    expect(stored.rows[0]).toMatchObject({
      project_id: projectId,
      business_code: `SITE-${siteId}`,
      name: 'Revised site',
      version: '2',
    })
    expect(
      (
        await pool!.query(
          "SELECT COUNT(*)::text AS count FROM audit_entries WHERE entity_type = 'site' AND entity_id = $1",
          [siteId],
        )
      ).rows[0]?.count,
    ).toBe('2')
  })

  it('rejects incompatible project-default tax references in the sync path', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const [
      projectId,
      countryId,
      otherCountryId,
      taxId,
      otherTaxId,
      globalTaxId,
      inactiveTaxId,
    ] = Array.from({ length: 7 }, () => randomUUID())
    const actor = { id: actorId, roles: ['administrator' as const] }
    const tax = (id: string, country: string | null, active: boolean) => ({
      eventId: randomUUID(),
      entityType: 'tax_template',
      entityId: id,
      operation: 'upsert',
      baseVersion: 0,
      payload: {
        business_code: `TAX-${id}`,
        name: 'Fixture tax',
        country_id: country,
        rate_basis_points: 1800,
        effective_at: '2026-10-15',
        is_active: active,
        version: 1,
      },
    })
    const setup = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          eventId: randomUUID(),
          entityType: 'country',
          entityId: countryId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            business_code: `COUNTRY-${countryId}`,
            name: 'Fixture country',
            time_zone: 'UTC',
            is_active: true,
            version: 1,
          },
        },
        {
          eventId: randomUUID(),
          entityType: 'project',
          entityId: projectId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            kind: 'project',
            business_code: `PROJECT-${projectId}`,
            name: 'Fixture project',
            country_id: countryId,
            site: 'Fixture site',
            department_name: 'Fixture department',
            default_currency: 'XOF',
            default_language_pair: 'zh_fr',
            is_active: true,
            version: 1,
          },
        },
        {
          eventId: randomUUID(),
          entityType: 'country',
          entityId: otherCountryId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            business_code: `COUNTRY-${otherCountryId}`,
            name: 'Other fixture country',
            time_zone: 'UTC',
            is_active: true,
          },
        },
        tax(taxId, countryId, true),
        tax(otherTaxId, otherCountryId, true),
        tax(globalTaxId, null, true),
        tax(inactiveTaxId, countryId, false),
      ],
    })
    expect(setup.results.every((result) => result.status === 'accepted')).toBe(
      true,
    )
    const defaults = (id: string, baseVersion: number) => ({
      eventId: randomUUID(),
      entityType: 'project_defaults',
      entityId: projectId,
      operation: 'upsert',
      baseVersion,
      payload: {
        project_id: projectId,
        department_title: 'Fixture department',
        company_address: 'Fixture address',
        company_contact: null,
        default_currency: 'XOF',
        default_language_pair: 'zh_fr',
        default_tax_template_id: id,
      },
    })
    const request = { deviceId: randomUUID(), events: [defaults(taxId, 0)] }
    const first = await service.push(actor, request)
    expect(first.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(first)
    const rejected = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        defaults(otherTaxId, 1),
        defaults(randomUUID(), 1),
        defaults(inactiveTaxId, 1),
      ],
    })
    expect(rejected.results.map((result) => result.status)).toEqual([
      'validation_error',
      'validation_error',
      'validation_error',
    ])
    const global = await service.push(actor, {
      deviceId: randomUUID(),
      events: [defaults(globalTaxId, 1)],
    })
    expect(global.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const retained = await pool!.query<{
      payload_json: { defaultTaxTemplateId: string }
    }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
      [projectId],
    )
    expect(retained.rows[0]?.payload_json.defaultTaxTemplateId).toBe(
      globalTaxId,
    )
    expect(
      (
        await pool!.query(
          'SELECT default_tax_template_id::text AS tax_id, version FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({ tax_id: globalTaxId, version: '2' })
  })

  it('checks a preexisting REST project and tax template when sync entities are absent', async () => {
    const [countryId, projectId, taxId] = Array.from({ length: 3 }, () =>
      randomUUID(),
    )
    const store = new PostgresSyncStore(pool!)
    try {
      await pool!.query(
        "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'fixture country', 'UTC')",
        [countryId, `SYNC-C-${countryId}`],
      )
      await pool!.query(
        "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr')",
        [projectId, countryId, `SYNC-P-${projectId}`],
      )
      await pool!.query(
        "INSERT INTO tax_templates (id, business_code, name, country_id, rate_basis_points, effective_at) VALUES ($1, $2, 'fixture tax', $3, 1800, '2026-10-15')",
        [taxId, `SYNC-T-${taxId}`, countryId],
      )
      expect(await store.isCompatibleProjectTax(projectId, taxId)).toBe(true)
      await pool!.query(
        "INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by) VALUES ('tax_template', $1, 1, FALSE, $2, $3)",
        [taxId, { countryId, isActive: true }, actorId],
      )
      await pool!.query(
        'UPDATE tax_templates SET is_active = FALSE WHERE id = $1',
        [taxId],
      )
      expect(await store.isCompatibleProjectTax(projectId, taxId)).toBe(false)
      await pool!.query(
        'UPDATE tax_templates SET is_active = TRUE WHERE id = $1',
        [taxId],
      )
      await pool!.query(
        "UPDATE sync_entities SET payload_json = $2 WHERE entity_type = 'tax_template' AND entity_id = $1",
        [taxId, { countryId, isActive: false }],
      )
      expect(await store.isCompatibleProjectTax(projectId, taxId)).toBe(true)
      expect(
        (
          await new SyncService(store).push(
            { id: actorId, roles: ['administrator'] },
            {
              deviceId: randomUUID(),
              events: [
                {
                  eventId: randomUUID(),
                  entityType: 'project_defaults',
                  entityId: projectId,
                  operation: 'upsert',
                  baseVersion: 0,
                  payload: {
                    projectId,
                    departmentTitle: 'Procurement',
                    companyAddress: 'Fixture address',
                    companyContact: null,
                    defaultCurrency: 'XOF',
                    defaultLanguagePair: 'zh_fr',
                    defaultTaxTemplateId: taxId,
                  },
                },
              ],
            },
          )
        ).results[0]?.status,
      ).toBe('accepted')
      await pool!.query(
        "UPDATE sync_entities SET is_deleted = TRUE, payload_json = '{}' WHERE entity_type = 'tax_template' AND entity_id = $1",
        [taxId],
      )
      expect(await store.isCompatibleProjectTax(projectId, taxId)).toBe(false)
      await pool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
        [taxId],
      )
      await pool!.query(
        "INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by) VALUES ('project', $1, 1, TRUE, '{}', $2)",
        [projectId, actorId],
      )
      expect(await store.isCompatibleProjectTax(projectId, taxId)).toBe(false)
    } finally {
      await pool!.query(
        'DELETE FROM project_print_defaults WHERE project_id = $1',
        [projectId],
      )
      await pool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
        [projectId],
      )
      await pool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
        [taxId],
      )
      await pool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'project' AND entity_id = $1",
        [projectId],
      )
      await pool!.query('DELETE FROM tax_templates WHERE id = $1', [taxId])
      await pool!.query('DELETE FROM projects WHERE id = $1', [projectId])
      await pool!.query('DELETE FROM countries WHERE id = $1', [countryId])
    }
  })

  it('persists validated project defaults with replay and conflict retention', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const entityId = randomUUID()
    const countryId = randomUUID()
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [entityId, countryId, `DEFAULT-P-${entityId}`],
    )
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const event = {
      eventId: randomUUID(),
      entityType: 'project_defaults',
      entityId,
      operation: 'upsert',
      baseVersion: 0,
      payload: {
        projectId: entityId,
        departmentTitle: 'Procurement',
        companyAddress: 'Fixture address',
        companyContact: 'Fixture contact',
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
      },
    }
    const request = { deviceId: randomUUID(), events: [event] }
    const actor = { id: actorId, roles: ['administrator' as const] }
    const first = await service.push(actor, request)
    expect(first.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(first)
    expect(
      (
        await pool!.query(
          'SELECT department_title, company_address, company_contact, version FROM project_print_defaults WHERE project_id = $1',
          [entityId],
        )
      ).rows[0],
    ).toMatchObject({
      department_title: 'Procurement',
      company_address: 'Fixture address',
      company_contact: 'Fixture contact',
      version: '1',
    })
    const pulled = await service.pull(
      { id: actorId, roles: ['engineer'] },
      { cursor, limit: 500 },
    )
    expect(
      pulled.changes.filter((change) => change.entityId === entityId),
    ).toHaveLength(1)
    expect(
      pulled.changes.find((change) => change.entityId === entityId)?.payload,
    ).toMatchObject({
      projectId: entityId,
      departmentTitle: 'Procurement',
      companyAddress: 'Fixture address',
      defaultCurrency: 'XOF',
      defaultTaxTemplateId: null,
    })
    const conflict = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...event,
          eventId: randomUUID(),
          payload: { ...event.payload, companyAddress: 'Changed address' },
        },
      ],
    })
    expect(conflict.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 1,
    })
    const stored = await pool!.query<{
      payload_json: { companyAddress: string }
    }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
      [entityId],
    )
    expect(stored.rows[0]?.payload_json.companyAddress).toBe('Fixture address')
  })

  it('rejects defaults without a project, then accepts the same event after its dependency arrives', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const [projectId, countryId] = [randomUUID(), randomUUID()]
    const event = {
      eventId: randomUUID(),
      entityType: 'project_defaults',
      entityId: projectId,
      operation: 'upsert',
      baseVersion: 0,
      payload: {
        project_id: projectId,
        department_title: ' Procurement ',
        company_address: ' Fixture address ',
        company_contact: null,
        default_currency: 'XOF',
        default_language_pair: 'zh_fr',
        default_tax_template_id: null,
      },
    }
    const actor = { id: actorId, roles: ['administrator' as const] }
    const request = { deviceId: randomUUID(), events: [event] }
    expect((await service.push(actor, request)).results[0]?.status).toBe(
      'validation_error',
    )
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
          [projectId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query('SELECT 1 FROM sync_events WHERE event_id = $1', [
          event.eventId,
        ])
      ).rowCount,
    ).toBe(0)
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [projectId, countryId, `DEFAULT-P-${projectId}`],
    )
    expect((await service.push(actor, request)).results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(
      (
        await pool!.query(
          'SELECT department_title, company_address, company_contact FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({
      department_title: 'Procurement',
      company_address: 'Fixture address',
      company_contact: null,
    })
  })

  it('keeps a REST-edited default and publishes its actual version when stale Push conflicts', async () => {
    const [projectId, countryId] = [randomUUID(), randomUUID()]
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [projectId, countryId, `DEFAULT-P-${projectId}`],
    )
    const store = new PostgresSyncStore(pool!)
    const service = new SyncService(store)
    const actor = { id: actorId, roles: ['administrator' as const] }
    const makeEvent = (baseVersion: number, address: string) => ({
      eventId: randomUUID(),
      entityType: 'project_defaults',
      entityId: projectId,
      operation: 'upsert',
      baseVersion,
      payload: {
        projectId,
        departmentTitle: 'Procurement',
        companyAddress: address,
        companyContact: 'Fixture contact',
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
      },
    })
    expect(
      (
        await service.push(actor, {
          deviceId: randomUUID(),
          events: [makeEvent(0, 'First address')],
        })
      ).results[0]?.status,
    ).toBe('accepted')
    await new PostgresMasterDataStore(pool!).saveProjectDefaults(
      {
        projectId,
        departmentTitle: 'Procurement',
        companyAddress: 'REST address',
        companyContact: 'Fixture contact',
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
      },
      actorId,
    )
    const stale = makeEvent(1, 'Stale address')
    expect(
      (await service.push(actor, { deviceId: randomUUID(), events: [stale] }))
        .results[0],
    ).toMatchObject({ status: 'conflict', serverVersion: 2 })
    expect(
      (
        await pool!.query(
          'SELECT company_address, version FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({ company_address: 'REST address', version: '2' })
    expect(
      (
        await pool!.query(
          'SELECT server_payload_json FROM sync_conflicts WHERE event_id = $1',
          [stale.eventId],
        )
      ).rows[0]?.server_payload_json,
    ).toMatchObject({ projectId, companyAddress: 'REST address' })
    expect(
      (
        await pool!.query(
          "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({
      version: '2',
      payload_json: { companyAddress: 'REST address' },
    })
    const resolved = makeEvent(2, 'Resolved address')
    expect(
      (
        await service.push(actor, {
          deviceId: randomUUID(),
          events: [resolved],
        })
      ).results[0],
    ).toMatchObject({ status: 'accepted', serverVersion: 3 })
    expect(
      (
        await pool!.query(
          'SELECT company_address, version FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({ company_address: 'Resolved address', version: '3' })
  })

  it('publishes each REST project-default save for incremental Pull and rolls back failed saves', async () => {
    const [projectId, countryId] = [randomUUID(), randomUUID()]
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [projectId, countryId, `DEFAULT-P-${projectId}`],
    )
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const defaults = {
      projectId,
      departmentTitle: 'Procurement',
      companyAddress: 'First address',
      companyContact: null,
      defaultCurrency: 'XOF' as const,
      defaultLanguagePair: 'zh_fr' as const,
      defaultTaxTemplateId: null,
    }
    const rest = new PostgresMasterDataStore(pool!)
    const sync = new SyncService(new PostgresSyncStore(pool!))
    const engineer = { id: actorId, roles: ['engineer' as const] }
    await rest.saveProjectDefaults(defaults, actorId)
    const first = await sync.pull(engineer, { cursor, limit: 500 })
    expect(
      first.changes.filter((change) => change.entityId === projectId),
    ).toMatchObject([
      {
        entityType: 'project_defaults',
        operation: 'upsert',
        version: 1,
        payload: defaults,
      },
    ])
    const revised = { ...defaults, companyAddress: 'Revised address' }
    await rest.saveProjectDefaults(revised, actorId)
    const second = await sync.pull(engineer, {
      cursor: first.nextCursor,
      limit: 500,
    })
    expect(
      second.changes.filter((change) => change.entityId === projectId),
    ).toMatchObject([
      {
        entityType: 'project_defaults',
        operation: 'upsert',
        version: 2,
        payload: revised,
      },
    ])
    const stale = {
      eventId: randomUUID(),
      entityType: 'project_defaults',
      entityId: projectId,
      operation: 'upsert',
      baseVersion: 1,
      payload: { ...defaults, companyAddress: 'Offline address' },
    }
    expect(
      (
        await sync.push(
          { id: actorId, roles: ['administrator'] },
          { deviceId: randomUUID(), events: [stale] },
        )
      ).results[0],
    ).toMatchObject({ status: 'conflict', serverVersion: 2 })
    await expect(
      rest.saveProjectDefaults(revised, randomUUID()),
    ).rejects.toThrow()
    expect(
      (
        await sync.pull(engineer, { cursor: second.nextCursor, limit: 500 })
      ).changes.filter((change) => change.entityId === projectId),
    ).toEqual([])
    const business = await pool!.query<{
      company_address: string
      version: string
    }>(
      'SELECT company_address, version FROM project_print_defaults WHERE project_id = $1',
      [projectId],
    )
    expect(business.rows[0]).toEqual({
      company_address: 'Revised address',
      version: '2',
    })
    const synced = await pool!.query<{
      version: string
      payload_json: typeof defaults
    }>(
      "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
      [projectId],
    )
    expect(synced.rows[0]).toMatchObject({
      version: '2',
      payload_json: revised,
    })
    const audits = await pool!.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM audit_entries WHERE entity_type = 'project_print_defaults' AND entity_id = $1 AND action = 'upsert'",
      [projectId],
    )
    expect(audits.rows[0]?.count).toBe('2')
    await rest.saveProjectDefaults(revised, actorId)
    expect(
      (
        await sync.pull(engineer, { cursor: second.nextCursor, limit: 500 })
      ).changes.filter((change) => change.entityId === projectId),
    ).toMatchObject([{ version: 3, payload: revised }])
  })

  it('does not let a REST change overtake an uncommitted change-log sequence', async () => {
    const [projectId, countryId, materialId] = Array.from({ length: 3 }, () =>
      randomUUID(),
    )
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [projectId, countryId, `DEFAULT-P-${projectId}`],
    )
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const client = await pool!.connect()
    let signalPublication!: () => void
    const publicationReached = new Promise<void>((resolve) => {
      signalPublication = resolve
    })
    const observedPool = {
      async connect() {
        const writer = await pool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            if (
              sql.includes('LOCK TABLE server_change_log') ||
              sql.includes('INSERT INTO server_change_log')
            )
              signalPublication()
            return writer.query(sql, values)
          },
          release() {
            writer.release()
          },
        }
      },
    } as unknown as Pool
    let committed = false
    let save: Promise<unknown> | undefined
    try {
      await client.query('BEGIN')
      await client.query(
        "INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id) VALUES ('material', $1, 'upsert', 1, $2, $3)",
        [materialId, { nameZh: 'Earlier fixture' }, actorId],
      )
      save = new PostgresMasterDataStore(observedPool).saveProjectDefaults(
        {
          projectId,
          departmentTitle: 'Procurement',
          companyAddress: 'Later fixture',
          companyContact: null,
          defaultCurrency: 'XOF',
          defaultLanguagePair: 'zh_fr',
          defaultTaxTemplateId: null,
        },
        actorId,
      )
      await publicationReached
      let waitingForEarlierWriter = false
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const lock = await pool!.query<{ waiting: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_locks
             WHERE relation = 'server_change_log'::regclass
               AND mode = 'ShareRowExclusiveLock' AND NOT granted
           ) AS waiting`,
        )
        waitingForEarlierWriter = lock.rows[0]?.waiting ?? false
        if (waitingForEarlierWriter) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(waitingForEarlierWriter).toBe(true)
      const sync = new SyncService(new PostgresSyncStore(pool!))
      const engineer = { id: actorId, roles: ['engineer' as const] }
      const affectedIds = new Set<string>([materialId, projectId])
      const beforeCommit = await sync.pull(engineer, { cursor, limit: 500 })
      expect(
        beforeCommit.changes.filter((change) =>
          affectedIds.has(change.entityId),
        ),
      ).toEqual([])
      await client.query('COMMIT')
      committed = true
      await save
      const pulled = await sync.pull(engineer, {
        cursor: beforeCommit.nextCursor,
        limit: 500,
      })
      expect(
        pulled.changes
          .filter((change) => affectedIds.has(change.entityId))
          .map((change) => change.entityId),
      ).toEqual([materialId, projectId])
    } finally {
      if (!committed) await client.query('ROLLBACK')
      client.release()
      await save?.catch(() => undefined)
    }
  })

  it('reconciles equal-version legacy sync defaults without overwriting divergent REST data', async () => {
    const [projectId, countryId] = [randomUUID(), randomUUID()]
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [projectId, countryId, `DEFAULT-P-${projectId}`],
    )
    const rest = {
      projectId,
      departmentTitle: 'Procurement',
      companyAddress: 'REST retained',
      companyContact: null,
      defaultCurrency: 'XOF' as const,
      defaultLanguagePair: 'zh_fr' as const,
      defaultTaxTemplateId: null,
    }
    await new PostgresMasterDataStore(pool!).saveProjectDefaults(rest, actorId)
    await pool!.query(
      "UPDATE sync_entities SET payload_json = $2 WHERE entity_type = 'project_defaults' AND entity_id = $1",
      [projectId, { ...rest, companyAddress: 'Legacy sync-only' }],
    )
    const event = {
      eventId: randomUUID(),
      entityType: 'project_defaults',
      entityId: projectId,
      operation: 'upsert',
      baseVersion: 1,
      payload: { ...rest, companyAddress: 'Offline edit' },
    }
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    expect(
      (await service.push(actor, { deviceId: randomUUID(), events: [event] }))
        .results[0],
    ).toMatchObject({ status: 'conflict', serverVersion: 2 })
    expect(
      (
        await pool!.query(
          'SELECT company_address, version FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({ company_address: 'REST retained', version: '2' })
    expect(
      (
        await pool!.query(
          "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({
      version: '2',
      payload_json: { companyAddress: 'REST retained', companyContact: null },
    })
    expect(
      (
        await pool!.query(
          'SELECT server_payload_json FROM sync_conflicts WHERE event_id = $1',
          [event.eventId],
        )
      ).rows[0]?.server_payload_json,
    ).toMatchObject({ companyAddress: 'REST retained' })
    const resolved = {
      ...event,
      eventId: randomUUID(),
      baseVersion: 2,
      payload: { ...rest, companyAddress: 'Resolved after inspection' },
    }
    expect(
      (
        await service.push(actor, {
          deviceId: randomUUID(),
          events: [resolved],
        })
      ).results[0],
    ).toMatchObject({ status: 'accepted', serverVersion: 3 })
    expect(
      (
        await pool!.query(
          'SELECT company_address, version FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({
      company_address: 'Resolved after inspection',
      version: '3',
    })
    await pool!.query(
      "UPDATE sync_entities SET version = 5, payload_json = $2 WHERE entity_type = 'project_defaults' AND entity_id = $1",
      [projectId, { ...rest, companyAddress: 'Legacy ahead' }],
    )
    const ahead = {
      ...event,
      eventId: randomUUID(),
      baseVersion: 5,
      payload: { ...rest, companyAddress: 'Another offline edit' },
    }
    expect(
      (await service.push(actor, { deviceId: randomUUID(), events: [ahead] }))
        .results[0],
    ).toMatchObject({ status: 'conflict', serverVersion: 6 })
    expect(
      (
        await pool!.query(
          'SELECT company_address, version FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rows[0],
    ).toMatchObject({
      company_address: 'Resolved after inspection',
      version: '6',
    })
    const aheadResolved = {
      ...ahead,
      eventId: randomUUID(),
      baseVersion: 6,
      payload: { ...rest, companyAddress: 'Resolved after legacy ahead' },
    }
    expect(
      (
        await service.push(actor, {
          deviceId: randomUUID(),
          events: [aheadResolved],
        })
      ).results[0],
    ).toMatchObject({ status: 'accepted', serverVersion: 7 })
  })

  it('rolls back project defaults and sync bookkeeping when audit insertion fails', async () => {
    const [projectId, countryId] = [randomUUID(), randomUUID()]
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [projectId, countryId, `DEFAULT-P-${projectId}`],
    )
    const event = {
      eventId: randomUUID(),
      entityType: 'project_defaults' as const,
      entityId: projectId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        projectId,
        departmentTitle: 'Procurement',
        companyAddress: 'Fixture address',
        companyContact: 'Fixture contact',
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
      },
    }
    expect(
      await new PostgresSyncStore(pool!).pushEvent({
        event,
        installationId: randomUUID(),
        actorId: randomUUID(),
      }),
    ).toMatchObject({ status: 'validation_error', serverVersion: null })
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM project_print_defaults WHERE project_id = $1',
          [projectId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
          [projectId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query('SELECT 1 FROM sync_events WHERE event_id = $1', [
          event.eventId,
        ])
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM server_change_log WHERE entity_type = 'project_defaults' AND entity_id = $1",
          [projectId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM audit_entries WHERE entity_type = 'project_print_defaults' AND entity_id = $1",
          [projectId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      await new PostgresSyncStore(pool!).pushEvent({
        event,
        installationId: randomUUID(),
        actorId,
      }),
    ).toMatchObject({ status: 'accepted', serverVersion: 1 })
  })

  it('persists validated tax and exchange-rate events without losing conflicts', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const taxId = randomUUID()
    const rateId = randomUUID()
    const actor = { id: actorId, roles: ['administrator' as const] }
    const events = [
      {
        eventId: randomUUID(),
        entityType: 'tax_template',
        entityId: taxId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          businessCode: `FIXTURE-${taxId}`,
          name: 'Fixture tax',
          countryId: null,
          rateBasisPoints: 1800,
          effectiveAt: '2026-10-15',
          isActive: true,
          version: 1,
        },
      },
      {
        eventId: randomUUID(),
        entityType: 'exchange_rate',
        entityId: rateId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          fromCurrency: 'XOF',
          toCurrency: 'EUR',
          rateDecimal: '0.00152449',
          effectiveAt: '2026-10-15',
          source: 'manual',
          reason: 'Fixture rate',
          version: 1,
        },
      },
    ]
    const request = { deviceId: randomUUID(), events }
    const first = await service.push(actor, request)
    expect(first.results.map((result) => result.status)).toEqual([
      'accepted',
      'accepted',
    ])
    expect(await service.push(actor, request)).toEqual(first)
    const pulled = await service.pull(
      { id: actorId, roles: ['engineer'] },
      { cursor, limit: 500 },
    )
    expect(
      pulled.changes
        .filter((change) =>
          new Set<string>([taxId, rateId]).has(change.entityId),
        )
        .map((change) => change.entityId),
    ).toEqual([taxId, rateId])
    const conflict = await service.push(actor, {
      deviceId: request.deviceId,
      events: [
        {
          ...events[0]!,
          eventId: randomUUID(),
          payload: { ...events[0]!.payload, name: 'Divergent tax' },
        },
      ],
    })
    expect(conflict.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 1,
    })
    const stored = await pool!.query<{ payload_json: { name: string } }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
      [taxId],
    )
    expect(stored.rows[0]?.payload_json.name).toBe('Fixture tax')
  })

  it('projects a validated exchange-rate Push into immutable business history and audit once', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const rateId = randomUUID()
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const event = {
      eventId: randomUUID(),
      entityType: 'exchange_rate' as const,
      entityId: rateId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        from_currency: 'CNY',
        to_currency: 'XOF',
        rate_decimal: '76.50000000',
        effective_at: '2026-10-15',
        source: 'manual',
        reason: '  Fixture approval  ',
      },
    }
    const actor = { id: actorId, roles: ['administrator' as const] }
    const request = { deviceId: randomUUID(), events: [event] }
    const first = await service.push(actor, request)
    expect(first.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(first)
    const business = await pool!.query<{
      from_currency: string
      to_currency: string
      rate_decimal: string
      source: string
      reason: string
      created_by: string
    }>(
      'SELECT from_currency, to_currency, rate_decimal, source, reason, created_by::text AS created_by FROM exchange_rates WHERE id = $1',
      [rateId],
    )
    expect(business.rows[0]).toMatchObject({
      from_currency: 'CNY',
      to_currency: 'XOF',
      rate_decimal: '76.50000000',
      source: 'manual',
      reason: 'Fixture approval',
      created_by: actorId,
    })
    const audit = await pool!.query<{ reason: string }>(
      "SELECT reason FROM audit_entries WHERE entity_type = 'exchange_rate' AND entity_id = $1",
      [rateId],
    )
    expect(audit.rows).toEqual([{ reason: 'Fixture approval' }])
    const synced = await pool!.query<{ payload_json: Record<string, unknown> }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'exchange_rate' AND entity_id = $1",
      [rateId],
    )
    expect(synced.rows[0]?.payload_json).toEqual({
      id: rateId,
      fromCurrency: 'CNY',
      toCurrency: 'XOF',
      rateDecimal: '76.50000000',
      effectiveAt: '2026-10-15',
      source: 'manual',
      reason: 'Fixture approval',
      version: 1,
    })
    const pulled = await service.pull(
      { id: actorId, roles: ['engineer'] },
      { cursor, limit: 500 },
    )
    expect(
      pulled.changes.find((change) => change.entityId === rateId)?.payload,
    ).toEqual(synced.rows[0]?.payload_json)
  })

  it('conflicts with a preexisting REST exchange rate without replacing its history', async () => {
    const rateId = randomUUID()
    const master = new PostgresMasterDataStore(pool!)
    await master.saveExchangeRate(
      {
        id: rateId,
        fromCurrency: 'USD',
        toCurrency: 'XOF',
        rateDecimal: '610.25',
        effectiveAt: '2026-10-15',
        source: 'manual',
        reason: 'REST source',
      },
      actorId,
    )
    const service = new SyncService(new PostgresSyncStore(pool!))
    const eventId = randomUUID()
    const result = await service.push(
      { id: actorId, roles: ['administrator'] },
      {
        deviceId: randomUUID(),
        events: [
          {
            eventId,
            entityType: 'exchange_rate',
            entityId: rateId,
            operation: 'upsert',
            baseVersion: 0,
            payload: {
              from_currency: 'USD',
              to_currency: 'XOF',
              rate_decimal: '600.00',
              effective_at: '2026-10-15',
              source: 'manual',
              reason: 'Offline source',
            },
          },
        ],
      },
    )
    expect(result.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 1,
    })
    const business = await pool!.query<{
      rate_decimal: string
      reason: string
    }>('SELECT rate_decimal, reason FROM exchange_rates WHERE id = $1', [
      rateId,
    ])
    expect(business.rows).toEqual([
      { rate_decimal: '610.25', reason: 'REST source' },
    ])
    const conflict = await pool!.query<{
      server_payload_json: { rateDecimal: string; reason: string }
    }>('SELECT server_payload_json FROM sync_conflicts WHERE event_id = $1', [
      eventId,
    ])
    expect(conflict.rows[0]?.server_payload_json).toEqual({
      id: rateId,
      version: 1,
      fromCurrency: 'USD',
      toCurrency: 'XOF',
      rateDecimal: '610.25',
      effectiveAt: '2026-10-15',
      source: 'manual',
      reason: 'REST source',
    })
    const synced = await pool!.query<{
      version: string
      payload_json: { rateDecimal: string }
    }>(
      "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'exchange_rate' AND entity_id = $1",
      [rateId],
    )
    expect(synced.rows[0]).toMatchObject({
      version: '1',
      payload_json: { id: rateId, version: 1, rateDecimal: '610.25' },
    })
    const published = await pool!.query<{
      version: string
      payload_json: Record<string, unknown>
    }>(
      "SELECT version, payload_json FROM server_change_log WHERE entity_type = 'exchange_rate' AND entity_id = $1",
      [rateId],
    )
    expect(published.rows[0]).toMatchObject({
      version: '1',
      payload_json: { id: rateId, version: 1, rateDecimal: '610.25' },
    })
  })

  it('rejects a second event for an immutable exchange-rate ID while accepting an independent rate', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const [rateId, otherId] = [randomUUID(), randomUUID()]
    const original = {
      eventId: randomUUID(),
      entityType: 'exchange_rate' as const,
      entityId: rateId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        fromCurrency: 'EUR',
        toCurrency: 'XOF',
        rateDecimal: '655.5',
        effectiveAt: '2026-10-15',
        source: 'manual',
        reason: 'Original approval',
      },
    }
    expect(
      (
        await service.push(actor, {
          deviceId: randomUUID(),
          events: [original],
        })
      ).results[0]?.status,
    ).toBe('accepted')
    const batch = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...original,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: {
            ...original.payload,
            rateDecimal: '650',
            reason: 'Changed',
          },
        },
        { ...original, eventId: randomUUID(), entityId: otherId },
      ],
    })
    expect(batch.results.map((result) => result.status)).toEqual([
      'validation_error',
      'accepted',
    ])
    const business = await pool!.query<{
      rate_decimal: string
      reason: string
    }>('SELECT rate_decimal, reason FROM exchange_rates WHERE id = $1', [
      rateId,
    ])
    expect(business.rows).toEqual([
      { rate_decimal: '655.5', reason: 'Original approval' },
    ])
    const synced = await pool!.query<{ version: string }>(
      "SELECT version FROM sync_entities WHERE entity_type = 'exchange_rate' AND entity_id = $1",
      [rateId],
    )
    expect(synced.rows).toEqual([{ version: '1' }])
    const audit = await pool!.query(
      "SELECT 1 FROM audit_entries WHERE entity_type = 'exchange_rate' AND entity_id = $1",
      [rateId],
    )
    expect(audit.rowCount).toBe(1)
    expect(
      (
        await pool!.query('SELECT 1 FROM exchange_rates WHERE id = $1', [
          otherId,
        ])
      ).rowCount,
    ).toBe(1)
  })

  it('rolls back exchange-rate business history when its audit insert fails', async () => {
    const rateId = randomUUID()
    const eventId = randomUUID()
    const failingPool = {
      async connect() {
        const client = await pool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            if (
              sql.startsWith('INSERT INTO audit_entries') &&
              sql.includes("'exchange_rate'")
            )
              throw new Error('fixture audit outage')
            return client.query(sql, values)
          },
          release() {
            client.release()
          },
        }
      },
    } as unknown as Pool
    const service = new SyncService(new PostgresSyncStore(failingPool))
    await expect(
      service.push(
        { id: actorId, roles: ['administrator'] },
        {
          deviceId: randomUUID(),
          events: [
            {
              eventId,
              entityType: 'exchange_rate',
              entityId: rateId,
              operation: 'upsert',
              baseVersion: 0,
              payload: {
                from_currency: 'USD',
                to_currency: 'XOF',
                rate_decimal: '600',
                effective_at: '2026-10-15',
                source: 'manual',
                reason: 'Fixture',
              },
            },
          ],
        },
      ),
    ).rejects.toThrow('fixture audit outage')
    for (const [table, clause] of [
      ['exchange_rates', 'id = $1'],
      ['sync_entities', "entity_type = 'exchange_rate' AND entity_id = $1"],
      ['sync_events', 'event_id = $1'],
      ['server_change_log', "entity_type = 'exchange_rate' AND entity_id = $1"],
      ['audit_entries', "entity_type = 'exchange_rate' AND entity_id = $1"],
    ]) {
      const id = table === 'sync_events' ? eventId : rateId
      expect(
        (await pool!.query(`SELECT 1 FROM ${table} WHERE ${clause}`, [id]))
          .rowCount,
      ).toBe(0)
    }
  })

  it('retains a concurrent REST exchange-rate creation instead of replacing it', async () => {
    const rateId = randomUUID()
    const master = new PostgresMasterDataStore(pool!)
    let inserted = false
    const racingPool = {
      async connect() {
        const client = await pool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            const result = await client.query(sql, values)
            if (
              !inserted &&
              sql.startsWith(
                'SELECT 1 FROM exchange_rates WHERE id = $1 FOR UPDATE',
              ) &&
              values?.[0] === rateId
            ) {
              inserted = true
              await master.saveExchangeRate(
                {
                  id: rateId,
                  fromCurrency: 'CNY',
                  toCurrency: 'XOF',
                  rateDecimal: '77',
                  effectiveAt: '2026-10-15',
                  source: 'manual',
                  reason: 'REST winner',
                },
                actorId,
              )
            }
            return result
          },
          release() {
            client.release()
          },
        }
      },
    } as unknown as Pool
    const service = new SyncService(new PostgresSyncStore(racingPool))
    const result = await service.push(
      { id: actorId, roles: ['administrator'] },
      {
        deviceId: randomUUID(),
        events: [
          {
            eventId: randomUUID(),
            entityType: 'exchange_rate',
            entityId: rateId,
            operation: 'upsert',
            baseVersion: 0,
            payload: {
              from_currency: 'CNY',
              to_currency: 'XOF',
              rate_decimal: '76',
              effective_at: '2026-10-15',
              source: 'manual',
              reason: 'Offline loser',
            },
          },
        ],
      },
    )
    expect(inserted).toBe(true)
    expect(result.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 1,
    })
    const business = await pool!.query<{
      rate_decimal: string
      reason: string
    }>('SELECT rate_decimal, reason FROM exchange_rates WHERE id = $1', [
      rateId,
    ])
    expect(business.rows).toEqual([
      { rate_decimal: '77', reason: 'REST winner' },
    ])
    const synced = await pool!.query<{ payload_json: { rateDecimal: string } }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'exchange_rate' AND entity_id = $1",
      [rateId],
    )
    expect(synced.rows[0]?.payload_json.rateDecimal).toBe('77')
  })

  it('projects tax-template Push into the business row and audit only once', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const taxId = randomUUID()
    const event = {
      eventId: randomUUID(),
      entityType: 'tax_template' as const,
      entityId: taxId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `TAX-${taxId}`,
        name: ' Test tax ',
        country_id: null,
        rate_basis_points: 1800,
        effective_at: '2026-10-15',
        is_active: true,
      },
    }
    const request = { deviceId: randomUUID(), events: [event] }
    const actor = { id: actorId, roles: ['administrator' as const] }
    const first = await service.push(actor, request)
    expect(first.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await service.push(actor, request)).toEqual(first)
    const row = await pool!.query<{
      business_code: string
      name: string
      country_id: string | null
      rate_basis_points: number
      effective_at: Date
      is_active: boolean
      version: string
    }>(
      'SELECT business_code, name, country_id, rate_basis_points, effective_at, is_active, version FROM tax_templates WHERE id = $1',
      [taxId],
    )
    expect(row.rows[0]).toMatchObject({
      business_code: `TAX-${taxId}`,
      name: 'Test tax',
      country_id: null,
      rate_basis_points: 1800,
      is_active: true,
      version: '1',
    })
    expect(row.rows[0]?.effective_at.toISOString().slice(0, 10)).toBe(
      '2026-10-15',
    )
    const synced = await pool!.query<{
      payload_json: { name: string; country_id: null }
    }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
      [taxId],
    )
    expect(synced.rows[0]?.payload_json).toMatchObject({
      name: 'Test tax',
      country_id: null,
    })
    const audit = await pool!.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM audit_entries WHERE entity_type = 'tax_template' AND entity_id = $1",
      [taxId],
    )
    expect(audit.rows[0]?.count).toBe('1')
  })

  it('keeps a rejected tax-template event retryable after its country arrives', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const [countryId, taxId] = [randomUUID(), randomUUID()]
    const taxEvent = {
      eventId: randomUUID(),
      entityType: 'tax_template' as const,
      entityId: taxId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        businessCode: `TAX-${taxId}`,
        name: 'Scoped tax',
        countryId,
        rateBasisPoints: 2000,
        effectiveAt: '2026-10-15',
        isActive: true,
      },
    }
    const countryEvent = {
      eventId: randomUUID(),
      entityType: 'country' as const,
      entityId: countryId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `COUNTRY-${countryId}`,
        name: 'Fixture country',
        time_zone: 'UTC',
        is_active: true,
      },
    }
    const partial = await service.push(actor, {
      deviceId: randomUUID(),
      events: [taxEvent, countryEvent],
    })
    expect(partial.results.map((result) => result.status)).toEqual([
      'validation_error',
      'accepted',
    ])
    expect(
      (await pool!.query('SELECT 1 FROM tax_templates WHERE id = $1', [taxId]))
        .rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query('SELECT 1 FROM sync_events WHERE event_id = $1', [
          taxEvent.eventId,
        ])
      ).rowCount,
    ).toBe(0)
    const retry = await service.push(actor, {
      deviceId: randomUUID(),
      events: [taxEvent],
    })
    expect(retry.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const row = await pool!.query<{ country_id: string }>(
      'SELECT country_id::text AS country_id FROM tax_templates WHERE id = $1',
      [taxId],
    )
    expect(row.rows[0]?.country_id).toBe(countryId)
  })

  it('conflicts instead of overwriting a tax template edited through REST', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const master = new PostgresMasterDataStore(pool!)
    const taxId = randomUUID()
    const businessCode = `TAX-${taxId}`
    const actor = { id: actorId, roles: ['administrator' as const] }
    const event = {
      eventId: randomUUID(),
      entityType: 'tax_template' as const,
      entityId: taxId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: businessCode,
        name: 'Initial',
        country_id: null,
        rate_basis_points: 1800,
        effective_at: '2026-10-15',
        is_active: true,
      },
    }
    expect(
      (await service.push(actor, { deviceId: randomUUID(), events: [event] }))
        .results[0]?.status,
    ).toBe('accepted')
    await master.saveTaxTemplate(
      {
        id: taxId,
        businessCode,
        name: 'REST edit',
        countryId: null,
        rateBasisPoints: 1900,
        effectiveAt: '2026-10-15',
        isActive: true,
      },
      actorId,
    )
    const staleEventId = randomUUID()
    const stale = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: staleEventId,
          baseVersion: 1,
          payload: {
            ...event.payload,
            name: 'Offline edit',
            rate_basis_points: 2100,
          },
        },
      ],
    })
    expect(stale.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 2,
    })
    const row = await pool!.query<{
      name: string
      rate_basis_points: number
      version: string
    }>(
      'SELECT name, rate_basis_points, version FROM tax_templates WHERE id = $1',
      [taxId],
    )
    expect(row.rows[0]).toMatchObject({
      name: 'REST edit',
      rate_basis_points: 1900,
      version: '2',
    })
    const conflict = await pool!.query<{
      server_payload_json: { name: string; rateBasisPoints: number }
    }>('SELECT server_payload_json FROM sync_conflicts WHERE event_id = $1', [
      staleEventId,
    ])
    expect(conflict.rows[0]?.server_payload_json).toMatchObject({
      name: 'REST edit',
      rateBasisPoints: 1900,
    })
    const reconciled = await pool!.query<{
      version: string
      payload_json: { name: string; effectiveAt: string }
    }>(
      "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
      [taxId],
    )
    expect(reconciled.rows[0]).toMatchObject({
      version: '2',
      payload_json: { name: 'REST edit', effectiveAt: '2026-10-15' },
    })
    const published = await pool!.query<{
      payload_json: { name: string; effectiveAt: string }
    }>(
      "SELECT payload_json FROM server_change_log WHERE entity_type = 'tax_template' AND entity_id = $1 AND version = 2",
      [taxId],
    )
    expect(published.rows[0]?.payload_json).toMatchObject({
      name: 'REST edit',
      effectiveAt: '2026-10-15',
    })
    const resolved = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 2,
          payload: {
            ...event.payload,
            name: 'Resolved',
            rate_basis_points: 2000,
          },
        },
      ],
    })
    expect(resolved.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 3,
    })
    const resolvedRow = await pool!.query<{ name: string; version: string }>(
      'SELECT name, version FROM tax_templates WHERE id = $1',
      [taxId],
    )
    expect(resolvedRow.rows[0]).toMatchObject({
      name: 'Resolved',
      version: '3',
    })
  })

  it('rejects a tax-template code collision and preserves the accepted template', async () => {
    const service = new SyncService(new PostgresSyncStore(pool!))
    const actor = { id: actorId, roles: ['administrator' as const] }
    const [taxId, duplicateId, independentId] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]
    const event = {
      eventId: randomUUID(),
      entityType: 'tax_template' as const,
      entityId: taxId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: `TAX-${taxId}`,
        name: 'Original',
        country_id: null,
        rate_basis_points: 1800,
        effective_at: '2026-10-15',
        is_active: true,
      },
    }
    expect(
      (await service.push(actor, { deviceId: randomUUID(), events: [event] }))
        .results[0]?.status,
    ).toBe('accepted')
    const batch = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        { ...event, eventId: randomUUID(), entityId: duplicateId },
        {
          ...event,
          eventId: randomUUID(),
          entityId: independentId,
          payload: { ...event.payload, business_code: `TAX-${independentId}` },
        },
      ],
    })
    expect(batch.results.map((result) => result.status)).toEqual([
      'validation_error',
      'accepted',
    ])
    expect(
      (
        await pool!.query('SELECT 1 FROM tax_templates WHERE id = $1', [
          duplicateId,
        ])
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
          [duplicateId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query('SELECT 1 FROM tax_templates WHERE id = $1', [
          independentId,
        ])
      ).rowCount,
    ).toBe(1)
    const changedCode = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...event.payload, business_code: `OTHER-${taxId}` },
        },
      ],
    })
    expect(changedCode.results[0]?.status).toBe('validation_error')
    const revised = await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: {
            ...event.payload,
            name: 'Revised',
            rate_basis_points: 1950,
            effective_at: '2026-10-16',
            is_active: false,
          },
        },
      ],
    })
    expect(revised.results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const row = await pool!.query<{
      business_code: string
      name: string
      rate_basis_points: number
      effective_at: Date
      is_active: boolean
      version: string
    }>(
      'SELECT business_code, name, rate_basis_points, effective_at, is_active, version FROM tax_templates WHERE id = $1',
      [taxId],
    )
    expect(row.rows[0]).toMatchObject({
      business_code: `TAX-${taxId}`,
      name: 'Revised',
      rate_basis_points: 1950,
      is_active: false,
      version: '2',
    })
    expect(row.rows[0]?.effective_at.toISOString().slice(0, 10)).toBe(
      '2026-10-16',
    )
  })

  it('rolls back a tax-template row when its audit write fails', async () => {
    const store = new PostgresSyncStore(pool!)
    const taxId = randomUUID()
    const eventId = randomUUID()
    await expect(
      store.pushEvent({
        event: {
          eventId,
          entityType: 'tax_template',
          entityId: taxId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            business_code: `TAX-${taxId}`,
            name: 'Rollback fixture',
            country_id: null,
            rate_basis_points: 1000,
            effective_at: '2026-10-15',
            is_active: true,
          },
        },
        installationId: randomUUID(),
        actorId: randomUUID(),
      }),
    ).resolves.toMatchObject({ status: 'validation_error' })
    for (const [table, clause, id] of [
      ['tax_templates', 'id = $1', taxId],
      [
        'sync_entities',
        "entity_type = 'tax_template' AND entity_id = $1",
        taxId,
      ],
      ['sync_events', 'event_id = $1', eventId],
      [
        'server_change_log',
        "entity_type = 'tax_template' AND entity_id = $1",
        taxId,
      ],
      [
        'audit_entries',
        "entity_type = 'tax_template' AND entity_id = $1",
        taxId,
      ],
    ]) {
      expect(
        (await pool!.query(`SELECT 1 FROM ${table} WHERE ${clause}`, [id]))
          .rowCount,
      ).toBe(0)
    }
  })

  it('retains a concurrent REST tax-template creation instead of overwriting it', async () => {
    const taxId = randomUUID()
    const businessCode = `TAX-${taxId}`
    const master = new PostgresMasterDataStore(pool!)
    let inserted = false
    const racingPool = {
      async connect() {
        const client = await pool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            const result = await client.query(sql, values)
            if (
              !inserted &&
              sql.startsWith(
                'SELECT version FROM tax_templates WHERE id = $1 FOR UPDATE',
              ) &&
              values?.[0] === taxId
            ) {
              inserted = true
              await master.saveTaxTemplate(
                {
                  id: taxId,
                  businessCode: `${businessCode}-REST`,
                  name: 'REST winner',
                  countryId: null,
                  rateBasisPoints: 1900,
                  effectiveAt: '2026-10-15',
                  isActive: true,
                },
                actorId,
              )
            }
            return result
          },
          release() {
            client.release()
          },
        }
      },
    } as unknown as Pool
    const service = new SyncService(new PostgresSyncStore(racingPool))
    const event = {
      eventId: randomUUID(),
      entityType: 'tax_template' as const,
      entityId: taxId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        business_code: businessCode,
        name: 'Offline loser',
        country_id: null,
        rate_basis_points: 1800,
        effective_at: '2026-10-15',
        is_active: true,
      },
    }
    const result = await service.push(
      { id: actorId, roles: ['administrator'] },
      { deviceId: randomUUID(), events: [event] },
    )
    expect(inserted).toBe(true)
    expect(result.results[0]).toMatchObject({
      status: 'conflict',
      serverVersion: 1,
    })
    const business = await pool!.query<{ name: string; version: string }>(
      'SELECT name, version FROM tax_templates WHERE id = $1',
      [taxId],
    )
    expect(business.rows[0]).toMatchObject({
      name: 'REST winner',
      version: '1',
    })
    const synced = await pool!.query<{
      version: string
      payload_json: { name: string }
    }>(
      "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
      [taxId],
    )
    expect(synced.rows[0]).toMatchObject({
      version: '1',
      payload_json: { name: 'REST winner' },
    })
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
