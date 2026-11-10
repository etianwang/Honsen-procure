import { openShellPage } from './shell-controls'
import { expect, test, type Locator, type Page } from '@playwright/test'
const countryA = '00000000-0000-4000-8000-000000000101'
const countryB = '00000000-0000-4000-8000-000000000102'

async function selectSupplierB105(page: Page, picker: Locator) {
  const name = 'SYNTH-B-105 · Synthetic supplier B 105'
  await picker.click()
  await picker.fill('105')
  await expect(picker).toHaveAttribute('aria-controls', /.+/)
  const listId = await picker.getAttribute('aria-controls')
  const popup = page.locator('.ant-select-dropdown:visible').filter({
    has: page.locator(`[id="${listId}"]`),
  })
  await expect(popup.getByText(name, { exact: true })).toBeVisible()
  await picker.press('ArrowDown')
  await picker.press('Enter')
  await expect(picker).toHaveAttribute('aria-expanded', 'false')
  await expect(
    page.locator('.ant-select').filter({ has: picker }).getByText(name, {
      exact: true,
    }),
  ).toBeVisible()
}

async function boot(page: Page, locale: string, deferred: boolean) {
  await page.addInitScript(
    ({ locale, deferred, countryA, countryB }) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      const requests: Array<{
        countryId: string
        query: string
        selectableOnly: boolean
      }> = []
      const settlers: Array<(ok: boolean) => void> = []
      let legacyReads = 0
      let dropCountryForB = false
      const rfqs: Array<Record<string, unknown>> = []
      const supplier = (countryId: string, i: number) => ({
        id:
          '00000000-0000-4000-8000-' +
          String((countryId === countryB ? 4000 : 3000) + i).padStart(12, '0'),
        countryId,
        businessCode: 'SYNTH-' + (countryId === countryB ? 'B' : 'A') + '-' + i,
        name:
          'Synthetic supplier ' +
          (countryId === countryB ? 'B' : 'A') +
          ' ' +
          i,
        contactName: null,
        address: null,
        city: null,
        country: null,
        phone: null,
        whatsapp: null,
        email: null,
        paymentTerms: null,
        deliveryLeadTime: null,
        notes: null,
        isActive: true,
        isBlacklisted: false,
        isPreferred: false,
        version: 1,
      })
      const summary = {
        currency: 'XOF',
        payableMinor: '9007199254740993',
        paidMinor: '0',
        remainingMinor: '9007199254740993',
        overpaidMinor: '0',
        status: 'unpaid',
        records: [],
      }
      const orders = ['A', 'B', 'Missing'].map((name, index) => ({
        id: '00000000-0000-4000-8000-' + String(1001 + index).padStart(12, '0'),
        countryId: index === 0 ? countryA : index === 1 ? countryB : undefined,
        displayNo: 'SYNTH-EXEC-' + name,
        primaryCurrency: 'XOF',
        procurementMode: 'honsen_self_purchase',
        workflowStatus: 'confirmed',
        lines: [
          {
            id:
              '00000000-0000-4000-8000-' +
              String(2001 + index).padStart(12, '0'),
            materialName: 'Demand-' + name,
            quantity: '2.5',
            receivedQuantity: '0',
            remainingQuantity: '2.5',
            unit: 'pcs',
            currency: 'XOF',
          },
        ],
        children: [],
        paymentSummary: summary,
      }))
      Object.assign(window, {
        __executionSupplierRequests: requests,
        __settleExecutionSupplier: (index: number, ok: boolean) =>
          settlers[index](ok),
        __executionLegacyReads: () => legacyReads,
        __dropExecutionCountry: () => {
          dropCountryForB = true
        },
        __TAURI__: {
          core: {
            invoke: async (
              command: string,
              args?: {
                countryId?: string
                query?: string
                after?: unknown
                selectableOnly?: boolean
                input?: Record<string, unknown>
                sourceOrderId?: string
                parentOrderId?: string
                allocations?: unknown[]
              },
            ) => {
              if (command === 'list_confirmed_procurement_orders')
                return orders.map((order) =>
                  dropCountryForB && order.displayNo === 'SYNTH-EXEC-B'
                    ? { ...order, countryId: undefined }
                    : order,
                )
              if (command === 'list_suppliers') {
                legacyReads++
                throw Error('Unbounded supplier read forbidden')
              }
              if (command === 'search_suppliers_page') {
                const countryId = args?.countryId ?? '',
                  query = args?.query ?? ''
                requests.push({
                  countryId,
                  query,
                  selectableOnly: args?.selectableOnly ?? false,
                })
                const result = () => ({
                  records: query
                    ? [supplier(countryId, 105)]
                    : Array.from({ length: args?.after ? 5 : 50 }, (_, i) =>
                        supplier(countryId, i + (args?.after ? 50 : 0)),
                      ),
                  nextCursor:
                    query || args?.after
                      ? null
                      : {
                          isActive: true,
                          name: 'Synthetic supplier 49',
                          id: supplier(countryId, 49).id,
                        },
                })
                if (deferred)
                  return new Promise((resolve, reject) =>
                    settlers.push((ok) =>
                      ok
                        ? resolve(result())
                        : reject(Error('Synthetic supplier read failure')),
                    ),
                  )
                return result()
              }
              if (command === 'list_rfqs')
                return rfqs.filter(
                  (rfq) => rfq.sourceOrderId === args?.sourceOrderId,
                )
              if (command === 'create_rfq') {
                const input = args?.input ?? {}
                Object.assign(window, { __executionRfqInput: input })
                const rfq = { ...input, status: 'draft', itemCount: 1 }
                rfqs.push(rfq)
                return rfq
              }
              if (command === 'allocate_supplier_child_orders') {
                Object.assign(window, {
                  __executionAllocationInput: {
                    parentOrderId: args?.parentOrderId,
                    allocations: args?.allocations,
                  },
                })
                return [
                  {
                    childOrderId: '00000000-0000-4000-8000-000000009001',
                    supplierId: supplier(countryB, 105).id,
                    currency: 'XOF',
                    sourceTotalMinor: '9007199254740993',
                    primaryTotalMinor: '9007199254740993',
                    lockedExchangeRateDecimal: '1',
                  },
                ]
              }
              return []
            },
          },
        },
      })
    },
    { locale, deferred, countryA, countryB },
  )
  await page.goto('/')
  await page
    .getByRole('button', {
      name: /打开界面预览|Open interface preview|Ouvrir l’aperçu/,
    })
    .click()
  await openShellPage(page, 'execution')
  await expect(
    page.getByRole('button', { name: 'SYNTH-EXEC-A', exact: true }),
  ).toBeVisible()
}
const languages = [
  {
    locale: 'zh',
    rfq: 'RFQ 供应商',
    supplier: '供应商',
    loading: '正在搜索供应商…',
    error: '供应商查询失败，请重试',
    retry: '重试',
    missing: '无法确定订单国家范围',
    number: '询价单编号',
    create: '创建询价单',
    child: '子单编号',
    allocate: '创建供应商子单',
  },
  {
    locale: 'en',
    rfq: 'RFQ supplier',
    supplier: 'Supplier',
    loading: 'Searching suppliers…',
    error: 'Supplier search failed. Retry.',
    retry: 'Retry',
    missing: 'Order country is unavailable',
    number: 'RFQ number',
    create: 'Create RFQ',
    child: 'Child order number',
    allocate: 'Create supplier child orders',
  },
  {
    locale: 'fr',
    rfq: 'Fournisseur RFQ',
    supplier: 'Fournisseur',
    loading: 'Recherche de fournisseurs…',
    error: 'Échec de la recherche. Réessayez.',
    retry: 'Réessayer',
    missing: 'Pays de la commande indisponible',
    number: 'Numéro RFQ',
    create: 'Créer une demande de prix',
    child: 'Numéro de sous-commande',
    allocate: 'Créer les sous-commandes fournisseurs',
  },
]
for (const language of languages) {
  test(
    'execution supplier lazy reads recover and follow each parent country ' +
      language.locale,
    async ({ page }) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await boot(page, language.locale, true)
      expect(
        await page.evaluate(
          () =>
            (window as Window & { __executionSupplierRequests: unknown[] })
              .__executionSupplierRequests.length,
        ),
      ).toBe(0)
      const picker = page.getByRole('combobox', {
        name: language.rfq,
        exact: true,
      })
      await picker.click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __executionSupplierRequests: unknown[] })
                .__executionSupplierRequests.length,
          ),
        )
        .toBe(1)
      await expect(
        page.locator('.ant-select-dropdown:visible').getByRole('status'),
      ).toContainText(language.loading)
      await page.evaluate(() =>
        (
          window as Window & {
            __settleExecutionSupplier: (index: number, ok: boolean) => void
          }
        ).__settleExecutionSupplier(0, false),
      )
      await expect(
        page.locator('.ant-select-dropdown:visible').getByRole('alert'),
      ).toContainText(language.error)
      await page
        .getByRole('button', {
          name: language.locale === 'zh' ? /^重\s*试$/ : language.retry,
          exact: true,
        })
        .click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __executionSupplierRequests: unknown[] })
                .__executionSupplierRequests.length,
          ),
        )
        .toBe(2)
      await expect(
        page.locator('.ant-select-dropdown:visible').getByRole('status'),
      ).toContainText(language.loading)
      await page.evaluate(() =>
        (
          window as Window & {
            __settleExecutionSupplier: (index: number, ok: boolean) => void
          }
        ).__settleExecutionSupplier(1, true),
      )
      await expect(
        page.getByText('SYNTH-A-0 · Synthetic supplier A 0', { exact: true }),
      ).toBeVisible()
      await picker.fill('slow')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __executionSupplierRequests: unknown[] })
                .__executionSupplierRequests.length,
          ),
        )
        .toBe(3)
      await page
        .getByRole('button', { name: 'SYNTH-EXEC-B', exact: true })
        .click()
      const pickerB = page.getByRole('combobox', {
        name: language.rfq,
        exact: true,
      })
      await pickerB.click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __executionSupplierRequests: unknown[] })
                .__executionSupplierRequests.length,
          ),
        )
        .toBe(4)
      await page.evaluate(() =>
        (
          window as Window & {
            __settleExecutionSupplier: (index: number, ok: boolean) => void
          }
        ).__settleExecutionSupplier(3, true),
      )
      await expect(
        page.getByText('SYNTH-B-0 · Synthetic supplier B 0', { exact: true }),
      ).toBeVisible()
      await page.evaluate(() =>
        (
          window as Window & {
            __settleExecutionSupplier: (index: number, ok: boolean) => void
          }
        ).__settleExecutionSupplier(2, true),
      )
      await expect(
        page.locator('.ant-select-dropdown:visible'),
      ).not.toContainText('Synthetic supplier A')
      await pickerB.press('Escape')
      const captured = await page.evaluate(
        () =>
          (
            window as Window & {
              __executionSupplierRequests: Array<{
                countryId: string
                selectableOnly: boolean
              }>
            }
          ).__executionSupplierRequests,
      )
      expect(captured.map((request) => request.countryId)).toEqual([
        countryA,
        countryA,
        countryA,
        countryB,
      ])
      expect(captured.every((request) => request.selectableOnly)).toBe(true)
      await page
        .getByRole('button', { name: 'SYNTH-EXEC-Missing', exact: true })
        .click()
      await expect(
        page.getByRole('alert').filter({ hasText: language.missing }),
      ).toBeVisible()
      await expect(
        page.getByRole('combobox', { name: language.rfq, exact: true }),
      ).toBeDisabled()
      await expect(
        page.getByRole('combobox', {
          name: 'Demand-Missing ' + language.supplier,
          exact: true,
        }),
      ).toBeDisabled()
      await expect(
        page.getByRole('button', { name: 'SYNTH-EXEC-Missing', exact: true }),
      ).toBeVisible()
      expect(
        await page.evaluate(() =>
          (
            window as Window & { __executionLegacyReads: () => number }
          ).__executionLegacyReads(),
        ),
      ).toBe(0)
      expect(errors).toEqual([])
    },
  )
  test(
    'execution RFQ and allocation keep payloads with parent-scoped supplier picker ' +
      language.locale,
    async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await boot(page, language.locale, false)
      await page
        .getByRole('button', { name: 'SYNTH-EXEC-B', exact: true })
        .click()
      const rfq = page.getByRole('combobox', {
        name: language.rfq,
        exact: true,
      })
      await selectSupplierB105(page, rfq)
      await page
        .getByLabel(language.number, { exact: true })
        .fill('SYNTH-RFQ-B')
      await page
        .getByRole('button', { name: language.create, exact: true })
        .click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __executionRfqInput?: unknown })
                .__executionRfqInput,
          ),
        )
        .toMatchObject({
          sourceOrderId: '00000000-0000-4000-8000-000000001002',
          supplierId: '00000000-0000-4000-8000-000000004105',
          currency: 'XOF',
          displayNo: 'SYNTH-RFQ-B',
        })
      const allocation = page.getByRole('combobox', {
        name: 'Demand-B ' + language.supplier,
        exact: true,
      })
      await selectSupplierB105(page, allocation)
      await page
        .getByLabel('Demand-B ' + language.child, { exact: true })
        .fill('SYNTH-CHILD-B')
      await page
        .getByRole('button', { name: language.allocate, exact: true })
        .click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __executionAllocationInput?: unknown })
                .__executionAllocationInput,
          ),
        )
        .toEqual({
          parentOrderId: '00000000-0000-4000-8000-000000001002',
          allocations: [
            {
              parentItemId: '00000000-0000-4000-8000-000000002002',
              supplierId: '00000000-0000-4000-8000-000000004105',
              currency: 'XOF',
              childDisplayNo: 'SYNTH-CHILD-B',
              lockedExchangeRateDecimal: '1',
            },
          ],
        })
      const captured = await page.evaluate(
        () =>
          (
            window as Window & {
              __executionSupplierRequests: Array<{
                countryId: string
                selectableOnly: boolean
              }>
            }
          ).__executionSupplierRequests,
      )
      expect(captured.length).toBeGreaterThanOrEqual(2)
      expect(
        captured.every(
          (request) => request.countryId === countryB && request.selectableOnly,
        ),
      ).toBe(true)
      expect(
        await page.evaluate(() =>
          (
            window as Window & { __executionLegacyReads: () => number }
          ).__executionLegacyReads(),
        ),
      ).toBe(0)
      expect(errors).toEqual([])
    },
  )
}

