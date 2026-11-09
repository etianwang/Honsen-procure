import { describe, it, expect } from 'vitest'
import { amountInWords as w } from './amount-words'
describe('integer currency words', () => {
  it('preserves currency precision and identity', () => {
    expect(w('36000', 'XOF', 'fr')).toBe('trente-six-mille francs CFA BCEAO')
    expect(w('36000', 'XAF', 'fr')).toContain('BEAC')
    expect(w('101', 'CNY', 'zh')).toBe('人民币壹元零壹分')
    expect(w('-101', 'USD', 'en')).toBe('minus one US dollar and one cent')
  })
  it('handles French composition', () => {
    for (const [n, s] of [
      ['71', 'soixante-et-onze'],
      ['80', 'quatre-vingts'],
      ['81', 'quatre-vingt-un'],
      ['200', 'deux-cents'],
      ['201', 'deux-cent-un'],
      ['80000', 'quatre-vingt-mille'],
    ])
      expect(w(n!, 'XOF', 'fr')).toBe(s + ' francs CFA BCEAO')
  })
  it('handles Chinese zero groups', () => {
    expect(w('100010001', 'XOF', 'zh')).toBe('西非法郎壹亿零壹万零壹整')
    expect(w('0', 'CNY', 'zh')).toBe('人民币零元整')
  })
  it('supports i64 boundaries and rejects invalid input', () => {
    for (const l of ['zh', 'fr', 'en'] as const)
      expect(w('9223372036854775807', 'EUR', l)).toBeTruthy()
    expect(() => w('9223372036854775808', 'EUR', 'en')).toThrow()
    expect(() => w('1.1', 'EUR', 'en')).toThrow()
    expect(() => w('1', 'GBP', 'en')).toThrow()
  })
})

describe('independent golden boundaries', () => {
  it.each([
    ['0', '零'],
    ['1', '壹'],
    ['10', '壹拾'],
    ['100', '壹佰'],
    ['1001', '壹仟零壹'],
    ['10000', '壹万'],
    ['100000001', '壹亿零壹'],
    ['100010000', '壹亿零壹万'],
    ['100010001', '壹亿零壹万零壹'],
    ['100001000', '壹亿零壹仟'],
    ['100100000', '壹亿零壹拾万'],
  ])('Chinese groups %s', (n, expected) =>
    expect(w(n, 'XOF', 'zh')).toBe('西非法郎' + expected + '整'),
  )
  it.each([
    ['70', 'soixante-dix'],
    ['71', 'soixante-et-onze'],
    ['80', 'quatre-vingts'],
    ['81', 'quatre-vingt-un'],
    ['91', 'quatre-vingt-onze'],
    ['200', 'deux-cents'],
    ['201', 'deux-cent-un'],
    ['200000', 'deux-cent-mille'],
    ['80000000', 'quatre-vingts-millions de'],
    ['1000000', 'un-million de'],
    ['1000000000', 'un-milliard de'],
  ])('French golden %s', (n, expected) =>
    expect(w(n, 'XOF', 'fr')).toBe(expected + ' francs CFA BCEAO'),
  )
  it('English zero plural and exact cents', () => {
    expect(w('0', 'USD', 'en')).toBe('zero US dollars')
    expect(w('5', 'USD', 'en')).toBe('zero US dollars and five cents')
    expect(w('50', 'EUR', 'en')).toBe('zero euros and fifty cents')
    expect(w('101', 'EUR', 'en')).toBe('one euro and one cent')
    expect(w('1000000000', 'XOF', 'en')).toBe(
      'one billion West African CFA francs',
    )
  })
  it('all currencies and signed boundaries', () => {
    for (const currency of ['XOF', 'XAF', 'CNY', 'USD', 'EUR', 'ETB'])
      for (const language of ['zh', 'fr', 'en'] as const) {
        for (const value of [
          '0',
          '1',
          '-1',
          '5',
          '50',
          '101',
          '9223372036854775807',
          '-9223372036854775808',
        ]) {
          const output = w(value, currency, language)
          expect(output).not.toMatch(/undefined|NaN/)
          expect(output.length).toBeGreaterThan(2)
        }
        expect(() => w('-9223372036854775809', currency, language)).toThrow()
      }
  })
})
