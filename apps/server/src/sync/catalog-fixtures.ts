// Complete business payloads for sync integration tests.
export const materialFixture = (id: string) => ({
  id,
  sku: null,
  nameZh: 'Fixture material',
  nameFr: null,
  aliases: [],
  brand: null,
  model: 'Fixture model',
  specification: 'Fixture specification',
  unit: 'pcs',
  notes: null,
  isActive: true,
  version: 1,
})

export const supplierFixture = (id: string, countryId: string) => ({
  id,
  countryId,
  businessCode: `SUP-${id}`,
  name: 'Fixture supplier',
  contactName: null,
  address: null,
  city: null,
  country: null,
  phone: null,
  whatsapp: null,
  email: null,
  paymentTerms: null,
  deliveryLeadTime: null,
  isPreferred: false,
  isBlacklisted: false,
  isActive: true,
  version: 1,
})

export const priceFixture = (
  id: string,
  materialId: string,
  supplierId: string,
) => ({
  id,
  materialId,
  supplierId,
  currency: 'XOF',
  unitPriceMinor: '1',
  unit: 'pcs',
  effectiveAt: '2026-10-01',
  sourceNote: null,
  version: 1,
})
