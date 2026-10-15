import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { runMigrations } from '../db/migration-runner.js'
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

describe.skipIf(!testPool)('PostgresMasterDataStore project tax scope', () => {
  beforeAll(async () => {
    await runMigrations(testPool!)
  }, 30_000)
  afterAll(async () => {
    await testPool!.end()
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
