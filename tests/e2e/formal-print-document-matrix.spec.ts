import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

for (const kind of ['HPA', 'SPO', 'OPA'] as const) {
  for (const languagePair of ['zh_fr', 'zh_en'] as const) {
    test(`${kind} ${languagePair} preserves long bilingual lines in multipage PDF`, async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/')
      await page.evaluate(
        async ({ kind, languagePair }) => {
          const load = (path: string) => import(/* @vite-ignore */ path)
          const React = await load('/node_modules/.vite/deps/react.js')
          const ReactDOM = await load(
            '/node_modules/.vite/deps/react-dom_client.js',
          )
          const { FormalPrintPreview } = await load(
            '/src/components/FormalPrintPreview.tsx',
          )
          Object.assign(window, {
            print: () => {},
            __TAURI__: {
              core: {
                invoke: async () => ({
                  formalDocumentNo: `TEST-${kind}-${languagePair}`,
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
                  documentType: kind,
                  languagePair,
                  projectId: '10000000-0000-4000-8000-000000000001',
                  site: 'TEST site',
                  orderDate: '2026-11-08',
                  deliveryAddress: 'TEST delivery',
                  expectedDeliveryDate: null,
                  notes: null,
                  currency: 'XOF',
                  subtotalMinor: '6400',
                  lineDiscountMinor: '0',
                  orderDiscountMinor: '0',
                  freightMinor: '0',
                  taxMinor: '0',
                  totalMinor: '6400',
                  taxRateBasisPoints: 0,
                  selfApproved: false,
                  supplier: null,
                  lines: Array.from({ length: 64 }, (_, i) => ({
                    nameZh: `TEST 长材料名称多页验收 第${i + 1}行`,
                    nameFr:
                      languagePair === 'zh_fr'
                        ? `TEST Matériau électrique accentué numéro ${i + 1}`
                        : null,
                    nameEn:
                      languagePair === 'zh_en'
                        ? `TEST long electrical material number ${i + 1}`
                        : null,
                    model: null,
                    specification: 'TEST 100 mm',
                    quantity: '1',
                    unit: 'PCS',
                    currency: 'XOF',
                    unitPriceMinor: '100',
                    lineTotalMinor: '100',
                  })),
                }),
              },
            },
          })
          const host = document.createElement('div')
          document.body.replaceChildren(host)
          const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot
          createRoot(host).render(
            (React.createElement ?? React.default.createElement)(
              FormalPrintPreview,
              { orderId: '10000000-0000-4000-8000-000000000001' },
            ),
          )
        },
        { kind, languagePair },
      )
      await page
        .getByRole('button', { name: '正式单据预览 / Aperçu', exact: true })
        .click()
      await expect(page.locator('.print-materials tbody tr')).toHaveCount(64)
      await expect(page.locator('.formal-company-name').first()).toHaveText(
        '深圳市弘盛优创机电工程设计有限公司',
      )
      await expect(
        page.locator('.formal-company-logo').first(),
      ).toHaveAttribute('src', '/print/honsen-approved-logo-v1.png')
      await page
        .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
        .click()
      await expect(page.locator('body > .honsen-print-root')).toHaveCount(1)
      await expect(
        page.locator('.honsen-print-root [data-layout-ready]'),
      ).toHaveCount(1)
      const output = resolve(
        '.cache/t12-print-matrix',
        `${kind}-${languagePair}`,
      )
      mkdirSync(output, { recursive: true })
      const pdf = await page.pdf({
        path: resolve(output, 'document.pdf'),
        preferCSSPageSize: true,
        printBackground: true,
      })
      const pageCount =
        pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
      expect(pageCount).toBeGreaterThan(1)
      const loadingTask = getDocument({ data: new Uint8Array(pdf) })
      const parsed = await loadingTask.promise
      expect(parsed.numPages).toBe(pageCount)
      const firstOperators = await (await parsed.getPage(1)).getOperatorList()
      expect(firstOperators.fnArray).toContain(OPS.paintImageXObject)
      const pageTexts: string[] = []
      for (let number = 1; number <= parsed.numPages; number++) {
        const printed = await parsed.getPage(number)
        expect(printed.view[2]).toBeCloseTo(595, 0)
        expect(printed.view[3]).toBeCloseTo(842, 0)
        pageTexts.push(
          (await printed.getTextContent()).items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' '),
        )
      }
      const text = pageTexts.join('\n')
      expect(text.normalize('NFKC').replace(/\s/g, '')).toContain(
        '深圳市弘盛优创机电工程设计有限公司',
      )
      expect(text).toContain(`TEST-${kind}-${languagePair}`)
      expect(text).toContain(
        languagePair === 'zh_fr'
          ? 'TEST Matériau électrique accentué numéro 64'
          : 'TEST long electrical material number 64',
      )
      expect(text).toMatch(/(?:TOTAL TTC|TOTAL)[\s\S]{0,40}6400 XOF/)
      expect(text).toContain('6400 XOF')
      expect(text).not.toContain('NaN')
      await loadingTask.destroy()
      writeFileSync(
        resolve(output, 'receipt.json'),
        JSON.stringify(
          {
            kind,
            languagePair,
            pageCount,
            bytes: pdf.length,
            amountMinor: '6400',
            currency: 'XOF',
            errors,
          },
          null,
          2,
        ),
      )
      expect(errors).toEqual([])
    })
  }
}
