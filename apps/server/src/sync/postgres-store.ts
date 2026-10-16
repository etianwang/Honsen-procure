import type { SyncChange, SyncEvent, SyncEventResult } from '@honsen/shared'
import type { Pool, PoolClient } from 'pg'
import type { SyncActor, SyncStore } from './types.js'

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
  origin_account_id: string | null
  origin_installation_id: string | null
  origin_status: 'attested' | 'legacy_unverified'
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
        `SELECT event_id, result_status, server_version, origin_account_id,
                origin_installation_id, origin_status
         FROM sync_events WHERE event_id = $1`,
        [input.event.eventId],
      )
      if (prior.rows[0]) {
        await client.query('COMMIT')
        if (
          prior.rows[0].origin_status !== 'attested' ||
          prior.rows[0].origin_account_id !== input.actorId ||
          prior.rows[0].origin_installation_id !== input.installationId
        ) {
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
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
           (event_id, installation_id, actor_id, origin_account_id, origin_installation_id, origin_status, origin_attested_at, entity_type, entity_id, operation, base_version, result_status, server_version)
         VALUES ($1, $2, $3, $3, $2, 'attested', NOW(), $4, $5, $6, $7, 'accepted', $8)`,
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
      throw error
    } finally {
      client.release()
    }
  }

  async pullChanges(input: {
    actor: SyncActor
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
         (event_id, installation_id, actor_id, origin_account_id, origin_installation_id, origin_status, origin_attested_at, entity_type, entity_id, operation, base_version, result_status, server_version)
       VALUES ($1, $2, $3, $3, $2, 'attested', NOW(), $4, $5, $6, $7, 'conflict', $8)`,
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
         (event_id, origin_account_id, origin_installation_id, origin_status, entity_type, entity_id, base_version, server_version, local_payload_json, server_payload_json)
       VALUES ($1, $8, $9, 'attested', $2, $3, $4, $5, $6, $7)`,
      [
        input.event.eventId,
        input.event.entityType,
        input.event.entityId,
        input.event.baseVersion,
        result.serverVersion,
        input.event.payload,
        current?.payload_json ?? {},
        input.actorId,
        input.installationId,
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
