import { describe, expect, it } from 'vitest'
import {
  syncPushRequestSchema,
  paymentConflictResolutionRequestSchema,
} from './sync.js'

describe('sync contracts', () => {
  it('rejects an oversized invalid push batch before accumulating element issues', () => {
    const result = syncPushRequestSchema.safeParse({
      deviceId: '00000000-0000-4000-8000-000000000001',
      events: Array.from({ length: 10_000 }, () => null),
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Oversized push must fail')
    expect(result.error.issues).toHaveLength(1)
    expect(result.error.issues[0]).toMatchObject({
      code: 'too_big',
      path: ['events'],
    })
  })
  it('accepts only a reasoned use-server payment decision without forged provenance', () => {
    const request = {
      id: '00000000-0000-4000-8000-000000000001',
      conflictId: '00000000-0000-4000-8000-000000000002',
      eventId: '00000000-0000-4000-8000-000000000003',
      action: 'use_server',
      reason: 'Verified both originals',
    }
    expect(paymentConflictResolutionRequestSchema.parse(request)).toEqual(
      request,
    )
    for (const invalid of [
      { ...request, action: 'keep_local' },
      { ...request, reason: ' ' },
      { ...request, resolvedBy: request.id },
      { ...request, serverPayload: {} },
    ])
      expect(
        paymentConflictResolutionRequestSchema.safeParse(invalid).success,
      ).toBe(false)
  })
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
