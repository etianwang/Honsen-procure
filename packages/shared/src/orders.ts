import { z } from 'zod'
import { uuidSchema } from './contracts.js'
import {
  currencySchema,
  divideRoundHalfUp,
  minorAmountSchema,
  multiplyMinorByQuantity,
  positiveQuantitySchema,
} from './money.js'
import type { Currency } from './money.js'
import { documentLanguagePairSchema } from './master-data.js'

const nonNegativeMinorSchema = minorAmountSchema.refine(
  (value) => BigInt(value) >= 0n,
  { message: 'Amount must be non-negative.' },
)

export const adjustmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed_minor'), minor: nonNegativeMinorSchema }),
  z.object({
    kind: z.literal('percent_basis_points'),
    basisPoints: z.number().int().min(0).max(10_000),
  }),
])

export const procurementModeSchema = z.enum([
  'owner_self_purchase',
  'honsen_self_purchase',
])

export const ownerQuoteSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog_price'), materialPriceId: uuidSchema }),
  z.object({
    kind: z.literal('manual_reference'),
    unitPriceMinor: nonNegativeMinorSchema,
    reason: z.string().trim().min(1).max(1000),
  }),
])

export const ownerLinePricingSchema = z.object({
  lineId: uuidSchema,
  sourceCurrency: currencySchema,
  primaryCurrency: currencySchema,
  lockedExchangeRateDecimal: z.string().regex(/^\d+(\.\d{1,8})?$/),
  sourceUnitPriceMinor: nonNegativeMinorSchema,
  markup: adjustmentSchema,
})

export type OwnerQuoteSource = z.infer<typeof ownerQuoteSourceSchema>
export type OwnerLinePricing = z.infer<typeof ownerLinePricingSchema>

export function calculateOwnerLinePrice(input: OwnerLinePricing) {
  ownerLinePricingSchema.parse(input)
  const rate = decimalRatio(input.lockedExchangeRateDecimal)
  if (
    input.sourceCurrency === input.primaryCurrency &&
    rate.numerator !== rate.denominator
  ) {
    throw new RangeError('Identity conversion must use rate 1.')
  }
  const convertedReferenceUnitMinor = divideRoundHalfUp(
    BigInt(input.sourceUnitPriceMinor) *
      rate.numerator *
      10n ** BigInt(currencyMinorDigits(input.primaryCurrency)),
    10n ** BigInt(currencyMinorDigits(input.sourceCurrency)) * rate.denominator,
  )
  const markupMinor = adjustmentAmount(
    convertedReferenceUnitMinor,
    input.markup,
    false,
  )
  return {
    convertedReferenceUnitMinor: convertedReferenceUnitMinor.toString(),
    markupMinor: markupMinor.toString(),
    finalUnitPriceMinor: (convertedReferenceUnitMinor + markupMinor).toString(),
  }
}

export const requisitionLineSchema = z.object({
  id: uuidSchema,
  materialId: uuidSchema.nullable(),
  catalogPriceId: uuidSchema.nullable().optional(),
  priceSource: z.enum(['catalog', 'manual']).nullable().optional(),
  materialSnapshot: z.object({
    nameZh: z.string().trim().min(1).max(255),
    nameFr: z.string().trim().min(1).max(255).nullable(),
    model: z.string().trim().min(1).max(255),
    specification: z.string().trim().min(1).max(2000),
  }),
  supplierId: uuidSchema.nullable(),
  supplierSnapshot: z
    .object({ id: uuidSchema, name: z.string().trim().min(1).max(255) })
    .nullable(),
  currency: currencySchema,
  quantity: positiveQuantitySchema,
  unit: z.string().trim().min(1).max(64),
  unitPriceMinor: nonNegativeMinorSchema,
  lineDiscount: adjustmentSchema,
  lineFreight: adjustmentSchema,
  freightIncluded: z.boolean(),
  sortOrder: z.number().int().min(0),
})

export const requisitionDraftSchema = z.object({
  id: uuidSchema,
  displayNo: z.string().trim().min(1).max(128),
  countryId: uuidSchema,
  projectId: uuidSchema,
  site: z.string().trim().min(1).max(255),
  departmentId: uuidSchema,
  teamId: uuidSchema,
  applicantId: uuidSchema,
  currency: currencySchema,
  primaryCurrency: currencySchema,
  languagePair: documentLanguagePairSchema,
  urgency: z.enum(['low', 'normal', 'high']),
  urgencyReason: z.string().trim().min(1).max(1000).nullable(),
  orderDate: z.string().date(),
  deliveryAddress: z.string().trim().min(1).max(1000),
  expectedDeliveryDate: z.string().date().nullable(),
  notes: z.string().trim().max(4000).nullable(),
  orderDiscount: adjustmentSchema,
  orderFreight: adjustmentSchema,
  taxRateBasisPoints: z.number().int().min(0).max(100_000),
  lines: z.array(requisitionLineSchema).min(1).max(500),
})

