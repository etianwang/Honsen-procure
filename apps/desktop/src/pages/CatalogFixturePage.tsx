import type { CatalogApi } from '../lib/catalog-api'
import { MaterialsPage } from './MaterialsPage'

const fixtureCatalogApi: CatalogApi = {
  async listCatalogPrices() {
    return []
  },
  async searchCatalog(query) {
    const materials = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        sku: 'FIXTURE-CABLE',
        nameZh: '测试电缆',
        nameFr: 'Câble de test',
        aliases: ['fixture cable'],
        brand: null,
        model: 'FX-01',
        specification: '3 × 2.5 mm²',
        unit: '米',
        notes: null,
        version: 1,
        prices: [
          {
            supplierName: 'fixture supplier A',
            unitPriceMinor: '1250',
            isPreferredSupplier: true,
          },
          {
            supplierName: 'fixture supplier B',
            unitPriceMinor: '1300',
            isPreferredSupplier: false,
          },
          {
            supplierName: 'fixture supplier C',
            unitPriceMinor: '1375',
            isPreferredSupplier: false,
          },
          {
            supplierName: 'fixture supplier D',
            unitPriceMinor: '1450',
            isPreferredSupplier: false,
          },
        ].map((quote, index) => ({
          priceId: `00000000-0000-4000-8000-00000000001${index}`,
          supplierId: `00000000-0000-4000-8000-00000000002${index}`,
          ...quote,
          currency: 'XOF' as const,
          unit: '米',
          effectiveAt: '2026-10-10',
        })),
      },
    ]
    const normalized = query.trim().toLocaleLowerCase()
    return materials.filter(
      (material) =>
        normalized.length === 0 ||
        [
          material.nameZh,
          material.nameFr,
          material.model,
          material.specification,
          material.sku,
        ].some((value) => value?.toLocaleLowerCase().includes(normalized)),
    )
  },
  async saveMaterial() {},
  async listSuppliers() {
    return []
  },
  async saveSupplier() {},
  async addMaterialPrice() {},
  async saveMaterialImage() {},
  async getMaterialSquareImage() {
    return null
  },
}

export function CatalogFixturePage() {
  return (
    <MaterialsPage
      role="engineer"
      projectId="00000000-0000-4000-8000-000000000102"
      api={fixtureCatalogApi}
    />
  )
}
