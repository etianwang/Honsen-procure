import { describe, it, expect } from 'vitest'
import { formatPrintMoney } from './formal-print-api'
describe('formal stamp money display', () => {
  it('keeps CFA francs integral and cent currencies in minor units', () => {
    expect(formatPrintMoney('37', 'XAF')).toBe('37 XAF')
    expect(formatPrintMoney('37', 'XOF')).toBe('37 XOF')
    expect(formatPrintMoney('37', 'USD')).toBe('0.37 USD')
    expect(formatPrintMoney('100', 'ETB')).toBe('1.00 ETB')
  })
})
