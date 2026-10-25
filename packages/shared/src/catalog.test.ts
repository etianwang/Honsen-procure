import { describe, expect, it } from 'vitest'
import {
  materialPriceSchema,
  materialSchema,
  supplierSchema,
} from './catalog.js'

const id = '00000000-0000-4000-8000-000000000001'

describe('catalog contracts', () => {
  it('requires the material name, model, specification and unit', () => {
    expect(() =>
      materialSchema.parse({
        id,
        sku: null,
        nameZh: ' ',
        nameFr: null,
        aliases: [],
        brand: null,
        model: 'M16',
        specification: 'fixture',
        unit: 'pcs',
        notes: null,
        isActive: true,
        version: 1,
      }),
    ).toThrow()
  })

  it('keeps price transport in integer minor units and validates suppliers', () => {
    expect(() =>
      materialPriceSchema.parse({
        id,
        materialId: id,
        supplierId: id,
        currency: 'XOF',
        unitPriceMinor: '12.5',
        unit: 'pcs',
        effectiveAt: '2026-10-10',
        sourceNote: null,
        version: 1,
      }),
    ).toThrow()
    expect(() =>
      supplierSchema.parse({
        id,
        countryId: id,
        businessCode: 'SUP-001',
        name: 'fixture supplier',
        contactName: null,
        address: null,
        city: null,
        country: null,
        phone: null,
        whatsapp: null,
        email: 'invalid',
        paymentTerms: null,
        deliveryLeadTime: null,
        isPreferred: false,
        isBlacklisted: false,
        isActive: true,
        version: 1,
      }),
    ).toThrow()
  })
})
