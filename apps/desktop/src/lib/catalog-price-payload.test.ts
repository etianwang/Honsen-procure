import { describe, expect, it } from 'vitest'
import { priceFromForm } from './catalog-maintenance'

describe('catalog quote form payload', () => {
  it('preserves the explicit supplier, currency and exact minor-unit string', () => {
    const materialId = '00000000-0000-4000-8000-000000000101'
    const supplierId = '00000000-0000-4000-8000-000000000301'
    const payload = priceFromForm(
      {
        supplierId,
        currency: 'XAF',
        unitPriceMinor: '9007199254740993',
        unit: 'pcs',
        effectiveAt: '2026-11-09',
        sourceNote: 'Synthetic retained quote',
      },
      materialId,
    )
    expect(payload).toEqual({
      id: expect.any(String),
      materialId,
      supplierId,
      currency: 'XAF',
      unitPriceMinor: '9007199254740993',
      unit: 'pcs',
      effectiveAt: '2026-11-09',
      sourceNote: 'Synthetic retained quote',
      version: 1,
    })
    expect(typeof payload.unitPriceMinor).toBe('string')
  })
})
