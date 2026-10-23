import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SyncEvent } from '@honsen/shared'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'
import {
  materialFixture,
  supplierFixture,
  priceFixture,
} from './catalog-fixtures.js'

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
let initialCursor = '0'
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
    initialCursor = (
      await pool!.query<{ cursor: string }>(
        'SELECT COALESCE(MAX(sequence),0)::text AS cursor FROM server_change_log',
      )
    ).rows[0]!.cursor
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
      (await push('material', material, materialFixture(material))).status,
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
    const before = await sync.pull(identity, {
      cursor: initialCursor,
      limit: 500,
    })
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
          ...materialFixture(lateMaterial),
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
      cursor: initialCursor,
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
      cursor: initialCursor,
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
    const restored = await sync.pull(identity, {
      cursor: initialCursor,
      limit: 500,
    })
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
  it('quarantines malformed history and restores it only with an audited scoped repair', async () => {
    const broken = randomUUID()
    const brokenQuote = randomUUID()
    const historical = {
      id: broken,
      countryId: country,
      name: 'Incomplete historical supplier',
    }
    await pool!.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('supplier',$1,1,$2,$3)",
      [broken, historical, actor],
    )
    await pool!.query(
      "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES ('supplier',$1,'upsert',1,$2,$3)",
      [broken, historical, actor],
    )
    const malformedQuote = {
      ...priceFixture(brokenQuote, material, broken),
      unitPriceMinor: '1.5',
    }
    await pool!.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES ('material_price',$1,1,$2,$3)",
      [brokenQuote, malformedQuote, actor],
    )
    await pool!.query(
      "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES ('material_price',$1,'upsert',1,$2,$3)",
      [brokenQuote, malformedQuote, actor],
    )
    const sync = new SyncService(store!)
    const identity = {
      id: actor,
      roles: ['administrator'] as const,
      installationId: installation,
    }
    const page = await sync.pull(identity, {
      cursor: initialCursor,
      limit: 500,
    })
    expect(
      page.changes.find((change) => change.entityId === broken)?.payload
        .__catalogQuarantine,
    ).toBe('INVALID_CATALOG_PAYLOAD')
    expect(
      page.changes.some(
        (change) =>
          change.entityId === supplier &&
          change.payload.__catalogQuarantine === undefined,
      ),
    ).toBe(true)
    expect(
      (
        await pool!.query(
          'SELECT original_payload FROM catalog_sync_quarantine WHERE entity_id = $1',
          [broken],
        )
      ).rows[0]?.original_payload,
    ).toEqual(historical)
    await pool!.query(
      "INSERT INTO user_roles(user_id,role) VALUES ($1,'administrator') ON CONFLICT DO NOTHING",
      [actor],
    )
    const request = {
      requestId: randomUUID(),
      entityType: 'supplier',
      entityId: broken,
      expectedVersion: 1,
      payload: supplierFixture(broken, country),
      reason: 'Verified missing supplier fields against the fixture source',
    }
    await expect(
      sync.repairCatalog({ ...identity, roles: ['purchaser'] }, request),
    ).rejects.toThrow('FORBIDDEN')
    const repaired = await sync.repairCatalog(identity, request)
    expect(repaired.status).toBe('accepted')
    expect(await sync.repairCatalog(identity, request)).toEqual(repaired)
    const retained = await pool!.query(
      'SELECT original_payload, resolved_event_id FROM catalog_sync_quarantine WHERE entity_id = $1',
      [broken],
    )
    expect(retained.rowCount).toBeGreaterThan(0)
    for (const row of retained.rows)
      expect(row).toEqual({
        original_payload: historical,
        resolved_event_id: request.requestId,
      })
    const fixedQuote = await sync.repairCatalog(identity, {
      requestId: randomUUID(),
      entityType: 'material_price',
      entityId: brokenQuote,
      expectedVersion: 1,
      payload: priceFixture(brokenQuote, material, broken),
      reason: 'Verified the original quote currency, price, unit and date',
    })
    expect(fixedQuote.status).toBe('accepted')
    expect(
      (
        await pool!.query(
          "SELECT 1 FROM audit_entries WHERE entity_id = $1 AND action = 'catalog_history_recovered'",
          [broken],
        )
      ).rowCount,
    ).toBe(1)
    const after = await sync.pull(identity, {
      cursor: page.nextCursor,
      limit: 500,
    })
    expect(
      after.changes.find((change) => change.entityId === broken)?.payload.name,
    ).toBe('Fixture supplier')
    expect(
      after.changes.find((change) => change.entityId === brokenQuote)?.payload
        .unitPriceMinor,
    ).toBe('1')
    expect(
      (
        await store!.pushEvent({
          actorId: actor,
          installationId: installation,
          event: {
            eventId: randomUUID(),
            entityType: 'supplier',
            entityId: randomUUID(),
            operation: 'upsert',
            baseVersion: 0,
            payload: { countryId: country },
          },
        })
      ).status,
    ).toBe('validation_error')
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
      cursor: initialCursor,
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
  it('preserves legacy nullable/alias payloads and tombstones while rejecting invalid references and duplicate codes', async () => {
    const sync = new SyncService(store!)
    const supplierId = randomUUID(),
      priceId = randomUUID()
    const legacy = (payload: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(payload)
          .filter(([, value]) => value !== null)
          .map(([key, value]) => [
            key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
            value,
          ]),
      )
    const identity = {
      id: actor,
      roles: ['purchaser'] as const,
      installationId: installation,
    }
    const result = await sync.push(identity, {
      deviceId: installation,
      events: [
        {
          eventId: randomUUID(),
          entityType: 'supplier',
          entityId: supplierId,
          operation: 'upsert',
          baseVersion: 0,
          payload: legacy(supplierFixture(supplierId, country)),
        },
        {
          eventId: randomUUID(),
          entityType: 'material_price',
          entityId: priceId,
          operation: 'upsert',
          baseVersion: 0,
          payload: legacy(priceFixture(priceId, material, supplierId)),
        },
      ],
    })
    expect(result.results.map((item) => item.status)).toEqual([
      'accepted',
      'accepted',
    ])
    const badId = randomUUID()
    expect(
      (
        await push('supplier', badId, {
          ...supplierFixture(badId, country),
          businessCode: `SUP-${supplierId}`,
        })
      ).errorCode,
    ).toBe('SUPPLIER_CODE_CONFLICT')
    const orphan = randomUUID()
    expect(
      (
        await push(
          'material_price',
          orphan,
          priceFixture(orphan, randomUUID(), supplierId),
        )
      ).status,
    ).toBe('validation_error')
    const badCountry = randomUUID()
    expect(
      (
        await push('material_price', badCountry, {
          ...priceFixture(badCountry, material, supplierId),
          countryId: randomUUID(),
        })
      ).status,
    ).toBe('validation_error')
    const deleted = await sync.push(identity, {
      deviceId: installation,
      events: [
        {
          eventId: randomUUID(),
          entityType: 'material_price',
          entityId: priceId,
          operation: 'soft_delete',
          baseVersion: 1,
          payload: {},
        },
        {
          eventId: randomUUID(),
          entityType: 'supplier',
          entityId: supplierId,
          operation: 'soft_delete',
          baseVersion: 1,
          payload: {},
        },
      ],
    })
    expect(deleted.results.map((item) => item.status)).toEqual([
      'accepted',
      'accepted',
    ])
    const history = await sync.pull(identity, {
      cursor: initialCursor,
      limit: 500,
    })
    expect(
      history.changes.find(
        (item) => item.entityId === supplierId && item.operation === 'upsert',
      )?.payload,
    ).toMatchObject({ id: supplierId, countryId: country, contactName: null })
    expect(
      history.changes.find(
        (item) => item.entityId === priceId && item.operation === 'soft_delete',
      )?.payload,
    ).toMatchObject({ id: priceId, supplierId, materialId: material })
  })

  it('requires reasoned administrator recovery to establish a missing historical country', async () => {
    const id = randomUUID()
    const original = { ...supplierFixture(id, country), countryId: null }
    await pool!.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('supplier',$1,1,$2,$3)",
      [id, original, actor],
    )
    const sync = new SyncService(store!)
    const identity = {
      id: actor,
      roles: ['administrator'] as const,
      installationId: installation,
    }
    await pool!.query(
      "INSERT INTO user_roles(user_id,role) VALUES($1,'administrator') ON CONFLICT DO NOTHING",
      [actor],
    )
    expect(
      (await push('supplier', id, supplierFixture(id, country), 1)).status,
    ).toBe('validation_error')
    const request = {
      requestId: randomUUID(),
      entityType: 'supplier',
      entityId: id,
      expectedVersion: 1,
      payload: supplierFixture(id, randomUUID()),
      reason: 'Manually verified supplier country from original records',
    }
    expect((await sync.repairCatalog(identity, request)).status).toBe(
      'validation_error',
    )
    const hiddenQuote = randomUUID()
    const oldQuote = priceFixture(hiddenQuote, material, id)
    await pool!.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('material_price',$1,1,$2,$3)",
      [hiddenQuote, oldQuote, actor],
    )
    await pool!.query(
      "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES('material_price',$1,'upsert',1,$2,$3)",
      [hiddenQuote, oldQuote, actor],
    )
    const marker = randomUUID()
    await push('material', marker, materialFixture(marker))
    const before = await sync.pull(identity, {
      cursor: initialCursor,
      limit: 500,
    })
    expect(
      before.changes.some((change) => change.entityId === hiddenQuote),
    ).toBe(false)
    const recovery = await sync.repairCatalog(identity, {
      ...request,
      requestId: randomUUID(),
      payload: supplierFixture(id, country),
    })
    expect(recovery.status).toBe('accepted')
    const after = await sync.pull(identity, {
      cursor: before.nextCursor,
      limit: 500,
    })
    expect(after.authorizationVersion).not.toBe(before.authorizationVersion)
    const replay = await sync.pull(identity, {
      cursor: initialCursor,
      limit: 500,
      replayUntil: after.replayUntil,
      authorizationVersion: after.authorizationVersion,
    })
    expect(
      replay.changes.some((change) => change.entityId === hiddenQuote),
    ).toBe(true)
    expect(
      (
        await pool!.query(
          'SELECT original_payload FROM catalog_sync_quarantine WHERE entity_id = $1',
          [id],
        )
      ).rows[0]?.original_payload,
    ).toEqual(original)
    expect(
      (
        await sync.repairCatalog(identity, {
          ...request,
          requestId: randomUUID(),
          expectedVersion: 2,
        })
      ).status,
    ).toBe('validation_error')
  })
  it('recovers unusable historical quote references only through scoped administrator verification', async () => {
    const sync = new SyncService(store!)
    const identity = {
      id: actor,
      roles: ['administrator'] as const,
      installationId: installation,
    }
    await pool!.query(
      "INSERT INTO user_roles(user_id,role) VALUES($1,'administrator') ON CONFLICT DO NOTHING",
      [actor],
    )
    const forbiddenSupplier = randomUUID()
    await pool!.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('supplier',$1,1,$2,$3)",
      [
        forbiddenSupplier,
        supplierFixture(forbiddenSupplier, randomUUID()),
        actor,
      ],
    )
    for (const badSupplier of ['invalid-uuid', randomUUID()]) {
      const id = randomUUID()
      const raw = {
        ...priceFixture(id, randomUUID(), supplier),
        supplierId: badSupplier,
      }
      await pool!.query(
        "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('material_price',$1,1,$2,$3)",
        [id, raw, actor],
      )
      expect(
        (
          await push(
            'material_price',
            id,
            priceFixture(id, material, supplier),
            1,
          )
        ).status,
      ).toBe('validation_error')
      const request = {
        requestId: randomUUID(),
        entityType: 'material_price',
        entityId: id,
        expectedVersion: 1,
        payload: priceFixture(id, material, forbiddenSupplier),
        reason: 'Verified quote identities against original source',
      }
      expect((await sync.repairCatalog(identity, request)).status).toBe(
        'validation_error',
      )
      expect(
        (
          await sync.repairCatalog(identity, {
            ...request,
            requestId: randomUUID(),
            payload: priceFixture(id, material, supplier),
          })
        ).status,
      ).toBe('accepted')
      expect(
        (
          await pool!.query(
            'SELECT original_payload FROM catalog_sync_quarantine WHERE entity_id = $1',
            [id],
          )
        ).rows[0]?.original_payload,
      ).toEqual(raw)
    }
  })
  it('preserves valid uppercase historical references during administrator recovery', async () => {
    const id = randomUUID()
    const original = {
      ...priceFixture(id, material, supplier),
      materialId: material.toUpperCase(),
      supplierId: supplier.toUpperCase(),
    }
    await pool!.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('material_price',$1,1,$2,$3)",
      [id, original, actor],
    )
    const alternate = randomUUID()
    await push('material', alternate, materialFixture(alternate))
    const sync = new SyncService(store!)
    const identity = {
      id: actor,
      roles: ['administrator'] as const,
      installationId: installation,
    }
    await pool!.query(
      "INSERT INTO user_roles(user_id,role) VALUES($1,'administrator') ON CONFLICT DO NOTHING",
      [actor],
    )
    const request = {
      requestId: randomUUID(),
      entityType: 'material_price',
      entityId: id,
      expectedVersion: 1,
      payload: priceFixture(id, alternate, supplier),
      reason:
        'Case-only normalization must preserve the original valid references',
    }
    expect((await sync.repairCatalog(identity, request)).status).toBe(
      'validation_error',
    )
    expect(
      (
        await sync.repairCatalog(identity, {
          ...request,
          requestId: randomUUID(),
          payload: priceFixture(id, material, supplier),
        })
      ).status,
    ).toBe('accepted')
    expect(
      (
        await pool!.query(
          'SELECT original_payload FROM catalog_sync_quarantine WHERE entity_id = $1',
          [id],
        )
      ).rows[0]?.original_payload,
    ).toEqual(original)
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
