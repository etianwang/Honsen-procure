import { expect, test } from '@playwright/test'

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
    let count = 0
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async () => {
            if (++count === 1) throw { code: 'forbidden' }
            return {
              formalDocumentNo: 'CI-P1-20261104-SPO-TEST-1',
              documentType: 'SPO',
              languagePair: 'zh_en',
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
                  nameFr: null,
                  nameEn: 'Matériau électrique accentué',
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
      (React.createElement ?? React.default.createElement)(FormalPrintPreview, {
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
  await expect(page.getByText('123.45 EUR').first()).toBeVisible()
  await expect(page.locator('article script')).toHaveCount(0)
  expect(errors).toEqual([])
})
