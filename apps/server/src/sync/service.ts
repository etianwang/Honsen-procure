import {
  exchangeRateSchema,
  categoryRepairRequestSchema,
  materialCategorySchema,
  supplierSchema,
  materialPriceSchema,
  projectDefaultsSchema,
  referenceMasterDataSchema,
  uuidSchema,
  syncPullQuerySchema,
  syncPushRequestSchema,
  taxTemplateSchema,
  type SyncEvent,
  type SyncEventResult,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@honsen/shared'
import type { Role } from '@honsen/shared'
import { z } from 'zod'
import type { SyncActor, SyncStore } from './types.js'

const procurementRoles: Role[] = ['purchaser', 'administrator']
const masterDataRoles: Role[] = [
  'super_administrator',
  'administrator',
  'purchaser',
]
const referenceMasterDataTypes = [
  'country',
  'project',
  'site',
  'department',
  'team',
  'unit',
] as const
const rfqPayloadSchema = z.strictObject({
  id: uuidSchema,
  sourceOrderId: uuidSchema,
  supplierId: uuidSchema,
  supplierSnapshot: z.strictObject({
    id: uuidSchema,
    name: z.string().trim().min(1),
  }),
  projectId: uuidSchema,
  displayNo: z.string().trim().min(1),
  currency: z.enum(['XOF', 'CNY', 'USD', 'EUR']),
  status: z.enum(['draft', 'sent', 'closed']),
  items: z
    .array(
      z.strictObject({
        sourceItemId: uuidSchema,
        materialSnapshot: z.strictObject({
          nameZh: z.string().trim().min(1),
          nameFr: z.string().nullable(),
          model: z.string(),
          specification: z.string(),
        }),
        quantity: z.string().regex(/^(?!0+(?:\.0{1,2})?$)\d+(?:\.\d{1,2})?$/),
        unit: z.string().trim().min(1),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1),
})

export class SyncService {
  constructor(private readonly store: SyncStore) {}

  async listCategoryQuarantine(actor: SyncActor) {
    if (
      !actor.roles.some(
        (role) => role === 'administrator' || role === 'super_administrator',
      )
    )
      throw new CategoryRepairError('FORBIDDEN')
    if (!this.store.listCategoryQuarantine)
      throw new CategoryRepairError('UNAVAILABLE')
    return this.store.listCategoryQuarantine()
  }

  async repairCategory(actor: SyncActor, input: unknown) {
    if (
      !actor.roles.some(
        (role) => role === 'administrator' || role === 'super_administrator',
      )
    )
      throw new CategoryRepairError('FORBIDDEN')
    const request = categoryRepairRequestSchema.parse(input)
    if (!this.store.repairCategory) throw new CategoryRepairError('UNAVAILABLE')
    return this.store.repairCategory({ actor, request })
  }

  async push(actor: SyncActor, input: unknown): Promise<SyncPushResponse> {
    const request = syncPushRequestSchema.parse(input)
    const results: SyncEventResult[] = []
    const blockedQuotes = new Set<string>()
    for (const event of request.events) {
      if (
        event.operation === 'upsert' &&
        (event.entityType === 'supplier' ||
          event.entityType === 'material_price')
      ) {
        const schema =
          event.entityType === 'supplier' ? supplierSchema : materialPriceSchema
        const parsed = schema.safeParse(event.payload)
        if (!parsed.success || parsed.data.id !== event.entityId) {
          results.push({
            eventId: event.eventId,
            status: 'validation_error',
            serverVersion: null,
            errorCode: 'INVALID_CATALOG_PAYLOAD',
          })
          continue
        }
      }
      const key = `${event.entityType}:${event.entityId}`
      if (blockedQuotes.has(key)) {
        results.push({
          eventId: event.eventId,
          status: 'validation_error',
          serverVersion: null,
          errorCode: 'QUOTE_PREDECESSOR_REJECTED',
        })
        continue
      }
      if (!(await this.canWrite(actor, event))) {
        results.push({
          eventId: event.eventId,
          status: 'validation_error',
          serverVersion: null,
          errorCode: 'FORBIDDEN',
        })
        continue
      }
      const result = normalizeResult(
        await this.store.pushEvent({
          event,
          installationId: actor.installationId,
          actorId: actor.id,
        }),
      )
      results.push(result)
      if (result.errorCode === 'QUOTE_UNAVAILABLE') blockedQuotes.add(key)
    }
    return { results }
  }

  async pull(actor: SyncActor, input: unknown): Promise<SyncPullResponse> {
    const query = syncPullQuerySchema.parse(input)
    return this.store.pullChanges({
      actor,
      cursor: query.cursor ?? '0',
      limit: query.limit,
      replayUntil: query.replayUntil,
      authorizationVersion: query.authorizationVersion,
    })
  }

  private async canWrite(actor: SyncActor, event: SyncEvent): Promise<boolean> {
    if (event.entityType === 'rfq') {
      if (
        event.operation !== 'upsert' ||
        !actor.roles.some((role) => procurementRoles.includes(role))
      )
        return false
      const parsed = rfqPayloadSchema.safeParse(event.payload)
      if (
        !parsed.success ||
        parsed.data.id !== event.entityId ||
        parsed.data.supplierSnapshot.id !== parsed.data.supplierId
      )
        return false
      const order = await this.store.getEntityPayload(
        'purchase_order',
        parsed.data.sourceOrderId,
      )
      const mode = order ? stringField(order, 'procurementMode') : null
      return (
        order !== null &&
        stringField(order, 'parentOrderId') === null &&
        stringField(order, 'projectId') === parsed.data.projectId &&
        (mode === null || mode === 'honsen_self_purchase') &&
        [
          'confirmed',
          'approved',
          'executing',
          'receiving',
          'completed',
          'completed_with_conditions',
        ].includes(stringField(order, 'workflowStatus') ?? '')
      )
    }
    if (event.entityType === 'order_comment' && event.operation !== 'upsert')
      return false
    if (event.entityType === 'material_category') {
      const payload = referencePayload(event.payload)
      return (
        event.operation === 'upsert' &&
        actor.roles.some(
          (role) => role === 'administrator' || role === 'super_administrator',
        ) &&
        payload.id === event.entityId &&
        materialCategorySchema.safeParse(payload).success
      )
    }
    if (
      referenceMasterDataTypes.includes(
        event.entityType as (typeof referenceMasterDataTypes)[number],
      )
    ) {
      if (
        event.entityType === 'project' &&
        !(await this.canChangeProjectCountry(event))
      ) {
        return false
      }
      return (
        event.operation === 'upsert' &&
        actor.roles.some((role) => masterDataRoles.includes(role)) &&
        referenceMasterDataSchema.safeParse({
          ...referencePayload(event.payload),
          kind: event.entityType,
          id: event.entityId,
        }).success
      )
    }
    if (
      event.entityType === 'tax_template' ||
      event.entityType === 'exchange_rate'
    ) {
      const schema =
        event.entityType === 'tax_template'
          ? taxTemplateSchema
          : exchangeRateSchema
      return (
        event.operation === 'upsert' &&
        actor.roles.some((role) => masterDataRoles.includes(role)) &&
        schema.safeParse({
          ...referencePayload(event.payload),
          id: event.entityId,
        }).success
      )
    }
    if (event.entityType === 'project_defaults') {
      const payload = referencePayload(event.payload)
      if (!(
        event.operation === 'upsert' &&
        actor.roles.some((role) => masterDataRoles.includes(role)) &&
        payload.projectId === event.entityId &&
        projectDefaultsSchema.safeParse(payload).success
      ))
        return false
      return (
        payload.defaultTaxTemplateId === null ||
        (typeof payload.defaultTaxTemplateId === 'string' &&
          (await this.store.isCompatibleProjectTax(
            event.entityId,
            payload.defaultTaxTemplateId,
          )))
      )
    }
    if (actor.roles.some((role) => procurementRoles.includes(role))) return true
    if (!actor.roles.includes('engineer')) return false
    if (
      !['purchase_order', 'order_comment', 'receipt'].includes(event.entityType)
    )
      return false

    const projectId = stringField(event.payload, 'projectId')
    const departmentId = stringField(event.payload, 'departmentId')
    const teamId = stringField(event.payload, 'teamId')
    if (
      !projectId ||
      (event.entityType === 'purchase_order' && (!departmentId || !teamId)) ||
      !(await this.store.hasActiveProjectBinding(
        actor.id,
        projectId,
        departmentId ?? undefined,
        teamId ?? undefined,
      ))
    ) {
      return false
    }
    if (event.entityType === 'purchase_order') {
      return (
        stringField(event.payload, 'applicantId') === actor.id &&
        ![
          'approved',
          'confirmed',
          'formally_issued',
          'receiving',
          'completed',
          'completed_with_conditions',
          'cancelled',
        ].includes(String(event.payload.workflowStatus)) &&
        event.payload.formalDocumentNo == null &&
        event.payload.formalInstallationId == null &&
        event.payload.formalSequence == null &&
        event.payload.formalSnapshotJson == null &&
        event.payload.documentType == null &&
        event.payload.formallyIssuedAt == null &&
        event.payload.confirmedBy == null &&
        event.payload.confirmedAt == null &&
        event.payload.selfApproved !== true
      )
    }
    if (event.entityType === 'order_comment') {
      if (
        event.operation !== 'upsert' ||
        stringField(event.payload, 'authorId') !== actor.id
      ) {
        return false
      }
      const orderId = stringField(event.payload, 'orderId')
      if (!orderId || stringField(event.payload, 'projectId') !== projectId)
        return false
      const order = await this.store.getEntityPayload('purchase_order', orderId)
      return (
        order !== null &&
        stringField(order, 'applicantId') === actor.id &&
        stringField(order, 'projectId') === projectId
      )
    }
    return stringField(event.payload, 'receiverId') === actor.id
  }

  private async canChangeProjectCountry(event: SyncEvent): Promise<boolean> {
    const previous = await this.store.getEntityPayload(
      'project',
      event.entityId,
    )
    const nextCountryId = stringField(
      referencePayload(event.payload),
      'countryId',
    )
    const previousCountryId = previous
      ? stringField(referencePayload(previous), 'countryId')
      : null
    return (
      previousCountryId === null ||
      previousCountryId === nextCountryId ||
      !(await this.store.hasProjectBusinessUse(event.entityId))
    )
  }
}

export class CategoryRepairError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'UNAVAILABLE' | 'CONFLICT') {
    super(code)
  }
}

function normalizeResult(result: SyncEventResult): SyncEventResult {
  if (result.status === 'accepted' || result.errorCode) return result
  return {
    ...result,
    errorCode:
      result.status === 'conflict' ? 'VERSION_CONFLICT' : 'VALIDATION_REJECTED',
  }
}

function referencePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...payload,
    businessCode: payload.businessCode ?? payload.business_code,
    timeZone: payload.timeZone ?? payload.time_zone,
    countryId:
      payload.countryId !== undefined ? payload.countryId : payload.country_id,
    departmentName: payload.departmentName ?? payload.department_name,
    departmentId: payload.departmentId ?? payload.department_id,
    defaultCurrency: payload.defaultCurrency ?? payload.default_currency,
    defaultLanguagePair:
      payload.defaultLanguagePair ?? payload.default_language_pair,
    projectId: payload.projectId ?? payload.project_id,
    isActive: payload.isActive ?? payload.is_active,
    rateBasisPoints: payload.rateBasisPoints ?? payload.rate_basis_points,
    effectiveAt: payload.effectiveAt ?? payload.effective_at,
    fromCurrency: payload.fromCurrency ?? payload.from_currency,
    toCurrency: payload.toCurrency ?? payload.to_currency,
    rateDecimal: payload.rateDecimal ?? payload.rate_decimal,
    departmentTitle: payload.departmentTitle ?? payload.department_title,
    companyAddress: payload.companyAddress ?? payload.company_address,
    companyContact:
      payload.companyContact !== undefined
        ? payload.companyContact
        : payload.company_contact,
    defaultTaxTemplateId:
      payload.defaultTaxTemplateId !== undefined
        ? payload.defaultTaxTemplateId
        : payload.default_tax_template_id,
  }
}

function stringField(
  payload: Record<string, unknown>,
  field: string,
): string | null {
  const value = payload[field]
  return typeof value === 'string' ? value : null
}
