import { z } from 'zod'
import { uuidSchema } from './contracts.js'
import { currencySchema, minorAmountSchema } from './money.js'

const optionalText = z.string().trim().max(1000).nullable()

export const materialSchema = z.object({
  id: uuidSchema,
  sku: z.string().trim().min(1).max(128).nullable(),
  nameZh: z.string().trim().min(1).max(255),
  nameFr: z.string().trim().min(1).max(255).nullable(),
  aliases: z.array(z.string().trim().min(1).max(255)).max(50),
  brand: optionalText,
  model: z.string().trim().min(1).max(255),
  specification: z.string().trim().min(1).max(2000),
  unit: z.string().trim().min(1).max(64),
  notes: optionalText,
  isActive: z.boolean(),
  version: z.number().int().min(1),
})

export const supplierSchema = z.object({
  id: uuidSchema,
  countryId: uuidSchema,
  businessCode: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  contactName: optionalText,
  address: optionalText,
  city: optionalText,
  country: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: z.email().max(255).nullable(),
  paymentTerms: optionalText,
  deliveryLeadTime: optionalText,
  isPreferred: z.boolean(),
  isBlacklisted: z.boolean(),
  isActive: z.boolean(),
  version: z.number().int().min(1),
})

export const materialPriceSchema = z.object({
  id: uuidSchema,
  materialId: uuidSchema,
  supplierId: uuidSchema,
  currency: currencySchema,
  unitPriceMinor: minorAmountSchema.refine((value) => BigInt(value) >= 0n, {
    message: 'Unit price must be non-negative.',
  }),
  unit: z.string().trim().min(1).max(64),
  effectiveAt: z.string().date(),
  sourceNote: optionalText,
  version: z.number().int().min(1),
})

export type Material = z.infer<typeof materialSchema>
export type Supplier = z.infer<typeof supplierSchema>
export type MaterialPrice = z.infer<typeof materialPriceSchema>
