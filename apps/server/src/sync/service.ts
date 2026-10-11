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
    if (actor.roles.some((role) => procurementRoles.includes(role))) return true
    if (!actor.roles.includes('engineer')) return false
    if (!['purchase_order', 'receipt'].includes(event.entityType)) return false

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
