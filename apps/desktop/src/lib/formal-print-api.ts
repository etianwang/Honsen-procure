import { z } from 'zod'
import { currencySchema } from '@honsen/shared'
export type FormalPrintDocument = z.infer<typeof documentSchema>

const minor = z.string().regex(/^-?\d+$/)
export const approvedPrintLogo = {
  assetId: 'honsen-approved-logo-v1',
  sha256: '0f733cc13c7086deb17668e9e7103e798d006493370f3b66340e9214e7b70751',
  path: '/print/honsen-approved-logo-v1.png',
} as const
export const printProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    profileVersion: z.literal('v1-20261108'),
    legalNameZh: z.string().trim().min(1).max(255),
    logo: z
      .object({
        assetId: z.literal(approvedPrintLogo.assetId),
        sha256: z.literal(approvedPrintLogo.sha256),
        mimeType: z.literal('image/png'),
      })
      .strict(),
  })
  .strict()

export async function verifyPrintProfileAsset(
  profile: z.infer<typeof printProfileSchema>,
) {
  printProfileSchema.parse(profile)
  const response = await fetch(approvedPrintLogo.path)
  if (!response.ok) throw new Error('Approved print logo unavailable')
  const bytes = await response.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  if (hash !== profile.logo.sha256)
    throw new Error('Approved print logo checksum mismatch')
}
export const internalExportDocumentSchema = z
  .object({
    printProfile: printProfileSchema.optional(),
    formalDocumentNo: z.string().min(1),
    documentType: z.enum(['OPA', 'HPA', 'SPO']),
    languagePair: z.enum(['zh_fr', 'zh_en']),
    projectId: z.string().uuid(),
    site: z.string(),
    orderDate: z.string(),
    deliveryAddress: z.string(),
    expectedDeliveryDate: z.string().nullable(),
    notes: z.string().nullable(),
    currency: currencySchema,
    subtotalMinor: minor,
    lineDiscountMinor: minor,
    orderDiscountMinor: minor,
    freightMinor: minor,
    taxMinor: minor,
    manualStampDutyMinor: z.string().regex(/^\d+$/).optional(),
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
            nameFr: z.string().min(1).nullable(),
            nameEn: z.string().min(1).nullable().optional(),
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

// Internal workbooks may identify missing historical translations. Formal
// printing remains subject to the original bilingual completeness gate.
export const documentSchema = internalExportDocumentSchema.refine(
  (document) =>
    document.lines.every((line) =>
      document.languagePair === 'zh_en'
        ? Boolean(line.nameEn?.trim())
        : Boolean(line.nameFr?.trim()),
    ),
  { message: 'Missing frozen document translation' },
)
export function formatPrintMoney(value: string, currency: string): string {
  if (!/^-?\d+$/.test(value)) throw new Error('Invalid minor amount')
  const amount = BigInt(value)
  if (currency === 'XOF' || currency === 'XAF') return `${amount} ${currency}`
  if (!['CNY', 'EUR', 'USD', 'ETB'].includes(currency))
    throw new Error('Unsupported currency')
  const absolute = amount < 0n ? -amount : amount
  return `${amount < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')} ${currency}`
}
