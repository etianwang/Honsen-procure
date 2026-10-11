import { describe, expect, it } from 'vitest'
import { syncPushRequestSchema } from './sync.js'

describe('sync contracts', () => {
  it('requires versioned, bounded idempotent events', () => {
    const parsed = syncPushRequestSchema.parse({
      deviceId: '00000000-0000-4000-8000-000000000001',
      events: [
        {
          eventId: '00000000-0000-4000-8000-000000000002',
          entityType: 'purchase_order',
          entityId: '00000000-0000-4000-8000-000000000003',
          operation: 'upsert',
          baseVersion: 0,
          payload: { applicantId: '00000000-0000-4000-8000-000000000004' },
        },
      ],
    })

    expect(parsed.events[0]?.baseVersion).toBe(0)
    expect(() =>
      syncPushRequestSchema.parse({
        ...parsed,
        events: [{ ...parsed.events[0], baseVersion: -1 }],
      }),
    ).toThrow()
  })
})
