import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { observeNativePushCancellation } from './native-push-cancellation.js'

describe('observeNativePushCancellation', () => {
  it('ignores normal IncomingMessage close and accepts socket close only while the response barrier is held', async () => {
    const raw = new EventEmitter() as EventEmitter & {
      socket: EventEmitter & { destroyed?: boolean }
    }
    raw.socket = new EventEmitter() as EventEmitter & { destroyed?: boolean }
    const diagnostics: Array<Record<string, unknown>> = []
    const observer = observeNativePushCancellation({
      raw,
      response: { writableEnded: false, finished: false },
      now: () => '2026-10-18T00:00:00.000Z',
      onObservation: (observation) => diagnostics.push(observation),
    })

    raw.emit('close')
    expect(diagnostics).toEqual([])

    let cancellationResolved = false
    void observer.cancellation.then(() => {
      cancellationResolved = true
    })

    raw.socket.emit('close')
    await expect(observer.cancellation).resolves.toMatchObject({
      cancellationSource: 'socket-close',
      accepted: true,
      barrierReleasedAt: null,
      responseCompleted: false,
    })

    const releasedRaw = new EventEmitter() as EventEmitter & {
      socket: EventEmitter & { destroyed?: boolean }
    }
    releasedRaw.socket = new EventEmitter() as EventEmitter & {
      destroyed?: boolean
    }
    const released = observeNativePushCancellation({
      raw: releasedRaw,
      response: { writableEnded: false, finished: false },
      now: () => '2026-10-18T00:00:00.000Z',
      onObservation: (observation) => diagnostics.push(observation),
    })
    const releasedAt = released.markBarrierReleased()
    releasedRaw.socket.destroyed = true
    releasedRaw.socket.emit('close')
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        cancellationSource: 'socket-close',
        accepted: false,
        barrierReleasedAt: releasedAt,
        responseCompleted: false,
        socketDestroyed: true,
      }),
    )
    await Promise.resolve()
    expect(cancellationResolved).toBe(true)
  })

  it('rejects socket close after response completion', () => {
    const raw = new EventEmitter() as EventEmitter & {
      socket: EventEmitter & { destroyed?: boolean }
    }
    raw.socket = new EventEmitter() as EventEmitter & { destroyed?: boolean }
    const diagnostics: Array<Record<string, unknown>> = []
    const observer = observeNativePushCancellation({
      raw,
      response: { writableEnded: true, finished: false },
      now: () => '2026-10-18T00:00:00.000Z',
      onObservation: (observation) => diagnostics.push(observation),
    })

    raw.socket.destroyed = true
    raw.socket.emit('close')

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        cancellationSource: 'socket-close',
        accepted: false,
        barrierReleasedAt: null,
        responseCompleted: true,
        socketDestroyed: true,
      }),
    )
    expect(observer.acceptedCancellation()).toBeUndefined()
    expect(
      observer.acceptedCancellation()?.cancellationObservedAt,
    ).toBeUndefined()
    observer.dispose()
    expect(raw.listenerCount('aborted')).toBe(0)
    expect(raw.socket.listenerCount('close')).toBe(0)
  })
})
