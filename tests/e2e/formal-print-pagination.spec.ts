import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

test('only the selected frozen document prints in body flow without hidden shell pages', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = await load('/node_modules/.vite/deps/react.js')
    const ReactDOM = await load('/node_modules/.vite/deps/react-dom_client.js')
    const { FormalPrintPreview } = await load(
      '/src/components/FormalPrintPreview.tsx',
    )
    const element = React.createElement ?? React.default.createElement
    Object.assign(window, {
      __printCalls: 0,
      print: () => {
        ;(window as unknown as { __printCalls: number }).__printCalls++
      },
      __TAURI__: {
        core: {
          invoke: async (_command: string, args: { orderId: string }) => ({
            formalDocumentNo: args.orderId,
            documentType: 'SPO',
            languagePair: 'zh_fr',
            projectId: '10000000-0000-4000-8000-000000000001',
            site: 'Synthetic site',
            orderDate: '2026-11-04',
            deliveryAddress: 'Synthetic address',
            expectedDeliveryDate: null,
            notes: 'Frozen terms',
            currency: 'XOF',
            subtotalMinor: '200',
            lineDiscountMinor: '0',
            orderDiscountMinor: '0',
            freightMinor: '0',
            taxMinor: '0',
            totalMinor: '200',
            taxRateBasisPoints: 0,
            selfApproved: false,
            supplier: null,
            lines: [1, 2].map((n) => ({
              nameZh: '合成电缆' + n,
              nameFr: 'Câble synthétique ' + n,
              model: 'M',
              specification: '3×2.5',
              quantity: '1',
              unit: '米',
              currency: 'XOF',
              unitPriceMinor: '100',
              lineTotalMinor: '100',
            })),
          }),
        },
      },
    })
    const host = document.createElement('div')
    host.id = 'synthetic-shell'
    document.body.replaceChildren(host)
    const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot
    const reactRoot = createRoot(host)
    Object.assign(window, {
      __unmountPrintFixture: () => reactRoot.unmount(),
      __remountPrintFixture: () =>
        createRoot(host).render(
          element(FormalPrintPreview, { orderId: 'SYNTHETIC-SPO-C' }),
        ),
    })
    reactRoot.render(
      element(
        'div',
        {
          style: {
            minHeight: '4000px',
            paddingTop: '1200px',
            position: 'relative',
          },
        },
        element(FormalPrintPreview, { orderId: 'SYNTHETIC-SPO-A' }),
        element(FormalPrintPreview, { orderId: 'SYNTHETIC-SPO-B' }),
      ),
    )
  })
  await page
    .getByRole('button', { name: '正式单据预览 / Aperçu', exact: true })
    .nth(0)
    .click()
  await page
    .getByRole('button', { name: '正式单据预览 / Aperçu', exact: true })
    .nth(1)
    .click()
  await page
    .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
    .nth(0)
    .click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __printCalls: number }).__printCalls,
      ),
    )
    .toBe(1)
  await expect(page.locator('body > .honsen-print-root')).toHaveCount(1)
  await expect(page.locator('.honsen-print-root')).toContainText(
    'SYNTHETIC-SPO-A',
  )
  await expect(page.locator('.honsen-print-root')).not.toContainText(
    'SYNTHETIC-SPO-B',
  )
  await page
    .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
    .nth(1)
    .click()
  await expect(page.locator('body > .honsen-print-root')).toHaveCount(1)
  await expect(page.locator('.honsen-print-root')).toContainText(
    'SYNTHETIC-SPO-A',
  )
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#synthetic-shell')).toBeHidden()
  expect((await page.locator('.honsen-print-root').boundingBox())?.y).toBe(0)
  const evidence = resolve('.cache/formal-print-pagination', randomUUID())
  mkdirSync(evidence, { recursive: true })
  const pdf = await page.pdf({
    path: resolve(evidence, 'selected-two-line.pdf'),
    preferCSSPageSize: true,
  })
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length).toBe(1)
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('body > .honsen-print-root')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveClass(/honsen-printing-formal/)
  await page
    .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
    .nth(1)
    .click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __printCalls: number }).__printCalls,
      ),
    )
    .toBe(2)
  await expect(page.locator('.honsen-print-root')).toContainText(
    'SYNTHETIC-SPO-B',
  )
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.honsen-print-root')).toHaveCount(0)
  await page.evaluate(() =>
    Object.defineProperty(document.fonts, 'ready', {
      configurable: true,
      value: new Promise(() => {}),
    }),
  )
  await page
    .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
    .nth(0)
    .click()
  await expect(page.locator('.honsen-print-root')).toHaveCount(1)
  await page.evaluate(() =>
    (
      window as unknown as { __unmountPrintFixture: () => void }
    ).__unmountPrintFixture(),
  )
  await expect(page.locator('.honsen-print-root')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveClass(/honsen-printing-formal/)
  await page.evaluate(() => {
    delete (document.fonts as unknown as { ready?: unknown }).ready
    ;(
      window as unknown as { __remountPrintFixture: () => void }
    ).__remountPrintFixture()
  })
  await page
    .getByRole('button', { name: '正式单据预览 / Aperçu', exact: true })
    .click()
  await page
    .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __printCalls: number }).__printCalls,
      ),
    )
    .toBe(3)
  await expect(page.locator('.honsen-print-root')).toContainText(
    'SYNTHETIC-SPO-C',
  )
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.honsen-print-root')).toHaveCount(0)
  await page.evaluate(() => {
    window.print = () => {
      throw Error('synthetic print failure')
    }
  })
  await page
    .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
    .click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.honsen-print-root')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveClass(/honsen-printing-formal/)
  await page.evaluate(() => {
    window.print = () => {
      ;(window as unknown as { __printCalls: number }).__printCalls++
    }
  })
  await page
    .getByRole('button', { name: '打印 / Imprimer · PDF', exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __printCalls: number }).__printCalls,
      ),
    )
    .toBe(4)
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.honsen-print-root')).toHaveCount(0)
  expect(errors).toEqual([])
})
