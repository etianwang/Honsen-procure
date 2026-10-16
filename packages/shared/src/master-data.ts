import { z } from 'zod'
import { currencySchema } from './money.js'
import { uuidSchema } from './contracts.js'

export const businessCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const documentLanguagePairSchema = z.enum(['zh_fr', 'zh_en'])

export const decimalRateSchema = z.string().regex(/^\d+(?:\.\d{1,8})?$/)

export const projectDefaultsSchema = z.object({
  projectId: uuidSchema,
  departmentTitle: z.string().trim().min(1).max(255),
  companyAddress: z.string().trim().min(1).max(1000),
  companyContact: z.string().trim().max(255).nullable(),
  defaultCurrency: currencySchema,
  defaultLanguagePair: documentLanguagePairSchema,
  defaultTaxTemplateId: uuidSchema.nullable(),
})

export const taxTemplateSchema = z.object({
  id: uuidSchema,
  businessCode: businessCodeSchema,
  name: z.string().trim().min(1).max(255),
  countryId: uuidSchema.nullable(),
  rateBasisPoints: z.number().int().min(0).max(100_000),
  effectiveAt: z.string().date(),
  isActive: z.boolean(),
})

export const exchangeRateSchema = z
  .object({
    id: uuidSchema,
    fromCurrency: currencySchema,
    toCurrency: currencySchema,
    rateDecimal: decimalRateSchema,
    effectiveAt: z.string().date(),
    source: z.enum(['public_daily', 'manual']),
    reason: z.string().trim().min(1).max(1000).nullable(),
  })
  .refine((value) => value.source === 'public_daily' || value.reason !== null, {
    message: 'manual exchange rates require a reason',
    path: ['reason'],
  })

const activeReferenceSchema = z.object({
  id: uuidSchema,
  businessCode: businessCodeSchema,
  name: z.string().trim().min(1).max(255),
  isActive: z.boolean(),
})

export const referenceMasterDataSchema = z.discriminatedUnion('kind', [
  activeReferenceSchema.extend({
    kind: z.literal('country'),
    timeZone: z.string().trim().min(1).max(255),
  }),
  activeReferenceSchema.extend({
    kind: z.literal('project'),
    countryId: uuidSchema,
    site: z.string().trim().min(1).max(255),
    departmentName: z.string().trim().min(1).max(255),
    defaultCurrency: currencySchema,
    defaultLanguagePair: documentLanguagePairSchema,
  }),
  activeReferenceSchema.extend({
    kind: z.literal('site'),
    projectId: uuidSchema,
  }),
  activeReferenceSchema.extend({
    kind: z.literal('department'),
  }),
  activeReferenceSchema.extend({
    kind: z.literal('team'),
    departmentId: uuidSchema,
  }),
  activeReferenceSchema.extend({
    kind: z.literal('unit'),
  }),
])

export type ProjectDefaults = z.infer<typeof projectDefaultsSchema>
export type TaxTemplate = z.infer<typeof taxTemplateSchema>
export type ExchangeRate = z.infer<typeof exchangeRateSchema>
export type ReferenceMasterData = z.infer<typeof referenceMasterDataSchema>
