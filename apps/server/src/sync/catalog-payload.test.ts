import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { catalogPayload } from './catalog-payload.js'
import { supplierFixture, priceFixture } from './catalog-fixtures.js'

describe('catalog transport projection compatibility', () => {
  const supplier = randomUUID()
  const material = randomUUID()
  const price = randomUUID()
  const country = randomUUID()

  it('normalizes only nullable omissions/blanks and unambiguous legacy names', () => {
    const legacy = {
      id: supplier,
      country_id: country,
      business_code: 'LEGACY-1',
      name: 'Legacy supplier',
      is_preferred: false,
      is_blacklisted: false,
      is_active: true,
      version: 1,
      phone: ' ',
    }
    expect(catalogPayload('supplier', supplier, legacy)).toMatchObject({
      countryId: country,
      businessCode: 'LEGACY-1',
      contactName: null,
      phone: null,
    })
    expect(
      catalogPayload('supplier', supplier, {
        ...legacy,
        countryId: randomUUID(),
      }),
    ).toBeNull()
    expect(
      catalogPayload('supplier', supplier, { ...legacy, name: undefined }),
    ).toBeNull()
    expect(
      catalogPayload('supplier', supplier.toUpperCase(), {
        ...supplierFixture(supplier, country),
        id: supplier.toUpperCase(),
        countryId: country.toUpperCase(),
      }),
    ).toMatchObject({ id: supplier, countryId: country })
  })

  it('rejects server-valid values that the SQLite domain cannot project', () => {
    for (const invalid of [
      { businessCode: 'bad code' },
      { businessCode: '_BAD' },
      { name: '中'.repeat(100) },
    ]) {
      expect(
        catalogPayload('supplier', supplier, {
          ...supplierFixture(supplier, country),
          ...invalid,
        }),
      ).toBeNull()
    }
    for (const invalid of [
      { unitPriceMinor: '-0' },
      { unitPriceMinor: '1.5' },
      { unitPriceMinor: 'invalid' },
      { unitPriceMinor: '9223372036854775808' },
      { effectiveAt: '1999-12-31' },
    ]) {
      expect(
        catalogPayload('material_price', price, {
          ...priceFixture(price, material, supplier),
          ...invalid,
        }),
      ).toBeNull()
    }
    expect(
      catalogPayload('material_price', price, {
        ...priceFixture(price, material, supplier),
        sourceNote: '',
      }),
    ).toMatchObject({ sourceNote: null })
  })
})
