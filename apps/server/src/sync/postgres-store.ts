import {
  exchangeRateSchema,
  projectDefaultsSchema,
  referenceMasterDataSchema,
  taxTemplateSchema,
} from '@honsen/shared'
import type { SyncChange, SyncEvent, SyncEventResult } from '@honsen/shared'
import { isDeepStrictEqual } from 'node:util'
import type { Pool, PoolClient } from 'pg'
import type { SyncStore } from './types.js'
import { formalShortCode, parseFormalIssue } from './formal-issue.js'

const globallyVisibleEntityTypes = [
  'country',
  'project',
  'site',
  'department',
  'team',
  'unit',
  'tax_template',
  'exchange_rate',
  'project_defaults',
  'material_category',
  'material',
]

type StoredEvent = {
  event_id: string
  result_status: SyncEventResult['status']
  server_version: string | null
}

type StoredEntity = {
  version: string
  payload_json: Record<string, unknown>
}

type ProjectDefaultsBusinessRow = {
  department_title: string
  company_address: string
  company_contact: string | null
  default_currency: string
  default_language_pair: string
  default_tax_template_id: string | null
  version: string
}

export class PostgresSyncStore implements SyncStore {
  constructor(private readonly pool: Pool) {}

  async pushEvent(input: {
    event: SyncEvent
    installationId: string
    actorId: string
  }): Promise<SyncEventResult> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        input.event.eventId,
      ])
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${input.event.entityType}:${input.event.entityId}`,
      ])
      const prior = await client.query<StoredEvent>(
        `SELECT event_id, result_status, server_version
         FROM sync_events WHERE event_id = $1`,
        [input.event.eventId],
      )
      if (prior.rows[0]) {
        await client.query('COMMIT')
        return eventResult(prior.rows[0])
      }

      const entity = await client.query<StoredEntity>(
        `SELECT version, payload_json
         FROM sync_entities
         WHERE entity_type = $1 AND entity_id = $2
         FOR UPDATE`,
        [input.event.entityType, input.event.entityId],
      )
      const current = entity.rows[0]
      const currentVersion = current ? Number(current.version) : 0
      if (input.event.entityType === 'exchange_rate' && currentVersion === 0) {
        const business = await client.query(
          'SELECT 1 FROM exchange_rates WHERE id = $1 FOR UPDATE',
          [input.event.entityId],
        )
        if (business.rowCount === 1) {
          const result = await this.recordExchangeRateBusinessConflict(
            client,
            input,
          )
          await client.query('COMMIT')
          return result
        }
      }
      if (input.event.entityType === 'unit') {
        const business = await client.query<{
          business_code: string
          name: string
          is_active: boolean
          version: string
        }>(
          'SELECT business_code, name, is_active, version FROM units WHERE id = $1 FOR UPDATE',
          [input.event.entityId],
        )
        const row = business.rows[0]
        if (row && Number(row.version) !== currentVersion) {
          const result = {
            eventId: input.event.eventId,
            status: 'conflict' as const,
            serverVersion: Number(row.version),
          }
          await this.recordConflict(
            client,
            input,
            {
              version: row.version,
              payload_json: {
                businessCode: row.business_code,
                name: row.name,
                isActive: row.is_active,
              },
            },
            result,
          )
          await client.query('COMMIT')
          return result
        }
      }
      if (input.event.entityType === 'tax_template') {
        const business = await client.query<{ version: string }>(
          'SELECT version FROM tax_templates WHERE id = $1 FOR UPDATE',
          [input.event.entityId],
        )
        const row = business.rows[0]
        if (row && Number(row.version) !== currentVersion) {
          const result = await this.recordTaxBusinessConflict(
            client,
            input,
            current,
          )
          await client.query('COMMIT')
          return result
        }
      }
      if (input.event.entityType === 'project_defaults') {
        const business = await client.query<ProjectDefaultsBusinessRow>(
          `SELECT department_title, company_address, company_contact,
             default_currency, default_language_pair,
             default_tax_template_id::text AS default_tax_template_id, version
           FROM project_print_defaults WHERE project_id = $1 FOR UPDATE`,
          [input.event.entityId],
        )
        const row = business.rows[0]
        const synced = current
          ? canonicalProjectDefaultsPayload({
              ...input.event,
              payload: current.payload_json,
            })
          : null
        if (
          row &&
          (Number(row.version) !== currentVersion ||
            (current &&
              JSON.stringify(synced) !==
                JSON.stringify(
                  projectDefaultsBusinessPayload(input.event.entityId, row),
                )))
        ) {
          const result = await this.recordProjectDefaultsBusinessConflict(
            client,
            input,
            current,
          )
          await client.query('COMMIT')
          return result
        }
      }
      if (currentVersion !== input.event.baseVersion) {
        const result = {
          eventId: input.event.eventId,
          status: 'conflict' as const,
          serverVersion: currentVersion,
        }
        await this.recordConflict(client, input, current, result)
        await client.query('COMMIT')
        return result
      }

      if (input.event.entityType === 'purchase_order') {
        const formal = await this.registerFormalIssue(client, input, current)
        if (formal === 'validation_error') {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
        if (formal !== null) {
          const result = {
            eventId: input.event.eventId,
            status: 'conflict' as const,
            serverVersion: currentVersion,
          }
          await this.recordConflict(client, input, formal, result)
          await client.query('COMMIT')
          return result
        }
      }

      const serverVersion = currentVersion + 1
      const deleted = input.event.operation === 'soft_delete'
      const unitPayload =
        input.event.entityType === 'unit'
          ? canonicalUnitPayload(input.event)
          : null
      if (input.event.entityType === 'unit' && !unitPayload) {
        await client.query('ROLLBACK')
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
        }
      }
      const taxPayload =
        input.event.entityType === 'tax_template'
          ? canonicalTaxTemplatePayload(input.event)
          : null
      if (input.event.entityType === 'tax_template' && !taxPayload) {
        await client.query('ROLLBACK')
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
        }
      }
      const ratePayload =
        input.event.entityType === 'exchange_rate'
          ? canonicalExchangeRatePayload(input.event)
          : null
      if (input.event.entityType === 'exchange_rate' && !ratePayload) {
        await client.query('ROLLBACK')
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
        }
      }
      const defaultsPayload =
        input.event.entityType === 'project_defaults'
          ? canonicalProjectDefaultsPayload(input.event)
          : null
      if (input.event.entityType === 'project_defaults' && !defaultsPayload) {
        await client.query('ROLLBACK')
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
        }
      }
      if (input.event.entityType === 'country') {
        const projected = await this.projectCountry(
          client,
          input.event,
          input.actorId,
        )
        if (!projected) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'project') {
        const projected = await this.projectProject(
          client,
          input.event,
          input.actorId,
        )
        if (!projected) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'site') {
        const projected = await this.projectSite(
          client,
          input.event,
          input.actorId,
        )
        if (!projected) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'department') {
        const projected = await this.projectDepartment(
          client,
          input.event,
          input.actorId,
        )
        if (!projected) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'team') {
        const projected = await this.projectTeam(
          client,
          input.event,
          input.actorId,
        )
        if (!projected) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'unit') {
        const projected = await this.projectUnit(
          client,
          { ...input.event, payload: unitPayload! },
          input.actorId,
        )
        if (!projected) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'tax_template') {
        const projected = await this.projectTaxTemplate(
          client,
          { ...input.event, payload: taxPayload! },
          input.actorId,
          currentVersion,
        )
        if (projected === 'conflict') {
          const result = await this.recordTaxBusinessConflict(
            client,
            input,
            current,
          )
          await client.query('COMMIT')
          return result
        }
        if (projected === 'validation_error') {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'exchange_rate') {
        const projected = await this.projectExchangeRate(
          client,
          { ...input.event, payload: ratePayload! },
          input.actorId,
          currentVersion,
        )
        if (projected === 'conflict') {
          const result = await this.recordExchangeRateBusinessConflict(
            client,
            input,
          )
          await client.query('COMMIT')
          return result
        }
        if (projected === 'validation_error') {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      if (input.event.entityType === 'project_defaults') {
        const projected = await this.projectProjectDefaults(
          client,
          defaultsPayload!,
          input.event.entityId,
          input.actorId,
          currentVersion,
        )
        if (projected === 'conflict') {
          const result = await this.recordProjectDefaultsBusinessConflict(
            client,
            input,
            current,
          )
          await client.query('COMMIT')
          return result
        }
        if (projected === 'validation_error') {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
      }
      await client.query(
        `INSERT INTO sync_entities
           (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET
           version = EXCLUDED.version,
           is_deleted = EXCLUDED.is_deleted,
           payload_json = EXCLUDED.payload_json,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [
          input.event.entityType,
          input.event.entityId,
          serverVersion,
          deleted,
          defaultsPayload ??
            ratePayload ??
            taxPayload ??
            unitPayload ??
            input.event.payload,
          input.actorId,
        ],
      )
      await client.query(
        `INSERT INTO sync_events
           (event_id, installation_id, actor_id, entity_type, entity_id, operation, base_version, result_status, server_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted', $8)`,
        [
          input.event.eventId,
          input.installationId,
          input.actorId,
          input.event.entityType,
          input.event.entityId,
          input.event.operation,
          input.event.baseVersion,
          serverVersion,
        ],
      )
      await client.query(
        'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
      )
      await client.query(
        `INSERT INTO server_change_log
           (entity_type, entity_id, operation, version, payload_json, actor_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.event.entityType,
          input.event.entityId,
          input.event.operation,
          serverVersion,
          defaultsPayload ??
            ratePayload ??
            taxPayload ??
            unitPayload ??
            input.event.payload,
          input.actorId,
        ],
      )
      await client.query('COMMIT')
      return {
        eventId: input.event.eventId,
        status: 'accepted',
        serverVersion,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      if (
        [
          'country',
          'project',
          'site',
          'department',
          'team',
          'unit',
          'tax_template',
          'exchange_rate',
          'project_defaults',
        ].includes(input.event.entityType) &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        ['23503', '23505', '23514'].includes(String(error.code))
      ) {
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
        }
      }
      throw error
    } finally {
      client.release()
    }
  }

  private async registerFormalIssue(
    client: PoolClient,
    input: { event: SyncEvent; installationId: string; actorId: string },
    current: StoredEntity | undefined,
  ): Promise<StoredEntity | 'validation_error' | null> {
    const formal = parseFormalIssue(input.event.payload)
    const existing = await client.query<{
      document_type: string
      formal_document_no: string
      formal_installation_id: string
      formal_sequence: string
      matches_snapshot: boolean
    }>(
      `SELECT document_type, formal_document_no,
         formal_installation_id::text AS formal_installation_id,
         formal_sequence::text AS formal_sequence,
         formal_snapshot_json = $2::jsonb AS matches_snapshot
       FROM formal_issue_registry WHERE order_id = $1 FOR UPDATE`,
      [
        input.event.entityId,
        formal && formal !== 'invalid' ? formal.snapshot : {},
      ],
    )
    const prior = existing.rows[0]
    if (formal === 'invalid')
      return prior
        ? (current ?? { version: '0', payload_json: {} })
        : 'validation_error'
    if (formal === null)
      return prior ? (current ?? { version: '0', payload_json: {} }) : null
    if (input.event.operation !== 'upsert')
      return prior
        ? (current ?? { version: '0', payload_json: {} })
        : 'validation_error'
    if (prior) {
      if (!(
        prior.document_type === formal.documentType &&
        prior.formal_document_no === formal.documentNo &&
        prior.formal_installation_id === formal.installationId &&
        prior.formal_sequence === formal.sequence &&
        prior.matches_snapshot
      ))
        return current ?? { version: '0', payload_json: {} }
      if (
        !current ||
        !validFormalTransition(
          current.payload_json.workflowStatus,
          input.event.payload.workflowStatus,
        ) ||
        !isDeepStrictEqual(input.event.payload, {
          ...current.payload_json,
          workflowStatus: input.event.payload.workflowStatus,
        })
      )
        return current ?? { version: '0', payload_json: {} }
      return null
    }
    if (!current || current.payload_json.formalDocumentNo != null)
      return current ?? 'validation_error'
    if (input.event.payload.workflowStatus !== 'formally_issued')
      return 'validation_error'
    if (!isDeepStrictEqual(current.payload_json, formal.snapshot))
      return current
    if (
      !['approved', 'confirmed'].includes(
        String(current.payload_json.workflowStatus),
      ) ||
      !isDeepStrictEqual(input.event.payload, {
        ...formal.snapshot,
        workflowStatus: 'formally_issued',
        documentType: formal.documentType,
        formalDocumentNo: formal.documentNo,
        formalInstallationId: formal.installationId,
        formalSequence: formal.sequence,
        formallyIssuedAt: input.event.payload.formallyIssuedAt,
        formalSnapshotJson: input.event.payload.formalSnapshotJson,
      })
    )
      return 'validation_error'
    const codes = await client.query<{
      country_code: string
      project_code: string
    }>(
      `SELECT c.business_code AS country_code, p.business_code AS project_code
       FROM projects p JOIN countries c ON c.id = p.country_id
       WHERE p.id = $1 AND c.id = $2`,
      [formal.projectId, formal.countryId],
    )
    const code = codes.rows[0]
    if (
      !code ||
      formal.documentNo !==
        `${code.country_code}-${code.project_code}-${formal.orderDate.replaceAll('-', '')}-OPA-${formalShortCode(formal.installationId)}-${formal.sequence}`
    )
      return 'validation_error'
    const inserted = await client.query(
      `INSERT INTO formal_issue_registry
         (order_id, document_type, formal_document_no, formal_installation_id,
          formal_sequence, formal_snapshot_json)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING RETURNING order_id`,
      [
        input.event.entityId,
        formal.documentType,
        formal.documentNo,
        formal.installationId,
        formal.sequence,
        formal.snapshot,
      ],
    )
    if (inserted.rowCount === 1) return null
    const winner = await client.query<StoredEntity>(
      `SELECT e.version, e.payload_json FROM formal_issue_registry r
       JOIN sync_entities e ON e.entity_type = 'purchase_order' AND e.entity_id = r.order_id
       WHERE r.formal_document_no = $1 OR
         (r.formal_installation_id = $2 AND r.formal_sequence = $3)
       LIMIT 1`,
      [formal.documentNo, formal.installationId, formal.sequence],
    )
    return winner.rows[0] ?? { version: '0', payload_json: {} }
  }

  private async projectCountry(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
  ): Promise<boolean> {
    if (event.operation !== 'upsert') return false
    const payload = event.payload
    const businessCode = payload.businessCode ?? payload.business_code
    const name = payload.name
    const timeZone = payload.timeZone ?? payload.time_zone
    const isActive = payload.isActive ?? payload.is_active
    if (
      typeof businessCode !== 'string' ||
      typeof name !== 'string' ||
      typeof timeZone !== 'string' ||
      typeof isActive !== 'boolean'
    )
      return false
    const previous = await client.query<{ business_code: string }>(
      'SELECT business_code FROM countries WHERE id = $1 FOR UPDATE',
      [event.entityId],
    )
    if (previous.rows[0] && previous.rows[0].business_code !== businessCode)
      return false
    await client.query(
      `INSERT INTO countries (id, business_code, name, time_zone, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, time_zone = EXCLUDED.time_zone,
         is_active = EXCLUDED.is_active, version = countries.version + 1,
         updated_at = NOW(), deleted_at = NULL`,
      [event.entityId, businessCode, name, timeZone, isActive],
    )
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'country', $2, 'upsert')",
      [actorId, event.entityId],
    )
    return true
  }

  private async projectProject(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
  ): Promise<boolean> {
    if (event.operation !== 'upsert') return false
    const payload = event.payload
    const businessCode = payload.businessCode ?? payload.business_code
    const countryId = payload.countryId ?? payload.country_id
    const name = payload.name
    const site = payload.site
    const departmentName = payload.departmentName ?? payload.department_name
    const defaultCurrency = payload.defaultCurrency ?? payload.default_currency
    const defaultLanguagePair =
      payload.defaultLanguagePair ?? payload.default_language_pair
    const isActive = payload.isActive ?? payload.is_active
    if (
      typeof businessCode !== 'string' ||
      typeof countryId !== 'string' ||
      typeof name !== 'string' ||
      typeof site !== 'string' ||
      typeof departmentName !== 'string' ||
      typeof defaultCurrency !== 'string' ||
      typeof defaultLanguagePair !== 'string' ||
      typeof isActive !== 'boolean'
    )
      return false
    const prior = await client.query<{
      business_code: string
      country_id: string
    }>(
      'SELECT business_code, country_id::text AS country_id FROM projects WHERE id = $1 FOR UPDATE',
      [event.entityId],
    )
    if (
      prior.rows[0]?.business_code !== undefined &&
      prior.rows[0].business_code !== businessCode
    )
      return false
    if (
      prior.rows[0]?.country_id !== undefined &&
      prior.rows[0].country_id !== countryId
    ) {
      const used = await client.query(
        `SELECT 1 FROM sync_entities WHERE entity_type = 'purchase_order'
         AND is_deleted = FALSE AND
           (payload_json->>'projectId' = $1 OR payload_json->>'project_id' = $1) LIMIT 1`,
        [event.entityId],
      )
      if (used.rowCount !== 0) return false
    }
    await client.query(
      `INSERT INTO projects
         (id, country_id, business_code, name, site, department_name,
          default_currency, default_language_pair, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET country_id = EXCLUDED.country_id,
         name = EXCLUDED.name, site = EXCLUDED.site,
         department_name = EXCLUDED.department_name,
         default_currency = EXCLUDED.default_currency,
         default_language_pair = EXCLUDED.default_language_pair,
         is_active = EXCLUDED.is_active, version = projects.version + 1,
         updated_at = NOW(), deleted_at = NULL`,
      [
        event.entityId,
        countryId,
        businessCode,
        name,
        site,
        departmentName,
        defaultCurrency,
        defaultLanguagePair,
        isActive,
      ],
    )
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'project', $2, 'upsert')",
      [actorId, event.entityId],
    )
    return true
  }

  private async projectSite(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
  ): Promise<boolean> {
    if (event.operation !== 'upsert') return false
    const payload = event.payload
    const businessCode = payload.businessCode ?? payload.business_code
    const projectId = payload.projectId ?? payload.project_id
    const name = payload.name
    const isActive = payload.isActive ?? payload.is_active
    if (
      typeof businessCode !== 'string' ||
      typeof projectId !== 'string' ||
      typeof name !== 'string' ||
      typeof isActive !== 'boolean'
    )
      return false
    const previous = await client.query<{ business_code: string }>(
      'SELECT business_code FROM sites WHERE id = $1 FOR UPDATE',
      [event.entityId],
    )
    if (previous.rows[0] && previous.rows[0].business_code !== businessCode)
      return false
    await client.query(
      `INSERT INTO sites (id, project_id, business_code, name, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id,
         name = EXCLUDED.name, is_active = EXCLUDED.is_active,
         version = sites.version + 1, updated_at = NOW(), deleted_at = NULL`,
      [event.entityId, projectId, businessCode, name, isActive],
    )
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'site', $2, 'upsert')",
      [actorId, event.entityId],
    )
    return true
  }

  private async projectDepartment(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
  ): Promise<boolean> {
    if (event.operation !== 'upsert') return false
    const payload = event.payload
    const businessCode = payload.businessCode ?? payload.business_code
    const name = payload.name
    const isActive = payload.isActive ?? payload.is_active
    if (
      typeof businessCode !== 'string' ||
      typeof name !== 'string' ||
      typeof isActive !== 'boolean'
    )
      return false
    const previous = await client.query<{ business_code: string }>(
      'SELECT business_code FROM departments WHERE id = $1 FOR UPDATE',
      [event.entityId],
    )
    if (previous.rows[0] && previous.rows[0].business_code !== businessCode)
      return false
    await client.query(
      `INSERT INTO departments (id, business_code, name, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
         is_active = EXCLUDED.is_active, version = departments.version + 1,
         updated_at = NOW(), deleted_at = NULL`,
      [event.entityId, businessCode, name, isActive],
    )
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'department', $2, 'upsert')",
      [actorId, event.entityId],
    )
    return true
  }

  private async projectTeam(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
  ): Promise<boolean> {
    if (event.operation !== 'upsert') return false
    const payload = event.payload
    const businessCode = payload.businessCode ?? payload.business_code
    const departmentId = payload.departmentId ?? payload.department_id
    const name = payload.name
    const isActive = payload.isActive ?? payload.is_active
    if (
      typeof businessCode !== 'string' ||
      typeof departmentId !== 'string' ||
      typeof name !== 'string' ||
      typeof isActive !== 'boolean'
    )
      return false
    if (isActive) {
      const department = await client.query(
        'SELECT 1 FROM departments WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL FOR SHARE',
        [departmentId],
      )
      if (department.rowCount !== 1) return false
    }
    const previous = await client.query<{ business_code: string }>(
      'SELECT business_code FROM teams WHERE id = $1 FOR UPDATE',
      [event.entityId],
    )
    if (previous.rows[0] && previous.rows[0].business_code !== businessCode)
      return false
    await client.query(
      `INSERT INTO teams (id, department_id, business_code, name, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET department_id = EXCLUDED.department_id,
         name = EXCLUDED.name, is_active = EXCLUDED.is_active,
         version = teams.version + 1, updated_at = NOW(), deleted_at = NULL`,
      [event.entityId, departmentId, businessCode, name, isActive],
    )
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'team', $2, 'upsert')",
      [actorId, event.entityId],
    )
    return true
  }

  private async projectUnit(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
  ): Promise<boolean> {
    if (event.operation !== 'upsert') return false
    const payload = event.payload
    const businessCode = payload.businessCode ?? payload.business_code
    const name = payload.name
    const isActive = payload.isActive ?? payload.is_active
    if (
      typeof businessCode !== 'string' ||
      typeof name !== 'string' ||
      typeof isActive !== 'boolean'
    )
      return false
    const previous = await client.query<{ business_code: string }>(
      'SELECT business_code FROM units WHERE id = $1 FOR UPDATE',
      [event.entityId],
    )
    if (previous.rows[0] && previous.rows[0].business_code !== businessCode)
      return false
    await client.query(
      `INSERT INTO units (id, business_code, name, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
         is_active = EXCLUDED.is_active, version = units.version + 1,
         updated_at = NOW(), deleted_at = NULL`,
      [event.entityId, businessCode, name, isActive],
    )
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'unit', $2, 'upsert')",
      [actorId, event.entityId],
    )
    return true
  }

  private async projectTaxTemplate(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
    expectedVersion: number,
  ): Promise<'accepted' | 'validation_error' | 'conflict'> {
    if (event.operation !== 'upsert') return 'validation_error'
    const payload = event.payload
    const businessCode = payload.businessCode ?? payload.business_code
    const name = payload.name
    const countryId =
      payload.countryId !== undefined ? payload.countryId : payload.country_id
    const rateBasisPoints = payload.rateBasisPoints ?? payload.rate_basis_points
    const effectiveAt = payload.effectiveAt ?? payload.effective_at
    const isActive = payload.isActive ?? payload.is_active
    if (
      typeof businessCode !== 'string' ||
      typeof name !== 'string' ||
      (countryId !== null && typeof countryId !== 'string') ||
      typeof rateBasisPoints !== 'number' ||
      typeof effectiveAt !== 'string' ||
      typeof isActive !== 'boolean'
    )
      return 'validation_error'
    const previous = await client.query<{ business_code: string }>(
      'SELECT business_code FROM tax_templates WHERE id = $1 FOR UPDATE',
      [event.entityId],
    )
    if (previous.rows[0] && previous.rows[0].business_code !== businessCode)
      return expectedVersion === 0 ? 'conflict' : 'validation_error'
    if (isActive && countryId !== null) {
      const country = await client.query(
        'SELECT 1 FROM countries WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL FOR SHARE',
        [countryId],
      )
      if (country.rowCount !== 1) return 'validation_error'
    }
    const written = await client.query(
      `INSERT INTO tax_templates (id, business_code, name, country_id, rate_basis_points, effective_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
         country_id = EXCLUDED.country_id, rate_basis_points = EXCLUDED.rate_basis_points,
         effective_at = EXCLUDED.effective_at, is_active = EXCLUDED.is_active,
         version = tax_templates.version + 1, updated_at = NOW(), deleted_at = NULL
       WHERE tax_templates.version = $8`,
      [
        event.entityId,
        businessCode,
        name,
        countryId,
        rateBasisPoints,
        effectiveAt,
        isActive,
        expectedVersion,
      ],
    )
    if (written.rowCount !== 1) return 'conflict'
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'tax_template', $2, 'upsert')",
      [actorId, event.entityId],
    )
    return 'accepted'
  }

  private async projectExchangeRate(
    client: PoolClient,
    event: SyncEvent,
    actorId: string,
    currentVersion: number,
  ): Promise<'accepted' | 'conflict' | 'validation_error'> {
    if (event.operation !== 'upsert' || currentVersion !== 0)
      return 'validation_error'
    const payload = event.payload
    const fromCurrency = payload.fromCurrency ?? payload.from_currency
    const toCurrency = payload.toCurrency ?? payload.to_currency
    const rateDecimal = payload.rateDecimal ?? payload.rate_decimal
    const effectiveAt = payload.effectiveAt ?? payload.effective_at
    const written = await client.query(
      `INSERT INTO exchange_rates
         (id, from_currency, to_currency, rate_decimal, effective_at, source, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.entityId,
        fromCurrency,
        toCurrency,
        rateDecimal,
        effectiveAt,
        payload.source,
        payload.reason,
        actorId,
      ],
    )
    if (written.rowCount !== 1) return 'conflict'
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action, reason) VALUES (gen_random_uuid(), $1, 'exchange_rate', $2, 'create', $3)",
      [actorId, event.entityId, payload.reason],
    )
    return 'accepted'
  }

  private async projectProjectDefaults(
    client: PoolClient,
    payload: Record<string, unknown>,
    projectId: string,
    actorId: string,
    expectedVersion: number,
  ): Promise<'accepted' | 'validation_error' | 'conflict'> {
    const project = await client.query<{ country_id: string }>(
      'SELECT country_id::text AS country_id FROM projects WHERE id = $1 AND deleted_at IS NULL FOR SHARE',
      [projectId],
    )
    if (!project.rows[0]) return 'validation_error'
    if (payload.defaultTaxTemplateId !== null) {
      const tax = await client.query(
        `SELECT 1 FROM tax_templates WHERE id = $1 AND is_active = TRUE
           AND deleted_at IS NULL AND (country_id IS NULL OR country_id = $2) FOR SHARE`,
        [payload.defaultTaxTemplateId, project.rows[0].country_id],
      )
      if (tax.rowCount !== 1) return 'validation_error'
    }
    const written = await client.query(
      `INSERT INTO project_print_defaults
         (project_id, department_title, company_address, company_contact,
          default_currency, default_language_pair, default_tax_template_id, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (project_id) DO UPDATE SET
         department_title = EXCLUDED.department_title,
         company_address = EXCLUDED.company_address,
         company_contact = EXCLUDED.company_contact,
         default_currency = EXCLUDED.default_currency,
         default_language_pair = EXCLUDED.default_language_pair,
         default_tax_template_id = EXCLUDED.default_tax_template_id,
         version = project_print_defaults.version + 1,
         updated_at = NOW(), deleted_at = NULL
       WHERE project_print_defaults.version = $9`,
      [
        projectId,
        payload.departmentTitle,
        payload.companyAddress,
        payload.companyContact,
        payload.defaultCurrency,
        payload.defaultLanguagePair,
        payload.defaultTaxTemplateId,
        expectedVersion + 1,
        expectedVersion,
      ],
    )
    if (written.rowCount !== 1) return 'conflict'
    await client.query(
      "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'project_print_defaults', $2, 'upsert')",
      [actorId, projectId],
    )
    return 'accepted'
  }

  private async recordProjectDefaultsBusinessConflict(
    client: PoolClient,
    input: { event: SyncEvent; installationId: string; actorId: string },
    current: StoredEntity | undefined,
  ): Promise<SyncEventResult> {
    const business = await client.query<ProjectDefaultsBusinessRow>(
      `SELECT department_title, company_address, company_contact, default_currency,
         default_language_pair, default_tax_template_id::text AS default_tax_template_id, version
       FROM project_print_defaults WHERE project_id = $1 FOR UPDATE`,
      [input.event.entityId],
    )
    const row = business.rows[0]
    if (!row)
      throw new Error('project defaults disappeared during conflict detection')
    const payload = projectDefaultsBusinessPayload(input.event.entityId, row)
    let businessVersion = Number(row.version)
    const currentVersion = current ? Number(current.version) : 0
    if (businessVersion <= currentVersion) {
      await client.query(
        'UPDATE project_print_defaults SET version = $2, updated_at = NOW() WHERE project_id = $1',
        [input.event.entityId, currentVersion + 1],
      )
      businessVersion = currentVersion + 1
      await client.query(
        "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action) VALUES (gen_random_uuid(), $1, 'project_print_defaults', $2, 'reconcile')",
        [input.actorId, input.event.entityId],
      )
    }
    if (businessVersion > currentVersion) {
      const audit = await client.query<{ actor_id: string | null }>(
        "SELECT actor_id::text AS actor_id FROM audit_entries WHERE entity_type = 'project_print_defaults' AND entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
        [input.event.entityId],
      )
      const actorId = audit.rows[0]?.actor_id ?? input.actorId
      await client.query(
        `INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
         VALUES ('project_defaults', $1, $2, FALSE, $3, $4)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET version = EXCLUDED.version,
           is_deleted = FALSE, payload_json = EXCLUDED.payload_json,
           updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [input.event.entityId, businessVersion, payload, actorId],
      )
      await client.query(
        'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
      )
      await client.query(
        `INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id)
         VALUES ('project_defaults', $1, 'upsert', $2, $3, $4)`,
        [input.event.entityId, businessVersion, payload, actorId],
      )
    }
    const result: SyncEventResult = {
      eventId: input.event.eventId,
      status: 'conflict',
      serverVersion: Math.max(businessVersion, currentVersion),
    }
    await this.recordConflict(
      client,
      input,
      businessVersion >= currentVersion
        ? { version: String(businessVersion), payload_json: payload }
        : current,
      result,
    )
    return result
  }

  private async recordExchangeRateBusinessConflict(
    client: PoolClient,
    input: { event: SyncEvent; installationId: string; actorId: string },
  ): Promise<SyncEventResult> {
    const business = await client.query<{
      from_currency: string
      to_currency: string
      rate_decimal: string
      effective_at: string
      source: string
      reason: string | null
      created_by: string | null
    }>(
      'SELECT from_currency, to_currency, rate_decimal, effective_at::text AS effective_at, source, reason, created_by::text AS created_by FROM exchange_rates WHERE id = $1 FOR UPDATE',
      [input.event.entityId],
    )
    const row = business.rows[0]
    if (!row)
      throw new Error('exchange rate disappeared during conflict detection')
    const payload = {
      id: input.event.entityId,
      fromCurrency: row.from_currency,
      toCurrency: row.to_currency,
      rateDecimal: row.rate_decimal,
      effectiveAt: row.effective_at,
      source: row.source,
      reason: row.reason,
      version: 1,
    }
    const actorId = row.created_by ?? input.actorId
    await client.query(
      `INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
       VALUES ('exchange_rate', $1, 1, FALSE, $2, $3)`,
      [input.event.entityId, payload, actorId],
    )
    await client.query(
      'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
    )
    await client.query(
      `INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id)
       VALUES ('exchange_rate', $1, 'upsert', 1, $2, $3)`,
      [input.event.entityId, payload, actorId],
    )
    const result: SyncEventResult = {
      eventId: input.event.eventId,
      status: 'conflict',
      serverVersion: 1,
    }
    await this.recordConflict(
      client,
      input,
      { version: '1', payload_json: payload },
      result,
    )
    return result
  }

  private async recordTaxBusinessConflict(
    client: PoolClient,
    input: { event: SyncEvent; installationId: string; actorId: string },
    current: StoredEntity | undefined,
  ): Promise<SyncEventResult> {
    const business = await client.query<{
      business_code: string
      name: string
      country_id: string | null
      rate_basis_points: number
      effective_at: string
      is_active: boolean
      version: string
    }>(
      'SELECT business_code, name, country_id::text AS country_id, rate_basis_points, effective_at::text AS effective_at, is_active, version FROM tax_templates WHERE id = $1 FOR UPDATE',
      [input.event.entityId],
    )
    const row = business.rows[0]
    if (!row)
      throw new Error('tax template disappeared during conflict detection')
    const payload = {
      businessCode: row.business_code,
      name: row.name,
      countryId: row.country_id,
      rateBasisPoints: row.rate_basis_points,
      effectiveAt: row.effective_at,
      isActive: row.is_active,
    }
    const businessVersion = Number(row.version)
    const currentVersion = current ? Number(current.version) : 0
    if (businessVersion > currentVersion) {
      const audit = await client.query<{ actor_id: string | null }>(
        "SELECT actor_id::text AS actor_id FROM audit_entries WHERE entity_type = 'tax_template' AND entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
        [input.event.entityId],
      )
      const actorId = audit.rows[0]?.actor_id ?? input.actorId
      await client.query(
        `INSERT INTO sync_entities (entity_type, entity_id, version, is_deleted, payload_json, updated_by)
         VALUES ('tax_template', $1, $2, FALSE, $3, $4)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET version = EXCLUDED.version,
           is_deleted = FALSE, payload_json = EXCLUDED.payload_json,
           updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [input.event.entityId, businessVersion, payload, actorId],
      )
      await client.query(
        'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
      )
      await client.query(
        `INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id)
         VALUES ('tax_template', $1, 'upsert', $2, $3, $4)`,
        [input.event.entityId, businessVersion, payload, actorId],
      )
    }
    const result: SyncEventResult = {
      eventId: input.event.eventId,
      status: 'conflict',
      serverVersion: Math.max(businessVersion, currentVersion),
    }
    await this.recordConflict(
      client,
      input,
      businessVersion >= currentVersion
        ? { version: row.version, payload_json: payload }
        : current,
      result,
    )
    return result
  }

  async pullChanges(input: {
    actor: { id: string; roles: import('@honsen/shared').Role[] }
    cursor: string
    limit: number
  }): Promise<{ changes: SyncChange[]; nextCursor: string }> {
    const canReadAll = input.actor.roles.some((role) =>
      ['super_administrator', 'administrator', 'purchaser', 'viewer'].includes(
        role,
      ),
    )
    const result = await this.pool.query<{
      sequence: string
      entity_type: SyncChange['entityType']
      entity_id: string
      operation: SyncChange['operation']
      version: string
      payload_json: Record<string, unknown>
      changed_at: Date
    }>(
      `SELECT sequence, entity_type, entity_id, operation, version, payload_json, changed_at
       FROM server_change_log c
       WHERE sequence > $1
         AND (
           $2
           OR entity_type = ANY($3::text[])
           OR (
             c.entity_type = 'supplier'
             AND EXISTS (
               SELECT 1 FROM user_project_bindings b
               JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
               WHERE b.user_id = $4 AND b.deleted_at IS NULL
                 AND p.country_id::text = c.payload_json->>'countryId'
             )
           )
           OR (
             c.entity_type = 'material_price'
             AND EXISTS (
               SELECT 1 FROM sync_entities supplier
               JOIN user_project_bindings b ON b.user_id = $4 AND b.deleted_at IS NULL
               JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
               WHERE supplier.entity_type = 'supplier'
                 AND supplier.entity_id::text = c.payload_json->>'supplierId'
                 AND p.country_id::text = supplier.payload_json->>'countryId'
             )
           )
           OR EXISTS (
             SELECT 1 FROM user_project_bindings b
             WHERE b.user_id = $4
               AND b.deleted_at IS NULL
               AND b.project_id::text = c.payload_json->>'projectId'
           )
         )
       ORDER BY sequence
       LIMIT $5`,
      [
        input.cursor,
        canReadAll,
        globallyVisibleEntityTypes,
        input.actor.id,
        input.limit,
      ],
    )
    const changes = result.rows.map((row) => ({
      cursor: row.sequence,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      version: Number(row.version),
      payload: row.payload_json,
      changedAt: row.changed_at.toISOString(),
    }))
    return {
      changes,
      nextCursor: changes.at(-1)?.cursor ?? input.cursor,
    }
  }

  async hasActiveProjectBinding(
    accountId: string,
    projectId: string,
    departmentId?: string,
    teamId?: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM user_project_bindings b
       WHERE b.user_id = $1 AND b.project_id = $2 AND b.deleted_at IS NULL
         AND ($3::uuid IS NULL OR EXISTS (
           SELECT 1 FROM user_project_scope_bindings s
           WHERE s.user_id = b.user_id AND s.project_id = b.project_id
             AND s.department_id = $3 AND s.team_id = $4 AND s.deleted_at IS NULL
         ))`,
      [accountId, projectId, departmentId ?? null, teamId ?? null],
    )
    return result.rowCount === 1
  }

  async hasProjectBusinessUse(projectId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM sync_entities
       WHERE entity_type = 'purchase_order' AND is_deleted = FALSE
         AND (payload_json->>'projectId' = $1 OR payload_json->>'project_id' = $1)
       LIMIT 1`,
      [projectId],
    )
    return result.rowCount === 1
  }

  async isCompatibleProjectTax(
    projectId: string,
    taxTemplateId: string,
  ): Promise<boolean> {
    const project = await this.pool.query<{ is_deleted: boolean }>(
      "SELECT is_deleted FROM sync_entities WHERE entity_type = 'project' AND entity_id = $1",
      [projectId],
    )
    if (project.rows[0]?.is_deleted) return false
    const tax = await this.pool.query<{ is_deleted: boolean }>(
      "SELECT is_deleted FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
      [taxTemplateId],
    )
    if (tax.rows[0]?.is_deleted) return false
    const stored = await this.pool.query(
      `SELECT 1 FROM projects p JOIN tax_templates t ON t.id = $2
       WHERE p.id = $1 AND p.deleted_at IS NULL AND t.is_active = TRUE
         AND t.deleted_at IS NULL AND (t.country_id IS NULL OR t.country_id = p.country_id)`,
      [projectId, taxTemplateId],
    )
    return stored.rowCount === 1
  }

  async getEntityPayload(
    entityType: string,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query<StoredEntity>(
      `SELECT version, payload_json FROM sync_entities
       WHERE entity_type = $1 AND entity_id = $2 AND is_deleted = FALSE`,
      [entityType, entityId],
    )
    return result.rows[0]?.payload_json ?? null
  }

  private async recordConflict(
    client: PoolClient,
    input: {
      event: SyncEvent
      installationId: string
      actorId: string
    },
    current: StoredEntity | undefined,
    result: SyncEventResult,
  ): Promise<void> {
    await client.query(
      `INSERT INTO sync_events
         (event_id, installation_id, actor_id, entity_type, entity_id, operation, base_version, result_status, server_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'conflict', $8)`,
      [
        input.event.eventId,
        input.installationId,
        input.actorId,
        input.event.entityType,
        input.event.entityId,
        input.event.operation,
        input.event.baseVersion,
        result.serverVersion,
      ],
    )
    await client.query(
      `INSERT INTO sync_conflicts
         (event_id, entity_type, entity_id, base_version, server_version, local_payload_json, server_payload_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.event.eventId,
        input.event.entityType,
        input.event.entityId,
        input.event.baseVersion,
        result.serverVersion,
        input.event.payload,
        current?.payload_json ?? {},
      ],
    )
  }
}

function eventResult(row: StoredEvent): SyncEventResult {
  return {
    eventId: row.event_id,
    status: row.result_status,
    serverVersion:
      row.server_version === null ? null : Number(row.server_version),
  }
}

function projectDefaultsBusinessPayload(
  projectId: string,
  row: ProjectDefaultsBusinessRow,
): Record<string, unknown> {
  return {
    projectId,
    departmentTitle: row.department_title.trim(),
    companyAddress: row.company_address.trim(),
    companyContact: row.company_contact?.trim() ?? null,
    defaultCurrency: row.default_currency.trim(),
    defaultLanguagePair: row.default_language_pair,
    defaultTaxTemplateId: row.default_tax_template_id,
  }
}

function canonicalUnitPayload(
  event: SyncEvent,
): Record<string, unknown> | null {
  const payload = event.payload
  const parsed = referenceMasterDataSchema.safeParse({
    kind: 'unit',
    id: event.entityId,
    businessCode: payload.businessCode ?? payload.business_code,
    name: payload.name,
    isActive: payload.isActive ?? payload.is_active,
  })
  if (!parsed.success || parsed.data.kind !== 'unit') return null
  return {
    ...payload,
    ...('businessCode' in payload
      ? { businessCode: parsed.data.businessCode }
      : {}),
    ...('business_code' in payload
      ? { business_code: parsed.data.businessCode }
      : {}),
    name: parsed.data.name,
    ...('isActive' in payload ? { isActive: parsed.data.isActive } : {}),
    ...('is_active' in payload ? { is_active: parsed.data.isActive } : {}),
  }
}

function canonicalTaxTemplatePayload(
  event: SyncEvent,
): Record<string, unknown> | null {
  const payload = event.payload
  const parsed = taxTemplateSchema.safeParse({
    id: event.entityId,
    businessCode: payload.businessCode ?? payload.business_code,
    name: payload.name,
    countryId:
      payload.countryId !== undefined ? payload.countryId : payload.country_id,
    rateBasisPoints: payload.rateBasisPoints ?? payload.rate_basis_points,
    effectiveAt: payload.effectiveAt ?? payload.effective_at,
    isActive: payload.isActive ?? payload.is_active,
  })
  if (!parsed.success) return null
  const value = parsed.data
  return {
    ...payload,
    ...('businessCode' in payload ? { businessCode: value.businessCode } : {}),
    ...('business_code' in payload
      ? { business_code: value.businessCode }
      : {}),
    name: value.name,
    ...('countryId' in payload ? { countryId: value.countryId } : {}),
    ...('country_id' in payload ? { country_id: value.countryId } : {}),
    ...('rateBasisPoints' in payload
      ? { rateBasisPoints: value.rateBasisPoints }
      : {}),
    ...('rate_basis_points' in payload
      ? { rate_basis_points: value.rateBasisPoints }
      : {}),
    ...('effectiveAt' in payload ? { effectiveAt: value.effectiveAt } : {}),
    ...('effective_at' in payload ? { effective_at: value.effectiveAt } : {}),
    ...('isActive' in payload ? { isActive: value.isActive } : {}),
    ...('is_active' in payload ? { is_active: value.isActive } : {}),
  }
}

function canonicalExchangeRatePayload(
  event: SyncEvent,
): Record<string, unknown> | null {
  const payload = event.payload
  const parsed = exchangeRateSchema.safeParse({
    id: event.entityId,
    fromCurrency: payload.fromCurrency ?? payload.from_currency,
    toCurrency: payload.toCurrency ?? payload.to_currency,
    rateDecimal: payload.rateDecimal ?? payload.rate_decimal,
    effectiveAt: payload.effectiveAt ?? payload.effective_at,
    source: payload.source,
    reason: payload.reason,
  })
  if (!parsed.success) return null
  return { ...parsed.data, version: 1 }
}

function canonicalProjectDefaultsPayload(
  event: SyncEvent,
): Record<string, unknown> | null {
  if (event.operation !== 'upsert') return null
  const payload = event.payload
  const parsed = projectDefaultsSchema.safeParse({
    projectId: payload.projectId ?? payload.project_id,
    departmentTitle: payload.departmentTitle ?? payload.department_title,
    companyAddress: payload.companyAddress ?? payload.company_address,
    companyContact:
      payload.companyContact !== undefined
        ? payload.companyContact
        : payload.company_contact,
    defaultCurrency: payload.defaultCurrency ?? payload.default_currency,
    defaultLanguagePair:
      payload.defaultLanguagePair ?? payload.default_language_pair,
    defaultTaxTemplateId:
      payload.defaultTaxTemplateId !== undefined
        ? payload.defaultTaxTemplateId
        : payload.default_tax_template_id,
  })
  if (!parsed.success || parsed.data.projectId !== event.entityId) return null
  return parsed.data
}

function validFormalTransition(before: unknown, after: unknown): boolean {
  if (before === 'formally_issued') return after === 'receiving'
  if (before === 'receiving')
    return [
      'receiving',
      'completed',
      'completed_with_conditions',
      'cancelled',
    ].includes(String(after))
  return false
}
