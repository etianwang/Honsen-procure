import { defaultPrintLanguage } from './formal-print-api'
import { describe, expect, it } from 'vitest'
import {
  legacyPrintLanguage,
  permittedPrintLanguages,
  validatePrintLanguage,
} from './formal-print-api'

describe('frozen print language presentation', () => {
  it('preserves legacy defaults without rewriting the frozen pair', () => {
    expect(legacyPrintLanguage('zh_fr')).toBe('zh')
    expect(legacyPrintLanguage('zh_en')).toBe('en')
  })
  it('allows both approved French/Chinese hierarchies', () => {
    expect(permittedPrintLanguages('zh_fr')).toEqual(['zh', 'fr'])
    expect(validatePrintLanguage('zh_fr', 'fr')).toBe('fr')
    expect(validatePrintLanguage('zh_fr', 'zh')).toBe('zh')
  })
  it('blocks requesting an unfrozen translation', () => {
    expect(validatePrintLanguage('zh_en', 'en')).toBe('en')
    expect(() => validatePrintLanguage('zh_en', 'fr')).toThrow('frozen')
    expect(() => validatePrintLanguage('zh_fr', 'en')).toThrow('frozen')
  })
})

it('defaults CI/CM formal documents to French inside the frozen pair', () => {
  expect(
    defaultPrintLanguage({
      formalDocumentNo: 'CI-P-TEST',
      languagePair: 'zh_fr',
    }),
  ).toBe('fr')
  expect(
    defaultPrintLanguage({
      formalDocumentNo: 'CM-P-TEST',
      languagePair: 'zh_fr',
    }),
  ).toBe('fr')
  expect(
    defaultPrintLanguage({
      formalDocumentNo: 'CI-P-TEST',
      languagePair: 'zh_en',
    }),
  ).toBe('en')
})
