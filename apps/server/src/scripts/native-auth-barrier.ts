// Imported only by the disposable native HTTPS test host, never by the production server.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export function createNativeAuthBarrier(
  prefix: string | undefined,
  runId: string | undefined,
) {
  if (
    prefix &&
    (!isAbsolute(prefix) ||
      !prefix.endsWith('.test') ||
      !/^native-smoke-[0-9]{14}$/.test(runId ?? ''))
  ) {
    throw new Error(
      'native auth barrier requires an absolute .test prefix and native run ID',
    )
  }
  const used = new Set<string>()
  return async (requestId: string) => {
    if (!prefix || !existsSync(`${prefix}.arm.signal`)) return undefined
    const phase = readFileSync(`${prefix}.arm.signal`, 'utf8')
    if (!['late-account', 'late-same-account'].includes(phase))
      throw new Error('invalid native auth barrier phase')
    if (used.has(phase)) return undefined
    used.add(phase)
    const readyAt = new Date().toISOString()
    writeFileSync(
      `${prefix}.${phase}.ready.signal`,
      JSON.stringify({ runId, requestId, phase, readyAt }),
    )
    // The Rust HTTPS timeout is 20s; failure to release must never count as a successful 401 race.
    const deadline = Date.now() + 15_000
    while (!existsSync(`${prefix}.${phase}.release.signal`)) {
      if (Date.now() >= deadline)
        throw new Error('native auth barrier release timed out')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const release: unknown = JSON.parse(
      readFileSync(`${prefix}.${phase}.release.signal`, 'utf8'),
    )
    if (
      !release ||
      typeof release !== 'object' ||
      !('runId' in release) ||
      release.runId !== runId ||
      !('phase' in release) ||
      release.phase !== phase
    ) {
      throw new Error('native auth barrier release identity mismatch')
    }
    return {
      runId,
      requestId,
      phase,
      readyAt,
      releasedAt: new Date().toISOString(),
    }
  }
}
