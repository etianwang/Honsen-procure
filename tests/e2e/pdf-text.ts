import type { PDFPageProxy } from 'pdfjs-dist'

export async function readPdfText(page: PDFPageProxy): Promise<string> {
  const { items } = await page.getTextContent()
  // Font or glyph run boundaries can split a word, even within one font.
  // Preserve the spaces and line breaks reported by PDF.js, without adding
  // a separator between every run.
  return items
    .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
    .join('')
    .normalize('NFKC')
}