export type Adjustment = z.infer<typeof adjustmentSchema>
export type RequisitionLine = z.infer<typeof requisitionLineSchema>
export type RequisitionDraft = z.infer<typeof requisitionDraftSchema>

export type DraftTotals = {
  subtotalMinor: string
  lineDiscountMinor: string
  orderDiscountMinor: string
  freightMinor: string
  taxMinor: string
  totalMinor: string
  sourceCurrencyTotals: Array<{ currency: Currency; totalMinor: string }>
  lineTotals: Array<{ lineId: string; lineTotalMinor: string }>
}

export function calculateDraftTotals(draft: RequisitionDraft): DraftTotals {
  requisitionDraftSchema.parse(draft)
  let subtotal = 0n
  let lineDiscount = 0n
  let lineFreight = 0n
  const sourceTotals = new Map<Currency, bigint>()
  const lineTotals = draft.lines.map((line) => {
    const lineSubtotal = multiplyMinorByQuantity(
      line.unitPriceMinor,
      line.quantity,
    )
    const discount = adjustmentAmount(lineSubtotal, line.lineDiscount, true)
    const freight = line.freightIncluded
      ? 0n
      : adjustmentAmount(lineSubtotal - discount, line.lineFreight, false)
    subtotal += lineSubtotal
    lineDiscount += discount
    lineFreight += freight
    sourceTotals.set(
      line.currency,
      (sourceTotals.get(line.currency) ?? 0n) +
        lineSubtotal -
        discount +
        freight,
    )
    return {
      lineId: line.id,
      lineTotalMinor: (lineSubtotal - discount + freight).toString(),
    }
  })
  const afterLineDiscount = subtotal - lineDiscount
  if (sourceTotals.size > 1) {
    if (
      draft.taxRateBasisPoints !== 0 ||
      !isZeroAdjustment(draft.orderDiscount) ||
      !isZeroAdjustment(draft.orderFreight)
    ) {
      throw new RangeError(
        'Mixed-currency parent orders require tax, discount and freight on supplier child orders.',
      )
    }
    return {
      subtotalMinor: '0',
      lineDiscountMinor: '0',
      orderDiscountMinor: '0',
      freightMinor: '0',
      taxMinor: '0',
      totalMinor: '0',
      sourceCurrencyTotals: [...sourceTotals].map(([currency, total]) => ({
        currency,
        totalMinor: total.toString(),
      })),
      lineTotals,
    }
  }
  const orderDiscount = adjustmentAmount(
    afterLineDiscount,
    draft.orderDiscount,
    true,
  )
  const orderFreight = adjustmentAmount(
    afterLineDiscount - orderDiscount,
    draft.orderFreight,
    false,
  )
  const freight = lineFreight + orderFreight
  const taxable = afterLineDiscount - orderDiscount + freight
  const tax = divideRoundHalfUp(
    taxable * BigInt(draft.taxRateBasisPoints),
    10_000n,
  )
  return {
    subtotalMinor: subtotal.toString(),
    lineDiscountMinor: lineDiscount.toString(),
    orderDiscountMinor: orderDiscount.toString(),
    freightMinor: freight.toString(),
    taxMinor: tax.toString(),
    totalMinor: (taxable + tax).toString(),
    sourceCurrencyTotals: [
      { currency: draft.currency, totalMinor: (taxable + tax).toString() },
    ],
    lineTotals,
  }
}

function isZeroAdjustment(adjustment: Adjustment): boolean {
  return adjustment.kind === 'fixed_minor'
    ? adjustment.minor === '0'
    : adjustment.basisPoints === 0
}

function adjustmentAmount(
  base: bigint,
  adjustment: Adjustment,
  capAtBase: boolean,
): bigint {
  const amount =
    adjustment.kind === 'fixed_minor'
      ? BigInt(adjustment.minor)
      : divideRoundHalfUp(base * BigInt(adjustment.basisPoints), 10_000n)
  if (capAtBase && amount > base) {
    throw new RangeError('Adjustment cannot exceed its calculation base.')
  }
  return amount
}

function decimalRatio(value: string) {
  const [whole, fraction = ''] = value.split('.')
  const denominator = 10n ** BigInt(fraction.length)
  return {
    numerator: BigInt(whole) * denominator + BigInt(fraction || '0'),
    denominator,
  }
}

function currencyMinorDigits(currency: Currency) {
  return currency === 'XOF' || currency === 'XAF' ? 0 : 2
}
