import { z } from 'zod'
import { uiLocaleSchema, type UiLocale } from './contracts.js'

export const currencySchema = z.enum(['XOF', 'XAF', 'CNY', 'USD', 'EUR', 'ETB'])
export type Currency = z.infer<typeof currencySchema>

export const currencyMinorDigits: Readonly<Record<Currency, number>> = {
  XOF: 0,
  XAF: 0,
  CNY: 2,
  USD: 2,
  EUR: 2,
  ETB: 2,
}

export const minorAmountSchema = z.string().regex(/^-?(0|[1-9]\d*)$/, {
  message: 'Minor amount must be an integer string.',
})

export const moneyDtoSchema = z.object({
  currency: currencySchema,
  minor: minorAmountSchema,
})

export type MoneyDto = z.infer<typeof moneyDtoSchema>

export const positiveQuantitySchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, {
    message: 'Quantity must have at most two decimal places.',
  })
  .refine((value) => quantityToHundredthsUnchecked(value) > 0n, {
    message: 'Quantity must be greater than zero.',
  })

export function parseMinorAmount(value: string): bigint {
  return BigInt(minorAmountSchema.parse(value))
}

export function formatMoney(money: MoneyDto, locale: UiLocale): string {
  const { currency, minor } = moneyDtoSchema.parse(money)
  const digits = currencyMinorDigits[currency]
  const divisor = 10n ** BigInt(digits)
  const value = parseMinorAmount(minor)
  const whole = abs(value / divisor)
  const fraction = abs(value % divisor)
  const formatter = new Intl.NumberFormat(uiLocaleSchema.parse(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  const group =
    formatter.formatToParts(1000).find((part) => part.type === 'group')
      ?.value ?? ','
  const template = formatter.formatToParts(value < 0n ? -1 : 0)
  const integer = groupDigits(whole.toString(), group)
  const fractionText = fraction.toString().padStart(digits, '0')

  return template
    .map((part) => {
      if (part.type === 'integer') return integer
      if (part.type === 'fraction') return fractionText
      return part.value
    })
    .join('')
}

export function quantityToHundredths(value: string): bigint {
  return quantityToHundredthsUnchecked(positiveQuantitySchema.parse(value))
}

export function multiplyMinorByQuantity(
  unitPriceMinor: string,
  quantity: string,
): bigint {
  const price = parseMinorAmount(unitPriceMinor)
  if (price < 0n) throw new RangeError('Unit price must be non-negative.')

  return divideRoundHalfUp(price * quantityToHundredths(quantity), 100n)
}

export function divideRoundHalfUp(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError(
      'Only non-negative numerators and positive denominators are supported.',
    )
  }

  return (numerator + denominator / 2n) / denominator
}

function quantityToHundredthsUnchecked(value: string): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}

function groupDigits(value: string, separator: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
}
