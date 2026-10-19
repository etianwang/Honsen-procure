import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNativeAuthBarrier } from './native-auth-barrier.js'

describe('native-only authenticated Pull barrier', () => {
  it('is disabled unless explicitly configured and fails closed on invalid configuration', async () => {
    expect(
      await createNativeAuthBarrier(undefined, undefined)('request'),
    ).toBeUndefined()
    expect(() =>
      createNativeAuthBarrier('relative.test', 'native-smoke-20261019000000'),
    ).toThrow()
    expect(() =>
      createNativeAuthBarrier(join(tmpdir(), 'auth.test'), undefined),
    ).toThrow()
  })

  it.each([
    'late-account',
    'late-same-account',
    'management-late-account',
    'management-late-same-account',
  ])(
    'holds only the armed %s request, binds release to run/phase and leaves subsequent requests free',
    async (phase) => {
      const directory = mkdtempSync(join(tmpdir(), 'honsen-auth-barrier-'))
      const prefix = join(directory, 'auth.test')
      const runId = 'native-smoke-20261019000000'
      try {
        const barrier = createNativeAuthBarrier(prefix, runId)
        writeFileSync(`${prefix}.arm.signal`, phase)
        let completed = false
        const waiting = barrier('old-request').then((value) => {
          completed = true
          return value
        })
        await expect
          .poll(() => readFileSync(`${prefix}.${phase}.ready.signal`, 'utf8'))
          .toContain('old-request')
        expect(completed).toBe(false)
        expect(await barrier('new-request')).toBeUndefined()
        writeFileSync(
          `${prefix}.${phase}.release.signal`,
          JSON.stringify({ runId, phase }),
        )
        const observation = await waiting
        expect(observation).toMatchObject({
          runId,
          requestId: 'old-request',
          phase,
        })
        expect(completed).toBe(true)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it('rejects an unrecognized phase instead of permitting an uncontrolled response', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'honsen-auth-barrier-'))
    const prefix = join(directory, 'auth.test')
    try {
      writeFileSync(`${prefix}.arm.signal`, 'not-a-phase')
      await expect(
        createNativeAuthBarrier(
          prefix,
          'native-smoke-20261019000000',
        )('request'),
      ).rejects.toThrow()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
