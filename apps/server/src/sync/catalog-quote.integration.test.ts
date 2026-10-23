import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SyncEvent } from '@honsen/shared'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'

const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null
const [
  actor,
  installation,
  country,
  project,
  department,
  team,
  material,
  supplier,
  price,
  order,
  line,
] = Array.from({ length: 11 }, () => randomUUID())
const buyer = randomUUID()
const store = pool ? new PostgresSyncStore(pool) : null
const quote = {
  id: price,
  materialId: material,
  supplierId: supplier,
  currency: 'CNY',
  unit: 'pcs',
  unitPriceMinor: '1234',
  effectiveAt: '2026-10-01',
  sourceNote: null,
  version: 1,
}
const data = {
  applicantId: actor,
  parentOrderId: null,
  projectId: project,
  countryId: country,
  departmentId: department,
  teamId: team,
  procurementMode: 'honsen_self_purchase',
  workflowStatus: 'draft',
  lines: [
    {
      id: line,
      materialId: material,
      catalogPriceId: price,
      priceSource: 'catalog',
      supplierSnapshotJson: JSON.stringify({ id: supplier, name: 'fixture' }),
      currency: 'CNY',
      unit: 'pcs',
      unitPriceMinor: '1234',
    },
  ],
}
const push = (
  entityType: SyncEvent['entityType'],
  entityId: string,
  payload: Record<string, unknown>,
  baseVersion = 0,
  actorId = actor,
) =>
  store!.pushEvent({
    actorId,
    installationId: installation,
    event: {
      eventId: randomUUID(),
      entityType,
      entityId,
      operation: 'upsert',
      baseVersion,
      payload,
    },
  })

