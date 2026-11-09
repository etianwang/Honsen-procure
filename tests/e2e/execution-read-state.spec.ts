import { expect, test } from '@playwright/test'

// Supplier pending/error/retry/stale coverage now lives at the lazy execution fields
// in execution-supplier-scope.spec.ts; every order-read assertion remains here.
for (const [locale, orderLoading, orderRetry, orderError, empty] of [
  [
    'zh',
    '正在读取已确认采购申请',
    '重新读取采购申请',
    '无法读取已确认采购申请',
    '没有可执行的已确认采购申请',
  ],
  [
    'en',
    'Loading approved requisitions',
    'Reload requisitions',
    'Unable to read approved requisitions',
    'No approved requisitions available for execution',
  ],
  [
    'fr',
    'Chargement des demandes approuvées',
    'Recharger les demandes',
    'Impossible de lire les demandes approuvées',
    'Aucune demande approuvée à exécuter',
  ],
] as const) {
  test(`execution reads distinguish loading errors and empty and ignore old refreshes in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto('/')
    await page.evaluate(async (locale) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { ProcurementExecutionPage } = await load(
        '/src/pages/ProcurementExecutionPage.tsx',
      )
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
      const reads: Array<{
        resolve: (value: unknown) => void
        reject: (reason: unknown) => void
      }> = []
      const suppliers: Array<{
        resolve: (value: unknown) => void
        reject: (reason: unknown) => void
      }> = []
      const frame = () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        )
      const order = (name: string) => ({
        id: '00000000-0000-4000-8000-000000000001',
        displayNo: name,
        countryId: '00000000-0000-4000-8000-000000000101',
        primaryCurrency: 'EUR',
        procurementMode: 'honsen_self_purchase',
        workflowStatus: 'completed',
        lines: [],
        children: [],
        paymentSummary: null,
      })
      Object.assign(window, {
        __TAURI__: { core: { invoke: async () => [] } },
        __finishExecutionRead: async (
          index: number,
          fail: boolean,
          name: string,
        ) => {
          if (fail) reads[index].reject(new Error('Synthetic read failure'))
          else reads[index].resolve(name ? [order(name)] : [])
          await frame()
        },
        __executionReadCount: () => reads.length,
        __executionLegacySupplierReadCount: () => suppliers.length,
      })
      const api = {
        listConfirmedProcurementOrders: () =>
          new Promise((resolve, reject) => reads.push({ resolve, reject })),
        startHonsenMarketExecution: async () => undefined,
      }
      const supplierApi = {
        listSuppliers: () =>
          new Promise((resolve, reject) => suppliers.push({ resolve, reject })),
      }
      const rfqApi = { listRfqs: async () => [] }
      const createRoot = DOM.createRoot ?? DOM.default.createRoot
      const createElement = React.createElement ?? React.default.createElement
      const target = document.createElement('div')
      document.body.replaceChildren(target)
      createRoot(target).render(
        createElement(ProcurementExecutionPage, {
          api,
          supplierApi,
          rfqApi,
          supplierOrderApi: {},
          receiverId: '00000000-0000-4000-8000-000000000002',
        }),
      )
    }, locale)
    const status = (text: string) =>
      page.getByRole('status').filter({ hasText: text })
    const alert = (text: string) =>
      page.getByRole('alert').filter({ hasText: text })
    const finishRead = async (index: number, fail: boolean, name = '') =>
      page.evaluate(
        ({ index, fail, name }) =>
          (
            window as Window & {
              __finishExecutionRead: (
                index: number,
                fail: boolean,
                name: string,
              ) => Promise<void>
            }
          ).__finishExecutionRead(index, fail, name),
        { index, fail, name },
      )
    await expect(status(orderLoading)).toBeVisible()
    expect(
      await page.evaluate(() =>
        (
          window as Window & {
            __executionLegacySupplierReadCount: () => number
          }
        ).__executionLegacySupplierReadCount(),
      ),
    ).toBe(0)
    await expect(page.getByText(empty, { exact: true })).toHaveCount(0)
    await finishRead(0, true)
    await expect(alert(orderError)).toBeVisible()
    await expect(page.getByText(empty, { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: orderRetry, exact: true }).click()
    await expect(status(orderLoading)).toBeVisible()
    await finishRead(1, false, 'CURRENT')
    await expect(
      page.getByRole('button', { name: 'CURRENT', exact: true }),
    ).toBeVisible()
    await expect(alert(orderError)).toHaveCount(0)
    await page.evaluate(() =>
      window.dispatchEvent(new Event('honsen-procurement-synced')),
    )
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as Window & { __executionReadCount: () => number }
          ).__executionReadCount(),
        ),
      )
      .toBe(3)
    await page.evaluate(() =>
      window.dispatchEvent(new Event('honsen-procurement-synced')),
    )
    await finishRead(3, false, 'NEWEST')
    await finishRead(2, false, 'STALE')
    await expect(
      page.getByRole('button', { name: 'NEWEST', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('STALE', { exact: true })).toHaveCount(0)
    await page.evaluate(() =>
      window.dispatchEvent(new Event('honsen-procurement-synced')),
    )
    await finishRead(4, true)
    await expect(alert(orderError)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'NEWEST', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: orderRetry, exact: true }).click()
    await finishRead(5, false, 'REQ-00000000-0000-4000-8000-000000000123')
    const unnamed =
      locale === 'zh'
        ? '未正式编号'
        : locale === 'fr'
          ? 'Sans numéro officiel'
          : 'Not formally numbered'
    await expect(
      page.getByRole('button', { name: unnamed, exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/REQ-00000000/)).toHaveCount(0)
    await page.evaluate(() =>
      window.dispatchEvent(new Event('honsen-procurement-synced')),
    )
    await finishRead(6, false)
    await expect(page.getByText(empty, { exact: true })).toBeVisible()
    await expect(alert(orderError)).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        (
          window as Window & {
            __executionLegacySupplierReadCount: () => number
          }
        ).__executionLegacySupplierReadCount(),
      ),
    ).toBe(0)
    expect(errors).toEqual([])
  })
}
