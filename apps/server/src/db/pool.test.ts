import { describe, expect, it, vi } from 'vitest'
import { waitForDatabase } from './pool.js'

describe('waitForDatabase', () => {
  it('retries only a transient startup connection failure', async () => {
    const query = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
      )
      .mockResolvedValueOnce(undefined)
    const sleep = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await waitForDatabase({ query }, sleep)

    expect(query).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(250)
  })

  it('does not retry a non-connectivity database error', async () => {
    const error = Object.assign(new Error('password authentication failed'), {
      code: '28P01',
    })
    const query = vi.fn<() => Promise<unknown>>().mockRejectedValue(error)
    const sleep = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(waitForDatabase({ query }, sleep)).rejects.toBe(error)
    expect(query).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
