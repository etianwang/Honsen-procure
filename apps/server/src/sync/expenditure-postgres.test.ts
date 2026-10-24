import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

const url = process.env.TEST_DATABASE_URL
describe.skipIf(!url)('PostgreSQL payment ledger', () => {
  const pool = new Pool({ connectionString: url })
  const store = new PostgresSyncStore(pool)
  const service = new SyncService(store)
  const actor = { id: randomUUID(), roles: ['purchaser'] as const }
  const countryId = randomUUID(),
    projectId = randomUUID(),
    parentId = randomUUID()
  const children = [randomUUID(), randomUUID()]
  const deviceId = randomUUID()
  beforeAll(async () => {
    await runMigrations(pool)
    await pool.query(
      `INSERT INTO users (id,business_code,username,password_hash,ui_locale,is_enabled) VALUES ($1::uuid,$1::text,$1::text,'fixture','zh-CN',true)`,
      [actor.id],
    )
    await pool.query(
      `INSERT INTO countries (id,business_code,name,time_zone) VALUES ($1::uuid,$1::text,'Synthetic','UTC')`,
      [countryId],
    )
    await pool.query(
      `INSERT INTO projects (id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES ($1::uuid,$2::uuid,$1::text,'Synthetic','Synthetic','Synthetic','XOF','zh_fr')`,
      [projectId, countryId],
    )
    await pool.query(
      `INSERT INTO user_project_bindings (user_id,project_id) VALUES ($1,$2)`,
      [actor.id, projectId],
    )
    for (const id of [parentId, ...children]) {
      await store.pushEvent({
        actorId: actor.id,
        installationId: deviceId,
        event: {
          eventId: randomUUID(),
          entityId: id,
          entityType: 'purchase_order',
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            parentOrderId: id === parentId ? null : parentId,
            procurementMode: id === parentId ? 'honsen_self_purchase' : null,
            projectId,
            countryId,
            currency: 'XOF',
            workflowStatus: 'executing',
            totalMinor: '1000',
          },
        },
      })
    }
  })
  afterAll(async () => {
    await pool.end()
  })
  const payment = (orderId: string, amountMinor = '100') => {
    const id = randomUUID()
    return {
      eventId: randomUUID(),
      entityId: id,
      entityType: 'procurement_expenditure' as const,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id,
        orderId,
        projectId,
        countryId,
        payeeName: 'Synthetic',
        currency: 'XOF',
        amountMinor,
        paymentDate: '2026-10-24',
        paymentType: 'progress',
        paymentMethod: 'cash',
        paymentHandlerId: actor.id,
        createdBy: actor.id,
        status: 'recorded',
        createdAt: 1792800000,
      } as Record<string, unknown>,
    }
  }
  it('persists three payments, retries safely, protects immutable rows and serializes duplicate reversals', async () => {
    const first = payment(children[0]!),
      second = payment(children[0]!, '200'),
      third = payment(children[1]!, '50')
    const push = async (events: (typeof first)[]) =>
      (await service.push(actor, { deviceId, events })).results
    expect((await push([first, second, third])).map((r) => r.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
    ])
    expect((await push([first]))[0]?.status).toBe('accepted')
    expect(
      (
        await push([
          {
            ...first,
            eventId: randomUUID(),
            baseVersion: 1,
            payload: { ...first.payload, amountMinor: '999' },
          },
        ])
      )[0]?.status,
    ).toBe('conflict')
    const reversal = {
      ...payment(children[0]!),
      payload: {} as Record<string, unknown>,
    }
    reversal.payload = {
      ...first.payload,
      id: reversal.entityId,
      status: 'reversed',
      correctsExpenditureId: first.entityId,
      correctionReason: 'Synthetic correction',
    }
    const duplicate = {
      ...reversal,
      eventId: randomUUID(),
      entityId: randomUUID(),
    }
    duplicate.payload = { ...reversal.payload, id: duplicate.entityId }
    const results = await Promise.all([push([reversal]), push([duplicate])])
    expect(
      results
        .flat()
        .map((r) => r.status)
        .sort(),
    ).toEqual(['accepted', 'validation_error'])
    const amounts = await pool.query<{ order_id: string; paid: string }>(
      `SELECT order_id, SUM(CASE WHEN status='reversed' THEN -amount_minor ELSE amount_minor END)::text AS paid FROM procurement_expenditures WHERE project_id=$1 GROUP BY order_id`,
      [projectId],
    )
    expect(
      Object.fromEntries(amounts.rows.map((r) => [r.order_id, r.paid])),
    ).toEqual({ [children[0]!]: '200', [children[1]!]: '50' })
    expect(
      (await store.getEntityPayload('purchase_order', children[0]!))
        ?.totalMinor,
    ).toBe('1000')
    const page = await service.pull(actor, { cursor: '0', limit: 500 })
    expect(
      page.changes.filter(
        (c) =>
          c.entityType === 'procurement_expenditure' &&
          c.payload.projectId === projectId,
      ),
    ).toHaveLength(4)
    expect(
      (await service.pull(actor, { cursor: page.nextCursor, limit: 500 }))
        .changes,
    ).toHaveLength(0)
    const original = await pool.query(
      `SELECT amount_minor,status FROM procurement_expenditures WHERE id=$1`,
      [first.entityId],
    )
    expect(original.rows[0]).toMatchObject({
      amount_minor: '100',
      status: 'recorded',
    })
  })
})
