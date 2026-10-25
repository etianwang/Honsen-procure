import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from '../sync/postgres-store.js'
import { materialFixture } from '../sync/catalog-fixtures.js'
import { PostgresMasterDataStore } from './postgres-store.js'
import { MasterDataError } from './service.js'

describe('PostgresMasterDataStore', () => {
  it('rejects a changed business code for an existing record', async () => {
    const calls: string[] = []
    const client = {
      async query(text: string) {
        calls.push(text)
        if (text.startsWith('SELECT business_code')) {
          return { rows: [{ business_code: 'CI' }] }
        }
        return { rows: [] }
      },
      release() {},
    }
    const pool = {
      async connect() {
        return client
      },
    } as unknown as Pool
    const store = new PostgresMasterDataStore(pool)

    await expect(
      store.saveReferenceData(
        {
          kind: 'country',
          id: '8b1cdb58-2a3b-4b0e-aeec-d60bf52c50f6',
          businessCode: 'CM',
          name: 'Cameroon',
          timeZone: 'Africa/Douala',
          isActive: true,
        },
        '8a37f7e4-95ce-4a8b-962e-677a5dd80ddc',
      ),
    ).rejects.toEqual(new MasterDataError('IMMUTABLE_BUSINESS_CODE'))
    expect(calls).toContain('ROLLBACK')
    expect(calls.some((call) => call.startsWith('INSERT INTO countries'))).toBe(
      false,
    )
  })
})

const testPool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null