describe.skipIf(!pool)('catalog quote push', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
    await pool!.query(
      `INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES ($1,$2,$2,'fixture','zh-CN')`,
      [actor, actor],
    )
    await pool!.query(
      `INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES ($1,$2,$2,'fixture','zh-CN')`,
      [buyer, buyer],
    )
    await pool!.query(
      `INSERT INTO countries(id,business_code,name,time_zone) VALUES ($1,$1::uuid::text,'test','UTC')`,
      [country],
    )
    await pool!.query(
      `INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES ($1,$2,$1::uuid::text,'test','test','test','CNY','zh_fr')`,
      [project, country],
    )
    await pool!.query(
      `INSERT INTO departments(id,business_code,name) VALUES ($1,$1::uuid::text,'test')`,
      [department],
    )
    await pool!.query(
      `INSERT INTO teams(id,department_id,business_code,name) VALUES ($1,$2,$1::uuid::text,'test')`,
      [team, department],
    )
    await pool!.query(
      `INSERT INTO user_project_bindings(user_id,project_id) VALUES ($1,$2)`,
      [actor, project],
    )
    await pool!.query(
      `INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4)`,
      [actor, project, department, team],
    )
    await pool!.query(
      `INSERT INTO user_project_bindings(user_id,project_id) VALUES ($1,$2)`,
      [buyer, project],
    )
    await pool!.query(
      `INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4)`,
      [buyer, project, department, team],
    )
    expect(
      (await push('material', material, { id: material, isActive: true }))
        .status,
    ).toBe('accepted')
    expect(
      (
        await push('supplier', supplier, {
          id: supplier,
          countryId: country,
          isActive: true,
          isBlacklisted: false,
        })
      ).status,
    ).toBe('accepted')
    expect((await push('material_price', price, quote)).status).toBe('accepted')
  })
  afterAll(async () => {
    await pool!.end()
  })
  it('persists identity and rejects a superseded quote on submission', async () => {
    expect((await push('purchase_order', order, data)).status).toBe('accepted')
    const saved = await pool!.query(
      `SELECT payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [order],
    )
    expect(saved.rows[0].payload_json.lines[0].catalogPriceId).toBe(price)
    const pulled = await store!.pullChanges({
      actor: { id: actor, roles: ['engineer'], installationId: installation },
      cursor: '0',
      limit: 500,
    })
    const pulledOrder = pulled.changes.find(
      (change) =>
        change.entityType === 'purchase_order' && change.entityId === order,
    )
    expect(pulledOrder?.payload.lines).toMatchObject([
      { catalogPriceId: price, priceSource: 'catalog' },
    ])
    expect(
      (
        await push(
          'purchase_order',
          order,
          { ...data, workflowStatus: 'pending_confirmation' },
          1,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (
        await push(
          'purchase_order',
          order,
          { ...data, workflowStatus: 'confirmed' },
          2,
          buyer,
        )
      ).status,
    ).toBe('accepted')
    const staleOrder = randomUUID()
    expect((await push('purchase_order', staleOrder, data)).status).toBe(
      'accepted',
    )
    const replacement = randomUUID()
    expect(
      (await push('material_price', replacement, { ...quote, id: replacement }))
        .status,
    ).toBe('accepted')
    expect(
      (
        await push(
          'purchase_order',
          order,
          { ...data, workflowStatus: 'executing' },
          3,
          buyer,
        )
      ).status,
    ).toBe('accepted')
    const result = await push(
      'purchase_order',
      staleOrder,
      { ...data, workflowStatus: 'pending_confirmation' },
      1,
    )
    expect(result).toMatchObject({
      status: 'validation_error',
      errorCode: 'QUOTE_UNAVAILABLE',
    })
    expect(
      (
        await pool!.query(
          `SELECT payload_json->>'workflowStatus' AS status FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
          [staleOrder],
        )
      ).rows[0].status,
    ).toBe('draft')
  })
  it('rejects forged source and blacklisted or cross-country supplier, including concurrent invalidation', async () => {
    const latest = randomUUID()
    expect(
      (await push('material_price', latest, { ...quote, id: latest })).status,
    ).toBe('accepted')
    const lineData = { ...data.lines[0], catalogPriceId: latest }
    expect(
      (
        await push('purchase_order', randomUUID(), {
          ...data,
          procurementMode: 'owner_self_purchase',
          lines: [lineData],
        })
      ).errorCode,
    ).toBe('QUOTE_UNAVAILABLE')
    const next = { ...data, lines: [lineData] }
    expect(
      (
        await push('purchase_order', randomUUID(), {
          ...next,
          lines: [{ ...lineData, catalogPriceId: null }],
        })
      ).errorCode,
    ).toBe('QUOTE_UNAVAILABLE')
    expect(
      (
        await push('purchase_order', randomUUID(), {
          ...next,
          lines: [{ ...lineData, currency: 'USD' }],
        })
      ).errorCode,
    ).toBe('QUOTE_UNAVAILABLE')
    expect(
      (
        await push('purchase_order', randomUUID(), {
          ...next,
          countryId: randomUUID(),
        })
      ).errorCode,
    ).toBe('FORBIDDEN')
    const manual = {
      ...lineData,
      catalogPriceId: null,
      priceSource: 'manual',
      unitPriceMinor: '999',
    }
    expect(
      (await push('purchase_order', randomUUID(), { ...next, lines: [manual] }))
        .status,
    ).toBe('accepted')
    expect(
      (
        await push('purchase_order', randomUUID(), {
          ...next,
          lines: [{ ...manual, catalogPriceId: latest }],
        })
      ).errorCode,
    ).toBe('QUOTE_UNAVAILABLE')
    expect(
      (
        await push('purchase_order', randomUUID(), {
          ...next,
          countryId: randomUUID(),
          lines: [manual],
        })
      ).errorCode,
    ).toBe('FORBIDDEN')
    const client = await pool!.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('catalog-quote-write', 0))",
      )
      await client.query(
        "UPDATE sync_entities SET payload_json = jsonb_set(payload_json, '{isBlacklisted}', 'true') WHERE entity_type = 'supplier' AND entity_id = $1",
        [supplier],
      )
      const competing = push('purchase_order', randomUUID(), next)
      await new Promise((resolve) => setTimeout(resolve, 100))
      await client.query('COMMIT')
      expect((await competing).errorCode).toBe('QUOTE_UNAVAILABLE')
      expect(
        (
          await push('purchase_order', randomUUID(), {
            ...next,
            lines: [manual],
          })
        ).errorCode,
      ).toBe('QUOTE_UNAVAILABLE')
    } finally {
      client.release()
    }
  })
})
