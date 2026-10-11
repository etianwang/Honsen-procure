import {
  syncPullQuerySchema,
  syncPushRequestSchema,
  type SyncEvent,
  type SyncEventResult,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@honsen/shared'
import type { Role } from '@honsen/shared'
import type { SyncActor, SyncStore } from './types.js'

const procurementRoles: Role[] = ['purchaser', 'administrator']

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
    if (actor.roles.some((role) => procurementRoles.includes(role))) return true
    if (!actor.roles.includes('engineer')) return false
    if (
      !['purchase_order', 'order_comment', 'receipt'].includes(event.entityType)
    )
      return false

    const projectId = stringField(event.payload, 'projectId')
    if (
      !projectId ||
      !(await this.store.hasActiveProjectBinding(actor.id, projectId))
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
}

function stringField(
  payload: Record<string, unknown>,
  field: string,
): string | null {
  const value = payload[field]
  return typeof value === 'string' ? value : null
}
