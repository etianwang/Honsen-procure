import { describe, expect, it } from 'vitest'
import {
  historyAuditText,
  historyMessageKeys,
  historyText,
} from './history-locale'

describe('history and preview UI catalog', () => {
  it('localizes recorded action codes and gives unknown codes a safe label', () => {
    expect(historyAuditText('zh', 'confirmed')).toBe('审批已确认')
    expect(historyAuditText('en', 'confirmed')).toBe('Approval recorded')
    expect(historyAuditText('fr', 'confirmed')).toBe('Approbation enregistrée')
    for (const locale of ['zh', 'en', 'fr'] as const) {
      expect(historyAuditText(locale, 'future_untranslated_action')).toBe(
        historyText(locale, '其他历史操作'),
      )
      expect(historyAuditText(locale, 'formally_issued')).not.toContain(
        'formally_issued',
      )
      expect(
        historyAuditText(locale, 'supplier_terms_completed'),
      ).not.toContain('supplier_terms_completed')
    }
  })
  it('covers every declared label in English and French while preserving Chinese selectors', () => {
    for (const key of historyMessageKeys) {
      expect(historyText('zh', key)).toBe(key)
      for (const locale of ['en', 'fr'] as const) {
        const translated = historyText(locale, key)
        expect(translated.trim()).not.toBe('')
        expect(translated).not.toMatch(/\p{Script=Han}/u)
      }
    }
  })
})
