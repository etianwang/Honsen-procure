import { describe, it, expect } from 'vitest'
import {
  paginateMeasured,
  fitsSinglePage,
  pageNumber,
  printDesignTokens,
} from './print-engine'
describe('measured print pagination', () => {
  const base = {
    capacity: 100,
    metadata: 10,
    tableHeader: 5,
    rows: [20, 20],
    summary: 45,
  }
  it('keeps exact boundary on one page', () => {
    expect(fitsSinglePage(base)).toBe(true)
    expect(paginateMeasured(base)).toEqual([
      { rows: [0, 1], summary: true, metadata: true },
    ])
  })
  it('moves final line with complete settlement when just over boundary', () => {
    expect(paginateMeasured({ ...base, summary: 46 })).toEqual([
      { rows: [0], summary: false, metadata: true },
      { rows: [1], summary: true, metadata: false },
    ])
  })
  it('retains each row once and repeated header capacity', () => {
    for (const count of [1, 5, 10, 20, 50]) {
      const pages = paginateMeasured({
        ...base,
        rows: Array(count).fill(12),
        summary: 30,
      })
      expect(pages.flatMap((p) => p.rows)).toEqual(
        Array.from({ length: count }, (_, i) => i),
      )
      expect(pages.filter((p) => p.summary)).toHaveLength(1)
      expect(pages.every((p) => p.rows.length || p.summary)).toBe(true)
    }
  })
  it('rejects unprintable readable rows and summary rather than clipping', () => {
    expect(() => paginateMeasured({ ...base, rows: [101] })).toThrow()
    expect(() => paginateMeasured({ ...base, summary: 101 })).toThrow()
    expect(() => paginateMeasured({ ...base, rows: [NaN] })).toThrow()
  })
  it('uses one A4 policy and explicit total-page numbering', () => {
    expect(printDesignTokens.minReadableFontSize).toBeGreaterThanOrEqual(8)
    expect(pageNumber(2, 3)).toBe('Page 2 / 3')
  })
})
