import type { Supplier, MaterialPrice, Currency } from '@honsen/shared'
import type { SupplierView } from './catalog-api'

export type SupplierFormValues = {
  businessCode: string
  name: string
  contactName?: string
  address?: string
  city?: string
  country?: string
  phone?: string
  whatsapp?: string
  email?: string
  paymentTerms?: string
  deliveryLeadTime?: string
  isPreferred: boolean
  isBlacklisted: boolean
  isActive: boolean
}
export type PriceFormValues = {
  supplierId: string
  currency: Currency
  unitPriceMinor: string
  unit: string
  effectiveAt: string
  sourceNote?: string
}

const optionalText = (value: string | undefined): string | null =>
  value?.trim() || null
export function supplierFromForm(
  values: SupplierFormValues,
  existing: SupplierView | undefined,
  countryId: string,
): Supplier {
  return {
    id: existing?.id ?? crypto.randomUUID(),
    countryId: existing?.countryId ?? countryId,
    businessCode: values.businessCode.trim(),
    name: values.name.trim(),
    contactName: optionalText(values.contactName),
    address: optionalText(values.address),
    city: optionalText(values.city),
    country: optionalText(values.country),
    phone: optionalText(values.phone),
    whatsapp: optionalText(values.whatsapp),
    email: optionalText(values.email),
    paymentTerms: optionalText(values.paymentTerms),
    deliveryLeadTime: optionalText(values.deliveryLeadTime),
    isPreferred: values.isPreferred,
    isBlacklisted: values.isBlacklisted,
    isActive: values.isActive,
    version: (existing?.version ?? 0) + 1,
  }
}
export function priceFromForm(
  values: PriceFormValues,
  materialId: string,
): MaterialPrice {
  return {
    id: crypto.randomUUID(),
    materialId,
    supplierId: values.supplierId,
    currency: values.currency,
    unitPriceMinor: values.unitPriceMinor,
    unit: values.unit.trim(),
    effectiveAt: values.effectiveAt,
    sourceNote: optionalText(values.sourceNote),
    version: 1,
  }
}
