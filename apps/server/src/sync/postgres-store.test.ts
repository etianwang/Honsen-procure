import { randomUUID } from 'node:crypto'
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
        company_contact: 'Fixture contact',
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
      payload_json: { default_tax_template_id: string }
    }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
      [projectId],
    )
    expect(retained.rows[0]?.payload_json.default_tax_template_id).toBe(
      globalTaxId,
    )
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
        'UPDATE tax_templates SET is_active = FALSE WHERE id = $1',
        [taxId],
      )
      expect(await store.isCompatibleProjectTax(projectId, taxId)).toBe(false)
      await pool!.query(
        'UPDATE tax_templates SET is_active = TRUE WHERE id = $1',
        [taxId],
      )
      await pool!.query(
        "INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by) VALUES ('tax_template', $1, 1, TRUE, '{}', $2)",
        [taxId, actorId],
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
    const pulled = await service.pull(
      { id: actorId, roles: ['engineer'] },
      { cursor, limit: 500 },
    )
    expect(
      pulled.changes.filter((change) => change.entityId === entityId),
    ).toHaveLength(1)
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
