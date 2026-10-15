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
           (project_id, department_title, company_address, company_contact, default_currency, default_language_pair, default_tax_template_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (project_id) DO UPDATE SET
           department_title = EXCLUDED.department_title,
           company_address = EXCLUDED.company_address,
           company_contact = EXCLUDED.company_contact,
           default_currency = EXCLUDED.default_currency,
           default_language_pair = EXCLUDED.default_language_pair,
           default_tax_template_id = EXCLUDED.default_tax_template_id,
           version = project_print_defaults.version + 1,
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
        ],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, 'project_print_defaults', $2, 'upsert')`,
        [actorId, defaults.projectId],
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
          await assertImmutableBusinessCode(client, 'units', record)
          await client.query(
            `INSERT INTO units (id, business_code, name, is_active)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active,
               version = units.version + 1, updated_at = NOW(), deleted_at = NULL`,
            [record.id, record.businessCode, record.name, record.isActive],
          )
          break
      }
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, $2, $3, 'upsert')`,
        [actorId, record.kind, record.id],
      )
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
      await assertImmutableBusinessCode(client, 'tax_templates', template)
      await client.query(
        `INSERT INTO tax_templates (id, business_code, name, country_id, rate_basis_points, effective_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, country_id = EXCLUDED.country_id,
           rate_basis_points = EXCLUDED.rate_basis_points, effective_at = EXCLUDED.effective_at,
           is_active = EXCLUDED.is_active, version = tax_templates.version + 1, updated_at = NOW(), deleted_at = NULL`,
        [
          template.id,
          template.businessCode,
          template.name,
          template.countryId,
          template.rateBasisPoints,
          template.effectiveAt,
          template.isActive,
        ],
      )
      await client.query(
        `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action)
         VALUES (gen_random_uuid(), $1, 'tax_template', $2, 'upsert')`,
        [actorId, template.id],
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
