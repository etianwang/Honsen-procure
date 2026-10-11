import { describe, expect, it } from 'vitest'
import { SyncService } from './service.js'
import type { SyncStore } from './types.js'

const engineer = {
  id: '00000000-0000-4000-8000-000000000001',
  roles: ['engineer'] as const,
}
const projectId = '00000000-0000-4000-8000-000000000002'

class FixtureStore implements SyncStore {
  pushed = 0
  bound = true

  async pushEvent(input: Parameters<SyncStore['pushEvent']>[0]) {
    this.pushed += 1
    return {
      eventId: input.event.eventId,
      status: 'accepted' as const,
      serverVersion: 1,
    }
  }

  async pullChanges() {
    return { changes: [], nextCursor: '0' }
  }

  async hasActiveProjectBinding() {
    return this.bound
  }
}

function purchaseOrderEvent(applicantId = engineer.id) {
  return {
    eventId: '00000000-0000-4000-8000-000000000003',
    entityType: 'purchase_order' as const,
    entityId: '00000000-0000-4000-8000-000000000004',
    operation: 'upsert' as const,
    baseVersion: 0,
    payload: { applicantId, projectId },
  }
}

describe('SyncService', () => {
  it('accepts an engineer order only for the engineer and a bound project', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)

    const response = await service.push(engineer, {
      deviceId: '00000000-0000-4000-8000-000000000005',
      events: [purchaseOrderEvent()],
    })

    expect(response.results[0]?.status).toBe('accepted')
    expect(store.pushed).toBe(1)
  })

  it('rejects an engineer attempt to write another applicant order without mutation', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)

    const response = await service.push(engineer, {
      deviceId: '00000000-0000-4000-8000-000000000005',
      events: [purchaseOrderEvent('00000000-0000-4000-8000-000000000006')],
    })

    expect(response.results[0]).toMatchObject({ status: 'validation_error' })
    expect(store.pushed).toBe(0)
  })
})
