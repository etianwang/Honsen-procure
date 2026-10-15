import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startSyncLifecycle, type SyncState } from './sync-lifecycle'

describe('authenticated desktop sync lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps pending data pending until a server acknowledgement and then pulls', async () => {
    const states: SyncState[] = []
    let pushes = 0
    const invoke = vi.fn(async (command: string) => {
      if (command === 'push_pending_sync') {
        pushes += 1
        return pushes === 1
          ? { acceptedCount: 0, pendingCount: 1 }
          : { acceptedCount: 1, pendingCount: 0 }
      }
      if (command === 'pull_sync') return { appliedCount: 0, nextCursor: '1' }
      throw new Error(`unexpected ${command}`)
    })
    const stop = startSyncLifecycle(
      invoke,
      (state) => states.push(state),
      new EventTarget(),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)).toEqual({ kind: 'pending', pendingCount: 1 })
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'push_pending_sync',
      'pull_sync',
    ])
    await vi.advanceTimersByTimeAsync(60_250)
    expect(states.at(-1)).toEqual({ kind: 'synced', pendingCount: 0 })
    stop()
  })

  it('backs off transport failures, recovers on reconnect, and does not overlap requests', async () => {
    const states: SyncState[] = []
    let release:
      | ((value: { acceptedCount: number; pendingCount: number }) => void)
      | undefined
    let attempts = 0
    const invoke = vi.fn((command: string): Promise<unknown> => {
      if (command === 'push_pending_sync') {
        attempts += 1
        if (attempts === 1)
          return Promise.reject({ code: 'sync_transport_error' })
        if (attempts === 2)
          return new Promise((resolve) => {
            release = resolve
          })
        return Promise.resolve({ acceptedCount: 0, pendingCount: 0 })
      }
      return Promise.resolve({ appliedCount: 0, nextCursor: '1' })
    })
    const host = new EventTarget()
    const stop = startSyncLifecycle(invoke, (state) => states.push(state), host)
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)?.kind).toBe('retrying')
    expect(attempts).toBe(1)
    host.dispatchEvent(new Event('online'))
    host.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(2)
    expect(invoke).toHaveBeenCalledTimes(2)
    release?.({ acceptedCount: 0, pendingCount: 0 })
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)?.kind).toBe('synced')
    stop()
  })

  it('stops retry timers and listeners on logout or account switch', async () => {
    const invoke = vi.fn().mockRejectedValue({ code: 'sync_transport_error' })
    const host = new EventTarget()
    const stop = startSyncLifecycle(invoke, () => undefined, host)
    await vi.advanceTimersByTimeAsync(0)
    expect(invoke).toHaveBeenCalledTimes(1)
    stop()
    host.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('does not retry a revoked authenticated session', async () => {
    const states: SyncState[] = []
    const invoke = vi
      .fn()
      .mockRejectedValue({ code: 'reauthentication_required' })
    const host = new EventTarget()
    const stop = startSyncLifecycle(invoke, (state) => states.push(state), host)
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)?.kind).toBe('auth-required')
    host.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(invoke).toHaveBeenCalledTimes(1)
    stop()
  })

  it('waits for bounded backoff after a transport failure', async () => {
    let attempts = 0
    const invoke = vi.fn(async (command: string) => {
      if (command === 'pull_sync') return { appliedCount: 0, nextCursor: '1' }
      attempts += 1
      if (attempts === 1) throw { code: 'sync_transport_error' }
      return { acceptedCount: 0, pendingCount: 0 }
    })
    const stop = startSyncLifecycle(invoke, () => undefined, new EventTarget())
    await vi.advanceTimersByTimeAsync(999)
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(251)
    expect(attempts).toBe(2)
    stop()
  })

  it('never displays synced for a malformed acknowledgement response', async () => {
    const states: SyncState[] = []
    const invoke = vi.fn().mockResolvedValue({ acceptedCount: 1 })
    const stop = startSyncLifecycle(
      invoke,
      (state) => states.push(state),
      new EventTarget(),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)?.kind).toBe('retrying')
    expect(invoke).toHaveBeenCalledTimes(1)
    stop()
  })

  it('pauses on an offline event and resumes without overlapping on reconnect', async () => {
    const states: SyncState[] = []
    const host = new EventTarget()
    const invoke = vi.fn(async (command: string) =>
      command === 'push_pending_sync'
        ? { acceptedCount: 0, pendingCount: 0 }
        : { appliedCount: 0, nextCursor: '1' },
    )
    const stop = startSyncLifecycle(invoke, (state) => states.push(state), host)
    host.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(invoke).not.toHaveBeenCalled()
    expect(states.at(-1)?.kind).toBe('offline-pending')
    host.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'push_pending_sync',
      'pull_sync',
    ])
    stop()
  })
})
