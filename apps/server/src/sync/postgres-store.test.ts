import { randomUUID } from 'node:crypto'
import type { SyncEvent } from '@honsen/shared'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
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

  it('keeps expenditure rows append-only and conflicts on a second reversal', async () => {
    const store = new PostgresSyncStore(pool!)
    const originalId = randomUUID()
    const correctionId = randomUUID()
    const makeEvent = (
      entityId: string,
      correctsExpenditureId: string | null,
      status: string,
    ) => ({
      eventId: randomUUID(),
      entityType: 'procurement_expenditure' as const,
      entityId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id: entityId,
        orderId: randomUUID(),
        projectId: randomUUID(),
        amountMinor: '100',
        status,
        correctsExpenditureId,
      },
    })
    const original = makeEvent(originalId, null, 'recorded')
    const push = (event: typeof original) =>
      store.pushEvent({ event, installationId: randomUUID(), actorId })
    expect((await push(original)).status).toBe('accepted')
    expect(await push(original)).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(
      (
        await push({
          ...original,
          eventId: randomUUID(),
          baseVersion: 1,
          payload: { ...original.payload, amountMinor: '200' },
        })
      ).status,
    ).toBe('conflict')
    const reversal = makeEvent(randomUUID(), originalId, 'reversed')
    expect((await push(reversal)).status).toBe('accepted')
    expect(
      (await push(makeEvent(correctionId, originalId, 'reversed'))).status,
    ).toBe('conflict')
    const stored = await store.getEntityPayload(
      'procurement_expenditure',
      originalId,
    )
    expect(stored?.amountMinor).toBe('100')
  })

  it('persists scoped market payments with retry and rejects owner-mode payments', async () => {
    const store = new PostgresSyncStore(pool!)
    const service = new SyncService(store)
    const [countryId, projectId, departmentId, teamId, marketId, ownerId] =
      Array.from({ length: 6 }, () => randomUUID())
    await pool!.query(
      'INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, $3, $4)',
      [countryId, `EXP-C-${countryId}`, 'fixture country', 'UTC'],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'fixture', 'fixture', 'fixture', 'XOF', 'zh_fr')",
      [projectId, countryId, `EXP-P-${projectId}`],
    )
    await pool!.query(
      'INSERT INTO departments (id, business_code, name) VALUES ($1, $2, $3)',
      [departmentId, `EXP-D-${departmentId}`, 'fixture department'],
    )
    await pool!.query(
      'INSERT INTO teams (id, department_id, business_code, name) VALUES ($1, $2, $3, $4)',
      [teamId, departmentId, `EXP-T-${teamId}`, 'fixture team'],
    )
    await pool!.query(
      'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
      [actorId, projectId],
    )
    await pool!.query(
      'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
      [actorId, projectId, departmentId, teamId],
    )
    for (const [orderId, procurementMode] of [
      [marketId, 'honsen_self_purchase'],
      [ownerId, 'owner_self_purchase'],
    ]) {
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
                countryId,
                departmentId,
                teamId,
                procurementMode,
                workflowStatus: 'executing',
                parentOrderId: null,
              },
            },
            installationId: randomUUID(),
            actorId,
          })
        ).status,
      ).toBe('accepted')
    }
    const beforeExpense = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const paymentId = randomUUID()
    const event = {
      eventId: randomUUID(),
      entityType: 'procurement_expenditure' as const,
      entityId: paymentId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id: paymentId,
        orderId: marketId,
        projectId,
        receiptId: null,
        counterpartyType: 'market_casual',
        supplierId: null,
        counterpartySnapshot: null,
        payeeName: 'fixture payee',
        currency: 'XOF',
        amountMinor: '1200',
        paymentDate: '2026-10-13',
        paymentMethod: 'cash',
        paymentHandlerId: actorId,
        notes: null,
        status: 'recorded',
        correctsExpenditureId: null,
        correctionReason: null,
        createdBy: actorId,
        createdAt: 1,
      },
    }
    const actor = { id: actorId, roles: ['purchaser' as const] }
    const push = (submitted: SyncEvent = event) =>
      service.push(actor, { deviceId: randomUUID(), events: [submitted] })
    expect((await push()).results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const reversalId = randomUUID()
    expect(
      (
        await push({
          ...event,
          eventId: randomUUID(),
          entityId: reversalId,
          payload: {
            ...event.payload,
            id: reversalId,
            status: 'reversed',
            correctsExpenditureId: paymentId,
            correctionReason: 'incorrect amount',
            createdAt: 2,
          },
        })
      ).results[0]?.status,
    ).toBe('accepted')
    const replacementId = randomUUID()
    expect(
      (
        await push({
          ...event,
          eventId: randomUUID(),
          entityId: replacementId,
          payload: {
            ...event.payload,
            id: replacementId,
            amountMinor: '1500',
            correctsExpenditureId: reversalId,
            correctionReason: 'replacement',
            createdAt: 3,
          },
        })
      ).results[0]?.status,
    ).toBe('accepted')
    const allowed = await store.pullChanges({
      actor: { id: actorId, roles: ['engineer'] },
      cursor: beforeExpense,
      limit: 20,
    })
    expect(allowed.changes.map((change) => change.entityId)).toEqual([
      paymentId,
      reversalId,
      replacementId,
    ])
    const denied = await store.pullChanges({
      actor: { id: randomUUID(), roles: ['engineer'] },
      cursor: beforeExpense,
      limit: 20,
    })
    expect(denied.changes).toEqual([])
    expect(denied.nextCursor).toBe(beforeExpense)
    expect((await push()).results[0]).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const deniedId = randomUUID()
    expect(
      (
        await push({
          ...event,
          eventId: randomUUID(),
          entityId: deniedId,
          payload: { ...event.payload, id: deniedId, orderId: ownerId },
        })
      ).results[0]?.status,
    ).toBe('validation_error')
    expect(
      (await store.getEntityPayload('procurement_expenditure', paymentId))
        ?.amountMinor,
    ).toBe('1200')
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
