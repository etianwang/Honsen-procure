import { describe, expect, it } from 'vitest'
import { homeMoney } from './home-messages'

describe('localized workbench amounts', () => {
  it('retains integer minor precision beyond Number range', () => {
    expect(homeMoney('900719925474099312', 'EUR', 'en')).toContain(
      '9,007,199,254,740,993.12',
    )
    expect(homeMoney('12345', 'EUR', 'fr')).toMatch(/123,45/)
    expect(homeMoney('12345', 'USD', 'zh')).toMatch(/123\.45/)
    expect(homeMoney('250', 'XOF', 'en')).toContain('250')
    expect(homeMoney('250', 'XOF', 'en')).not.toContain('.00')
  })
  it('does not reinterpret malformed money or unsupported currency', () => {
    expect(() => homeMoney('1.2', 'EUR', 'en')).toThrow()
    expect(() => homeMoney('1', 'GBP', 'fr')).toThrow()
  })
})
