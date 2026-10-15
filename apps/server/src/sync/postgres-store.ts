import type { SyncChange, SyncEvent, SyncEventResult } from '@honsen/shared'
import type { Pool, PoolClient } from 'pg'
import type { SyncStore } from './types.js'

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

      const serverVersion = currentVersion + 1
      const deleted = input.event.operation === 'soft_delete'
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
        `INSERT INTO server_change_log
           (entity_type, entity_id, operation, version, payload_json, actor_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.event.entityType,
          input.event.entityId,
          input.event.operation,
          serverVersion,
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
        ['country', 'project', 'site', 'department'].includes(
          input.event.entityType,
        ) &&
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
    const project = await this.pool.query<{
      is_deleted: boolean
      payload_json: Record<string, unknown>
    }>(
      "SELECT is_deleted, payload_json FROM sync_entities WHERE entity_type = 'project' AND entity_id = $1",
      [projectId],
    )
    if (project.rows[0]?.is_deleted) return false
    const projectPayload = project.rows[0]?.payload_json
    const countryId = projectPayload
      ? (projectPayload.countryId ?? projectPayload.country_id)
      : (
          await this.pool.query<{ country_id: string }>(
            'SELECT country_id::text AS country_id FROM projects WHERE id = $1 AND deleted_at IS NULL',
            [projectId],
          )
        ).rows[0]?.country_id
    if (typeof countryId !== 'string') return false
    const tax = await this.pool.query<{
      is_deleted: boolean
      payload_json: Record<string, unknown>
    }>(
      "SELECT is_deleted, payload_json FROM sync_entities WHERE entity_type = 'tax_template' AND entity_id = $1",
      [taxTemplateId],
    )
    if (tax.rows[0]?.is_deleted) return false
    const taxPayload = tax.rows[0]?.payload_json
    if (taxPayload) {
      const active = taxPayload.isActive ?? taxPayload.is_active
      const taxCountry =
        taxPayload.countryId !== undefined
          ? taxPayload.countryId
          : taxPayload.country_id
      return (
        active === true && (taxCountry === null || taxCountry === countryId)
      )
    }
    const stored = await this.pool.query<{
      country_id: string | null
      is_active: boolean
    }>(
      'SELECT country_id::text AS country_id, is_active FROM tax_templates WHERE id = $1 AND deleted_at IS NULL',
      [taxTemplateId],
    )
    const row = stored.rows[0]
    return (
      row?.is_active === true &&
      (row.country_id === null || row.country_id === countryId)
    )
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
