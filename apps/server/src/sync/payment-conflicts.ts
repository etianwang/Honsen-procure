import { isDeepStrictEqual } from 'node:util'
import {
  paymentConflictResolutionRequestSchema,
  paymentConflictResolutionSchema,
  procurementExpenditureSchema,
  type PaymentConflictView,
  type SyncEvent,
  type SyncEventResult,
} from '@honsen/shared'
import type { Pool, PoolClient } from 'pg'
import type { SyncActor } from './types.js'
import { CategoryRepairError } from './service.js'

type ConflictRow = {
  id: string
  event_id: string
  entity_id: string
  server_version: string
  local_payload_json: Record<string, unknown>
  server_payload_json: Record<string, unknown>
  canonical_local_payload: Record<string, unknown>
  origin_account_id: string
  origin_installation_id: string
  created_at: Date
  resolution: {
    id: string
    resolvedBy: string
    resolvedAt: string
    reason: string
  } | null
}

// Both evidence snapshots must refer to the same authoritative order. Scope comes
// from that order, never a project/country supplied by the resolving renderer.
const scopedConflicts = `SELECT c.*, canonical_procurement_payment(c.local_payload_json,c.origin_account_id,c.created_at) AS canonical_local_payload, CASE WHEN r.id IS NOT NULL THEN
  jsonb_build_object('id',r.id,'resolvedBy',r.actor_id,'resolvedAt',r.payload_json->>'resolvedAt','reason',r.reason) END AS resolution
  FROM sync_conflicts c
  JOIN sync_events rejected ON rejected.event_id=c.event_id AND rejected.result_status='conflict'
    AND rejected.entity_type='procurement_expenditure' AND rejected.entity_id=c.entity_id
    AND rejected.origin_status='attested' AND rejected.origin_account_id=c.origin_account_id
    AND rejected.origin_installation_id=c.origin_installation_id
    AND rejected.server_version=c.server_version
  JOIN sync_entities o ON o.entity_type='purchase_order' AND o.entity_id::text=c.server_payload_json->>'orderId' AND NOT o.is_deleted
  JOIN projects p ON p.id::text=o.payload_json->>'projectId' AND p.is_active AND p.deleted_at IS NULL
  JOIN countries country ON country.id=p.country_id AND country.is_active AND country.deleted_at IS NULL
  JOIN user_project_bindings b ON b.project_id=p.id AND b.user_id=$1 AND b.deleted_at IS NULL
  JOIN user_project_scope_bindings scope ON scope.user_id=b.user_id AND scope.project_id=p.id AND scope.deleted_at IS NULL
  JOIN departments d ON d.id=scope.department_id AND d.is_active AND d.deleted_at IS NULL
  JOIN teams t ON t.id=scope.team_id AND t.department_id=d.id AND t.is_active AND t.deleted_at IS NULL
  LEFT JOIN payment_conflict_resolutions r ON r.conflict_id=c.id
  WHERE c.entity_type='procurement_expenditure' AND c.origin_status='attested'
    AND c.local_payload_json->>'id'=c.entity_id::text
    AND COALESCE(c.local_payload_json->>'createdBy',c.origin_account_id::text)=c.origin_account_id::text
    AND c.local_payload_json->>'orderId'=o.entity_id::text
    AND c.local_payload_json->>'projectId'=p.id::text AND c.server_payload_json->>'projectId'=p.id::text
    AND COALESCE(c.local_payload_json->>'countryId',country.id::text)=country.id::text
    AND COALESCE(c.server_payload_json->>'countryId',country.id::text)=country.id::text
    AND o.payload_json->>'countryId'=country.id::text
    AND o.payload_json->>'departmentId'=d.id::text AND o.payload_json->>'teamId'=t.id::text`

async function isAdministrator(client: PoolClient, actorId: string) {
  const result = await client.query(
    `SELECT 1 FROM users u WHERE u.id=$1 AND u.is_enabled AND u.deleted_at IS NULL
    AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('administrator','super_administrator'))`,
    [actorId],
  )
  return result.rowCount === 1
}

