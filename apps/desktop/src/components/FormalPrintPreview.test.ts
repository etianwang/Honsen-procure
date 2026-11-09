import { describe, expect, it, vi } from 'vitest'
import {
  formatPrintMoney,
  printProfileSchema,
  verifyPrintProfileAsset,
  approvedPrintLogo,
} from '../lib/formal-print-api'

describe('frozen approved company print profile', () => {
  const profile = {
    schemaVersion: 1,
    profileVersion: 'v1-20261108',
    legalNameZh: '深圳市弘盛优创机电工程设计有限公司',
    logo: {
      assetId: approvedPrintLogo.assetId,
      sha256: approvedPrintLogo.sha256,
      mimeType: 'image/png',
    },
  }
  it('rejects unsupported profile, asset and arbitrary logo URLs', () => {
    expect(printProfileSchema.safeParse(profile).success).toBe(true)
    expect(
      printProfileSchema.safeParse({ ...profile, profileVersion: 'v2' })
        .success,
    ).toBe(false)
    expect(
      printProfileSchema.safeParse({
        ...profile,
        logo: { ...profile.logo, sha256: '0'.repeat(64) },
      }).success,
    ).toBe(false)
    expect(
      printProfileSchema.safeParse({
        ...profile,
        logo: { ...profile.logo, url: 'https://untrusted.invalid/logo.png' },
      }).success,
    ).toBe(false)
  })
  it('rejects corrupt approved logo bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('corrupt')),
    )
    try {
      await expect(
        verifyPrintProfileAsset(printProfileSchema.parse(profile)),
      ).rejects.toThrow('checksum mismatch')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('formal print integer money', () => {
  it('preserves large integers and negative cents without floating point', () => {
    expect(formatPrintMoney('900719925474099312', 'EUR')).toBe(
      '9007199254740993.12 EUR',
    )
    expect(formatPrintMoney('-1', 'USD')).toBe('-0.01 USD')
    expect(formatPrintMoney('250', 'XOF')).toBe('250 XOF')
    expect(formatPrintMoney('0', 'CNY')).toBe('0.00 CNY')
  })
  it('rejects fractional minor values and unsupported currencies', () => {
    expect(() => formatPrintMoney('1.2', 'EUR')).toThrow()
    expect(() => formatPrintMoney('12', 'GBP')).toThrow()
  })
})
