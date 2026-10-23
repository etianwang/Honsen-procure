import { z } from 'zod'
import { uuidSchema } from './contracts.js'
import { currencySchema, minorAmountSchema } from './money.js'
import { businessCodeSchema } from './master-data.js'

const catalogText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => new TextEncoder().encode(value).length <= max,
      'Text exceeds the desktop UTF-8 byte limit.',
    )
const optionalText = catalogText(1000).min(1).nullable()

export const materialSchema = z.object({
  id: uuidSchema,
  sku: catalogText(128).min(1).nullable(),
  nameZh: catalogText(255).min(1),
  nameFr: catalogText(255).min(1).nullable(),
  aliases: z.array(catalogText(255).min(1)).max(50),
  brand: optionalText,
  model: catalogText(255).min(1),
  specification: catalogText(2000).min(1),
  unit: catalogText(64).min(1),
  notes: optionalText,
  isActive: z.boolean(),
  version: z.number().int().min(1),
})

export const supplierSchema = z.object({
  id: uuidSchema,
  countryId: uuidSchema,
  businessCode: businessCodeSchema,
  name: catalogText(255).min(1),
  contactName: optionalText,
  address: optionalText,
  city: optionalText,
  country: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: z
    .email()
    .max(255)
    .refine((value) => new TextEncoder().encode(value).length <= 255)
    .nullable(),
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
  unitPriceMinor: minorAmountSchema.refine(
    (value) =>
      value.length <= 19 &&
      /^(0|[1-9]\d*)$/.test(value) &&
      BigInt(value) <= 9223372036854775807n,
    {
      message: 'Unit price must fit a non-negative signed 64-bit integer.',
    },
  ),
  unit: catalogText(64).min(1),
  effectiveAt: z
    .string()
    .date()
    .refine((value) => value >= '2000-01-01'),
  sourceNote: optionalText,
  version: z.number().int().min(1),
})

export type Material = z.infer<typeof materialSchema>
export type Supplier = z.infer<typeof supplierSchema>
export type MaterialPrice = z.infer<typeof materialPriceSchema>
