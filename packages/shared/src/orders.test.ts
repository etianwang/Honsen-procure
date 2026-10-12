import { describe, expect, it } from 'vitest'
import {
  calculateDraftTotals,
  calculateOwnerLinePrice,
  requisitionDraftSchema,
} from './orders.js'

const ids = {
  order: '00000000-0000-4000-8000-000000000001',
  country: '00000000-0000-4000-8000-000000000002',
  project: '00000000-0000-4000-8000-000000000003',
  department: '00000000-0000-4000-8000-000000000004',
  team: '00000000-0000-4000-8000-000000000005',
  applicant: '00000000-0000-4000-8000-000000000006',
  line: '00000000-0000-4000-8000-000000000007',
}

function draft() {
  return requisitionDraftSchema.parse({
    id: ids.order,
    displayNo: 'CI-Bethel2-20261010-INT-0001',
    countryId: ids.country,
    projectId: ids.project,
    site: 'fixture site',
    departmentId: ids.department,
    teamId: ids.team,
    applicantId: ids.applicant,
    currency: 'XOF',
    primaryCurrency: 'XOF',
    languagePair: 'zh_fr',
    urgency: 'normal',
    urgencyReason: null,
    orderDate: '2026-10-10',
    deliveryAddress: 'fixture address',
    expectedDeliveryDate: null,
    notes: null,
    orderDiscount: { kind: 'fixed_minor', minor: '100' },
    orderFreight: { kind: 'fixed_minor', minor: '50' },
    taxRateBasisPoints: 1800,
    lines: [
      {
        id: ids.line,
        materialId: null,
        supplierId: null,
        materialSnapshot: {
          nameZh: 'fixture material',
          nameFr: null,
          model: 'FX-01',
          specification: 'fixture',
        },
        supplierSnapshot: null,
        currency: 'XOF',
        quantity: '2.5',
        unit: 'pcs',
        unitPriceMinor: '1250',
        lineDiscount: { kind: 'percent_basis_points', basisPoints: 1000 },
        lineFreight: { kind: 'fixed_minor', minor: '20' },
        freightIncluded: false,
        sortOrder: 0,
      },
    ],
  })
}

describe('requisition calculations', () => {
  it('calculates a frozen owner line conversion and exactly one markup', () => {
    expect(
      calculateOwnerLinePrice({
        lineId: ids.line,
        sourceCurrency: 'CNY',
        primaryCurrency: 'XOF',
        lockedExchangeRateDecimal: '76.5',
        sourceUnitPriceMinor: '1234',
        markup: { kind: 'percent_basis_points', basisPoints: 1000 },
      }),
    ).toEqual({
      convertedReferenceUnitMinor: '944',
      markupMinor: '94',
      finalUnitPriceMinor: '1038',
    })
  })

  it('rejects a non-identity rate for the same currency', () => {
    expect(() =>
      calculateOwnerLinePrice({
        lineId: ids.line,
        sourceCurrency: 'XOF',
        primaryCurrency: 'XOF',
        lockedExchangeRateDecimal: '2',
        sourceUnitPriceMinor: '1',
        markup: { kind: 'fixed_minor', minor: '0' },
      }),
    ).toThrow('Identity conversion')
  })

  it('calculates discounts, freight and tax in the required order', () => {
    expect(calculateDraftTotals(draft())).toMatchObject({
      subtotalMinor: '3125',
      lineDiscountMinor: '313',
      orderDiscountMinor: '100',
      freightMinor: '70',
      taxMinor: '501',
      totalMinor: '3283',
      lineTotals: [{ lineId: ids.line, lineTotalMinor: '2832' }],
    })
  })

  it('rejects a discount larger than the base amount', () => {
    const invalid = draft()
    invalid.orderDiscount = { kind: 'fixed_minor', minor: '999999' }
    expect(() => calculateDraftTotals(invalid)).toThrow(
      'Adjustment cannot exceed',
    )
  })

  it('allows independently stated freight to exceed the goods value', () => {
    const expensiveDelivery = draft()
    expensiveDelivery.orderFreight = { kind: 'fixed_minor', minor: '5000' }

    expect(calculateDraftTotals(expensiveDelivery).freightMinor).toBe('5020')
  })

  it('keeps a mixed-currency parent as source totals until supplier allocation', () => {
    const mixed = draft()
    mixed.lines.push({ ...mixed.lines[0], id: ids.order, currency: 'USD' })
    mixed.taxRateBasisPoints = 0
    mixed.orderDiscount = { kind: 'fixed_minor', minor: '0' }
    mixed.orderFreight = { kind: 'fixed_minor', minor: '0' }
    expect(calculateDraftTotals(mixed).sourceCurrencyTotals).toEqual([
      { currency: 'XOF', totalMinor: '2832' },
      { currency: 'USD', totalMinor: '2832' },
    ])
  })
})
