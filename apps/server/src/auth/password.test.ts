import argon2 from 'argon2'
import { describe, expect, it } from 'vitest'

describe('password hashing', () => {
  it('uses Argon2id and rejects a different password', async () => {
    const hash = await argon2.hash('fixture-password', {
      type: argon2.argon2id,
    })

    expect(hash).toContain('argon2id')
    await expect(argon2.verify(hash, 'fixture-password')).resolves.toBe(true)
    await expect(argon2.verify(hash, 'wrong-password')).resolves.toBe(false)
  })
})
