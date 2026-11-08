import { expect, test, type Page } from '@playwright/test'

async function mount(page: Page, role = 'purchaser', locale = 'zh') {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '打开界面预览' })).toBeVisible()
  await page.evaluate(
    async ({ role, locale }) => {
      const load = (p: string) => import(/* @vite-ignore */ p)
      const React = await load('/node_modules/.vite/deps/react.js'),
        ReactDOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { SuppliersPricesPage } = await load(
          '/src/pages/SuppliersPricesPage.tsx',
        ),
        { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
      const supplier = {
        id: 's',
        countryId: 'ci',
        businessCode: 'SYNTH',
        name: 'Synthetic supplier',
        contactName: 'Synthetic contact',
        notes: 'Synthetic retained notes',
        isActive: true,
        isBlacklisted: false,
        isPreferred: false,
        version: 1,
      }
      const material = {
        id: 'm',
        nameZh: '合成材料',
        nameEn: 'Synthetic material',
        nameFr: 'Matériau synthétique',
        model: 'M',
        specification: 'S',
        unit: 'pcs',
        prices: [],
        aliases: [],
        version: 1,
      }
      const base = {
        supplierId: 's',
        supplierName: 'Synthetic supplier',
        currency: 'XAF',
        unit: 'pcs',
        effectiveAt: '2026-11-06',
        isActive: true,
      }
      Object.assign(window, { __priceInput: null, __historyFail: false })
      const api = {
        listSuppliers: async () => [supplier],
        searchMaterials: async () => [material],
        searchCatalog: async () => [material],
        listSupplierPrices: async (
          _s: string,
          _p: string,
          after: string | null,
        ) => {
          if ((window as unknown as { __historyFail: boolean }).__historyFail)
            throw Error('failed')
          return Array.from({ length: after ? 1 : 25 }, (_, i) => ({
            ...base,
            priceId: after ? 'h25' : `h${i}`,
            materialId: 'm',
            materialNameZh: after ? '历史26' : '历史' + i,
            materialModel: 'M',
            materialSpecification: 'S',
            materialActive: true,
            supplierActive: true,
            isBlacklisted: false,
            unitPriceMinor: '125',
            isActive: i !== 0,
            sourceNote: 'synthetic',
          }))
        },
        listCatalogPrices: async () => [
          {
            ...base,
            priceId: 'high',
            supplierName: 'Higher exact',
            unitPriceMinor: '9007199254740993',
          },
          {
            ...base,
            priceId: 'low',
            supplierName: 'Lower exact',
            unitPriceMinor: '9007199254740992',
          },
          {
            ...base,
            priceId: 'other-unit',
            supplierName: 'Other unit',
            unit: 'kg',
            unitPriceMinor: '1',
          },
          {
            ...base,
            priceId: 'other-currency',
            supplierName: 'Other currency',
            currency: 'USD',
            unitPriceMinor: '1',
          },
        ],
        addMaterialPrice: async (input: unknown) => {
          ;(window as unknown as { __priceInput: unknown }).__priceInput = input
        },
        saveSupplier: async (input: typeof supplier) => {
          Object.assign(supplier, input)
        },
      }
      const el = document.createElement('div')
      document.body.replaceChildren(el)
      const renderRoot = (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(
        el,
      )
      renderRoot.render(
        (React.createElement ?? React.default.createElement)(
          SuppliersPricesPage,
          {
            role,
            countryId: 'ci',
            projectId: 'p',
            api,
          },
        ),
      )
    },
    { role, locale },
  )
}

test('supplier history pages include inactive rows and comparison groups preserve integer precision', async ({
  page,
}) => {
  await mount(page)
  await page
    .getByRole('button', { name: 'Synthetic supplier', exact: true })
    .click()
  await expect(page.getByText('历史0', { exact: true })).toBeVisible()
  await expect(page.locator('.supplier-detail tbody tr')).toHaveCount(25)
  const history = page.locator('.supplier-detail')
  await history.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('历史26', { exact: true })).toBeVisible()
  await history.getByRole('button', { name: '上一页', exact: true }).click()
  await expect(page.getByText('历史0', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: '选择材料', exact: true }).click()
  await page.getByText('合成材料', { exact: false }).last().click()
  await expect(page.locator('.supplier-material-comparison')).toContainText(
    'Lower exact',
  )
  const groups = page.locator('.supplier-material-comparison table')
  await expect(groups).toHaveCount(3)
  const exact = groups.filter({ hasText: 'Lower exact' })
  expect(await exact.locator('tbody tr').allTextContents()).toEqual([
    expect.stringContaining('Lower exact'),
    expect.stringContaining('Higher exact'),
  ])
  await page.screenshot({
    path: '.cache/suppliers-prices-comparison.png',
    animations: 'disabled',
  })
})

