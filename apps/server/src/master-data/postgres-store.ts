import type {
  ExchangeRate,
  ProjectDefaults,
  ReferenceMasterData,
  TaxTemplate,
} from '@honsen/shared'
import type { Pool } from 'pg'
import { MasterDataError, type MasterDataStore } from './service.js'

export class PostgresMasterDataStore implements MasterDataStore {
  constructor(private readonly pool: Pool) {}

  async saveProjectDefaults(
    defaults: ProjectDefaults,
    actorId: string,
  ): Promise<ProjectDefaults> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `project_defaults:${defaults.projectId}`,
      ])
      const synced = await client.query<{ version: string }>(
        "SELECT version FROM sync_entities WHERE entity_type = 'project_defaults' AND entity_id = $1 FOR UPDATE",
        [defaults.projectId],
      )
      const business = await client.query<{ version: string }>(
        'SELECT version FROM project_print_defaults WHERE project_id = $1 FOR UPDATE',
        [defaults.projectId],
      )
      const version =
        Math.max(
          Number(synced.rows[0]?.version ?? 0),
          Number(business.rows[0]?.version ?? 0),
        ) + 1
      if (defaults.defaultTaxTemplateId !== null) {
        const compatible = await client.query(
          `SELECT 1 FROM projects p JOIN tax_templates t ON t.id = $2
           WHERE p.id = $1 AND p.deleted_at IS NULL AND t.is_active = TRUE
             AND t.deleted_at IS NULL AND (t.country_id IS NULL OR t.country_id = p.country_id)`,
          [defaults.projectId, defaults.defaultTaxTemplateId],
        )
        if (compatible.rowCount !== 1)
          throw new MasterDataError('INVALID_DEFAULTS')
      }
      await client.query(
        `INSERT INTO project_print_defaults
           (project_id, department_title, company_address, company_contact, default_currency, default_language_pair, default_tax_template_id, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (project_id) DO UPDATE SET
           department_title = EXCLUDED.department_title,
           company_address = EXCLUDED.company_address,
           company_contact = EXCLUDED.company_contact,
           default_currency = EXCLUDED.default_currency,
           default_language_pair = EXCLUDED.default_language_pair,
           default_tax_template_id = EXCLUDED.default_tax_template_id,
           version = EXCLUDED.version,
           updated_at = NOW(),
           deleted_at = NULL`,
        [
          defaults.projectId,
          defaults.departmentTitle,
          defaults.companyAddress,
          defaults.companyContact,
          defaults.defaultCurrency,
          defaults.defaultLanguagePair,
          defaults.defaultTaxTemplateId,
          version,
        ],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, 'project_print_defaults', $2, 'upsert')`,
        [actorId, defaults.projectId],
      )
      await client.query(
        `INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
         VALUES ('project_defaults', $1, $2, FALSE, $3, $4)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET
           version = EXCLUDED.version, is_deleted = FALSE,
           payload_json = EXCLUDED.payload_json, updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [defaults.projectId, version, defaults, actorId],
      )
      // A cursor must not pass a sequence allocated by an uncommitted writer.
      await client.query(
        'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
      )
      await client.query(
        `INSERT INTO server_change_log
           (entity_type, entity_id, operation, version, payload_json, actor_id)
         VALUES ('project_defaults', $1, 'upsert', $2, $3, $4)`,
        [defaults.projectId, version, defaults, actorId],
      )
      await client.query('COMMIT')
      return defaults
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async saveReferenceData(
    record: ReferenceMasterData,
    actorId: string,
  ): Promise<ReferenceMasterData> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      let unitVersion: number | null = null
      switch (record.kind) {
        case 'country':
          await assertImmutableBusinessCode(client, 'countries', record)
          await client.query(
            `INSERT INTO countries (id, business_code, name, time_zone, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, time_zone = EXCLUDED.time_zone,
               is_active = EXCLUDED.is_active, version = countries.version + 1, updated_at = NOW(), deleted_at = NULL`,
            [
              record.id,
              record.businessCode,
              record.name,
              record.timeZone,
              record.isActive,
            ],
          )
          break
        case 'project':
          await assertImmutableBusinessCode(client, 'projects', record)
          await client.query(
            `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET country_id = EXCLUDED.country_id, name = EXCLUDED.name,
               site = EXCLUDED.site, department_name = EXCLUDED.department_name, default_currency = EXCLUDED.default_currency,
               default_language_pair = EXCLUDED.default_language_pair, is_active = EXCLUDED.is_active,
               version = projects.version + 1, updated_at = NOW(), deleted_at = NULL`,
            [
              record.id,
              record.countryId,
              record.businessCode,
              record.name,
              record.site,
              record.departmentName,
              record.defaultCurrency,
              record.defaultLanguagePair,
              record.isActive,
            ],
          )
          break
        case 'site':
          await assertImmutableBusinessCode(client, 'sites', record)
          await client.query(
            `INSERT INTO sites (id, project_id, business_code, name, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id, name = EXCLUDED.name,
               is_active = EXCLUDED.is_active, version = sites.version + 1, updated_at = NOW(), deleted_at = NULL`,
            [
              record.id,
              record.projectId,
              record.businessCode,
              record.name,
              record.isActive,
            ],
          )
          break
        case 'department':
          await assertImmutableBusinessCode(client, 'departments', record)
          await client.query(
            `INSERT INTO departments (id, business_code, name, is_active)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active,
               version = departments.version + 1, updated_at = NOW(), deleted_at = NULL`,
            [record.id, record.businessCode, record.name, record.isActive],
          )
          break
        case 'team':
          if (record.isActive) {
            const department = await client.query(
              'SELECT 1 FROM departments WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL FOR SHARE',
              [record.departmentId],
            )
            if (department.rowCount !== 1)
              throw new MasterDataError('INVALID_DEFAULTS')
          }
          await assertImmutableBusinessCode(client, 'teams', record)
          await client.query(
            `INSERT INTO teams (id, department_id, business_code, name, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET department_id = EXCLUDED.department_id, name = EXCLUDED.name,
               is_active = EXCLUDED.is_active, version = teams.version + 1, updated_at = NOW(), deleted_at = NULL`,
            [
              record.id,
              record.departmentId,
              record.businessCode,
              record.name,
              record.isActive,
            ],
          )
          break
        case 'unit':
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `unit:${record.id}`,
          ])
          const syncedUnit = await client.query<{
            version: string
            payload_json: Record<string, unknown>
          }>(
            "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'unit' AND entity_id = $1 FOR UPDATE",
            [record.id],
          )
          if (syncedUnit.rows[0]) {
            const code =
              syncedUnit.rows[0].payload_json.businessCode ??
              syncedUnit.rows[0].payload_json.business_code
            if (code !== record.businessCode)
              throw new MasterDataError('IMMUTABLE_BUSINESS_CODE')
          }
          const businessUnit = await client.query<{ version: string }>(
            'SELECT version FROM units WHERE id = $1 FOR UPDATE',
            [record.id],
          )
          unitVersion =
            Math.max(
              Number(syncedUnit.rows[0]?.version ?? 0),
              Number(businessUnit.rows[0]?.version ?? 0),
            ) + 1
          await assertImmutableBusinessCode(client, 'units', record)
          await client.query(
            `INSERT INTO units (id, business_code, name, is_active, version)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active,
               version = EXCLUDED.version, updated_at = NOW(), deleted_at = NULL`,
            [
              record.id,
              record.businessCode,
              record.name,
              record.isActive,
              unitVersion,
            ],
          )
          break
      }
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, $2, $3, 'upsert')`,
        [actorId, record.kind, record.id],
      )
      if (record.kind === 'unit' && unitVersion !== null) {
        const payload = {
          kind: 'unit',
          id: record.id,
          business_code: record.businessCode,
          name: record.name,
          is_active: record.isActive,
          version: unitVersion,
        }
        await client.query(
          `INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
           VALUES ('unit', $1, $2, FALSE, $3, $4)
           ON CONFLICT (entity_type, entity_id) DO UPDATE SET
             version = EXCLUDED.version, is_deleted = FALSE,
             payload_json = EXCLUDED.payload_json, updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
          [record.id, unitVersion, payload, actorId],
        )
        await client.query(
          'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
        )
        await client.query(
          `INSERT INTO server_change_log
             (entity_type, entity_id, operation, version, payload_json, actor_id)
           VALUES ('unit', $1, 'upsert', $2, $3, $4)`,
          [record.id, unitVersion, payload, actorId],
        )
      }
      await client.query('COMMIT')
      return record
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async saveTaxTemplate(
    template: TaxTemplate,
    actorId: string,
  ): Promise<TaxTemplate> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `tax_template:${template.id}`,
      ])
      const synced = await client.query<{ version: string }>(
        "SELECT version FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1 FOR UPDATE",
        [template.id],
      )
      const business = await client.query<{ version: string }>(
        'SELECT version FROM tax_templates WHERE id = $1 FOR UPDATE',
        [template.id],
      )
      const version =
        Math.max(
          Number(synced.rows[0]?.version ?? 0),
          Number(business.rows[0]?.version ?? 0),
        ) + 1
      await assertImmutableBusinessCode(client, 'tax_templates', template)
      await client.query(
        `INSERT INTO tax_templates (id, business_code, name, country_id, rate_basis_points, effective_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, country_id = EXCLUDED.country_id,
           rate_basis_points = EXCLUDED.rate_basis_points, effective_at = EXCLUDED.effective_at,
           is_active = EXCLUDED.is_active, version = $8, updated_at = NOW(), deleted_at = NULL`,
        [
          template.id,
          template.businessCode,
          template.name,
          template.countryId,
          template.rateBasisPoints,
          template.effectiveAt,
          template.isActive,
          version,
        ],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, 'tax_template', $2, 'upsert')`,
        [actorId, template.id],
      )
      const payload = { ...template, version }
      await client.query(
        `INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
         VALUES ('tax_template', $1, $2, FALSE, $3, $4)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET
           version = EXCLUDED.version, is_deleted = FALSE,
           payload_json = EXCLUDED.payload_json, updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [template.id, version, payload, actorId],
      )
      await client.query(
        'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
      )
      await client.query(
        `INSERT INTO server_change_log
           (entity_type, entity_id, operation, version, payload_json, actor_id)
         VALUES ('tax_template', $1, 'upsert', $2, $3, $4)`,
        [template.id, version, payload, actorId],
      )
      await client.query('COMMIT')
      return template
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async saveExchangeRate(
    rate: ExchangeRate,
    actorId: string,
  ): Promise<ExchangeRate> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO exchange_rates (id, from_currency, to_currency, rate_decimal, effective_at, source, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          rate.id,
          rate.fromCurrency,
          rate.toCurrency,
          rate.rateDecimal,
          rate.effectiveAt,
          rate.source,
          rate.reason,
          actorId,
        ],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action, reason)
         VALUES (gen_random_uuid(), $1, 'exchange_rate', $2, 'create', $3)`,
        [actorId, rate.id, rate.reason],
      )
      await client.query('COMMIT')
      return rate
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

type BusinessCodeRecord = { id: string; businessCode: string }
type BusinessCodeTable =
  | 'countries'
  | 'projects'
  | 'sites'
  | 'departments'
  | 'teams'
  | 'units'
  | 'tax_templates'

async function assertImmutableBusinessCode(
  client: {
    query: (
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Array<{ business_code: string }> }>
  },
  table: BusinessCodeTable,
  record: BusinessCodeRecord,
): Promise<void> {
  // `table` is a closed union of repository-owned identifiers; user data stays parameterized.
  const existing = await client.query(
    `SELECT business_code FROM ${table} WHERE id = $1`,
    [record.id],
  )
  if (
    existing.rows[0] !== undefined &&
    existing.rows[0].business_code !== record.businessCode
  ) {
    throw new MasterDataError('IMMUTABLE_BUSINESS_CODE')
  }
}
