import { describe, expect, it } from 'vitest'
import { formatPrintMoney } from '../lib/formal-print-api'

describe('formal print integer money', () => {
  it('preserves large integers and negative cents without floating point', () => {
    expect(formatPrintMoney('900719925474099312', 'EUR')).toBe(
      '9007199254740993.12 EUR',
    )
    expect(formatPrintMoney('-1', 'USD')).toBe('-0.01 USD')
    expect(formatPrintMoney('250', 'XOF')).toBe('250 XOF')
    expect(formatPrintMoney('0', 'CNY')).toBe('0.00 CNY')
  })
  it('rejects fractional minor values and unsupported currencies', () => {
    expect(() => formatPrintMoney('1.2', 'EUR')).toThrow()
    expect(() => formatPrintMoney('12', 'GBP')).toThrow()
  })
})
