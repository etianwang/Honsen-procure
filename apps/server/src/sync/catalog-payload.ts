import {
  materialSchema,
  supplierSchema,
  materialPriceSchema,
  uuidSchema,
} from '@honsen/shared'

export const catalogTypes = ['material', 'supplier', 'material_price']

// Legacy clients omitted nullable fields and used snake_case names. Required facts are never supplied.
export function catalogPayload(
  type: string,
  id: string,
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  const schema =
    type === 'supplier'
      ? supplierSchema
      : type === 'material_price'
        ? materialPriceSchema
        : materialSchema
  const payload = { ...raw }
  for (const key of [...Object.keys(schema.shape), 'categoryId', 'countryId']) {
    const alias = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    if (key !== alias && payload[alias] !== undefined) {
      if (payload[key] !== undefined && payload[key] !== payload[alias])
        return null
      payload[key] = payload[alias]
    }
  }
  const nullable =
    type === 'supplier'
      ? [
          'contactName',
          'address',
          'city',
          'country',
          'phone',
          'whatsapp',
          'email',
          'paymentTerms',
          'deliveryLeadTime',
        ]
      : type === 'material_price'
        ? ['sourceNote']
        : ['sku', 'nameFr', 'brand', 'notes']
  for (const key of nullable)
    if (
      payload[key] === undefined ||
      (typeof payload[key] === 'string' && !payload[key].trim())
    )
      payload[key] = null
  const parsed = schema.safeParse(payload)
  if (!parsed.success || parsed.data.id.toLowerCase() !== id.toLowerCase())
    return null
  const result: Record<string, unknown> = { ...parsed.data }
  for (const key of ['id', 'countryId', 'materialId', 'supplierId']) {
    if (typeof result[key] === 'string') result[key] = result[key].toLowerCase()
  }
  if (type === 'material' && payload.categoryId != null) {
    if (!uuidSchema.safeParse(payload.categoryId).success) return null
    result.categoryId = String(payload.categoryId).toLowerCase()
  }
  if (type === 'material_price' && payload.countryId != null) {
    if (!uuidSchema.safeParse(payload.countryId).success) return null
    result.countryId = String(payload.countryId).toLowerCase()
  }
  return result
}
