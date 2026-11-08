import { describe, expect, it } from 'vitest'
import { documentNumber } from './document-number'

describe('business number display', () => {
  it('keeps valid saved business numbers verbatim', () => {
    expect(documentNumber('CI-P1-20261109-HPA-0001', 'Draft')).toBe(
      'CI-P1-20261109-HPA-0001',
    )
  })
  it('uses an explicit local label for missing or UUID-derived numbers', () => {
    for (const raw of [
      null,
      undefined,
      '',
      '  ',
      'REQ-00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001-CHILD-1',
    ])
      expect(documentNumber(raw, '未正式编号')).toBe('未正式编号')
  })
})