describe.skipIf(!testPool)('PostgresMasterDataStore integration', () => {
  beforeAll(async () => {
    await runMigrations(testPool!)
  }, 30_000)
  afterAll(async () => {
    await testPool!.end()
  })
  it('publishes online unit saves to cursor Pull and preserves a stale Push as a conflict', async () => {
    const [actorId, unitId] = [randomUUID(), randomUUID()]
    const staleEventId = randomUUID()
    await testPool!.query(
      "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
      [actorId, `UNIT-A-${actorId}`, `unit-${actorId}`],
    )
    const store = new PostgresMasterDataStore(testPool!)
    const sync = new PostgresSyncStore(testPool!)
    const unit = {
      kind: 'unit' as const,
      id: unitId,
      businessCode: `UNIT-${unitId}`,
      name: 'Fixture unit',
      isActive: true,
    }
    try {
      const cursor = (
        await testPool!.query<{ sequence: string }>(
          'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
        )
      ).rows[0]!.sequence
      await store.saveReferenceData(unit, actorId)
      const first = await sync.pullChanges({
        actor: {
          id: actorId,
          roles: ['engineer'],
          installationId: randomUUID(),
        },
        cursor,
        limit: 500,
      })
      expect(
        first.changes.filter((change) => change.entityId === unitId),
      ).toMatchObject([
        {
          entityType: 'unit',
          version: 1,
          payload: {
            kind: 'unit',
            id: unitId,
            business_code: unit.businessCode,
            name: 'Fixture unit',
            is_active: true,
            version: 1,
          },
        },
      ])
      await store.saveReferenceData(
        { ...unit, name: 'Renamed fixture unit', isActive: false },
        actorId,
      )
      const second = await sync.pullChanges({
        actor: {
          id: actorId,
          roles: ['engineer'],
          installationId: randomUUID(),
        },
        cursor: first.nextCursor,
        limit: 500,
      })
      expect(
        second.changes.filter((change) => change.entityId === unitId),
      ).toMatchObject([
        {
          entityType: 'unit',
          version: 2,
          payload: {
            name: 'Renamed fixture unit',
            is_active: false,
            version: 2,
          },
        },
      ])
      expect(
        await sync.pushEvent({
          event: {
            eventId: staleEventId,
            entityType: 'unit',
            entityId: unitId,
            operation: 'upsert',
            baseVersion: 1,
            payload: { ...unit, name: 'Stale offline edit', version: 1 },
          },
          installationId: randomUUID(),
          actorId,
        }),
      ).toMatchObject({ status: 'conflict', serverVersion: 2 })
      const retained = await testPool!.query<{
        name: string
        version: string
      }>('SELECT name, version FROM units WHERE id = $1', [unitId])
      expect(retained.rows[0]).toEqual({
        name: 'Renamed fixture unit',
        version: '2',
      })
      const conflict = await testPool!.query<{
        server_payload_json: Record<string, unknown>
      }>('SELECT server_payload_json FROM sync_conflicts WHERE event_id = $1', [
        staleEventId,
      ])
      expect(conflict.rows[0]?.server_payload_json).toMatchObject({
        name: 'Renamed fixture unit',
        is_active: false,
        version: 2,
      })
    } finally {
      await testPool!.query('DELETE FROM sync_conflicts WHERE event_id = $1', [
        staleEventId,
      ])
      await testPool!.query('DELETE FROM sync_events WHERE event_id = $1', [
        staleEventId,
      ])
      await testPool!.query(
        "DELETE FROM server_change_log WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query(
        "DELETE FROM audit_entries WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query('DELETE FROM units WHERE id = $1', [unitId])
      await testPool!.query('DELETE FROM users WHERE id = $1', [actorId])
    }
  })

  it('rolls back an online unit save when change-log publication fails, then retries', async () => {
    const [actorId, unitId] = [randomUUID(), randomUUID()]
    await testPool!.query(
      "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
      [actorId, `UNIT-A-${actorId}`, `unit-${actorId}`],
    )
    const unit = {
      kind: 'unit' as const,
      id: unitId,
      businessCode: `UNIT-${unitId}`,
      name: 'Rollback fixture',
      isActive: true,
    }
    const failingPool = {
      async connect() {
        const client = await testPool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            if (sql.includes('INSERT INTO server_change_log'))
              throw new Error('injected unit publication failure')
            return client.query(sql, values)
          },
          release() {
            client.release()
          },
        }
      },
    } as unknown as Pool
    try {
      await expect(
        new PostgresMasterDataStore(failingPool).saveReferenceData(
          unit,
          actorId,
        ),
      ).rejects.toThrow('injected unit publication failure')
      const empty = await testPool!.query(
        `SELECT
           (SELECT COUNT(*) FROM units WHERE id = $1) AS business,
           (SELECT COUNT(*) FROM audit_entries WHERE entity_type = 'unit' AND entity_id = $1) AS audit,
           (SELECT COUNT(*) FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1) AS synced,
           (SELECT COUNT(*) FROM server_change_log WHERE entity_type = 'unit' AND entity_id = $1) AS changes`,
        [unitId],
      )
      expect(empty.rows[0]).toEqual({
        business: '0',
        audit: '0',
        synced: '0',
        changes: '0',
      })
      await new PostgresMasterDataStore(testPool!).saveReferenceData(
        unit,
        actorId,
      )
      const restored = await testPool!.query<{ version: string }>(
        'SELECT version FROM units WHERE id = $1',
        [unitId],
      )
      expect(restored.rows[0]?.version).toBe('1')
    } finally {
      await testPool!.query(
        "DELETE FROM server_change_log WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query(
        "DELETE FROM audit_entries WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query('DELETE FROM units WHERE id = $1', [unitId])
      await testPool!.query('DELETE FROM users WHERE id = $1', [actorId])
    }
  })

  it('keeps a legacy sync-only unit code immutable and publishes a same-code revision', async () => {
    const [actorId, unitId] = [randomUUID(), randomUUID()]
    const code = `LEGACY-${unitId}`
    await testPool!.query(
      "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
      [actorId, `UNIT-A-${actorId}`, `unit-${actorId}`],
    )
    await testPool!.query(
      `INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
       VALUES ('unit', $1, 4, FALSE, $2, $3)`,
      [
        unitId,
        {
          kind: 'unit',
          id: unitId,
          business_code: code,
          name: 'Legacy unit',
          is_active: true,
          version: 4,
        },
        actorId,
      ],
    )
    const store = new PostgresMasterDataStore(testPool!)
    try {
      await expect(
        store.saveReferenceData(
          {
            kind: 'unit',
            id: unitId,
            businessCode: `CHANGED-${unitId}`,
            name: 'Wrong code',
            isActive: true,
          },
          actorId,
        ),
      ).rejects.toEqual(new MasterDataError('IMMUTABLE_BUSINESS_CODE'))
      expect(
        (await testPool!.query('SELECT 1 FROM units WHERE id = $1', [unitId]))
          .rowCount,
      ).toBe(0)
      const cursor = (
        await testPool!.query<{ sequence: string }>(
          'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
        )
      ).rows[0]!.sequence
      await store.saveReferenceData(
        {
          kind: 'unit',
          id: unitId,
          businessCode: code,
          name: 'Reconciled unit',
          isActive: true,
        },
        actorId,
      )
      const business = await testPool!.query<{
        business_code: string
        version: string
      }>('SELECT business_code, version FROM units WHERE id = $1', [unitId])
      expect(business.rows[0]).toEqual({ business_code: code, version: '5' })
      const changes = await new PostgresSyncStore(testPool!).pullChanges({
        actor: {
          id: actorId,
          roles: ['engineer'],
          installationId: randomUUID(),
        },
        cursor,
        limit: 500,
      })
      expect(
        changes.changes.filter((change) => change.entityId === unitId),
      ).toMatchObject([
        {
          entityType: 'unit',
          version: 5,
          payload: { business_code: code, name: 'Reconciled unit', version: 5 },
        },
      ])
      await testPool!.query(
        "UPDATE units SET name = 'Business-ahead fixture', version = 9 WHERE id = $1",
        [unitId],
      )
      await store.saveReferenceData(
        {
          kind: 'unit',
          id: unitId,
          businessCode: code,
          name: 'Reconciled business-ahead unit',
          isActive: true,
        },
        actorId,
      )
      const advanced = await testPool!.query<{ version: string }>(
        'SELECT version FROM units WHERE id = $1',
        [unitId],
      )
      expect(advanced.rows[0]?.version).toBe('10')
      const resumed = await new PostgresSyncStore(testPool!).pullChanges({
        actor: {
          id: actorId,
          roles: ['engineer'],
          installationId: randomUUID(),
        },
        cursor: changes.nextCursor,
        limit: 500,
      })
      expect(
        resumed.changes.filter((change) => change.entityId === unitId),
      ).toMatchObject([
        {
          version: 10,
          payload: { name: 'Reconciled business-ahead unit', version: 10 },
        },
      ])
    } finally {
      await testPool!.query(
        "DELETE FROM server_change_log WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query(
        "DELETE FROM audit_entries WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query('DELETE FROM units WHERE id = $1', [unitId])
      await testPool!.query('DELETE FROM users WHERE id = $1', [actorId])
    }
  })

  it('does not publish a unit past an earlier uncommitted change-log cursor', async () => {
    const [actorId, unitId, materialId] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]
    await testPool!.query(
      "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
      [actorId, `UNIT-A-${actorId}`, `unit-${actorId}`],
    )
    const cursor = (
      await testPool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const earlierWriter = await testPool!.connect()
    let signalPublication!: () => void
    const publicationReached = new Promise<void>((resolve) => {
      signalPublication = resolve
    })
    const observedPool = {
      async connect() {
        const writer = await testPool!.connect()
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
      await earlierWriter.query('BEGIN')
      await earlierWriter.query(
        "INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id) VALUES ('material', $1, 'upsert', 1, $2, $3)",
        [
          materialId,
          { ...materialFixture(materialId), nameZh: 'Earlier fixture' },
          actorId,
        ],
      )
      save = new PostgresMasterDataStore(observedPool).saveReferenceData(
        {
          kind: 'unit',
          id: unitId,
          businessCode: `UNIT-${unitId}`,
          name: 'Later fixture unit',
          isActive: true,
        },
        actorId,
      )
      await publicationReached
      let waitingForEarlierWriter = false
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const lock = await testPool!.query<{ waiting: boolean }>(
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
      const sync = new PostgresSyncStore(testPool!)
      const beforeCommit = await sync.pullChanges({
        actor: {
          id: actorId,
          roles: ['engineer'],
          installationId: randomUUID(),
        },
        cursor,
        limit: 500,
      })
      const affectedIds = new Set<string>([materialId, unitId])
      expect(
        beforeCommit.changes.filter((change) =>
          affectedIds.has(change.entityId),
        ),
      ).toEqual([])
      await earlierWriter.query('COMMIT')
      committed = true
      await save
      const pulled = await sync.pullChanges({
        actor: {
          id: actorId,
          roles: ['engineer'],
          installationId: randomUUID(),
        },
        cursor: beforeCommit.nextCursor,
        limit: 500,
      })
      expect(
        pulled.changes
          .filter((change) => affectedIds.has(change.entityId))
          .map((change) => change.entityId),
      ).toEqual([materialId, unitId])
    } finally {
      if (!committed) await earlierWriter.query('ROLLBACK')
      earlierWriter.release()
      await save?.catch(() => undefined)
      await testPool!.query(
        'DELETE FROM server_change_log WHERE entity_id = ANY($1::uuid[])',
        [[materialId, unitId]],
      )
      await testPool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query(
        "DELETE FROM audit_entries WHERE entity_type = 'unit' AND entity_id = $1",
        [unitId],
      )
      await testPool!.query('DELETE FROM units WHERE id = $1', [unitId])
      await testPool!.query('DELETE FROM users WHERE id = $1', [actorId])
    }
  })
  it('keeps a valid default when another-country or inactive tax is rejected', async () => {
    const [actorId, countryId, otherCountryId, projectId, taxId, otherTaxId] =
      Array.from({ length: 6 }, () => randomUUID())
    const store = new PostgresMasterDataStore(testPool!)
    try {
      await testPool!.query(
        `INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled)
        VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)`,
        [actorId, `TAX-A-${actorId}`, `tax-${actorId}`],
      )
      for (const id of [countryId, otherCountryId]) {
        await testPool!.query(
          `INSERT INTO countries (id, business_code, name, time_zone)
          VALUES ($1, $2, 'fixture country', 'UTC')`,
          [id, `TAX-C-${id}`],
        )
      }
      await testPool!.query(
        `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair)
        VALUES ($1, $2, $3, 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr')`,
        [projectId, countryId, `TAX-P-${projectId}`],
      )
      for (const [id, scopedCountry] of [
        [taxId, countryId],
        [otherTaxId, otherCountryId],
      ]) {
        await testPool!.query(
          `INSERT INTO tax_templates (id, business_code, name, country_id, rate_basis_points, effective_at)
          VALUES ($1, $2, 'fixture tax', $3, 1800, '2026-10-15')`,
          [id, `TAX-T-${id}`, scopedCountry],
        )
      }
      const defaults = {
        projectId,
        departmentTitle: 'Fixture department',
        companyAddress: 'Fixture address',
        companyContact: 'Fixture contact',
        defaultCurrency: 'XOF' as const,
        defaultLanguagePair: 'zh_fr' as const,
        defaultTaxTemplateId: taxId,
      }
      await store.saveProjectDefaults(defaults, actorId)
      await expect(
        store.saveProjectDefaults(
          { ...defaults, defaultTaxTemplateId: otherTaxId },
          actorId,
        ),
      ).rejects.toEqual(new MasterDataError('INVALID_DEFAULTS'))
      await testPool!.query(
        'UPDATE tax_templates SET is_active = FALSE WHERE id = $1',
        [taxId],
      )
      await expect(
        store.saveProjectDefaults(defaults, actorId),
      ).rejects.toEqual(new MasterDataError('INVALID_DEFAULTS'))
      const retained = await testPool!.query<{
        default_tax_template_id: string
      }>(
        'SELECT default_tax_template_id FROM project_print_defaults WHERE project_id = $1',
        [projectId],
      )
      expect(retained.rows[0]?.default_tax_template_id).toBe(taxId)
      const audits = await testPool!.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM audit_entries WHERE actor_id = $1 AND entity_type = 'project_print_defaults'",
        [actorId],
      )
      expect(audits.rows[0]?.count).toBe('1')
    } finally {
      await testPool!.query(
        "DELETE FROM server_change_log WHERE entity_type = 'project_defaults' AND entity_id = $1",
        [projectId],
      )
      await testPool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
        [projectId],
      )
      await testPool!.query('DELETE FROM audit_entries WHERE actor_id = $1', [
        actorId,
      ])
      await testPool!.query(
        'DELETE FROM project_print_defaults WHERE project_id = $1',
        [projectId],
      )
      await testPool!.query(
        'DELETE FROM tax_templates WHERE id = ANY($1::uuid[])',
        [[taxId, otherTaxId]],
      )
      await testPool!.query('DELETE FROM projects WHERE id = $1', [projectId])
      await testPool!.query(
        'DELETE FROM countries WHERE id = ANY($1::uuid[])',
        [[countryId, otherCountryId]],
      )
      await testPool!.query('DELETE FROM users WHERE id = $1', [actorId])
    }
  })

  it('rolls back business, audit and sync rows when change-log publication fails', async () => {
    const [actorId, countryId, projectId] = Array.from({ length: 3 }, () =>
      randomUUID(),
    )
    await testPool!.query(
      "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
      [actorId, `DEFAULT-A-${actorId}`, `default-${actorId}`],
    )
    await testPool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'Fixture country', 'UTC')",
      [countryId, `DEFAULT-C-${countryId}`],
    )
    await testPool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'Fixture project', 'Fixture site', 'Fixture department', 'XOF', 'zh_fr')",
      [projectId, countryId, `DEFAULT-P-${projectId}`],
    )
    const defaults = {
      projectId,
      departmentTitle: 'Procurement',
      companyAddress: 'Fixture address',
      companyContact: null,
      defaultCurrency: 'XOF' as const,
      defaultLanguagePair: 'zh_fr' as const,
      defaultTaxTemplateId: null,
    }
    const failingPool = {
      async connect() {
        const client = await testPool!.connect()
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
    try {
      await expect(
        new PostgresMasterDataStore(failingPool).saveProjectDefaults(
          defaults,
          actorId,
        ),
      ).rejects.toThrow('injected change-log failure')
      const empty = await testPool!.query(
        `SELECT
           (SELECT COUNT(*) FROM project_print_defaults WHERE project_id = $1) AS business,
           (SELECT COUNT(*) FROM audit_entries WHERE entity_type = 'project_print_defaults' AND entity_id = $1) AS audit,
           (SELECT COUNT(*) FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1) AS synced,
           (SELECT COUNT(*) FROM server_change_log WHERE entity_type = 'project_defaults' AND entity_id = $1) AS changes`,
        [projectId],
      )
      expect(empty.rows[0]).toEqual({
        business: '0',
        audit: '0',
        synced: '0',
        changes: '0',
      })
      await new PostgresMasterDataStore(testPool!).saveProjectDefaults(
        defaults,
        actorId,
      )
      const restored = await testPool!.query<{ version: string }>(
        'SELECT version FROM project_print_defaults WHERE project_id = $1',
        [projectId],
      )
      expect(restored.rows[0]?.version).toBe('1')
    } finally {
      await testPool!.query(
        "DELETE FROM server_change_log WHERE entity_type = 'project_defaults' AND entity_id = $1",
        [projectId],
      )
      await testPool!.query(
        "DELETE FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1",
        [projectId],
      )
      await testPool!.query(
        "DELETE FROM audit_entries WHERE entity_type = 'project_print_defaults' AND entity_id = $1",
        [projectId],
      )
      await testPool!.query(
        'DELETE FROM project_print_defaults WHERE project_id = $1',
        [projectId],
      )
      await testPool!.query('DELETE FROM projects WHERE id = $1', [projectId])
      await testPool!.query('DELETE FROM countries WHERE id = $1', [countryId])
      await testPool!.query('DELETE FROM users WHERE id = $1', [actorId])
    }
  })
})