for (const [locale, edit, save, label] of [
  ['zh', '编辑供应商', '保存供应商', '备注'],
  ['en', 'Edit supplier', 'Save supplier', 'Notes'],
  ['fr', 'Modifier le fournisseur', 'Enregistrer le fournisseur', 'Remarques'],
]) {
  test(`supplier notes can be edited and cleared in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await mount(page, 'purchaser', locale)
    await page
      .getByRole('button', { name: 'Synthetic supplier', exact: true })
      .click()
    await expect(
      page
        .locator('.supplier-contact-details')
        .getByText('Synthetic retained notes', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: edit, exact: true }).click()
    await expect(
      page.getByRole('dialog').getByLabel(label, { exact: true }),
    ).toHaveValue('Synthetic retained notes')
    await page
      .getByRole('dialog')
      .getByLabel(label, { exact: true })
      .fill('Synthetic revised notes')
    await page.getByRole('button', { name: save, exact: true }).click()
    await expect(
      page
        .locator('.supplier-contact-details')
        .getByText('Synthetic revised notes', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: edit, exact: true }).click()
    await page.getByRole('dialog').getByLabel(label, { exact: true }).fill('')
    await page.getByRole('button', { name: save, exact: true }).click()
    await expect(
      page
        .locator('.supplier-contact-details')
        .getByText('Synthetic revised notes', { exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: edit, exact: true }).click()
    await expect(
      page.getByRole('dialog').getByLabel(label, { exact: true }),
    ).toHaveValue('')
    expect(errors).toEqual([])
  })
}

test('quote form submits XAF integer minor units without selecting a supplier implicitly', async ({
  page,
}) => {
  await mount(page)
  await page.getByRole('combobox', { name: '选择材料', exact: true }).click()
  await page.getByText('合成材料', { exact: false }).last().click()
  await page.getByRole('button', { name: '维护报价', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: '.cache/suppliers-prices-quote-form.png',
    animations: 'disabled',
  })
  const supplier = dialog.getByRole('combobox', { name: '供应商', exact: true })
  await expect(supplier).toHaveValue('')
  await supplier.click()
  await expect(
    page
      .locator('.ant-select-dropdown:visible')
      .getByText('SYNTH · Synthetic supplier', { exact: true }),
  ).toBeVisible()
  await supplier.press('ArrowDown')
  await supplier.press('Enter')
  await expect(supplier).toHaveAttribute('aria-expanded', 'false')
  await expect(
    dialog.locator('.ant-select').filter({
      has: page.getByRole('combobox', { name: '供应商', exact: true }),
    }),
  ).toContainText('SYNTH · Synthetic supplier')
  const currency = dialog.getByRole('combobox', { name: /货币$/ })
  await currency.click()
  await page.getByRole('option', { name: 'XAF', exact: true }).click()
  await expect(currency).toHaveAttribute('aria-expanded', 'false')
  await expect(
    dialog
      .locator('.ant-select')
      .filter({ has: page.getByRole('combobox', { name: /货币$/ }) }),
  ).toContainText('XAF')
  await dialog.getByLabel(/单价（最小货币单位）/).fill('9007199254740993')
  await dialog.getByRole('button', { name: /保存/ }).click()
  await expect(
    page.getByText('报价已保存到本地；等待同步确认。', { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => (window as unknown as { __priceInput: unknown }).__priceInput,
    ),
  ).toEqual(
    expect.objectContaining({
      currency: 'XAF',
      unitPriceMinor: '9007199254740993',
      supplierId: 's',
    }),
  )
})

for (const [locale, title] of [
  ['zh', '供应商与价格'],
  ['en', 'Suppliers and prices'],
  ['fr', 'Fournisseurs et prix'],
]) {
  test(`supplier page ${locale} readonly role cannot mutate`, async ({
    page,
  }) => {
    await mount(page, 'viewer', locale)
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible()
    await expect(
      page.locator('.supplier-toolbar button').first(),
    ).toBeDisabled()
  })
}

for (const mode of ['pure-super', 'combined', 'storage-error']) {
  test(`supplier App authorization notice ${mode} respects actual roles`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      const context = {
        projectId: 'p',
        countryId: 'ci',
        projectName: 'Synthetic project',
        site: 'Synthetic site',
        departmentId: 'd',
        departmentName: 'Synthetic department',
        teamId: 't',
        teamName: 'Synthetic team',
        currency: 'XOF',
        primaryCurrency: 'XOF',
        languagePair: 'zh_fr',
      }
      Object.assign(window, {
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (command: string) => {
              if (command === 'issue_cloud_captcha')
                throw { code: 'network_unavailable' }
              if (command === 'issue_local_captcha')
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'offline_login')
                return {
                  user_id: crypto.randomUUID(),
                  username: 'synthetic',
                  roles:
                    mode === 'combined'
                      ? ['super_administrator', 'purchaser']
                      : mode === 'pure-super'
                        ? ['super_administrator']
                        : ['purchaser'],
                  requires_password_change: false,
                }
              if (command === 'get_authorization_context') {
                if (mode === 'pure-super') throw { code: 'forbidden' }
                if (mode === 'storage-error')
                  throw { code: 'local_storage_error' }
                return context
              }
              if (command === 'list_authorization_contexts')
                return mode === 'pure-super' ? [] : [context]
              if (command === 'search_suppliers_page')
                return {
                  records: [
                    {
                      id: 's',
                      countryId: 'ci',
                      businessCode: 'SYNTH',
                      name: 'Synthetic supplier',
                      contactName: 'Synthetic contact',
                      isActive: true,
                      isBlacklisted: false,
                      isPreferred: false,
                      version: 1,
                    },
                  ],
                  nextCursor: null,
                }
              if (command === 'search_catalog') return []
              return []
            },
          },
        },
      })
    }, mode)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('button', { name: '使用离线登录', exact: true })
      .click()
    await page.getByLabel('账号', { exact: true }).fill('synthetic')
    await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: '离线登录', exact: true }).click()
    await page
      .getByRole('button', { name: '供应商与价格', exact: true })
      .click()
    if (mode === 'combined') {
      await expect(
        page.getByRole('button', { name: '新增供应商', exact: true }),
      ).toBeEnabled()
      await page
        .getByRole('button', { name: 'Synthetic supplier', exact: true })
        .click()
      await expect(
        page.getByText('Synthetic contact', { exact: true }),
      ).toBeVisible()
      await page.screenshot({
        path: '.cache/suppliers-prices-app-navigation.png',
        animations: 'disabled',
      })
    } else if (mode === 'pure-super') {
      await expect(
        page.getByText(
          '超级管理员不会自动获得项目范围；查看报价需要有效项目授权，维护另需管理员或采购员角色。',
          { exact: true },
        ),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: '新增供应商', exact: true }),
      ).toHaveCount(0)
    } else
      await expect(
        page.getByText(
          '无法读取本地授权资料；请重试同步或重新登录，当前不能判定为缺少项目授权。',
          { exact: true },
        ),
      ).toBeVisible()
  })
}
