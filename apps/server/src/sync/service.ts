import {
  referenceMasterDataSchema,
  syncPullQuerySchema,
  syncPushRequestSchema,
  type SyncEvent,
  type SyncEventResult,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@honsen/shared'
import type { Role } from '@honsen/shared'
import { z } from 'zod'
import type { SyncActor, SyncStore } from './types.js'

const procurementRoles: Role[] = ['purchaser', 'administrator']
const referenceMasterDataTypes = ['country', 'project', 'site'] as const
const expenditurePayloadSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  projectId: z.uuid(),
  receiptId: z.uuid().nullable(),
  counterpartyType: z.enum(['registered_supplier', 'market_casual']),
  supplierId: z.uuid().nullable(),
  payeeName: z.string().trim().min(1).max(255),
  counterpartySnapshot: z
    .object({ id: z.uuid(), name: z.string().min(1), countryId: z.uuid() })
    .nullable(),
  currency: z.enum(['XOF', 'XAF', 'CNY', 'USD', 'EUR', 'ETB']),
  amountMinor: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .refine((amount) => BigInt(amount) <= 9223372036854775807n),
  paymentDate: z.iso.date(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'mobile_payment', 'other']),
  paymentHandlerId: z.uuid(),
  notes: z.string().max(2000).nullable(),
  status: z.enum(['recorded', 'reversed']),
  correctsExpenditureId: z.uuid().nullable(),
  correctionReason: z.string().trim().min(1).max(1000).nullable(),
  createdBy: z.uuid(),
  createdAt: z.number().int().nonnegative(),
})

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
    if (event.entityType === 'procurement_expenditure') {
      return this.canWriteExpenditure(actor, event)
    }
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
        actor.roles.some((role) => procurementRoles.includes(role)) &&
        referenceMasterDataSchema.safeParse({
          ...referencePayload(event.payload),
          kind: event.entityType,
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

  private async canWriteExpenditure(
    actor: SyncActor,
    event: SyncEvent,
  ): Promise<boolean> {
    if (
      event.operation !== 'upsert' ||
      !actor.roles.some((role) => procurementRoles.includes(role))
    )
      return false
    const parsed = expenditurePayloadSchema.safeParse(event.payload)
    if (
      !parsed.success ||
      parsed.data.id !== event.entityId ||
      parsed.data.createdBy !== actor.id
    )
      return false
    const value = parsed.data
    if (
      (value.counterpartyType === 'market_casual') !==
      (value.supplierId === null)
    )
      return false
    if (value.supplierId === null && value.counterpartySnapshot !== null)
      return false
    if (
      (value.correctsExpenditureId === null) !==
      (value.correctionReason === null)
    )
      return false
    if (value.status === 'reversed' && value.correctsExpenditureId === null)
      return false
    const order = await this.store.getEntityPayload(
      'purchase_order',
      value.orderId,
    )
    if (!order || stringField(order, 'projectId') !== value.projectId)
      return false
    const parentId = stringField(order, 'parentOrderId')
    const parent = parentId
      ? await this.store.getEntityPayload('purchase_order', parentId)
      : null
    if (
      parentId &&
      (!parent || stringField(parent, 'projectId') !== value.projectId)
    )
      return false
    const mode =
      stringField(order, 'procurementMode') ??
      (parent ? stringField(parent, 'procurementMode') : null)
    if (mode !== 'honsen_self_purchase') return false
    const workflowStatus = stringField(order, 'workflowStatus')
    if (
      !(parentId === null
        ? [
            'executing',
            'receiving',
            'completed',
            'completed_with_conditions',
          ].includes(workflowStatus ?? '')
        : [
            'sent',
            'receiving',
            'completed',
            'completed_with_conditions',
          ].includes(workflowStatus ?? ''))
    )
      return false
    const departmentId = stringField(order, 'departmentId')
    const teamId = stringField(order, 'teamId')
    if (
      !departmentId ||
      !teamId ||
      !(await this.store.hasActiveProjectBinding(
        actor.id,
        value.projectId,
        departmentId,
        teamId,
      ))
    )
      return false
    if (value.receiptId !== null) {
      const receipt = await this.store.getEntityPayload(
        'receipt',
        value.receiptId,
      )
      if (!receipt || stringField(receipt, 'orderId') !== value.orderId)
        return false
    }
    let prior: Record<string, unknown> | null = null
    if (value.correctsExpenditureId !== null) {
      prior = await this.store.getEntityPayload(
        'procurement_expenditure',
        value.correctsExpenditureId,
      )
      if (
        !prior ||
        stringField(prior, 'orderId') !== value.orderId ||
        stringField(prior, 'status') === value.status
      )
        return false
    }
    if (value.status === 'reversed') {
      const copiedFields = [
        'receiptId',
        'counterpartyType',
        'supplierId',
        'payeeName',
        'currency',
        'amountMinor',
        'paymentDate',
        'paymentMethod',
        'paymentHandlerId',
        'notes',
      ] as const
      if (
        !prior ||
        copiedFields.some((field) => prior?.[field] !== value[field])
      )
        return false
      const priorSnapshot =
        expenditurePayloadSchema.shape.counterpartySnapshot.safeParse(
          prior.counterpartySnapshot,
        )
      if (
        !priorSnapshot.success ||
        priorSnapshot.data?.id !== value.counterpartySnapshot?.id ||
        priorSnapshot.data?.name !== value.counterpartySnapshot?.name ||
        priorSnapshot.data?.countryId !== value.counterpartySnapshot?.countryId
      )
        return false
    } else if (value.supplierId !== null) {
      const supplier = await this.store.getEntityPayload(
        'supplier',
        value.supplierId,
      )
      if (
        !supplier ||
        stringField(supplier, 'countryId') !==
          stringField(order, 'countryId') ||
        value.counterpartySnapshot?.id !== value.supplierId ||
        value.counterpartySnapshot.name !== value.payeeName ||
        value.counterpartySnapshot.countryId !== stringField(order, 'countryId')
      )
        return false
    }
    return true
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
    countryId: payload.countryId ?? payload.country_id,
    departmentName: payload.departmentName ?? payload.department_name,
    defaultCurrency: payload.defaultCurrency ?? payload.default_currency,
    defaultLanguagePair:
      payload.defaultLanguagePair ?? payload.default_language_pair,
    projectId: payload.projectId ?? payload.project_id,
    isActive: payload.isActive ?? payload.is_active,
  }
}

function stringField(
  payload: Record<string, unknown>,
  field: string,
): string | null {
  const value = payload[field]
  return typeof value === 'string' ? value : null
}
