import { z } from 'zod'
import { uuidSchema } from './contracts.js'
import { currencySchema } from './money.js'

const recipientType = z.enum(['individual', 'company'])
const settlementText = z.string().trim().min(1).max(200)
export const settlementDetailsSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('CASH') }),
    z.strictObject({
      kind: z.literal('BANK_TRANSFER'),
      recipientType,
      bankChannel: z.enum(['SWIFT', 'IBAN', 'OTHER']),
      bankName: settlementText.optional(),
      accountHolder: settlementText.optional(),
      accountReference: settlementText.max(100).optional(),
      iban: z
        .string()
        .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/)
        .optional(),
      swiftBic: z
        .string()
        .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/)
        .optional(),
      transactionReference: settlementText,
    }),
    z.strictObject({
      kind: z.literal('REMITTANCE'),
      recipientType,
      providerCode: settlementText.max(64),
      providerName: settlementText,
      reference: settlementText,
      transactionReference: settlementText,
    }),
    z.strictObject({
      kind: z.literal('MOBILE_PAYMENT'),
      recipientType,
      transactionReference: settlementText,
      channelId: uuidSchema,
      channelCode: settlementText.max(64),
      countryCode: z.string().regex(/^[A-Z]{2}$/),
      channelNameSnapshot: settlementText,
      recipientReference: settlementText.max(100),
    }),
    z.strictObject({
      kind: z.literal('OTHER'),
      description: z.string().trim().min(1).max(1000),
    }),
  ])
  .superRefine((v, ctx) => {
    if (v.kind === 'BANK_TRANSFER') {
      if (
        v.bankChannel === 'SWIFT' &&
        (!v.bankName || !v.accountReference || !v.swiftBic)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'SWIFT requires bank, account and BIC.',
        })
      if (v.bankChannel === 'IBAN' && !v.iban)
        ctx.addIssue({ code: 'custom', message: 'IBAN is required.' })
      if (v.bankChannel === 'OTHER' && !v.accountReference)
        ctx.addIssue({
          code: 'custom',
          message: 'Account reference is required.',
        })
    }
    if (
      v.kind === 'REMITTANCE' &&
      v.providerCode === 'WESTERN_UNION' &&
      !/^\d{10}$/.test(v.reference)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Western Union MTCN must have ten digits.',
      })
  })
export type SettlementDetails = z.infer<typeof settlementDetailsSchema>
const settlementMethod = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  REMITTANCE: 'other',
  MOBILE_PAYMENT: 'mobile_payment',
  OTHER: 'other',
} as const

export const procurementExpenditureSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    projectId: uuidSchema,
    countryId: uuidSchema,
    supplierId: uuidSchema.nullish(),
    receiptId: uuidSchema.nullish(),
    counterpartyType: z
      .enum(['registered_supplier', 'market_casual'])
      .nullish(),
    counterpartySnapshot: z
      .strictObject({
        type: z.enum(['registered_supplier', 'market_casual']),
        supplierId: uuidSchema.nullish(),
        name: z.string().min(1).max(500),
      })
      .nullish(),
    voucherAttachmentIds: z
      .array(uuidSchema)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    payeeName: z.string().trim().min(1).max(500),
    currency: currencySchema,
    amountMinor: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .refine((v) => BigInt(v) <= 9223372036854775807n),
    paymentDate: z.iso.date(),
    paymentType: z.enum(['advance', 'progress', 'final', 'other']),
    paymentMethod: z.enum(['cash', 'bank_transfer', 'mobile_payment', 'other']),
    settlementDetails: settlementDetailsSchema.optional(),
    paymentHandlerId: uuidSchema,
    voucherReference: z.string().max(1000).nullish(),
    notes: z.string().max(4000).nullish(),
    status: z.enum(['recorded', 'reversed']),
    correctsExpenditureId: uuidSchema.nullish(),
    correctionReason: z.string().trim().min(1).max(1000).nullish(),
    createdBy: uuidSchema,
    createdAt: z.number().int().nonnegative().max(8640000000000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.settlementDetails &&
      settlementMethod[v.settlementDetails.kind] !== v.paymentMethod
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Settlement classification does not match legacy payment method.',
      })
    if (
      (v.counterpartySnapshot &&
        (v.counterpartySnapshot.type !== v.counterpartyType ||
          (v.counterpartySnapshot.supplierId ?? null) !==
            (v.supplierId ?? null))) ||
      (v.counterpartyType === 'market_casual' && v.supplierId != null) ||
      (v.counterpartyType === 'registered_supplier' && v.supplierId == null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid counterparty association.',
      })

    if (
      v.status === 'reversed'
        ? !v.correctsExpenditureId ||
          !v.correctionReason ||
          v.correctsExpenditureId === v.id
        : v.correctsExpenditureId != null || v.correctionReason != null
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'A reversal requires an original payment and a reason; a payment cannot correct another row.',
      })
    }
  })
export type ProcurementExpenditure = z.infer<
  typeof procurementExpenditureSchema
>
