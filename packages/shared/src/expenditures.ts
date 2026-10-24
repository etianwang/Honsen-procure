import { z } from 'zod'
import { uuidSchema } from './contracts.js'
import { currencySchema } from './money.js'

export const procurementExpenditureSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    projectId: uuidSchema,
    countryId: uuidSchema,
    supplierId: uuidSchema.nullish(),
    payeeName: z.string().trim().min(1).max(255),
    currency: currencySchema,
    amountMinor: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .refine((v) => BigInt(v) <= 9223372036854775807n),
    paymentDate: z.iso.date(),
    paymentType: z.enum(['advance', 'progress', 'final', 'other']),
    paymentMethod: z.enum(['cash', 'bank_transfer', 'mobile_payment', 'other']),
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
