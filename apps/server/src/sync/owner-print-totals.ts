import {
  adjustmentSchema,
  calculateOwnerLinePrice,
  currencySchema,
  multiplyMinorByQuantity,
  divideRoundHalfUp,
  manualStampDutyMinorSchema,
} from '@honsen/shared'

type Rule = ReturnType<typeof adjustmentSchema.parse>
const limit = (value: bigint) => {
  if (value < 0n || value > 9223372036854775807n)
    throw Error('Owner amount out of range')
  return value.toString()
}
const amount = (base: bigint, rule: Rule, cap: boolean) => {
  const result =
    rule.kind === 'fixed_minor'
      ? BigInt(rule.minor)
      : divideRoundHalfUp(base * BigInt(rule.basisPoints), 10000n)
  if (cap && result > base) throw Error('Discount exceeds base')
  limit(result)
  return result
}
/** Independently derive owner-facing totals; never accept renderer totals. */
export function calculateOwnerPrintTotals(
  payload: Record<string, unknown>,
  orderDiscount: unknown,
  orderFreight: unknown,
) {
  const currency = currencySchema.parse(payload.primaryCurrency)
  if (!Array.isArray(payload.lines) || payload.lines.length === 0)
    throw Error('Missing owner lines')
  let subtotal = 0n,
    discounts = 0n,
    freight = 0n
  const lines = payload.lines.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw Error('Invalid owner line')
    const line = value as Record<string, unknown>
    const rate = String(line.ownerLockedExchangeRateDecimal)
    if (
      !/^\d+(?:\.\d{1,8})?$/.test(rate) ||
      BigInt(rate.replace('.', '')) <= 0n
    )
      throw Error('Invalid frozen rate')
    const base = multiplyMinorByQuantity(
      String(line.ownerFinalUnitPriceMinor),
      String(line.quantity),
    )
    const convertRule = (raw: unknown): Rule => {
      if (typeof raw !== 'string') throw Error('Missing line rule')
      const rule = adjustmentSchema.parse(JSON.parse(raw))
      if (rule.kind !== 'fixed_minor') return rule
      const converted = calculateOwnerLinePrice({
        lineId: String(line.id),
        sourceCurrency: currencySchema.parse(line.currency),
        primaryCurrency: currency,
        lockedExchangeRateDecimal: String(line.ownerLockedExchangeRateDecimal),
        sourceUnitPriceMinor: rule.minor,
        markup: { kind: 'fixed_minor', minor: '0' },
      })
      return {
        kind: 'fixed_minor',
        minor: converted.convertedReferenceUnitMinor,
      }
    }
    const discount = amount(base, convertRule(line.lineDiscountJson), true)
    const extra =
      line.freightIncluded === true
        ? 0n
        : amount(base - discount, convertRule(line.lineFreightJson), false)
    subtotal += base
    discounts += discount
    freight += extra
    return {
      id: line.id,
      subtotalMinor: limit(base),
      discountMinor: limit(discount),
      freightMinor: limit(extra),
      totalMinor: limit(base - discount + extra),
    }
  })
  const orderDiscountMinor = amount(
    subtotal - discounts,
    adjustmentSchema.parse(orderDiscount),
    true,
  )
  freight += amount(
    subtotal - discounts - orderDiscountMinor,
    adjustmentSchema.parse(orderFreight),
    false,
  )
  const taxable = subtotal - discounts - orderDiscountMinor + freight
  const taxRate = payload.taxRateBasisPoints
  if (
    typeof taxRate !== 'number' ||
    !Number.isInteger(taxRate) ||
    taxRate < 0 ||
    taxRate > 100000
  )
    throw Error('Invalid tax rate')
  const tax = divideRoundHalfUp(taxable * BigInt(taxRate), 10000n)
  const stamp = BigInt(
    manualStampDutyMinorSchema.parse(payload.manualStampDutyMinor ?? '0'),
  )
  return {
    version: 1,
    currency,
    lines,
    subtotalMinor: limit(subtotal),
    lineDiscountMinor: limit(discounts),
    orderDiscountMinor: limit(orderDiscountMinor),
    freightMinor: limit(freight),
    taxMinor: limit(tax),
    ...(payload.manualStampDutyMinor !== undefined
      ? { manualStampDutyMinor: limit(stamp) }
      : {}),
    totalMinor: limit(taxable + tax + stamp),
  }
}
