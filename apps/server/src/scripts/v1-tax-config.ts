import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { projectDefaultsSchema, taxTemplateSchema } from '@honsen/shared'

const reason =
  'User-approved V1 tax configuration 2026-11-06; not a legal verification'
/** Caller owns a transaction and the bootstrap advisory lock. Never rewrites existing configuration. */
export async function applyApprovedV1TaxConfig(
  client: PoolClient,
  actor: string,
) {
  const marker = await client.query(
    "SELECT 1 FROM audit_entries WHERE actor_id=$1 AND action='v1_tax_defaults_seeded'",
    [actor],
  )
  if (marker.rowCount)
    return {
      status: 'already_applied_preserving_user_configuration',
      taxTemplates: 0,
      projectDefaults: 0,
    }
  // Keep cursor publication ordered with ordinary API writers during legacy upgrades.
  await client.query('LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE')
  const publish = async (kind: string, id: string, payload: unknown) => {
    await client.query(
      'INSERT INTO sync_entities(entity_type,entity_id,version,is_deleted,payload_json,updated_by) VALUES($1,$2,1,FALSE,$3,$4)',
      [kind, id, payload, actor],
    )
    await client.query(
      "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES($1,$2,'upsert',1,$3,$4)",
      [kind, id, payload, actor],
    )
  }
  const taxes = new Map<string, string>()
  for (const [country, rate] of [
    ['CI', 1800],
    ['CM', 1925],
  ] as const) {
    const countries = await client.query<{ id: string }>(
      'SELECT id FROM countries WHERE business_code=$1 AND is_active=TRUE AND deleted_at IS NULL',
      [country],
    )
    if (countries.rowCount !== 1) throw new Error('TAX_SEED_COUNTRY_MISSING')
    const code = country + '-VAT'
    const existing = await client.query(
      'SELECT id FROM tax_templates WHERE business_code=$1',
      [code],
    )
    if (existing.rowCount)
      throw new Error('TAX_SEED_EXISTING_CONFIGURATION_REQUIRES_REVIEW')
    const template = taxTemplateSchema.parse({
      id: randomUUID(),
      businessCode: code,
      name: country + ' 增值税（用户配置）',
      countryId: countries.rows[0]!.id,
      rateBasisPoints: rate,
      effectiveAt: '2026-11-06',
      isActive: true,
    })
    await client.query(
      'INSERT INTO tax_templates(id,business_code,name,country_id,rate_basis_points,effective_at,is_active) VALUES($1,$2,$3,$4,$5,$6,TRUE)',
      [
        template.id,
        code,
        template.name,
        template.countryId,
        rate,
        template.effectiveAt,
      ],
    )
    await publish('tax_template', template.id, { ...template, version: 1 })
    await client.query(
      "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES(gen_random_uuid(),$1,'tax_template',$2,'v1_user_approved_tax_created',$3)",
      [actor, template.id, reason],
    )
    taxes.set(country, template.id)
  }
  for (const [code, country, currency, address] of [
    ['BETHEL2', 'CI', 'XOF', 'Riviera Golf D30'],
    ['KERENE', 'CI', 'XOF', 'Riviera Golf D30'],
    ['MINREX', 'CM', 'XAF', 'CTDM Minrex'],
  ] as const) {
    const projects = await client.query<{ id: string }>(
      'SELECT p.id FROM projects p JOIN countries c ON c.id=p.country_id WHERE p.business_code=$1 AND c.business_code=$2 AND p.is_active=TRUE AND p.deleted_at IS NULL',
      [code, country],
    )
    if (projects.rowCount !== 1) throw new Error('TAX_SEED_PROJECT_MISSING')
    const projectId = projects.rows[0]!.id
    const existing = await client.query(
      'SELECT 1 FROM project_print_defaults WHERE project_id=$1',
      [projectId],
    )
    if (existing.rowCount)
      throw new Error('TAX_SEED_EXISTING_DEFAULTS_REQUIRES_REVIEW')
    const defaults = projectDefaultsSchema.parse({
      projectId,
      departmentTitle: '项目部',
      companyAddress: address,
      companyContact: null,
      defaultCurrency: currency,
      defaultLanguagePair: 'zh_fr',
      defaultTaxTemplateId: taxes.get(country),
    })
    await client.query(
      'INSERT INTO project_print_defaults(project_id,department_title,company_address,company_contact,default_currency,default_language_pair,default_tax_template_id) VALUES($1,$2,$3,NULL,$4,$5,$6)',
      [
        projectId,
        defaults.departmentTitle,
        address,
        currency,
        defaults.defaultLanguagePair,
        defaults.defaultTaxTemplateId,
      ],
    )
    await publish('project_defaults', projectId, defaults)
  }
  await client.query(
    "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES(gen_random_uuid(),$1,'user',$1,'v1_tax_defaults_seeded',$2)",
    [actor, reason],
  )
  return {
    status: 'applied_user_approved_configuration',
    taxTemplates: 2,
    projectDefaults: 3,
  }
}
