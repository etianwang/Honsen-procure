import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SyncEvent } from '@honsen/shared'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

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
          businessCode: `SUP-${supplier}`,
          name: 'fixture supplier',
          contactName: null,
          address: null,
          city: null,
          country: null,
          phone: null,
          whatsapp: null,
          email: null,
          paymentTerms: null,
          deliveryLeadTime: null,
          isPreferred: false,
          isActive: true,
          isBlacklisted: false,
          version: 1,
        })
      ).status,
    ).toBe('accepted')
    expect((await push('material_price', price, quote)).status).toBe('accepted')
  })
  afterAll(async () => {
    await pool!.end()
  })
  it('bounds authorization replay and rechecks grants on every page', async () => {
    const reader = randomUUID()
    await pool!.query(
      "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES ($1,$1::uuid::text,$1::uuid::text,'fixture','zh-CN')",
      [reader],
    )
    const sync = new SyncService(store!)
    const identity = {
      id: reader,
      roles: ['engineer'] as const,
      installationId: randomUUID(),
    }
    const before = await sync.pull(identity, { cursor: '0', limit: 500 })
    expect(before.changes.some((change) => change.entityId === supplier)).toBe(
      false,
    )
    expect(before.authorizationVersion).toMatch(/^[a-f0-9]{64}$/)
    await pool!.query(
      'INSERT INTO user_project_bindings(user_id,project_id) VALUES ($1,$2)',
      [reader, project],
    )
    await pool!.query(
      'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4)',
      [reader, project, department, team],
    )
    const expanded = await sync.pull(identity, {
      cursor: before.nextCursor,
      limit: 500,
    })
    expect(expanded.authorizationVersion).not.toBe(before.authorizationVersion)
    const replayUntil = expanded.replayUntil
    const latePrice = randomUUID()
    const lateMaterial = randomUUID()
    expect(
      (
        await push('material', lateMaterial, {
          id: lateMaterial,
          isActive: true,
        })
      ).status,
    ).toBe('accepted')
    expect(
      (
        await push('material_price', latePrice, {
          ...quote,
          id: latePrice,
          materialId: lateMaterial,
        })
      ).status,
    ).toBe('accepted')
    const history = await sync.pull(identity, {
      cursor: '0',
      limit: 500,
      replayUntil,
      authorizationVersion: expanded.authorizationVersion,
    })
    expect(history.changes.some((change) => change.entityId === supplier)).toBe(
      true,
    )
    expect(history.changes.some((change) => change.entityId === price)).toBe(
      true,
    )
    expect(
      history.changes.some((change) => change.entityId === latePrice),
    ).toBe(false)
    const incremental = await sync.pull(identity, {
      cursor: expanded.nextCursor,
      limit: 500,
    })
    expect(
      incremental.changes.some((change) => change.entityId === latePrice),
    ).toBe(true)
    await pool!.query(
      'UPDATE user_project_scope_bindings SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1',
      [reader],
    )
    const revoked = await sync.pull(identity, {
      cursor: '0',
      limit: 500,
      replayUntil,
      authorizationVersion: expanded.authorizationVersion,
    })
    expect(revoked.changes).toEqual([])
    expect(revoked.authorizationVersion).not.toBe(expanded.authorizationVersion)
    await pool!.query(
      'UPDATE user_project_scope_bindings SET deleted_at = NULL, updated_at = NOW() WHERE user_id = $1',
      [reader],
    )
    const restored = await sync.pull(identity, { cursor: '0', limit: 500 })
    expect(restored.authorizationVersion).not.toBe(
      expanded.authorizationVersion,
    )
  })
  it('rejects incomplete and forged catalog payloads without logging changes', async () => {
    const supplierId = randomUUID()
    const priceId = randomUUID()
    const service = new SyncService(store!)
    const events = [
      {
        eventId: randomUUID(),
        entityType: 'supplier',
        entityId: supplierId,
        operation: 'upsert',
        baseVersion: 0,
        payload: { id: supplierId, countryId: country },
      },
      {
        eventId: randomUUID(),
        entityType: 'material_price',
        entityId: priceId,
        operation: 'upsert',
        baseVersion: 0,
        payload: { ...quote, id: randomUUID() },
      },
      {
        eventId: randomUUID(),
        entityType: 'material_price',
        entityId: randomUUID(),
        operation: 'upsert',
        baseVersion: 0,
        payload: { supplierId: supplier, materialId: material },
      },
    ]
    const result = await service.push(
      { id: actor, roles: ['purchaser'], installationId: installation },
      { deviceId: installation, events },
    )
    expect(result.results).toHaveLength(3)
    expect(
      result.results.every(
        (item) =>
          item.status === 'validation_error' &&
          item.errorCode === 'INVALID_CATALOG_PAYLOAD',
      ),
    ).toBe(true)
    const ids = events.map((event) => event.entityId)
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM sync_entities WHERE entity_id = ANY($1::uuid[])',
          [ids],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM server_change_log WHERE entity_id = ANY($1::uuid[])',
          [ids],
        )
      ).rowCount,
    ).toBe(0)
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
