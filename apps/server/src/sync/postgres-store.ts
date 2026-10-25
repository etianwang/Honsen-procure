import {
  exchangeRateSchema,
  projectDefaultsSchema,
  referenceMasterDataSchema,
  taxTemplateSchema,
} from '@honsen/shared'
import type { SyncChange, SyncEvent, SyncEventResult } from '@honsen/shared'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { formalShortCode, parseFormalIssue } from './formal-issue.js'
import type { SyncActor, SyncStore } from './types.js'
import { CategoryRepairError } from './service.js'
import { catalogPayload, catalogTypes } from './catalog-payload.js'

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
  result_error_code: string | null
  server_version: string | null
  origin_account_id: string | null
  origin_installation_id: string | null
  origin_status: 'attested' | 'legacy_unverified'
}

type StoredEntity = {
  version: string
  payload_json: Record<string, unknown>
  is_deleted?: boolean
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

  async listCategoryQuarantine() {
    const result = await this.pool.query<{
      category_id: string
      business_code: string
      name: string
      version: string
    }>(`SELECT q.entity_id AS category_id, q.business_code, COALESCE(e.payload_json->>'name', '') AS name, e.version
      FROM category_code_quarantine q JOIN sync_entities e ON e.entity_type = 'material_category' AND e.entity_id = q.entity_id
      WHERE q.status = 'unresolved' ORDER BY q.business_code, q.entity_id`)
    return result.rows.map((row) => ({
      categoryId: row.category_id,
      businessCode: row.business_code,
      name: row.name,
      version: Number(row.version),
    }))
  }

  async repairCategory(
    input: Parameters<NonNullable<SyncStore['repairCategory']>>[0],
  ) {
    if (
      !input.actor.roles.some(
        (role) => role === 'administrator' || role === 'super_administrator',
      )
    )
      throw new CategoryRepairError('FORBIDDEN')
    const client = await this.pool.connect()
    const { request, actor } = input
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        request.requestId,
      ])
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `material_category:${request.categoryId}`,
      ])
      const existing = await client.query<{
        actor_id: string
        installation_id: string
        category_id: string
        expected_version: string
        result_version: string
        new_business_code: string
        reason: string
      }>('SELECT * FROM category_code_repairs WHERE request_id = $1', [
        request.requestId,
      ])
      const prior = existing.rows[0]
      if (prior) {
        if (
          prior.actor_id !== actor.id ||
          prior.installation_id !== actor.installationId ||
          prior.category_id !== request.categoryId ||
          Number(prior.expected_version) !== request.expectedVersion ||
          prior.new_business_code !== request.newBusinessCode ||
          prior.reason !== request.reason
        )
          throw new CategoryRepairError('CONFLICT')
        await client.query('COMMIT')
        return {
          categoryId: prior.category_id,
          version: Number(prior.result_version),
        }
      }
      // Lock both code groups in a consistent order before taking quarantine
      // row locks. Two administrators may repair different members of one group.
      const snapshot = await client.query<StoredEntity>(
        "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'material_category' AND entity_id = $1",
        [request.categoryId],
      )
      const oldCode =
        snapshot.rows[0]?.payload_json.businessCode ??
        snapshot.rows[0]?.payload_json.business_code
      if (typeof oldCode !== 'string' || oldCode === request.newBusinessCode)
        throw new CategoryRepairError('CONFLICT')
      for (const code of [oldCode, request.newBusinessCode].sort()) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('material_category:' || $1, 0))",
          [code],
        )
      }
      const entity = await client.query<StoredEntity>(
        "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'material_category' AND entity_id = $1 FOR UPDATE",
        [request.categoryId],
      )
      const quarantine = await client.query(
        "SELECT 1 FROM category_code_quarantine WHERE entity_id = $1 AND status = 'unresolved' FOR UPDATE",
        [request.categoryId],
      )
      const current = entity.rows[0]
      if (
        !current ||
        Number(current.version) !== request.expectedVersion ||
        quarantine.rowCount !== 1 ||
        (current.payload_json.businessCode ??
          current.payload_json.business_code) !== oldCode
      )
        throw new CategoryRepairError('CONFLICT')
      const payload: Record<string, unknown> = {
        ...current.payload_json,
        businessCode: request.newBusinessCode,
        version: request.expectedVersion + 1,
      }
      delete payload.business_code
      const version = request.expectedVersion + 1
      await client.query(
        "UPDATE sync_entities SET payload_json = $2, version = $3, updated_by = $4, updated_at = NOW() WHERE entity_type = 'material_category' AND entity_id = $1",
        [request.categoryId, payload, version, actor.id],
      )
      await client.query(
        "UPDATE category_code_quarantine SET status = 'resolved' WHERE entity_id = $1",
        [request.categoryId],
      )
      await client.query(
        'INSERT INTO category_code_repairs (request_id, actor_id, installation_id, category_id, expected_version, result_version, old_business_code, new_business_code, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          request.requestId,
          actor.id,
          actor.installationId,
          request.categoryId,
          request.expectedVersion,
          version,
          oldCode,
          request.newBusinessCode,
          request.reason,
        ],
      )
      await client.query(
        "INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action, reason) VALUES ($1, $2, 'material_category', $3, 'repair_business_code', $4)",
        [request.requestId, actor.id, request.categoryId, request.reason],
      )
      await client.query(
        'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
      )
      await client.query(
        "INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id) VALUES ('material_category', $1, 'upsert', $2, $3, $4)",
        [request.categoryId, version, payload, actor.id],
      )
      await client.query(
        `WITH remaining AS (
        SELECT entity_id, version, payload_json FROM sync_entities
        WHERE entity_type = 'material_category' AND COALESCE(payload_json->>'businessCode', payload_json->>'business_code') COLLATE "C" = $1 COLLATE "C"
      ), released AS (
        UPDATE category_code_quarantine SET status = 'resolved'
        WHERE status = 'unresolved' AND entity_id IN (SELECT entity_id FROM remaining)
          AND (SELECT count(*) FROM remaining) <= 1
        RETURNING entity_id
      ) INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id)
        SELECT 'material_category', r.entity_id, 'upsert', r.version, r.payload_json, $2 FROM remaining r JOIN released q ON q.entity_id = r.entity_id`,
        [oldCode, actor.id],
      )
      await client.query('COMMIT')
      return { categoryId: request.categoryId, version }
    } catch (error) {
      await client.query('ROLLBACK')
      if (
        typeof error === 'object' &&
        error !== null &&
        'constraint' in error &&
        error.constraint === 'material_category_business_code_unique'
      )
        throw new CategoryRepairError('CONFLICT')
      throw error
    } finally {
      client.release()
    }
  }

  async pushEvent(input: {
    event: SyncEvent
    installationId: string
    actorId: string
    recoveryReason?: string
  }): Promise<SyncEventResult> {
    if (
      ['supplier', 'material_price'].includes(input.event.entityType) &&
      input.event.payload.id !== undefined &&
      (typeof input.event.payload.id !== 'string' ||
        input.event.payload.id.toLowerCase() !==
          input.event.entityId.toLowerCase())
    ) {
      return {
        eventId: input.event.eventId,
        status: 'validation_error',
        serverVersion: null,
        errorCode: 'INVALID_CATALOG_PAYLOAD',
      }
    }
    if (
      input.event.operation === 'upsert' &&
      ['supplier', 'material_price'].includes(input.event.entityType)
    ) {
      const payload = catalogPayload(
        input.event.entityType,
        input.event.entityId,
        input.event.payload,
      )
      if (!payload)
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
          errorCode: 'INVALID_CATALOG_PAYLOAD',
        }
      input = { ...input, event: { ...input.event, payload } }
    }
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      if (input.recoveryReason !== undefined) {
        const administrator = await client.query(
          "SELECT 1 FROM user_roles r JOIN users u ON u.id = r.user_id AND u.is_enabled AND u.deleted_at IS NULL WHERE r.user_id = $1 AND r.role = 'administrator'",
          [input.actorId],
        )
        if (
          !input.recoveryReason.trim() ||
          input.recoveryReason.length > 1000 ||
          administrator.rowCount !== 1
        ) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
            errorCode: 'FORBIDDEN',
          }
        }
      }
      if (
        ['material', 'material_price', 'supplier', 'purchase_order'].includes(
          input.event.entityType,
        )
      ) {
        await client.query(
          input.event.entityType === 'purchase_order'
            ? "SELECT pg_advisory_xact_lock(hashtextextended('catalog-quote-write', 0))"
            : "SELECT pg_advisory_xact_lock_shared(hashtextextended('catalog-quote-write', 0))",
        )
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        input.event.eventId,
      ])
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${input.event.entityType}:${input.event.entityId}`,
      ])
      if (['supplier', 'material_price'].includes(input.event.entityType)) {
        const stored = await client.query<StoredEntity>(
          'SELECT version, payload_json, is_deleted FROM sync_entities WHERE entity_type = $1 AND entity_id = $2 FOR UPDATE',
          [input.event.entityType, input.event.entityId],
        )
        const previous = stored.rows[0]?.payload_json
        const next = input.event.payload
        let country =
          input.event.entityType === 'supplier'
            ? previous
              ? (previous.countryId ?? previous.country_id)
              : (next.countryId ?? next.country_id)
            : null
        if (typeof country === 'string') country = country.toLowerCase()
        if (input.recoveryReason && input.event.entityType === 'supplier') {
          const knownCountry = await client.query(
            'SELECT 1 FROM countries WHERE id::text = $1',
            [typeof country === 'string' ? country : null],
          )
          if (!knownCountry.rowCount) country = next.countryId
        }
        let allowed = false
        if (input.event.entityType === 'supplier') {
          const nextCountry = next.countryId ?? next.country_id
          allowed =
            typeof country === 'string' &&
            (input.event.operation !== 'upsert' ||
              (nextCountry === country &&
                (next.countryId === undefined || next.countryId === country) &&
                (next.country_id === undefined || next.country_id === country)))
        } else {
          let supplierId =
            previous?.supplierId ??
            previous?.supplier_id ??
            next.supplierId ??
            next.supplier_id
          let materialId =
            previous?.materialId ??
            previous?.material_id ??
            next.materialId ??
            next.material_id
          if (typeof supplierId === 'string')
            supplierId = supplierId.toLowerCase()
          if (typeof materialId === 'string')
            materialId = materialId.toLowerCase()
          if (input.recoveryReason) {
            const known = await client.query<{
              supplier: boolean
              material: boolean
            }>(
              "SELECT EXISTS(SELECT 1 FROM sync_entities WHERE entity_type = 'supplier' AND entity_id::text = $1) AS supplier, EXISTS(SELECT 1 FROM sync_entities WHERE entity_type = 'material' AND entity_id::text = $2) AS material",
              [
                typeof supplierId === 'string' ? supplierId : null,
                typeof materialId === 'string' ? materialId : null,
              ],
            )
            if (!known.rows[0]!.supplier) supplierId = next.supplierId
            if (!known.rows[0]!.material) materialId = next.materialId
          }
          if (
            typeof supplierId === 'string' &&
            typeof materialId === 'string' &&
            (input.event.operation !== 'upsert' ||
              ((next.supplierId ?? next.supplier_id) === supplierId &&
                (next.materialId ?? next.material_id) === materialId &&
                (next.supplierId === undefined ||
                  next.supplierId === supplierId) &&
                (next.supplier_id === undefined ||
                  next.supplier_id === supplierId) &&
                (next.materialId === undefined ||
                  next.materialId === materialId) &&
                (next.material_id === undefined ||
                  next.material_id === materialId)))
          ) {
            const relations = await client.query<{
              country_id: string
              supplier_payload: Record<string, unknown>
              material_payload: Record<string, unknown>
            }>(
              `SELECT LOWER(COALESCE(s.payload_json->>'countryId', s.payload_json->>'country_id')) AS country_id, s.payload_json AS supplier_payload, m.payload_json AS material_payload
               FROM sync_entities s JOIN sync_entities m ON m.entity_type = 'material' AND m.entity_id::text = $2 AND (NOT m.is_deleted OR $3::boolean)
               WHERE s.entity_type = 'supplier' AND s.entity_id::text = $1 AND (NOT s.is_deleted OR $3::boolean) FOR SHARE OF s, m`,
              [supplierId, materialId, !!previous],
            )
            const supplierCountry = relations.rows[0]?.country_id
            if (
              input.event.operation === 'upsert' &&
              relations.rows[0] &&
              (!catalogPayload(
                'supplier',
                supplierId,
                relations.rows[0].supplier_payload,
              ) ||
                !catalogPayload(
                  'material',
                  materialId,
                  relations.rows[0].material_payload,
                ))
            ) {
              await client.query('ROLLBACK')
              return {
                eventId: input.event.eventId,
                status: 'validation_error',
                serverVersion: null,
                errorCode: 'INVALID_CATALOG_REFERENCE',
              }
            }
            if (
              supplierCountry &&
              (next.countryId == null || next.countryId === supplierCountry) &&
              (next.country_id == null || next.country_id === supplierCountry)
            ) {
              const binding = await client.query(
                `SELECT 1 FROM user_project_bindings b JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
                 JOIN user_project_scope_bindings scope ON scope.user_id = b.user_id AND scope.project_id = b.project_id AND scope.deleted_at IS NULL
                 JOIN departments d ON d.id = scope.department_id AND d.is_active AND d.deleted_at IS NULL
                 JOIN teams t ON t.id = scope.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
                 WHERE b.user_id = $1 AND b.deleted_at IS NULL AND p.country_id::text = $2 FOR SHARE OF b, p, scope, d, t`,
                [input.actorId, supplierCountry],
              )
              allowed = (binding.rowCount ?? 0) > 0
            }
          }
        }
        if (allowed && input.event.entityType === 'supplier') {
          const binding = await client.query(
            `SELECT 1 FROM user_project_bindings b JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
             JOIN user_project_scope_bindings scope ON scope.user_id = b.user_id AND scope.project_id = b.project_id AND scope.deleted_at IS NULL
             JOIN departments d ON d.id = scope.department_id AND d.is_active AND d.deleted_at IS NULL
             JOIN teams t ON t.id = scope.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
             WHERE b.user_id = $1 AND b.deleted_at IS NULL AND p.country_id::text = $2 FOR SHARE OF b, p, scope, d, t`,
            [input.actorId, country],
          )
          allowed = (binding.rowCount ?? 0) > 0
        }
        if (!allowed) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
            errorCode: 'FORBIDDEN',
          }
        }
      }
      if (input.event.entityType === 'purchase_order') {
        const existing = await client.query<StoredEntity>(
          "SELECT version, payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1 FOR UPDATE",
          [input.event.entityId],
        )
        const previous = existing.rows[0]?.payload_json
        const next = input.event.payload
        const projectId = previous?.projectId ?? next.projectId
        const scope =
          typeof projectId === 'string'
            ? await client.query<{ country_id: string }>(
                `SELECT p.country_id::text AS country_id FROM user_project_bindings b
           JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
           JOIN user_project_scope_bindings scope ON scope.user_id = b.user_id AND scope.project_id = b.project_id AND scope.deleted_at IS NULL
           JOIN departments d ON d.id = scope.department_id AND d.is_active AND d.deleted_at IS NULL
           JOIN teams t ON t.id = scope.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
           WHERE b.user_id = $1 AND b.deleted_at IS NULL AND p.id::text = $2 FOR SHARE OF b, p, scope, d, t`,
                [input.actorId, projectId],
              )
            : null
        const countryId = scope?.rows[0]?.country_id
        let allowed =
          !!countryId &&
          (input.event.operation !== 'upsert' ||
            (next.projectId === projectId &&
              (next.countryId === undefined || next.countryId === countryId) &&
              (previous?.countryId === undefined ||
                previous.countryId === countryId)))
        if (allowed && typeof next.supplierId === 'string') {
          const supplier = await client.query(
            `SELECT 1 FROM sync_entities WHERE entity_type = 'supplier' AND entity_id::text = $1 AND (NOT is_deleted OR $3::boolean)
             AND COALESCE(payload_json->>'countryId', payload_json->>'country_id') = $2 FOR SHARE`,
            [
              next.supplierId,
              countryId,
              previous?.supplierId === next.supplierId,
            ],
          )
          allowed = supplier.rowCount === 1
        }
        if (allowed && Array.isArray(next.lines)) {
          for (const line of next.lines) {
            if (!line || typeof line !== 'object') {
              allowed = false
              break
            }
            const item = line as Record<string, unknown>
            const priceId = item.ownerCatalogPriceId ?? item.materialPriceId
            if (typeof priceId === 'string') {
              const retained =
                Array.isArray(previous?.lines) &&
                previous.lines.some((old) => {
                  if (!old || typeof old !== 'object') return false
                  const priorLine = old as Record<string, unknown>
                  return (
                    typeof item.id === 'string' &&
                    priorLine.id === item.id &&
                    (priorLine.ownerCatalogPriceId ??
                      priorLine.materialPriceId) === priceId
                  )
                })
              const price = await client.query(
                `SELECT 1 FROM sync_entities price JOIN sync_entities supplier
                 ON supplier.entity_type = 'supplier' AND supplier.entity_id::text = COALESCE(price.payload_json->>'supplierId', price.payload_json->>'supplier_id') AND (NOT supplier.is_deleted OR $4::boolean)
                 WHERE price.entity_type = 'material_price' AND price.entity_id::text = $1 AND (NOT price.is_deleted OR $4::boolean)
                   AND LOWER(COALESCE(supplier.payload_json->>'countryId', supplier.payload_json->>'country_id')) = $2
                   AND ($3::text IS NULL OR COALESCE(price.payload_json->>'materialId', price.payload_json->>'material_id') = $3)
                 FOR SHARE OF price, supplier`,
                [
                  priceId,
                  countryId,
                  typeof item.materialId === 'string' ? item.materialId : null,
                  retained,
                ],
              )
              if (price.rowCount !== 1) {
                allowed = false
                break
              }
            }
          }
        }
        if (!allowed) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
            errorCode: 'FORBIDDEN',
          }
        }
      }
      if (
        ['rfq', 'order_comment', 'receipt'].includes(input.event.entityType)
      ) {
        const existing = await client.query<StoredEntity>(
          'SELECT version, payload_json FROM sync_entities WHERE entity_type = $1 AND entity_id = $2 FOR UPDATE',
          [input.event.entityType, input.event.entityId],
        )
        const previous = existing.rows[0]?.payload_json
        const next = input.event.payload
        const field =
          input.event.entityType === 'rfq' ? 'sourceOrderId' : 'orderId'
        const orderId = previous?.[field] ?? next[field]
        const scope =
          typeof orderId === 'string'
            ? await client.query<{ project_id: string; country_id: string }>(
                `SELECT p.id::text AS project_id, p.country_id::text AS country_id FROM sync_entities o
           JOIN projects p ON p.id::text = o.payload_json->>'projectId' AND p.is_active AND p.deleted_at IS NULL
           JOIN user_project_bindings b ON b.project_id = p.id AND b.user_id = $2 AND b.deleted_at IS NULL
           JOIN user_project_scope_bindings scope ON scope.user_id = b.user_id AND scope.project_id = b.project_id AND scope.deleted_at IS NULL
           JOIN departments d ON d.id = scope.department_id AND d.is_active AND d.deleted_at IS NULL
           JOIN teams t ON t.id = scope.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
           WHERE o.entity_type = 'purchase_order' AND o.entity_id::text = $1 AND NOT o.is_deleted
             AND (o.payload_json->>'countryId' IS NULL OR o.payload_json->>'countryId' = p.country_id::text)
           FOR SHARE OF o, p, b, scope, d, t`,
                [orderId, input.actorId],
              )
            : null
        const project = scope?.rows[0]
        let allowed =
          !!project &&
          (input.event.operation !== 'upsert' ||
            (next[field] === orderId && next.projectId === project.project_id))
        if (allowed && input.event.entityType === 'rfq') {
          const supplierId = previous?.supplierId ?? next.supplierId
          const supplier = await client.query(
            `SELECT 1 FROM sync_entities WHERE entity_type = 'supplier' AND entity_id::text = $1 AND (NOT is_deleted OR $3::boolean)
             AND COALESCE(payload_json->>'countryId', payload_json->>'country_id') = $2 FOR SHARE`,
            [
              supplierId,
              project?.country_id,
              !!previous && previous.supplierId === supplierId,
            ],
          )
          allowed =
            supplier.rowCount === 1 &&
            (input.event.operation !== 'upsert' ||
              next.supplierId === supplierId)
        }
        if (!allowed) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
            errorCode: 'FORBIDDEN',
          }
        }
      }
      const prior = await client.query<StoredEvent>(
        `SELECT event_id, result_status, result_error_code, server_version, origin_account_id,
                origin_installation_id, origin_status
         FROM sync_events WHERE event_id = $1`,
        [input.event.eventId],
      )
      if (prior.rows[0]) {
        if (
          prior.rows[0].origin_status !== 'attested' ||
          prior.rows[0].origin_account_id !== input.actorId ||
          prior.rows[0].origin_installation_id !== input.installationId
        ) {
          await client.query('COMMIT')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
        const result = eventResult(prior.rows[0])
        if (result.status === 'conflict') {
          const conflict = await client.query<{
            server_payload_json: Record<string, unknown>
          }>(
            'SELECT server_payload_json FROM sync_conflicts WHERE event_id = $1',
            [input.event.eventId],
          )
          const entity = await client.query<Pick<StoredEntity, 'is_deleted'>>(
            `SELECT is_deleted FROM sync_entities
             WHERE entity_type = $1 AND entity_id = $2`,
            [input.event.entityType, input.event.entityId],
          )
          if (conflict.rows[0] && entity.rows[0]) {
            result.serverPayload = conflict.rows[0].server_payload_json
            result.serverOperation = entity.rows[0].is_deleted
              ? 'soft_delete'
              : 'upsert'
          }
        }
        await client.query('COMMIT')
        return result
      }

      const entity = await client.query<StoredEntity>(
        `SELECT version, payload_json, is_deleted
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

      if (
        input.event.entityType === 'material_category' &&
        ('__categoryRepair' in input.event.payload ||
          '__categoryQuarantine' in input.event.payload ||
          (current &&
            (current.payload_json.businessCode ??
              current.payload_json.business_code) !==
              (input.event.payload.businessCode ??
                input.event.payload.business_code)))
      ) {
        await client.query(
          `INSERT INTO sync_events
          (event_id, installation_id, actor_id, origin_account_id, origin_installation_id, origin_status, origin_attested_at, entity_type, entity_id, operation, base_version, result_status, result_error_code, server_version)
          VALUES ($1,$2,$3,$3,$2,'attested',NOW(),$4,$5,$6,$7,'validation_error','CATEGORY_REPAIR_REQUIRED',NULL)`,
          [
            input.event.eventId,
            input.installationId,
            input.actorId,
            input.event.entityType,
            input.event.entityId,
            input.event.operation,
            input.event.baseVersion,
          ],
        )
        await client.query('COMMIT')
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
          errorCode: 'CATEGORY_REPAIR_REQUIRED',
        }
      }

      if (
        input.event.entityType === 'rfq' &&
        (!validRfqTransition(current?.payload_json, input.event) ||
          !(await validRfqParent(client, input.event.payload)))
      ) {
        await client.query('COMMIT')
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: currentVersion,
        }
      }
      if (input.event.entityType === 'purchase_order') {
        if (
          !(await validCatalogQuotes(
            client,
            input.event,
            current?.payload_json,
          ))
        ) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
            errorCode: 'QUOTE_UNAVAILABLE',
          }
        }
        if (!(await validParentWithExistingRfqs(client, input.event))) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: currentVersion,
          }
        }
        if (
          input.event.operation === 'upsert' &&
          current &&
          (current.payload_json.applicantId !==
            input.event.payload.applicantId ||
            current.payload_json.parentOrderId !==
              input.event.payload.parentOrderId)
        ) {
          const result = {
            eventId: input.event.eventId,
            status: 'conflict' as const,
            serverVersion: currentVersion,
          }
          await this.recordConflict(client, input, current, result)
          await client.query('COMMIT')
          return result
        }
        if (
          input.event.operation === 'upsert' &&
          !current &&
          input.event.payload.parentOrderId == null &&
          typeof input.event.payload.applicantId === 'string' &&
          input.event.payload.applicantId !== input.actorId
        ) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
        if (current?.is_deleted && input.event.operation === 'upsert') {
          const result = {
            eventId: input.event.eventId,
            status: 'conflict' as const,
            serverVersion: currentVersion,
          }
          await this.recordConflict(client, input, current, result)
          await client.query('COMMIT')
          return result
        }
        if (
          input.event.operation === 'upsert' &&
          input.event.payload.procurementMode === 'owner_self_purchase' &&
          ['approved', 'confirmed'].includes(
            String(input.event.payload.workflowStatus),
          ) &&
          !validOrderApproval(current, input.event.payload, input.actorId)
        ) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
          }
        }
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
        if (
          input.event.payload.formallyIssuedAt != null &&
          current?.payload_json.formallyIssuedAt == null &&
          (await ownerQuoteDiscrepancy(client, input.event.payload))
        ) {
          await client.query(
            `INSERT INTO audit_entries (id, actor_id, entity_type, entity_id, action, reason)
             VALUES (gen_random_uuid(), $1, 'purchase_order', $2, 'issued_quote_verification_discrepancy', $3)`,
            [input.actorId, input.event.entityId, input.event.eventId],
          )
        }
      }

      const serverVersion = currentVersion + 1
      const deleted = input.event.operation === 'soft_delete'
      if (!deleted && input.event.entityType === 'supplier') {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `supplier-code:${input.event.payload.businessCode}`,
        ])
        const duplicate = await client.query(
          "SELECT 1 FROM sync_entities WHERE entity_type = 'supplier' AND entity_id <> $1 AND COALESCE(payload_json->>'businessCode',payload_json->>'business_code') = $2 LIMIT 1",
          [input.event.entityId, input.event.payload.businessCode],
        )
        if (duplicate.rowCount) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: null,
            errorCode: 'SUPPLIER_CODE_CONFLICT',
          }
        }
      }
      if (
        !deleted &&
        ['supplier', 'material_price'].includes(input.event.entityType) &&
        current &&
        (input.recoveryReason ||
          !catalogPayload(
            input.event.entityType,
            input.event.entityId,
            current.payload_json,
          ))
      ) {
        if (!input.recoveryReason) {
          await client.query('ROLLBACK')
          return {
            eventId: input.event.eventId,
            status: 'validation_error',
            serverVersion: currentVersion,
            errorCode: 'CATALOG_RECOVERY_REQUIRED',
          }
        }
        await quarantineCatalogPayload(
          client,
          `entity:${input.event.entityType}:${input.event.entityId}:${currentVersion}`,
          null,
          input.event.entityType,
          input.event.entityId,
          currentVersion,
          current.payload_json,
          input.actorId,
        )
      }
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
      const persistedPayload =
        deleted &&
        current &&
        [
          'supplier',
          'material_price',
          'purchase_order',
          'rfq',
          'order_comment',
          'receipt',
        ].includes(input.event.entityType)
          ? current.payload_json
          : (defaultsPayload ??
            ratePayload ??
            taxPayload ??
            unitPayload ??
            input.event.payload)
      await client.query('SAVEPOINT category_entity_write')
      try {
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
            persistedPayload,
            input.actorId,
          ],
        )
      } catch (error) {
        if (
          input.event.entityType !== 'material_category' ||
          typeof error !== 'object' ||
          error === null ||
          !('constraint' in error) ||
          error.constraint !== 'material_category_business_code_unique'
        )
          throw error
        await client.query('ROLLBACK TO SAVEPOINT category_entity_write')
        await client.query(
          `INSERT INTO sync_events
           (event_id, installation_id, actor_id, origin_account_id, origin_installation_id, origin_status, origin_attested_at, entity_type, entity_id, operation, base_version, result_status, result_error_code, server_version)
           VALUES ($1, $2, $3, $3, $2, 'attested', NOW(), $4, $5, $6, $7, 'validation_error', 'CATEGORY_CODE_CONFLICT', NULL)`,
          [
            input.event.eventId,
            input.installationId,
            input.actorId,
            input.event.entityType,
            input.event.entityId,
            input.event.operation,
            input.event.baseVersion,
          ],
        )
        await client.query('COMMIT')
        return {
          eventId: input.event.eventId,
          status: 'validation_error',
          serverVersion: null,
          errorCode: 'CATEGORY_CODE_CONFLICT',
        }
      }
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
        'LOCK TABLE server_change_log IN SHARE ROW EXCLUSIVE MODE',
      )
      if (input.recoveryReason) {
        await client.query(
          'UPDATE catalog_sync_quarantine SET resolved_event_id = $3, resolved_at = NOW() WHERE entity_type = $1 AND entity_id = $2 AND resolved_at IS NULL',
          [input.event.entityType, input.event.entityId, input.event.eventId],
        )
        await client.query(
          "INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason) VALUES(gen_random_uuid(),$1,$2,$3,'catalog_history_recovered',$4)",
          [
            input.actorId,
            input.event.entityType,
            input.event.entityId,
            input.recoveryReason,
          ],
        )
      }
      await client.query(
        `INSERT INTO server_change_log
           (entity_type, entity_id, operation, version, payload_json, actor_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.event.entityType,
          input.event.entityId,
          input.event.operation,
          serverVersion,
          persistedPayload,
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
        ? (current ?? { version: '0', payload_json: {}, is_deleted: false })
        : 'validation_error'
    if (formal === null)
      return prior
        ? (current ?? { version: '0', payload_json: {}, is_deleted: false })
        : null
    if (input.event.operation !== 'upsert')
      return prior
        ? (current ?? { version: '0', payload_json: {}, is_deleted: false })
        : 'validation_error'
    if (prior) {
      if (
        prior.document_type !== formal.documentType ||
        prior.formal_document_no !== formal.documentNo ||
        prior.formal_installation_id !== formal.installationId ||
        prior.formal_sequence !== formal.sequence ||
        !prior.matches_snapshot
      )
        return current ?? { version: '0', payload_json: {}, is_deleted: false }
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
        return current ?? { version: '0', payload_json: {}, is_deleted: false }
      return null
    }
    if (formal.documentType === 'HPA') {
      const issuer = await client.query(
        `SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id
         WHERE u.id = $1 AND u.is_enabled AND u.deleted_at IS NULL
           AND NOT u.requires_password_change AND r.role IN ('purchaser','administrator')
         LIMIT 1`,
        [input.actorId],
      )
      if (issuer.rowCount !== 1) return 'validation_error'
    }
    if (
      !current ||
      current.is_deleted ||
      current.payload_json.formalDocumentNo != null
    )
      return current ?? 'validation_error'
    const issuedStatus =
      formal.documentType === 'OPA' ? 'formally_issued' : 'executing'
    if (input.event.payload.workflowStatus !== issuedStatus)
      return 'validation_error'
    if (!isDeepStrictEqual(current.payload_json, formal.snapshot))
      return current
    if (
      !['approved', 'confirmed'].includes(
        String(current.payload_json.workflowStatus),
      ) ||
      current.payload_json.confirmedBy === current.payload_json.applicantId ||
      current.payload_json.selfApproved !== false ||
      !Number.isSafeInteger(current.payload_json.confirmedAt) ||
      Number(current.payload_json.confirmedAt) <= 0 ||
      !isDeepStrictEqual(input.event.payload, {
        ...formal.snapshot,
        workflowStatus: issuedStatus,
        documentType: formal.documentType,
        formalDocumentNo: formal.documentNo,
        formalInstallationId: formal.installationId,
        formalSequence: formal.sequence,
        formallyIssuedAt: input.event.payload.formallyIssuedAt,
        formalSnapshotJson: input.event.payload.formalSnapshotJson,
      })
    )
      return 'validation_error'
    if (
      !(await hasApprovalProvenance(
        client,
        input.event.entityId,
        current.payload_json,
      ))
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
        `${code.country_code}-${code.project_code}-${formal.orderDate.replaceAll('-', '')}-${formal.documentType}-${formalShortCode(formal.installationId)}-${formal.sequence}`
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
      `SELECT e.version, e.payload_json, e.is_deleted FROM formal_issue_registry r
       JOIN sync_entities e ON e.entity_type = 'purchase_order' AND e.entity_id = r.order_id
       WHERE r.formal_document_no = $1 OR
         (r.formal_installation_id = $2 AND r.formal_sequence = $3)
       LIMIT 1`,
      [formal.documentNo, formal.installationId, formal.sequence],
    )
    return (
      winner.rows[0] ?? { version: '0', payload_json: {}, is_deleted: false }
    )
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
        `SELECT 1 FROM user_project_bindings WHERE project_id::text = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT 1 FROM sync_entities WHERE entity_type = 'purchase_order'
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
    actor: SyncActor
    cursor: string
    limit: number
    replayUntil?: string
    authorizationVersion?: string
  }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      const scopes = await client.query(
        `SELECT s.project_id, s.department_id, s.team_id, s.xmin::text AS scope_revision,
              b.xmin::text AS binding_revision, p.country_id, p.xmin::text AS project_revision,
              d.xmin::text AS department_revision, t.xmin::text AS team_revision
       FROM user_project_scope_bindings s
       JOIN user_project_bindings b ON b.user_id = s.user_id AND b.project_id = s.project_id AND b.deleted_at IS NULL
       JOIN projects p ON p.id = s.project_id AND p.is_active AND p.deleted_at IS NULL
       JOIN departments d ON d.id = s.department_id AND d.is_active AND d.deleted_at IS NULL
       JOIN teams t ON t.id = s.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
       WHERE s.user_id = $1 AND s.deleted_at IS NULL ORDER BY s.project_id, s.department_id, s.team_id`,
        [input.actor.id],
      )
      // Row revisions also detect revoke/regrant between two client refreshes.
      const watermark = await client.query<{
        cursor: string
        recovery_revision: string
      }>(
        "SELECT COALESCE(MAX(sequence), 0)::text AS cursor, (SELECT count(*)::text FROM audit_entries WHERE action = 'catalog_history_recovered') AS recovery_revision FROM server_change_log",
      )
      // A scoped repair can make a formerly unroutable historical quote visible.
      const authorizationVersion = createHash('sha256')
        .update(
          JSON.stringify({
            scopes: scopes.rows,
            recoveryRevision: watermark.rows[0]!.recovery_revision,
          }),
        )
        .digest('hex')
      const replayUntil = watermark.rows[0]!.cursor
      if (
        input.authorizationVersion &&
        input.authorizationVersion !== authorizationVersion
      ) {
        await client.query('COMMIT')
        return {
          changes: [],
          nextCursor: input.cursor,
          authorizationVersion,
          replayUntil,
        }
      }
      const result = await client.query<{
        sequence: string
        entity_type: SyncChange['entityType']
        entity_id: string
        operation: SyncChange['operation']
        version: string
        payload_json: Record<string, unknown>
        changed_at: Date
        repair_request_id: string | null
        old_business_code: string | null
        new_business_code: string | null
        quarantine_status: string | null
      }>(
        `SELECT c.sequence, c.entity_type, c.entity_id, c.operation, c.version, c.payload_json, c.changed_at,
              repair.request_id AS repair_request_id, repair.old_business_code, repair.new_business_code,
              q.status AS quarantine_status
       FROM server_change_log c
       LEFT JOIN category_code_repairs repair ON c.entity_type = 'material_category' AND repair.category_id = c.entity_id AND repair.result_version = c.version
       LEFT JOIN category_code_quarantine q ON c.entity_type = 'material_category' AND q.entity_id = c.entity_id
       WHERE c.sequence > $1 AND c.sequence <= $5
         AND (
           c.entity_type = ANY($2::text[])
           OR (
             c.entity_type = 'supplier'
             AND EXISTS (
               SELECT 1 FROM user_project_bindings b
               JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
               JOIN user_project_scope_bindings scope ON scope.user_id = b.user_id AND scope.project_id = b.project_id AND scope.deleted_at IS NULL
               JOIN departments d ON d.id = scope.department_id AND d.is_active AND d.deleted_at IS NULL
               JOIN teams t ON t.id = scope.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
               JOIN sync_entities supplier ON supplier.entity_type = 'supplier' AND supplier.entity_id = c.entity_id
               WHERE b.user_id = $3 AND b.deleted_at IS NULL
                 AND p.country_id::text = LOWER(COALESCE(c.payload_json->>'countryId', c.payload_json->>'country_id'))
                 AND p.country_id::text = LOWER(COALESCE(supplier.payload_json->>'countryId', supplier.payload_json->>'country_id'))
             )
           )
           OR (
             c.entity_type = 'material_price'
             AND EXISTS (
               SELECT 1 FROM sync_entities supplier
               JOIN user_project_bindings b ON b.user_id = $3 AND b.deleted_at IS NULL
               JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
               JOIN user_project_scope_bindings scope ON scope.user_id = b.user_id AND scope.project_id = b.project_id AND scope.deleted_at IS NULL
               JOIN departments d ON d.id = scope.department_id AND d.is_active AND d.deleted_at IS NULL
               JOIN teams t ON t.id = scope.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
               WHERE supplier.entity_type = 'supplier'
                 AND supplier.entity_id::text = LOWER(COALESCE(c.payload_json->>'supplierId', c.payload_json->>'supplier_id'))
                 AND p.country_id::text = LOWER(COALESCE(supplier.payload_json->>'countryId', supplier.payload_json->>'country_id'))
             )
           )
           OR (c.entity_type NOT IN ('supplier', 'material_price') AND EXISTS (
             SELECT 1 FROM user_project_bindings b
             JOIN projects p ON p.id = b.project_id AND p.is_active AND p.deleted_at IS NULL
             JOIN user_project_scope_bindings scope ON scope.user_id = b.user_id AND scope.project_id = b.project_id AND scope.deleted_at IS NULL
             JOIN departments d ON d.id = scope.department_id AND d.is_active AND d.deleted_at IS NULL
             JOIN teams t ON t.id = scope.team_id AND t.department_id = d.id AND t.is_active AND t.deleted_at IS NULL
             WHERE b.user_id = $3
               AND b.deleted_at IS NULL
               AND b.project_id::text = c.payload_json->>'projectId'
               AND (c.entity_type <> 'purchase_order' OR c.payload_json->>'countryId' IS NULL OR c.payload_json->>'countryId' = p.country_id::text)
           ))
         )
       ORDER BY c.sequence
       LIMIT $4`,
        [
          input.cursor,
          globallyVisibleEntityTypes,
          input.actor.id,
          input.limit,
          input.replayUntil ?? replayUntil,
        ],
      )
      const changes: SyncChange[] = []
      for (const row of result.rows) {
        let payload = { ...row.payload_json }
        delete payload.__catalogQuarantine
        if (
          row.operation === 'upsert' &&
          catalogTypes.includes(row.entity_type)
        ) {
          const canonical = catalogPayload(
            row.entity_type,
            row.entity_id,
            payload,
          )
          if (canonical) payload = canonical
          else {
            await quarantineCatalogPayload(
              client,
              `change:${row.sequence}`,
              row.sequence,
              row.entity_type,
              row.entity_id,
              Number(row.version),
              row.payload_json,
              input.actor.id,
            )
            payload.__catalogQuarantine = 'INVALID_CATALOG_PAYLOAD'
          }
        }
        if (row.entity_type === 'material_category') {
          delete payload.__categoryRepair
          delete payload.__categoryQuarantine
          if (row.repair_request_id)
            payload.__categoryRepair = {
              requestId: row.repair_request_id,
              oldBusinessCode: row.old_business_code,
              newBusinessCode: row.new_business_code,
            }
          if (row.quarantine_status === 'unresolved')
            payload.__categoryQuarantine = true
        }
        changes.push({
          cursor: row.sequence,
          entityType: row.entity_type,
          entityId: row.entity_id,
          operation: row.operation,
          version: Number(row.version),
          payload,
          changedAt: row.changed_at.toISOString(),
        })
      }
      await client.query('COMMIT')
      return {
        changes,
        nextCursor: changes.at(-1)?.cursor ?? input.cursor,
        authorizationVersion,
        replayUntil,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
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
       UNION ALL
       SELECT 1 FROM user_project_bindings WHERE project_id::text = $1 AND deleted_at IS NULL
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
    result.serverPayload = current?.payload_json ?? {}
    result.serverOperation = current?.is_deleted ? 'soft_delete' : 'upsert'
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

async function validRfqParent(
  client: PoolClient,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (typeof payload.sourceOrderId !== 'string') return false
  const parent = await client.query<{ payload_json: Record<string, unknown> }>(
    `SELECT payload_json FROM sync_entities
     WHERE entity_type = 'purchase_order' AND entity_id = $1 AND is_deleted = FALSE
     FOR UPDATE`,
    [payload.sourceOrderId],
  )
  const order = parent.rows[0]?.payload_json
  return (
    !!order &&
    order.parentOrderId == null &&
    order.projectId === payload.projectId &&
    (order.procurementMode == null ||
      order.procurementMode === 'honsen_self_purchase') &&
    [
      'confirmed',
      'approved',
      'executing',
      'receiving',
      'completed',
      'completed_with_conditions',
    ].includes(String(order.workflowStatus))
  )
}

async function validParentWithExistingRfqs(
  client: PoolClient,
  event: SyncEvent,
): Promise<boolean> {
  // The parent row lock in pushEvent serializes this with RFQ parent validation.
  const rfq = await client.query<{ project_id: string }>(
    `SELECT payload_json->>'projectId' AS project_id FROM sync_entities
     WHERE entity_type = 'rfq' AND is_deleted = FALSE
       AND payload_json->>'sourceOrderId' = $1 LIMIT 1`,
    [event.entityId],
  )
  if (!rfq.rows[0]) return true
  const parent = event.payload
  return (
    event.operation === 'upsert' &&
    parent.parentOrderId == null &&
    parent.projectId === rfq.rows[0].project_id &&
    (parent.procurementMode == null ||
      parent.procurementMode === 'honsen_self_purchase') &&
    [
      'confirmed',
      'approved',
      'executing',
      'receiving',
      'completed',
      'completed_with_conditions',
      'cancelled',
    ].includes(String(parent.workflowStatus))
  )
}

function validFormalTransition(before: unknown, after: unknown): boolean {
  if (before === 'formally_issued' || before === 'executing')
    return after === 'receiving'
  if (before === 'receiving')
    return [
      'receiving',
      'completed',
      'completed_with_conditions',
      'cancelled',
    ].includes(String(after))
  return false
}

function validOrderApproval(
  current: StoredEntity | undefined,
  next: Record<string, unknown>,
  actorId: string,
): boolean {
  if (
    current &&
    !current.is_deleted &&
    ['approved', 'confirmed'].includes(
      String(current.payload_json.workflowStatus),
    ) &&
    next.workflowStatus === current.payload_json.workflowStatus
  )
    return (
      next.confirmedBy === current.payload_json.confirmedBy &&
      next.confirmedAt === current.payload_json.confirmedAt &&
      next.selfApproved === false &&
      current.payload_json.selfApproved === false
    )
  if (
    !current ||
    current.is_deleted ||
    current.payload_json.workflowStatus !== 'pending_confirmation' ||
    current.payload_json.confirmedBy != null ||
    current.payload_json.confirmedAt != null ||
    current.payload_json.selfApproved === true ||
    current.payload_json.applicantId === actorId ||
    next.confirmedBy !== actorId ||
    next.selfApproved !== false ||
    !Number.isSafeInteger(next.confirmedAt) ||
    Number(next.confirmedAt) <= 0
  )
    return false
  return isDeepStrictEqual(next, {
    ...current.payload_json,
    workflowStatus: next.workflowStatus,
    confirmedBy: actorId,
    confirmedAt: next.confirmedAt,
    selfApproved: false,
  })
}

async function hasApprovalProvenance(
  client: PoolClient,
  orderId: string,
  current: Record<string, unknown>,
): Promise<boolean> {
  const approvals = await client.query<{
    version: string
    actor_id: string
    payload_json: Record<string, unknown>
  }>(
    `SELECT version, actor_id::text AS actor_id, payload_json
     FROM server_change_log
     WHERE entity_type = 'purchase_order' AND entity_id = $1 AND operation = 'upsert'
       AND payload_json->>'workflowStatus' IN ('approved', 'confirmed')
     ORDER BY version ASC LIMIT 1`,
    [orderId],
  )
  const approval = approvals.rows[0]
  if (
    !approval ||
    approval.actor_id !== current.confirmedBy ||
    approval.actor_id === current.applicantId ||
    approval.payload_json.applicantId !== current.applicantId ||
    approval.payload_json.confirmedAt !== current.confirmedAt ||
    approval.payload_json.selfApproved !== false
  )
    return false
  const before = await client.query<{ payload_json: Record<string, unknown> }>(
    `SELECT payload_json FROM server_change_log
     WHERE entity_type = 'purchase_order' AND entity_id = $1 AND operation = 'upsert'
       AND version = $2 LIMIT 1`,
    [orderId, (BigInt(approval.version) - 1n).toString()],
  )
  const pending = before.rows[0]?.payload_json
  return (
    !!pending &&
    pending.workflowStatus === 'pending_confirmation' &&
    pending.confirmedBy == null &&
    pending.confirmedAt == null &&
    pending.selfApproved !== true &&
    isDeepStrictEqual(approval.payload_json, {
      ...pending,
      workflowStatus: approval.payload_json.workflowStatus,
      confirmedBy: approval.actor_id,
      confirmedAt: approval.payload_json.confirmedAt,
      selfApproved: false,
    })
  )
}

async function quarantineCatalogPayload(
  client: PoolClient,
  sourceKey: string,
  sequence: string | null,
  entityType: string,
  entityId: string,
  version: number,
  payload: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  await client.query(
    `WITH recorded AS (
       INSERT INTO catalog_sync_quarantine(source_key,change_sequence,entity_type,entity_id,server_version,original_payload,reason)
       VALUES($1,$2,$3,$4,$5,$6,'MANUAL_REVIEW_REQUIRED') ON CONFLICT(source_key) DO NOTHING RETURNING entity_id
     ) INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason)
       SELECT gen_random_uuid(),$7,$3,entity_id,'catalog_payload_quarantined',$1 FROM recorded`,
    [
      sourceKey,
      sequence,
      entityType,
      entityId,
      version,
      JSON.stringify(payload),
      actorId,
    ],
  )
}

function validRfqTransition(
  previous: Record<string, unknown> | undefined,
  event: SyncEvent,
): boolean {
  if (event.operation !== 'upsert') return false
  if (!previous) return event.payload.status === 'draft'
  if (!(
    (previous.status === 'draft' && event.payload.status === 'sent') ||
    (previous.status === 'sent' && event.payload.status === 'closed')
  ))
    return false
  const { status: _oldStatus, ...oldSnapshot } = previous
  const { status: _newStatus, ...newSnapshot } = event.payload
  return isDeepStrictEqual(oldSnapshot, newSnapshot)
}

function eventResult(row: StoredEvent): SyncEventResult {
  return {
    eventId: row.event_id,
    status: row.result_status,
    ...(row.result_error_code ? { errorCode: row.result_error_code } : {}),
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

function validCatalogQuoteRow(row: {
  price_id: string
  supplier_id: string
  material_id: string
  price_payload: Record<string, unknown>
  supplier_payload: Record<string, unknown>
  material_payload: Record<string, unknown>
}): boolean {
  const price = catalogPayload(
    'material_price',
    row.price_id,
    row.price_payload,
  )
  const supplier = catalogPayload(
    'supplier',
    row.supplier_id,
    row.supplier_payload,
  )
  const material = catalogPayload(
    'material',
    row.material_id,
    row.material_payload,
  )
  return !!(
    price &&
    supplier &&
    material &&
    (price.countryId == null || price.countryId === supplier.countryId)
  )
}

async function ownerQuoteDiscrepancy(
  client: PoolClient,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (
    payload.procurementMode !== 'owner_self_purchase' ||
    !Array.isArray(payload.lines)
  )
    return false
  for (const item of payload.lines) {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      item.ownerQuoteSource !== 'catalog_price'
    )
      continue
    let supplier: unknown
    try {
      supplier = JSON.parse(item.supplierSnapshotJson)
    } catch {
      return true
    }
    if (!supplier || typeof supplier !== 'object' || Array.isArray(supplier))
      return true
    const supplierId = (supplier as Record<string, unknown>).id
    const result = await client.query(
      `SELECT p.entity_id::text AS price_id,p.payload_json AS price_payload,s.entity_id::text AS supplier_id,s.payload_json AS supplier_payload,m.entity_id::text AS material_id,m.payload_json AS material_payload FROM sync_entities p
       JOIN sync_entities s ON s.entity_type = 'supplier' AND s.entity_id::text = LOWER(COALESCE(p.payload_json->>'supplierId',p.payload_json->>'supplier_id')) AND NOT s.is_deleted
       JOIN sync_entities m ON m.entity_type = 'material' AND m.entity_id::text = LOWER(COALESCE(p.payload_json->>'materialId',p.payload_json->>'material_id')) AND NOT m.is_deleted
       WHERE p.entity_type = 'material_price' AND p.entity_id::text = $1 AND NOT p.is_deleted
         AND LOWER(COALESCE(p.payload_json->>'materialId',p.payload_json->>'material_id')) = $2 AND LOWER(COALESCE(p.payload_json->>'supplierId',p.payload_json->>'supplier_id')) = $3
         AND p.payload_json->>'currency' = $4 AND p.payload_json->>'unit' = $5 AND COALESCE(p.payload_json->>'unitPriceMinor',p.payload_json->>'unit_price_minor') = $6
         AND LOWER(COALESCE(s.payload_json->>'countryId',s.payload_json->>'country_id')) = $7 AND COALESCE(s.payload_json->>'isActive',s.payload_json->>'is_active') = 'true' AND COALESCE(s.payload_json->>'isBlacklisted',s.payload_json->>'is_blacklisted') = 'false'
         AND COALESCE(m.payload_json->>'isActive',m.payload_json->>'is_active') = 'true'
         AND p.entity_id::text = (SELECT c.entity_id::text FROM server_change_log c WHERE c.entity_type = 'material_price'
           AND LOWER(COALESCE(c.payload_json->>'materialId',c.payload_json->>'material_id')) = $2 AND LOWER(COALESCE(c.payload_json->>'supplierId',c.payload_json->>'supplier_id')) = $3 AND c.payload_json->>'currency' = $4
           ORDER BY c.sequence DESC LIMIT 1)`,
      [
        item.ownerCatalogPriceId,
        item.materialId,
        supplierId,
        item.currency,
        item.unit,
        item.ownerSourceUnitPriceMinor,
        payload.countryId,
      ],
    )
    if (result.rowCount !== 1 || !validCatalogQuoteRow(result.rows[0]))
      return true
  }
  return false
}

// The shared advisory lock serializes quote/supplier writes with this verification.
async function validCatalogQuotes(
  client: PoolClient,
  event: SyncEvent,
  previous?: Record<string, unknown>,
): Promise<boolean> {
  if (event.operation !== 'upsert' || event.payload.formallyIssuedAt != null)
    return true
  if (
    previous &&
    [
      'approved',
      'confirmed',
      'executing',
      'receiving',
      'completed',
      'completed_with_conditions',
    ].includes(String(previous.workflowStatus)) &&
    previous.countryId === event.payload.countryId &&
    previous.projectId === event.payload.projectId &&
    previous.departmentId === event.payload.departmentId &&
    previous.teamId === event.payload.teamId &&
    isDeepStrictEqual(previous.lines, event.payload.lines)
  )
    return true
  const currentLines = Array.isArray(previous?.lines) ? previous.lines : []
  const previousCatalog = currentLines.some(
    (line: unknown) =>
      line &&
      typeof line === 'object' &&
      !Array.isArray(line) &&
      (line as Record<string, unknown>).catalogPriceId != null,
  )
  if (event.payload.procurementMode === 'owner_self_purchase')
    return (
      !previousCatalog &&
      (!Array.isArray(event.payload.lines) ||
        event.payload.lines.every(
          (line: unknown) =>
            !line ||
            typeof line !== 'object' ||
            Array.isArray(line) ||
            (line as Record<string, unknown>).catalogPriceId == null,
        ))
    )
  const lines = event.payload.lines
  if (!Array.isArray(lines))
    return (
      !previousCatalog &&
      event.payload.workflowStatus !== 'pending_confirmation'
    )
  for (const value of lines) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false
    const line = value as Record<string, unknown>
    const old = currentLines.find(
      (item: unknown) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>).id === line.id,
    ) as Record<string, unknown> | undefined
    if (
      event.payload.workflowStatus === 'pending_confirmation' &&
      old?.catalogPriceId &&
      line.catalogPriceId !== old.catalogPriceId
    )
      return false
    if (
      line.priceSource != null &&
      line.priceSource !== 'catalog' &&
      line.priceSource !== 'manual'
    )
      return false
    if ((line.priceSource === 'catalog') !== (line.catalogPriceId != null))
      return false
    if (line.catalogPriceId == null && line.priceSource == null) {
      if (
        line.materialId != null &&
        line.supplierSnapshotJson != null &&
        (!old ||
          old.catalogPriceId != null ||
          old.priceSource != null ||
          old.materialId !== line.materialId ||
          old.supplierSnapshotJson !== line.supplierSnapshotJson ||
          old.currency !== line.currency ||
          old.unit !== line.unit ||
          old.unitPriceMinor !== line.unitPriceMinor)
      )
        return false
      continue
    }
    if (line.supplierSnapshotJson == null && line.priceSource === 'manual')
      continue
    if (
      typeof line.supplierSnapshotJson !== 'string' ||
      (line.priceSource === 'catalog' && typeof line.materialId !== 'string')
    )
      return false
    let supplier: unknown
    try {
      supplier = JSON.parse(line.supplierSnapshotJson)
    } catch {
      return false
    }
    if (!supplier || typeof supplier !== 'object' || Array.isArray(supplier))
      return false
    const supplierId = (supplier as Record<string, unknown>).id
    if (
      typeof supplierId !== 'string' ||
      typeof event.payload.countryId !== 'string'
    )
      return false
    const scope = await client.query(
      `SELECT 1 FROM projects p
      JOIN user_project_bindings b ON b.project_id = p.id AND b.user_id::text = $1 AND b.deleted_at IS NULL
      JOIN user_project_scope_bindings a ON a.project_id = p.id AND a.user_id = b.user_id AND a.deleted_at IS NULL
        AND a.department_id::text = $3 AND a.team_id::text = $4
      WHERE p.id::text = $2 AND p.country_id::text = $5 AND p.is_active AND p.deleted_at IS NULL
      FOR SHARE OF p, b, a`,
      [
        event.payload.applicantId,
        event.payload.projectId,
        event.payload.departmentId,
        event.payload.teamId,
        event.payload.countryId,
      ],
    )
    if (scope.rowCount !== 1) return false
    if (line.priceSource === 'manual') {
      const allowedSupplier = await client.query(
        `SELECT payload_json FROM sync_entities WHERE entity_type = 'supplier' AND entity_id::text = $1 AND NOT is_deleted
         AND LOWER(COALESCE(payload_json->>'countryId',payload_json->>'country_id')) = $2 AND COALESCE(payload_json->>'isActive',payload_json->>'is_active') = 'true' AND COALESCE(payload_json->>'isBlacklisted',payload_json->>'is_blacklisted') = 'false'`,
        [supplierId, event.payload.countryId],
      )
      if (
        allowedSupplier.rowCount !== 1 ||
        !catalogPayload(
          'supplier',
          supplierId,
          allowedSupplier.rows[0]!.payload_json,
        )
      )
        return false
      continue
    }
    const result = await client.query(
      `SELECT p.entity_id::text AS price_id,p.payload_json AS price_payload,s.entity_id::text AS supplier_id,s.payload_json AS supplier_payload,m.entity_id::text AS material_id,m.payload_json AS material_payload FROM sync_entities p
      JOIN sync_entities s ON s.entity_type = 'supplier' AND s.entity_id::text = LOWER(COALESCE(p.payload_json->>'supplierId',p.payload_json->>'supplier_id')) AND NOT s.is_deleted
      JOIN sync_entities m ON m.entity_type = 'material' AND m.entity_id::text = LOWER(COALESCE(p.payload_json->>'materialId',p.payload_json->>'material_id')) AND NOT m.is_deleted
      WHERE p.entity_type = 'material_price' AND p.entity_id::text = $1 AND NOT p.is_deleted
        AND LOWER(COALESCE(p.payload_json->>'materialId',p.payload_json->>'material_id')) = $2 AND LOWER(COALESCE(p.payload_json->>'supplierId',p.payload_json->>'supplier_id')) = $3
        AND p.payload_json->>'currency' = $4 AND p.payload_json->>'unit' = $5
        AND COALESCE(p.payload_json->>'unitPriceMinor',p.payload_json->>'unit_price_minor') = $6 AND LOWER(COALESCE(s.payload_json->>'countryId',s.payload_json->>'country_id')) = $7
        AND COALESCE(s.payload_json->>'isActive',s.payload_json->>'is_active') = 'true'
        AND COALESCE(s.payload_json->>'isBlacklisted',s.payload_json->>'is_blacklisted') = 'false'
        AND COALESCE(m.payload_json->>'isActive',m.payload_json->>'is_active') = 'true'
        AND p.entity_id::text = (SELECT c.entity_id::text FROM server_change_log c
          WHERE c.entity_type = 'material_price' AND LOWER(COALESCE(c.payload_json->>'materialId',c.payload_json->>'material_id')) = $2
            AND LOWER(COALESCE(c.payload_json->>'supplierId',c.payload_json->>'supplier_id')) = $3 AND c.payload_json->>'currency' = $4
          ORDER BY c.sequence DESC LIMIT 1)`,
      [
        line.catalogPriceId,
        line.materialId,
        supplierId,
        line.currency,
        line.unit,
        line.unitPriceMinor,
        event.payload.countryId,
      ],
    )
    if (result.rowCount !== 1 || !validCatalogQuoteRow(result.rows[0]))
      return false
  }
  return true
}
