import { describe, expect, it } from 'vitest'
import { calculateOwnerPrintTotals } from './owner-print-totals.js'
const fixed = (minor: string) => ({ kind: 'fixed_minor', minor })
const percent = (basisPoints: number) => ({
  kind: 'percent_basis_points',
  basisPoints,
})
const fixture = () => ({
  primaryCurrency: 'EUR',
  taxRateBasisPoints: 500,
  lines: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      currency: 'USD',
      ownerLockedExchangeRateDecimal: '0.5',
      ownerFinalUnitPriceMinor: '1000',
      quantity: '2.5',
      lineDiscountJson: JSON.stringify(fixed('100')),
      lineFreightJson: JSON.stringify(percent(1000)),
      freightIncluded: false,
    },
  ],
})
describe('owner print versioned final totals', () => {
  it('converts fixed source adjustments then applies line/order rules and tax exactly', () => {
    const result = calculateOwnerPrintTotals(
      fixture(),
      percent(1000),
      fixed('20'),
    )
    expect(result).toMatchObject({
      version: 1,
      currency: 'EUR',
      subtotalMinor: '2500',
      lineDiscountMinor: '50',
      orderDiscountMinor: '245',
      freightMinor: '265',
      taxMinor: '124',
      totalMinor: '2594',
    })
    expect(result.lines[0]).toMatchObject({
      subtotalMinor: '2500',
      discountMinor: '50',
      freightMinor: '245',
      totalMinor: '2695',
    })
  })
  it('excludes included line freight and does not mutate frozen input or expose source fields', () => {
    const data = fixture()
    data.lines[0]!.freightIncluded = true
    const before = JSON.stringify(data)
    const result = calculateOwnerPrintTotals(data, fixed('0'), fixed('0'))
    expect(result.freightMinor).toBe('0')
    expect(result.totalMinor).toBe('2573')
    expect(JSON.stringify(data)).toBe(before)
    expect(JSON.stringify(result)).not.toContain(
      'ownerLockedExchangeRateDecimal',
    )
    expect(JSON.stringify(result)).not.toContain('USD')
  })
  it('rejects over-discount, absent rules and invalid conversion rate', () => {
    expect(() =>
      calculateOwnerPrintTotals(fixture(), fixed('999999'), fixed('0')),
    ).toThrow()
    expect(() =>
      calculateOwnerPrintTotals(fixture(), null, fixed('0')),
    ).toThrow()
    const data = fixture()
    data.lines[0]!.ownerLockedExchangeRateDecimal = '0'
    expect(() =>
      calculateOwnerPrintTotals(data, fixed('0'), fixed('0')),
    ).toThrow()
  })
})

describe('owner adjustment currency and rounding boundaries', () => {
  for (const source of ['XOF', 'CNY', 'USD', 'EUR'])
    for (const primary of ['XOF', 'CNY', 'USD', 'EUR']) {
      it(
        source + ' to ' + primary + ' keeps minor digit conversion exact',
        () => {
          const data = fixture()
          data.primaryCurrency = primary
          data.taxRateBasisPoints = 0
          data.lines[0]!.currency = source
          data.lines[0]!.ownerLockedExchangeRateDecimal = '1'
          data.lines[0]!.quantity = '100'
          data.lines[0]!.freightIncluded = true
          const result = calculateOwnerPrintTotals(data, fixed('0'), fixed('0'))
          expect(result.lineDiscountMinor).toBe(
            source === 'XOF' && primary !== 'XOF'
              ? '10000'
              : source !== 'XOF' && primary === 'XOF'
                ? '1'
                : '100',
          )
        },
      )
    }
  it('rounds fixed conversions half up at one half minor unit', () => {
    const data = fixture()
    data.taxRateBasisPoints = 0
    data.lines[0]!.lineDiscountJson = JSON.stringify(fixed('1'))
    data.lines[0]!.freightIncluded = true
    expect(
      calculateOwnerPrintTotals(data, fixed('0'), fixed('0')).lineDiscountMinor,
    ).toBe('1')
  })
  it('rejects percent overflow, negative final prices and i64 result overflow', () => {
    const data = fixture()
    expect(() =>
      calculateOwnerPrintTotals(data, percent(10001), fixed('0')),
    ).toThrow()
    data.lines[0]!.ownerFinalUnitPriceMinor = '-1'
    expect(() =>
      calculateOwnerPrintTotals(data, fixed('0'), fixed('0')),
    ).toThrow()
    data.lines[0]!.ownerFinalUnitPriceMinor = '9223372036854775807'
    expect(() =>
      calculateOwnerPrintTotals(data, fixed('0'), fixed('0')),
    ).toThrow()
  })
})
