import { expect, test } from '@playwright/test'

test('formal preview exposes pending and prevents duplicate requests until failure', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = await load('/node_modules/.vite/deps/react.js')
    const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
    const { FormalPrintPreview } = await load(
      '/src/components/FormalPrintPreview.tsx',
    )
    const { setUiLocale } = await load('/src/lib/ui-locale.ts')
    setUiLocale('en')
    const host = window as Window & {
      __TAURI__?: object
      __previewCalls?: number
      __rejectPreview?: () => void
    }
    host.__previewCalls = 0
    host.__TAURI__ = {
      core: {
        invoke: () => {
          host.__previewCalls = (host.__previewCalls ?? 0) + 1
          return new Promise((_resolve, reject) => {
            host.__rejectPreview = () => reject(new Error('Synthetic denied'))
          })
        },
      },
    }
    const target = document.createElement('div')
    const createRoot = DOM.createRoot ?? DOM.default.createRoot
    const createElement = React.createElement ?? React.default.createElement
    document.body.replaceChildren(target)
    createRoot(target).render(
      createElement(FormalPrintPreview, {
        orderId: '10000000-0000-4000-8000-000000000001',
      }),
    )
  })
  const preview = page.locator('section button').first()
  await preview.click()
  await expect(preview).toBeDisabled()
  await expect(page.getByRole('status')).toContainText(
    'Preparing the formal document preview',
  )
  await page.evaluate(async () => {
    const path = '/src/lib/ui-locale.ts'
    ;(await import(path)).setUiLocale('fr')
  })
  await expect(page.getByRole('status')).toContainText(
    'Préparation de l’aperçu',
  )
  expect(
    await page.evaluate(
      () => (window as Window & { __previewCalls?: number }).__previewCalls,
    ),
  ).toBe(1)
  await page.evaluate(() =>
    (window as Window & { __rejectPreview?: () => void }).__rejectPreview?.(),
  )
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(preview).toBeEnabled()
  expect(errors).toEqual([])
})

test('formal bilingual preview rejects failures then renders trusted escaped snapshot', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = await load('/node_modules/.vite/deps/react.js')
    const ReactDOM = await load('/node_modules/.vite/deps/react-dom_client.js')
    const { FormalPrintPreview } = await load(
      '/src/components/FormalPrintPreview.tsx',
    )
    const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot
    const createElement = React.createElement ?? React.default.createElement
    let count = 0
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async () => {
            if (++count === 1) throw { code: 'forbidden' }
            return {
              formalDocumentNo: 'CI-P1-20261104-SPO-TEST-1',
              documentType: 'SPO',
              languagePair: 'zh_fr',
              projectId: '10000000-0000-4000-8000-000000000001',
              site: 'Test',
              orderDate: '2026-11-04',
              deliveryAddress: 'Test',
              expectedDeliveryDate: null,
              notes: '合成条款 / Conditions',
              currency: 'EUR',
              subtotalMinor: '12345',
              lineDiscountMinor: '0',
              orderDiscountMinor: '0',
              freightMinor: '0',
              taxMinor: '0',
              totalMinor: '12345',
              taxRateBasisPoints: 0,
              selfApproved: false,
              supplier: {
                name: '合成供应商 / Société <script>',
                contactName: null,
                address: null,
                phone: null,
                email: null,
              },
              lines: [
                {
                  nameZh: '长名称测试材料',
                  nameFr: 'Matériau électrique accentué',
                  model: 'M',
                  specification: 'S',
                  quantity: '2.5',
                  unit: 'pcs',
                  currency: 'EUR',
                  unitPriceMinor: '4938',
                  lineTotalMinor: '12345',
                },
              ],
            }
          },
        },
      },
    })
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    createRoot(host).render(
      createElement(FormalPrintPreview, {
        orderId: '10000000-0000-4000-8000-000000000001',
      }),
    )
  })
  await page.getByRole('button', { name: '正式单据预览 / Aperçu' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '正式单据预览 / Aperçu' }).click()
  await expect(
    page.getByText('SPO · CI-P1-20261104-SPO-TEST-1', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Matériau électrique accentué')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'BON DE COMMANDE 采购订单' }),
  ).toBeVisible()
  await expect(page.locator('.formal-document-brand')).toHaveText(
    'HONSEN Procure',
  )
  await expect(page.locator('.formal-document-footer')).toContainText(
    'CI-P1-20261104-SPO-TEST-1',
  )
  await expect(page.locator('.print-materials tbody td').last()).toHaveCSS(
    'text-align',
    'right',
  )
  await expect(page.getByText('123.45 EUR').first()).toBeVisible()
  await expect(page.locator('article script')).toHaveCount(0)
  expect(errors).toEqual([])
})
