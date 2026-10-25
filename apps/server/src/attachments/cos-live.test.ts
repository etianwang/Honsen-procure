import { writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { CosStorage } from './cos.js'

describe.skipIf(process.env.HONSEN_COS_LIVE !== '1')(
  'real Tencent COS isolated prefix',
  () => {
    it('uploads, inspects, downloads and hashes a synthetic PDF; rejects invalid authorization; removes only its object', async () => {
      const cos = CosStorage.fromEnvironment(process.env)
      if (!cos) throw new Error('COS_TEST_CONFIGURATION_MISSING')
      const key = `honsen-procure-tests/${randomUUID()}/${randomUUID()}.pdf`
      await writeFile(
        process.env.COS_TEST_OWNERSHIP_FILE ?? 'cos-test-owned-object.json',
        JSON.stringify({ key, createdAt: new Date().toISOString() }),
        { mode: 0o600 },
      )
      const file = Buffer.from(
        '%PDF-1.4\n% Synthetic Honsen attachment connectivity test\n%%EOF\n',
      )
      const checksum = createHash('sha256').update(file).digest('hex')
      const evidence: Record<string, unknown> = { byteLength: file.length }
      let owned = false,
        versionId: string | null = null
      try {
        const upload = await cos.upload(
          key,
          'application/pdf',
          checksum,
          file.length,
        )
        expect(
          upload.url.includes(process.env.COS_SECRET_ID ?? 'MISSING'),
        ).toBe(false)
        const put = await fetch(upload.url, {
          method: 'PUT',
          headers: upload.headers,
          body: file,
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
        })
        evidence.put = put.status
        expect(put.ok).toBe(true)
        owned = true
        versionId = put.headers.get('x-cos-version-id')
        const inspected = await cos.inspect(
          key,
          file.length,
          checksum,
          'application/pdf',
        )
        evidence.headSize = inspected.byteLength
        versionId = inspected.versionId
        const download = await cos.download(key, versionId)
        const get = await fetch(download.url, {
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
        })
        evidence.get = get.status
        const downloaded = Buffer.from(await get.arrayBuffer())
        evidence.hashMatches =
          createHash('sha256').update(downloaded).digest('hex') === checksum
        expect(evidence.hashMatches).toBe(true)
        const invalid = new URL(download.url)
        invalid.searchParams.set('q-signature', '0'.repeat(40))
        const denied = await fetch(invalid, {
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
        })
        evidence.invalidAuthorization = denied.status
        expect([401, 403]).toContain(denied.status)
      } catch (error) {
        evidence.failure =
          error instanceof Error ? error.message : 'COS_OPERATION_FAILED'
        throw error
      } finally {
        if (owned) {
          try {
            evidence.cleanup = await cos.removeOwnedTestObject(key, versionId)
          } catch (error) {
            evidence.cleanupFailure =
              error instanceof Error ? error.message : 'COS_CLEANUP_FAILED'
          }
        }
        console.info('COS_LIVE_EVIDENCE ' + JSON.stringify(evidence))
        await writeFile(
          process.env.COS_TEST_OWNERSHIP_FILE ?? 'cos-test-owned-object.json',
          JSON.stringify({ key, versionId, ...evidence }),
          { mode: 0o600 },
        )
        if (owned) expect(evidence.cleanup).toBe(204)
      }
    }, 120000)
    it('rejects a genuinely expired download URL without creating an object', async () => {
      const cos = CosStorage.fromEnvironment({
        ...process.env,
        COS_SIGNED_URL_TTL_SECONDS: '60',
      })
      if (!cos) throw new Error('COS_TEST_CONFIGURATION_MISSING')
      const access = await cos.download(
        `honsen-procure-tests/${randomUUID()}/${randomUUID()}.pdf`,
        null,
      )
      await new Promise((resolve) => setTimeout(resolve, 66000))
      const response = await fetch(access.url, {
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      })
      const body = await response.text()
      expect(response.status).toBe(403)
      expect(/RequestHasExpired|AccessDenied|Expired/.test(body)).toBe(true)
      console.info(
        'COS_EXPIRED_URL_EVIDENCE ' +
          JSON.stringify({ status: response.status, writes: 0 }),
      )
    }, 100000)
  },
)
