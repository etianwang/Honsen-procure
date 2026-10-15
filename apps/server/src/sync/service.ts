import {
  exchangeRateSchema,
  referenceMasterDataSchema,
  syncPullQuerySchema,
  syncPushRequestSchema,
  taxTemplateSchema,
  type SyncEvent,
  type SyncEventResult,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@honsen/shared'
import type { Role } from '@honsen/shared'
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

export class SyncService {
  constructor(private readonly store: SyncStore) {}

  async push(actor: SyncActor, input: unknown): Promise<SyncPushResponse> {
    const request = syncPushRequestSchema.parse(input)
    const results: SyncEventResult[] = []
    for (const event of request.events) {
      if (!(await this.canWrite(actor, event))) {
        results.push({
          eventId: event.eventId,
          status: 'validation_error',
          serverVersion: null,
        })
        continue
      }
      results.push(
        await this.store.pushEvent({
          event,
          installationId: request.deviceId,
          actorId: actor.id,
        }),
      )
    }
    return { results }
  }

  async pull(actor: SyncActor, input: unknown): Promise<SyncPullResponse> {
    const query = syncPullQuerySchema.parse(input)
    return this.store.pullChanges({
      actor,
      cursor: query.cursor ?? '0',
      limit: query.limit,
    })
  }

  private async canWrite(actor: SyncActor, event: SyncEvent): Promise<boolean> {
    if (event.entityType === 'order_comment' && event.operation !== 'upsert')
      return false
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
      return stringField(event.payload, 'applicantId') === actor.id
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
  }
}

function stringField(
  payload: Record<string, unknown>,
  field: string,
): string | null {
  const value = payload[field]
  return typeof value === 'string' ? value : null
}
