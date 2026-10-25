import { afterEach, describe, it, expect, vi } from 'vitest'
import { CosStorage, validFileSignature } from './cos.js'
afterEach(() => vi.unstubAllGlobals())
describe('COS request boundaries', () => {
  it('supports Tencent region names and exposes only a temporary identity', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        Response: {
          Credentials: {
            TmpSecretId: 'temporary-identity',
            TmpSecretKey: 'temporary-key',
            Token: 'temporary-token',
          },
        },
      }),
    )
    const cos = new CosStorage({
      region: 'ap-guangzhou',
      bucket: 'synthetic-test-1250000000',
      secretId: 'server-only-id',
      secretKey: 'server-only-key',
    })
    const signed = await cos.upload(
      'honsen-procure/attachments/synthetic',
      'application/pdf',
      '0'.repeat(64),
      64,
    )
    const url = new URL(signed.url)
    expect(url.searchParams.get('q-ak')).toBe('temporary-identity')
    expect(signed.url.includes('server-only')).toBe(false)
    expect(url.searchParams.get('q-header-list')).toContain(
      'x-cos-forbid-overwrite',
    )
    expect(url.searchParams.get('q-url-param-list')).toBe(
      'x-cos-security-token',
    )
    expect(signed.headers['content-length']).toBe('64')
  })
  it('rejects executable bytes disguised as a PDF', () => {
    expect(
      validFileSignature(Buffer.from('MZ executable'), 'application/pdf'),
    ).toBe(false)
    expect(validFileSignature(Buffer.from('%PDF-1.4'), 'application/pdf')).toBe(
      true,
    )
  })
  it('uses the signed HTTP verb for HEAD and DELETE', async () => {
    const methods: string[] = []
    vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
      methods.push(options?.method ?? 'GET')
      return new Response(null, {
        status: 204,
        headers: { 'content-length': '1' },
      })
    })
    const cos = new CosStorage({
      region: 'ap-guangzhou',
      bucket: 'synthetic-test-1250000000',
      secretId: 'fixture-id',
      secretKey: 'fixture-key',
    })
    await cos
      .inspect('synthetic', 2, '0'.repeat(64), 'application/pdf')
      .catch(() => {})
    await cos.removeOwnedTestObject(
      'honsen-procure-tests/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.pdf',
    )
    expect(methods).toEqual(['HEAD', 'DELETE'])
  })
  it('rejects cleanup outside the isolated test namespace', async () => {
    const cos = new CosStorage({
      region: 'ap-guangzhou',
      bucket: 'synthetic-test-1250000000',
      secretId: 'fixture-id',
      secretKey: 'fixture-key',
    })
    await expect(
      cos.removeOwnedTestObject('business/existing.pdf'),
    ).rejects.toMatchObject({ code: 'TEST_PREFIX_REQUIRED' })
  })
})
