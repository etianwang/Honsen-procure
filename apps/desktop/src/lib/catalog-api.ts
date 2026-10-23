import type {
  Currency,
  Material,
  MaterialPrice,
  Supplier,
} from '@honsen/shared'

export type CatalogPriceView = {
  priceId: string
  supplierId: string
  supplierName: string
  isPreferredSupplier: boolean
  currency: Currency
  unitPriceMinor: string
  unit: string
  effectiveAt: string
  isBlacklisted?: boolean
  paymentTerms?: string | null
  deliveryLeadTime?: string | null
  sourceNote?: string | null
}

export type CatalogMaterialView = {
  id: string
  sku: string | null
  nameZh: string
  nameFr: string | null
  aliases: string[]
  brand: string | null
  model: string
  specification: string
  unit: string
  notes: string | null
  version: number
  prices: CatalogPriceView[]
}

export type SupplierView = {
  id: string
  businessCode: string
  name: string
  contactName: string | null
  address: string | null
  city: string | null
  country: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  paymentTerms: string | null
  deliveryLeadTime: string | null
  isPreferred: boolean
  isBlacklisted: boolean
  isActive: boolean
  version: number
}

export type MaterialImageInput = {
  id: string
  materialId: string
  sourceFileName: string
  sourceBase64: string
  squareCropBase64: string
  cropJson: string
}

export type CatalogApi = {
  searchCatalog(
    query: string,
    projectId?: string,
  ): Promise<CatalogMaterialView[]>
  listCatalogPrices(
    materialId: string,
    projectId: string | undefined,
    after: string | null,
    includeBlacklisted?: boolean,
  ): Promise<CatalogPriceView[]>
  saveMaterial(material: Material): Promise<void>
  listSuppliers(): Promise<SupplierView[]>
  saveSupplier(supplier: Supplier): Promise<void>
  addMaterialPrice(price: MaterialPrice): Promise<void>
  saveMaterialImage(image: MaterialImageInput): Promise<void>
  getMaterialSquareImage(materialId: string): Promise<string | null>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function tauriInvoke(): TauriInvoke {
  const invoke = (
    window as Window & {
      __TAURI__?: { core?: { invoke?: TauriInvoke } }
    }
  ).__TAURI__?.core?.invoke
  if (!invoke) throw new Error('桌面主机不可用')
  return invoke
}

export const tauriCatalogApi: CatalogApi = {
  searchCatalog: (query, projectId) =>
    tauriInvoke()<CatalogMaterialView[]>('search_catalog', {
      query,
      projectId,
    }),
  listCatalogPrices: (
    materialId,
    projectId,
    after,
    includeBlacklisted = false,
  ) =>
    tauriInvoke()<CatalogPriceView[]>('list_catalog_prices', {
      materialId,
      projectId,
      after,
      includeBlacklisted,
    }),
  saveMaterial: (material) =>
    tauriInvoke()<void>('save_material', { material }),
  listSuppliers: () => tauriInvoke()<SupplierView[]>('list_suppliers'),
  saveSupplier: (supplier) =>
    tauriInvoke()<void>('save_supplier', { supplier }),
  addMaterialPrice: (price) =>
    tauriInvoke()<void>('add_material_price', { price }),
  saveMaterialImage: (image) =>
    tauriInvoke()<void>('save_material_image', { image }),
  getMaterialSquareImage: (materialId) =>
    tauriInvoke()<string | null>('get_material_square_image', { materialId }),
}
