import { z } from 'zod'
export type FormalPrintDocument = z.infer<typeof documentSchema>

const minor = z.string().regex(/^-?\d+$/)
export const documentSchema = z
  .object({
    formalDocumentNo: z.string().min(1),
    documentType: z.enum(['OPA', 'HPA', 'SPO']),
    languagePair: z.literal('zh_fr'),
    projectId: z.string().uuid(),
    site: z.string(),
    orderDate: z.string(),
    deliveryAddress: z.string(),
    expectedDeliveryDate: z.string().nullable(),
    notes: z.string().nullable(),
    currency: z.enum(['XOF', 'EUR', 'USD', 'CNY']),
    subtotalMinor: minor,
    lineDiscountMinor: minor,
    orderDiscountMinor: minor,
    freightMinor: minor,
    taxMinor: minor,
    totalMinor: minor,
    taxRateBasisPoints: z.number().int(),
    selfApproved: z.boolean(),
    supplier: z
      .object({
        name: z.string().nullable(),
        contactName: z.string().nullable(),
        address: z.string().nullable(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
      })
      .strict()
      .nullable(),
    lines: z
      .array(
        z
          .object({
            nameZh: z.string().min(1),
            nameFr: z.string().min(1),
            model: z.string().nullable(),
            specification: z.string().nullable(),
            quantity: z.string().regex(/^\d+(\.\d+)?$/),
            unit: z.string(),
            currency: z.string(),
            unitPriceMinor: minor,
            lineTotalMinor: minor,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
export function formatPrintMoney(value: string, currency: string): string {
  if (!/^-?\d+$/.test(value)) throw new Error('Invalid minor amount')
  const amount = BigInt(value)
  if (currency === 'XOF') return `${amount} XOF`
  if (!['CNY', 'EUR', 'USD'].includes(currency))
    throw new Error('Unsupported currency')
  const absolute = amount < 0n ? -amount : amount
  return `${amount < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')} ${currency}`
}
