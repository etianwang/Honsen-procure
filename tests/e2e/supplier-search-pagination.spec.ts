import { openShellPage } from './shell-controls'
import { expect, test } from '@playwright/test'

for (const [
  locale,
  nav,
  searchLabel,
  pages,
  previous,
  next,
  reload,
  chooseMaterial,
  maintain,
  supplierLabel,
  more,
] of [
  [
    'zh',
    '供应商与价格',
    '搜索供应商名称、编码或联系人',
    '供应商分页',
    '上一页',
    '下一页',
    '重新加载',
    '选择材料',
    '维护报价',
    '供应商',
    '加载更多供应商',
  ],
  [
    'en',
    'Suppliers and prices',
    'Search supplier name, code or contact',
    'Supplier pages',
    'Previous page',
    'Next page',
    'Reload',
    'Select material',
    'Maintain quote',
    'Supplier',
    'Load more suppliers',
  ],
  [
    'fr',
    'Fournisseurs et prix',
    'Rechercher un fournisseur, code ou contact',
    'Pages des fournisseurs',
    'Page précédente',
    'Page suivante',
    'Recharger',
    'Sélectionner un matériau',
    'Gérer le devis',
    'Fournisseur',
    'Charger plus de fournisseurs',
  ],
]) {
  test(
    'supplier pages and quote picker query independently without full directories ' +
      locale,
    async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.addInitScript(
        ({ locale }) => {
          localStorage.setItem('honsen.procure.ui-locale', locale)
          const requests: Array<{
            query: string
            after: unknown
            selectableOnly: boolean
            countryId: string
          }> = []
          let failed = false
          const supplier = (i: number) => ({
            id: 'supplier-' + i,
            countryId: '00000000-0000-4000-8000-000000000001',
            businessCode: 'SYNTH-' + i,
            name: 'Synthetic supplier ' + i,
            contactName: 'Synthetic contact ' + i,
            address: null,
            city: 'Synthetic city',
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
          Object.assign(window, {
            __supplierSearchRequests: requests,
            __TAURI__: {
              core: {
                invoke: async (
                  command: string,
                  args?: {
                    query?: string
                    after?: unknown
                    selectableOnly?: boolean
                    countryId?: string
                  },
                ) => {
                  if (command === 'search_suppliers_page') {
                    const query = args?.query ?? ''
                    requests.push({
                      query,
                      after: args?.after,
                      selectableOnly: args?.selectableOnly ?? false,
                      countryId: args?.countryId ?? '',
                    })
                    if (args?.selectableOnly) {
                      if (query)
                        return { records: [supplier(105)], nextCursor: null }
                      return {
                        records: Array.from(
                          { length: args.after ? 5 : 50 },
                          (_, i) => supplier(i + (args.after ? 50 : 0)),
                        ),
                        nextCursor: args.after
                          ? null
                          : {
                              isActive: true,
                              name: 'Synthetic supplier 49',
                              id: 'supplier-49',
                            },
                      }
                    }
                    if (query === 'error' && !failed) {
                      failed = true
                      throw Error('Synthetic search failure')
                    }
                    if (query === 'old')
                      return new Promise((resolve) =>
                        Object.assign(window, {
                          __resolveOldSupplier: () =>
                            resolve({
                              records: [supplier(999)],
                              nextCursor: null,
                            }),
                        }),
                      )
                    if (query === 'none')
                      return { records: [], nextCursor: null }
                    if (query)
                      return { records: [supplier(777)], nextCursor: null }
                    return {
                      records: Array.from(
                        { length: args?.after ? 5 : 50 },
                        (_, i) => supplier(i + (args?.after ? 50 : 0)),
                      ),
                      nextCursor: args?.after
                        ? null
                        : {
                            isActive: true,
                            name: 'Synthetic supplier 49',
                            id: 'supplier-49',
                          },
                    }
                  }
                  if (command === 'search_catalog_page')
                    return {
                      records: [
                        {
                          id: 'material-10005',
                          sku: 'SYNTH-M',
                          nameZh: '合成材料10005',
                          nameFr: 'Matériau synthétique 10005',
                          nameEn: 'Synthetic material 10005',
                          model: 'MODEL',
                          specification: 'Synthetic specification',
                          unit: 'pcs',
                          aliases: [],
                          brand: null,
                          notes: null,
                          version: 1,
                          prices: [],
                        },
                      ],
                      nextCursor: null,
                    }
                  if (command === 'list_catalog_comparison_page')
                    return { records: [], nextCursor: null }
                  if (
                    command === 'list_supplier_prices' ||
                    command === 'list_catalog_prices'
                  )
                    return []
                  if (
                    command === 'list_suppliers' ||
                    command === 'search_catalog'
                  )
                    throw Error('Unbounded legacy directory called')
                  return undefined
                },
              },
            },
          })
        },
        { locale },
      )
      await page.goto('/')
      await page
        .getByRole('button', {
          name: /打开界面预览|Open interface preview|Ouvrir l’aperçu/,
        })
        .click()
      await openShellPage(page, 'suppliers')
      const list = page.locator('.supplier-list')
      const pager = page.getByRole('navigation', { name: pages })
      const search = page.getByRole('textbox', {
        name: searchLabel,
        exact: true,
      })
      await expect(
        page.locator('label[for="supplier-page-search"] span'),
      ).toHaveText(searchLabel)
      await expect(list.locator('tbody tr')).toHaveCount(50)
      await pager.getByRole('button', { name: next, exact: true }).click()
      await expect(list.locator('tbody tr')).toHaveCount(5)
      await list
        .getByRole('button', { name: 'Synthetic supplier 50', exact: true })
        .click()
      await expect(page.locator('.supplier-detail-header h3')).toHaveText(
        'Synthetic supplier 50',
      )
      await pager.getByRole('button', { name: previous, exact: true }).click()
      await expect(list.locator('tbody tr')).toHaveCount(50)
      await expect(page.locator('.supplier-detail-header h3')).toHaveText(
        'Synthetic supplier 50',
      )
      await search.fill('error')
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(search).toHaveValue('error')
      await page.getByRole('button', { name: reload, exact: true }).click()
      await expect(
        list.getByRole('button', {
          name: 'Synthetic supplier 777',
          exact: true,
        }),
      ).toBeVisible()
      await search.fill('old')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & {
                  __supplierSearchRequests: Array<{ query: string }>
                }
              ).__supplierSearchRequests.at(-1)?.query,
          ),
        )
        .toBe('old')
      await search.fill('none')
      await expect(list.locator('tbody tr')).toHaveCount(0)
      await expect(pager.getByRole('status')).toContainText('0')
      await page.evaluate(() =>
        (
          window as Window & { __resolveOldSupplier: () => void }
        ).__resolveOldSupplier(),
      )
      await expect(
        list.getByRole('button', {
          name: 'Synthetic supplier 999',
          exact: true,
        }),
      ).toHaveCount(0)
      await page.clock.install()
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500)
      const before = await page.evaluate(
        () =>
          (window as Window & { __supplierSearchRequests: unknown[] })
            .__supplierSearchRequests.length,
      )
      await search.pressSequentially(' contact', { delay: 10 })
      await page.clock.runFor(250)
      await page.clock.resume()
      await expect(
        list.getByRole('button', {
          name: 'Synthetic supplier 777',
          exact: true,
        }),
      ).toBeVisible()
      expect(
        await page.evaluate(
          () =>
            (window as Window & { __supplierSearchRequests: unknown[] })
              .__supplierSearchRequests.length,
        ),
      ).toBe(before + 1)
      const material = page.getByRole('combobox', {
        name: chooseMaterial,
        exact: true,
      })
      await material.click()
      await material.fill('beyond 100')
      const materialName =
        locale === 'fr'
          ? 'Matériau synthétique 10005'
          : locale === 'en'
            ? 'Synthetic material 10005'
            : '合成材料10005'
      await expect(
        page.getByText(materialName + ' · MODEL', { exact: true }),
      ).toBeVisible()
      await material.press('ArrowDown')
      await material.press('Enter')
      await page.getByRole('button', { name: maintain, exact: true }).click()
      const dialog = page.getByRole('dialog')
      const picker = dialog.getByRole('combobox', {
        name: supplierLabel,
        exact: true,
      })
      await expect(picker).toHaveValue('')
      await picker.click()
      await expect(
        page.getByRole('button', { name: more, exact: true }),
      ).toBeVisible()
      expect(
        await page.locator('.ant-select-item-option').count(),
      ).toBeLessThan(30)
      await picker.fill('SYNTH-105')
      await expect(
        page.getByText('SYNTH-105 · Synthetic supplier 105', { exact: true }),
      ).toBeVisible()
      await picker.press('ArrowDown')
      await picker.press('Enter')
      await expect(picker).toHaveAttribute('aria-expanded', 'false')
      await expect(
        dialog.locator('.ant-select').filter({
          has: page.getByRole('combobox', {
            name: supplierLabel,
            exact: true,
          }),
        }),
      ).toContainText('SYNTH-105 · Synthetic supplier 105')
      const captured = await page.evaluate(
        () =>
          (
            window as Window & {
              __supplierSearchRequests: Array<{
                query: string
                selectableOnly: boolean
                countryId: string
              }>
            }
          ).__supplierSearchRequests,
      )
      expect(
        captured.some(
          (request) => request.query === 'SYNTH-105' && request.selectableOnly,
        ),
      ).toBe(true)
      expect(
        captured.every((request) => /^[0-9a-f-]{36}$/.test(request.countryId)),
      ).toBe(true)
      await page.screenshot({
        path: '.cache/supplier-search-picker-' + locale + '.png',
      })
      expect(errors).toEqual([])
    },
  )
}