export async function listPaymentConflicts(
  pool: Pool,
  actor: SyncActor,
): Promise<{ conflicts: PaymentConflictView[] }> {
  const client = await pool.connect()
  try {
    if (!(await isAdministrator(client, actor.id)))
      throw new CategoryRepairError('FORBIDDEN')
    const rows = await client.query<ConflictRow>(
      `${scopedConflicts} ORDER BY c.created_at,c.id`,
      [actor.id],
    )
    return {
      conflicts: rows.rows.map((c) => ({
        conflictId: c.id,
        eventId: c.event_id,
        entityId: c.entity_id,
        serverVersion: Number(c.server_version),
        localPayload: c.local_payload_json,
        serverPayload: c.server_payload_json,
        originAccountId: c.origin_account_id,
        originInstallationId: c.origin_installation_id,
        createdAt: c.created_at.toISOString(),
        ...(c.resolution ? { resolution: c.resolution } : {}),
      })),
    }
  } finally {
    client.release()
  }
}

export async function pushPaymentResolution(
  pool: Pool,
  input: { event: SyncEvent; installationId: string; actorId: string },
): Promise<SyncEventResult> {
  const invalid = (errorCode: string): SyncEventResult => ({
    eventId: input.event.eventId,
    status: 'validation_error',
    serverVersion: null,
    errorCode,
  })
  const parsed = paymentConflictResolutionRequestSchema.safeParse(
    input.event.payload,
  )
  if (
    !parsed.success ||
    input.event.operation !== 'upsert' ||
    input.event.baseVersion !== 0 ||
    parsed.data.id !== input.event.entityId
  )
    return invalid('INVALID_PAYMENT_RESOLUTION')
  const request = parsed.data
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!(await isAdministrator(client, input.actorId))) {
      await client.query('ROLLBACK')
      return invalid('FORBIDDEN')
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `payment-resolution-event:${input.event.eventId}`,
    ])
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `payment-resolution-id:${request.id}`,
    ])
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `payment-conflict:${request.conflictId}`,
    ])
    const rows = await client.query<ConflictRow>(
      `${scopedConflicts} AND c.id=$2 AND c.event_id=$3 FOR SHARE OF o,p,country,b,scope,d,t`,
      [input.actorId, request.conflictId, request.eventId],
    )
    const conflict = rows.rows[0]
    if (!conflict) {
      await client.query('ROLLBACK')
      return invalid('FORBIDDEN')
    }
    const prior = await client.query<{
      event_id: string
      actor_id: string
      installation_id: string
      payload_json: Record<string, unknown>
    }>(
      'SELECT event_id,actor_id,installation_id,payload_json FROM payment_conflict_resolutions WHERE id=$1',
      [request.id],
    )
    if (prior.rows[0]) {
      const p = prior.rows[0]
      const same =
        p.event_id === input.event.eventId &&
        p.actor_id === input.actorId &&
        p.installation_id === input.installationId &&
        Object.entries(request).every(([k, v]) =>
          isDeepStrictEqual(p.payload_json[k], v),
        )
      await client.query('COMMIT')
      return same
        ? { eventId: input.event.eventId, status: 'accepted', serverVersion: 1 }
        : invalid('PAYMENT_CONFLICT_ALREADY_RESOLVED')
    }
    if (conflict.resolution) {
      await client.query('ROLLBACK')
      return invalid('PAYMENT_CONFLICT_ALREADY_RESOLVED')
    }
    const winnerId = conflict.server_payload_json.id
    if (typeof winnerId !== 'string') {
      await client.query('ROLLBACK')
      return invalid('INVALID_PAYMENT_CONFLICT_EVIDENCE')
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `payment-order:${conflict.server_payload_json.orderId}`,
    ])
    const winner = await client.query<{
      version: string
      payload_json: Record<string, unknown>
      canonical_payload: Record<string, unknown>
    }>(
      `SELECT e.version,e.payload_json,canonical_procurement_payment(e.payload_json,e.updated_by,e.updated_at) AS canonical_payload FROM sync_entities e JOIN procurement_expenditures p ON p.id=e.entity_id
      WHERE e.entity_type='procurement_expenditure' AND e.entity_id::text=$1 AND NOT e.is_deleted AND canonical_procurement_payment(e.payload_json,e.updated_by,e.updated_at)=p.payload_json`,
      [winnerId],
    )
    if (
      !winner.rows[0] ||
      Number(winner.rows[0].version) !== Number(conflict.server_version) ||
      !isDeepStrictEqual(
        winner.rows[0].payload_json,
        conflict.server_payload_json,
      )
    ) {
      await client.query('ROLLBACK')
      return invalid('STALE_PAYMENT_CONFLICT')
    }
    const local = procurementExpenditureSchema.safeParse(
        conflict.canonical_local_payload,
      ),
      remote = procurementExpenditureSchema.safeParse(
        winner.rows[0].canonical_payload,
      )
    if (
      !local.success ||
      !remote.success ||
      local.data.orderId !== remote.data.orderId ||
      local.data.projectId !== remote.data.projectId ||
      local.data.countryId !== remote.data.countryId ||
      local.data.id !== conflict.entity_id ||
      (local.data.id !== remote.data.id &&
        (local.data.status !== 'reversed' ||
          remote.data.status !== 'reversed' ||
          !local.data.correctsExpenditureId ||
          local.data.correctsExpenditureId !==
            remote.data.correctsExpenditureId))
    ) {
      await client.query('ROLLBACK')
      return invalid('INVALID_PAYMENT_CONFLICT_EVIDENCE')
    }
    // A caller may not reuse another entity/event identifier, even for a decision.
    const used = await client.query(
      'SELECT 1 FROM sync_events WHERE event_id=$1 UNION ALL SELECT 1 FROM sync_entities WHERE entity_type=$2 AND entity_id=$3',
      [input.event.eventId, 'payment_conflict_resolution', request.id],
    )
    if (used.rowCount) {
      await client.query('ROLLBACK')
      return invalid('PAYMENT_CONFLICT_ALREADY_RESOLVED')
    }
    const time = await client.query<{ at: Date }>(
      'SELECT clock_timestamp() AS at',
    )
    const payload = paymentConflictResolutionSchema.parse({
      ...request,
      entityId: conflict.entity_id,
      canonicalEntityId: remote.data.id,
      serverVersion: Number(conflict.server_version),
      localPayload: conflict.local_payload_json,
      serverPayload: conflict.server_payload_json,
      canonicalPayload: winner.rows[0].canonical_payload,
      originAccountId: conflict.origin_account_id,
      originInstallationId: conflict.origin_installation_id,
      orderId: remote.data.orderId,
      projectId: remote.data.projectId,
      countryId: remote.data.countryId,
      resolvedBy: input.actorId,
      resolvedAt: time.rows[0]!.at.toISOString(),
    })
    await client.query(
      `INSERT INTO sync_events(event_id,installation_id,actor_id,origin_account_id,origin_installation_id,origin_status,origin_attested_at,entity_type,entity_id,operation,base_version,result_status,server_version)
      VALUES($1,$2,$3,$3,$2,'attested',NOW(),'payment_conflict_resolution',$4,'upsert',0,'accepted',1)`,
      [input.event.eventId, input.installationId, input.actorId, request.id],
    )
    await client.query(
      'INSERT INTO payment_conflict_resolutions(id,conflict_id,event_id,rejected_event_id,actor_id,installation_id,reason,payload_json,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        request.id,
        request.conflictId,
        input.event.eventId,
        request.eventId,
        input.actorId,
        input.installationId,
        request.reason,
        payload,
        payload.resolvedAt,
      ],
    )
    await client.query(
      `INSERT INTO sync_entities(entity_type,entity_id,version,is_deleted,payload_json,updated_by) VALUES('payment_conflict_resolution',$1,1,FALSE,$2,$3)`,
      [request.id, payload, input.actorId],
    )
    await client.query(
      `INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES($1,$2,'payment_conflict_resolution',$1,'payment_conflict_use_server',$3)`,
      [request.id, input.actorId, request.reason],
    )
    await client.query(
      'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
    )
    await client.query(
      `INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES('payment_conflict_resolution',$1,'upsert',1,$2,$3)`,
      [request.id, payload, input.actorId],
    )
    await client.query('COMMIT')
    return {
      eventId: input.event.eventId,
      status: 'accepted',
      serverVersion: 1,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
