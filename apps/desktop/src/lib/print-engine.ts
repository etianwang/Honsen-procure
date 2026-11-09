export const printDesignTokens = {
  compact: {
    headerHeight: 24,
    summaryCellPadding: 0.35,
    sectionGap: 1.5,
    tableCellPadding: 1,
    primaryFontSize: 9,
    lineHeight: 1.22,
  },
  paperSize: 'A4',
  orientation: 'portrait',
  widthMm: 210,
  heightMm: 297,
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  headerHeight: 29,
  footerHeight: 9,
  titleFontSize: 17,
  primaryFontSize: 9.5,
  secondaryFontSize: 8,
  tableFontSize: 9.5,
  totalFontSize: 12,
  minReadableFontSize: 8,
  lineHeight: 1.32,
  tableCellPadding: 2,
  sectionGap: 3,
  summaryWidthRatio: 0.52,
  summaryCellPadding: 0.55,
  summaryLineHeight: 1.2,
  pageNumberFormat: 'Page X / Y',
  repeatTableHeader: true,
  preferSinglePage: true,
  paginationStrategy: 'measured-standard-compact',
} as const
export type PrintLayoutConfig = typeof printDesignTokens
export type PrintPage = { rows: number[]; summary: boolean; metadata: boolean }
export type MeasuredLayout = {
  capacity: number
  metadata: number
  tableHeader: number
  rows: number[]
  summary: number
}
/** Heights come from the same font-loaded DOM that is sent to WebView2 print. */
export function paginateMeasured(m: MeasuredLayout): PrintPage[] {
  if (
    [m.capacity, m.metadata, m.tableHeader, m.summary, ...m.rows].some(
      (n) => !Number.isFinite(n) || n < 0,
    ) ||
    m.capacity <= 0
  )
    throw Error('Invalid print measurements')
  if (m.summary > m.capacity) throw Error('Summary exceeds readable A4 page')
  const pages: PrintPage[] = []
  let page: PrintPage = { rows: [], summary: false, metadata: true }
  let used = m.metadata
  for (let i = 0; i < m.rows.length; i++) {
    const height = m.rows[i]! + (page.rows.length ? 0 : m.tableHeader)
    if (used + height > m.capacity + 0.1) {
      if (page.rows.length === 0)
        throw Error('Material or metadata exceeds readable A4 page')
      pages.push(page)
      page = { rows: [], summary: false, metadata: false }
      used = 0
    }
    const next = m.rows[i]! + (page.rows.length ? 0 : m.tableHeader)
    if (next > m.capacity) throw Error('Material exceeds readable A4 page')
    page.rows.push(i)
    used += next
  }
  if (used + m.summary > m.capacity + 0.1) {
    // Keep the last material with the settlement where it fits; never isolate signatures.
    const last = page.rows.at(-1)
    if (
      last !== undefined &&
      page.rows.length > 1 &&
      m.rows[last]! + m.tableHeader + m.summary <= m.capacity
    ) {
      page.rows.pop()
      pages.push(page)
      page = { rows: [last], summary: true, metadata: false }
    } else {
      pages.push(page)
      page = { rows: [], summary: true, metadata: false }
    }
  } else page.summary = true
  pages.push(page)
  return pages
}
export function fitsSinglePage(m: MeasuredLayout) {
  return (
    m.metadata +
      m.tableHeader +
      m.rows.reduce((a, b) => a + b, 0) +
      m.summary <=
    m.capacity + 0.1
  )
}
export function pageNumber(page: number, total: number) {
  return `Page ${page} / ${total}`
}
