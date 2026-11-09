import { afterEach, describe, it, expect, vi } from 'vitest'
import { startProcurementSync } from './procurement-sync'

afterEach(() => vi.useRealTimers())
describe('procurement synchronization scheduling', () => {
  it('retries on reconnect, coalesces mutations and stops with the session', async () => {
    vi.useFakeTimers()
    const events = new EventTarget()
    let attempts = 0,
      active = 0,
      max = 0
    const stop = startProcurementSync(async () => {
      attempts++
      active++
      max = Math.max(max, active)
      await Promise.resolve()
      active--
      return { uploadedCount: 0, pendingCount: 0, conflictCount: 0 }
    }, events)
    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)
    events.dispatchEvent(new Event('online'))
    events.dispatchEvent(new Event('honsen-procurement-mutation'))
    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBeGreaterThan(1)
    expect(max).toBe(1)
    stop()
    const prior = attempts
    events.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(120000)
    expect(attempts).toBe(prior)
  })
  it('backs off after a transport failure and never announces a synced result', async () => {
    vi.useFakeTimers()
    const events = new EventTarget()
    let attempts = 0
    const states: string[] = []
    events.addEventListener('honsen-procurement-status', (event) =>
      states.push((event as CustomEvent<{ state: string }>).detail.state),
    )
    const stop = startProcurementSync(async () => {
      attempts++
      throw new Error('offline')
    }, events)
    await vi.advanceTimersByTimeAsync(0)
    expect(states).toContain('error')
    expect(states).not.toContain('synced')
    await vi.advanceTimersByTimeAsync(500)
    expect(attempts).toBe(1)
    stop()
  })
})