test('same parent losing country blocks old supplier dispatch while retaining RFQ and allocation drafts', async ({
  page,
}) => {
  await boot(page, 'zh', false)
  await page.getByRole('button', { name: 'SYNTH-EXEC-B', exact: true }).click()
  const rfq = page.getByRole('combobox', { name: 'RFQ 供应商', exact: true })
  await selectSupplierB105(page, rfq)
  await page
    .getByLabel('询价单编号', { exact: true })
    .fill('SYNTH-RETAINED-RFQ')
  const allocation = page.getByRole('combobox', {
    name: 'Demand-B 供应商',
    exact: true,
  })
  await selectSupplierB105(page, allocation)
  await page
    .getByLabel('Demand-B 子单编号', { exact: true })
    .fill('SYNTH-RETAINED-CHILD')
  const create = page.getByRole('button', { name: '创建询价单', exact: true })
  const allocate = page.getByRole('button', {
    name: '创建供应商子单',
    exact: true,
  })
  await expect(create).toBeEnabled()
  await expect(allocate).toBeEnabled()
  await page.evaluate(() => {
    ;(
      window as Window & { __dropExecutionCountry: () => void }
    ).__dropExecutionCountry()
    window.dispatchEvent(new Event('honsen-procurement-synced'))
  })
  await expect(
    page.getByRole('alert').filter({ hasText: '无法确定订单国家范围' }),
  ).toBeVisible()
  await expect(create).toBeDisabled()
  await expect(allocate).toBeDisabled()
  await expect(rfq).toBeDisabled()
  await expect(allocation).toBeDisabled()
  await expect(page.getByLabel('询价单编号', { exact: true })).toHaveValue(
    'SYNTH-RETAINED-RFQ',
  )
  await expect(
    page.getByLabel('Demand-B 子单编号', { exact: true }),
  ).toHaveValue('SYNTH-RETAINED-CHILD')
  await expect(
    page.getByRole('button', { name: '开始市场直采', exact: true }),
  ).toBeEnabled()
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __executionRfqInput?: unknown })
          .__executionRfqInput,
    ),
  ).toBeUndefined()
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __executionAllocationInput?: unknown })
          .__executionAllocationInput,
    ),
  ).toBeUndefined()
})
