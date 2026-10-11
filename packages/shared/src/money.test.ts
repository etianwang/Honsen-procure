import { describe, expect, it } from 'vitest'
import {
  divideRoundHalfUp,
  formatMoney,
  multiplyMinorByQuantity,
  positiveQuantitySchema,
  quantityToHundredths,
} from './index.js'

describe('money contracts', () => {
  it('formats each supported currency from an integer transport value', () => {
    expect(formatMoney({ currency: 'XOF', minor: '1234' }, 'fr-FR')).toContain(
      '1',
    )
    expect(formatMoney({ currency: 'CNY', minor: '1234' }, 'zh-CN')).toContain(
      '12.34',
    )
    expect(formatMoney({ currency: 'USD', minor: '1234' }, 'en-US')).toContain(
      '12.34',
    )
    expect(formatMoney({ currency: 'EUR', minor: '1234' }, 'fr-FR')).toContain(
      '12,34',
    )
  })

  it('parses quantities without using floating point arithmetic', () => {
    expect(quantityToHundredths('2.5')).toBe(250n)
    expect(quantityToHundredths('3.01')).toBe(301n)
    expect(() => positiveQuantitySchema.parse('0')).toThrow()
    expect(() => positiveQuantitySchema.parse('1.234')).toThrow()
  })

  it('rounds multiplication half up in minor units', () => {
    expect(multiplyMinorByQuantity('5', '0.5')).toBe(3n)
    expect(multiplyMinorByQuantity('123', '2.5')).toBe(308n)
    expect(divideRoundHalfUp(5n, 2n)).toBe(3n)
  })
})
