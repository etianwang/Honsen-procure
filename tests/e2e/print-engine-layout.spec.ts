import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Generator acceptance only: browser directly mounts the production layout.
// This fixture does not prove Windows installation, business authorization or native save.
for (const [li, language] of (['fr', 'zh', 'en'] as const).entries()) {
  for (const [ri, count] of [1, 5, 10, 20, 50, 1].entries()) {
    const currency = ['XOF', 'XAF', 'CNY', 'USD', 'EUR', 'EUR'][ri]!
    const maximum = ri === 5
    const kind = (['HPA', 'SPO', 'OPA'] as const)[li]!
    test(`generator ${kind} ${language} ${currency} ${count} measured rows maximum=${maximum}`, async ({
      page,
    }) => {
      await page.goto('/')
      await page.evaluate(
        async ({ language, count, currency, kind, maximum }) => {
          const load = (path: string) => import(/* @vite-ignore */ path)
          const React = await load('/node_modules/.vite/deps/react.js')
          const ReactDOM = await load(
            '/node_modules/.vite/deps/react-dom_client.js',
          )
          const { FormalDocumentSheet } = await load(
            '/src/components/PrintEngine.tsx',
          )
          await load('/src/components/FormalPrintPreview.css')
          const doc = {
            formalDocumentNo: `TEST-${kind}-${language}-${count}`,
            documentType: kind,
            languagePair: language === 'en' ? 'zh_en' : 'zh_fr',
            projectId: '10000000-0000-4000-8000-000000000001',
            site: 'TEST Bethel',
            orderDate: '2026-11-08',
            deliveryAddress: 'TEST Delivery',
            expectedDeliveryDate: null,
            notes: null,
            currency,
            subtotalMinor: maximum
              ? '9223372036854775807'
              : String(count * 100),
            lineDiscountMinor: '0',
            orderDiscountMinor: '0',
            freightMinor: '0',
            taxMinor: '0',
            manualStampDutyMinor: '0',
            totalMinor: maximum ? '9223372036854775807' : String(count * 100),
            taxRateBasisPoints: 0,
            selfApproved: false,
            supplier: null,
            printProfile: {
              schemaVersion: 1,
              profileVersion: 'v1-20261108',
              legalNameZh: '深圳市弘盛优创机电工程设计有限公司',
              logo: {
                assetId: 'honsen-approved-logo-v1',
                sha256:
                  '0f733cc13c7086deb17668e9e7103e798d006493370f3b66340e9214e7b70751',
                mimeType: 'image/png',
              },
            },
            lines: Array.from({ length: count }, (_, i) => ({
              nameZh: `TESTROW${String(i).padStart(3, '0')}END 中文电气材料${count >= 20 ? '超长名称和技术规格用于验证自动换行及完整分页'.repeat(2) : ''}`,
              nameFr: `Matériau électrique éèêàçùœ ${count >= 20 ? 'câble à isolation renforcée pour installation industrielle '.repeat(2) : ''}`,
              nameEn: 'TEST Electrical material',
              model: 'M',
              specification: 'TEST 100 mm',
              quantity: '1',
              unit: 'PCS',
              currency,
              unitPriceMinor: maximum ? '9223372036854775807' : '100',
              lineTotalMinor: maximum ? '9223372036854775807' : '100',
            })),
          }
          const host = document.createElement('div')
          host.className = 'honsen-print-root'
          document.body.replaceChildren(host)
          document.body.className = 'honsen-printing-formal'
          ;(ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host).render(
            (React.createElement ?? React.default.createElement)(
              FormalDocumentSheet,
              { document: doc, primaryLanguage: language },
            ),
          )
        },
        { language, count, currency, kind, maximum },
      )
      await expect(
        page.locator('.print-engine[data-layout-ready="true"]'),
      ).toHaveCount(1)
      await page.emulateMedia({ media: 'print' })
      const sheets = page.locator('.formal-print-sheet')
      const pages = await sheets.count()
      if (count <= 5 && !maximum) expect(pages).toBe(1)
      if (count >= 20) expect(pages).toBeGreaterThan(1)
      expect(await page.locator('.print-materials tbody tr').count()).toBe(
        count,
      )
      expect(await page.locator('.print-summary tr').count()).toBe(8)
      const geometry = await page
        .locator('.formal-page-content')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect()
            return Array.from(node.children).every((child) => {
              const b = child.getBoundingClientRect()
              return (
                b.bottom <= r.bottom + 1 &&
                b.right <= r.right + 1 &&
                b.left >= r.left - 1
              )
            })
          }),
        )
      expect(geometry.every(Boolean)).toBe(true)
      const dir = resolve('.cache/print-engine-layout')
      mkdirSync(dir, { recursive: true })
      const bytes = await page.pdf({
        path: resolve(
          dir,
          `${kind}-${language}-${currency}-${count}-${maximum}.pdf`,
        ),
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        printBackground: true,
      })
      // Skia can embed CJK as searchable Type3 glyph programs rather than FontFile2.
      const rawPdf = bytes.toString('latin1')
      expect(
        /\/FontFile[23]?\b/.test(rawPdf) ||
          (/\/Subtype\s*\/Type3\b/.test(rawPdf) &&
            /\/CharProcs\b/.test(rawPdf) &&
            /\/ToUnicode\b/.test(rawPdf)),
      ).toBe(true)
      const task = getDocument({ data: new Uint8Array(bytes) })
      const pdf = await task.promise
      expect(pdf.numPages).toBe(pages)
      let all = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i)
        expect(p.view[2]).toBeCloseTo(595, -1)
        expect(p.view[3]).toBeCloseTo(842, -1)
        const text = (await p.getTextContent()).items
          .map((x) => ('str' in x ? x.str : ''))
          .join(' ')
          .normalize('NFKC')
        expect(
          text.match(new RegExp(`Page ${i} / ${pages}`, 'g')),
        ).toHaveLength(2)
        expect(text).toContain(`TEST-${kind}-${language}-${count}`)
        expect(text).not.toContain('10000000-0000')
        expect(text).not.toContain('127.0.0.1:5173')
        expect(text).not.toContain('tauri.localhost')
        expect(text).not.toContain('desktop')
        expect((await p.getOperatorList()).fnArray).toContain(OPS.setFont)
        all += text
      }
      for (let i = 0; i < count; i++)
        expect(
          all.match(new RegExp(`TESTROW${String(i).padStart(3, '0')}END`, 'g')),
        ).toHaveLength(1)
      expect(all).toContain(currency)
      await task.destroy()
    })
  }
}
