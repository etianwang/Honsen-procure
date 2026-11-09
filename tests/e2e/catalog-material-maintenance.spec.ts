import { expect, test, type Page } from '@playwright/test'

async function mount(page: Page, locale = 'zh') {
  await page.goto('/')
  await page.evaluate(async (locale) => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = await load('/node_modules/.vite/deps/react.js')
    const ReactDOM = await load('/node_modules/.vite/deps/react-dom_client.js')
    const { MaterialsPage } = await load('/src/pages/MaterialsPage.tsx')
    const { setUiLocale } = await load('/src/lib/ui-locale.ts')
    setUiLocale(locale)
    let material = {
      id: '00000000-0000-4000-8000-000000000011',
      sku: 'SYNTH-OLD',
      categoryId: '00000000-0000-4000-8000-000000000014',
      nameZh: 'Synthetic previous material',
      nameEn: null,
      nameFr: null,
      aliases: ['old alias'],
      brand: 'Old brand',
      model: 'Old model',
      specification: 'Old specification',
      unit: 'pcs',
      notes: 'Old note',
      isActive: true,
      version: 1,
      prices: [],
    }
    Object.assign(window, { __materialSaves: [] })
    const api = {
      searchCatalog: async (
        _query: string,
        _project: string,
        includeInactive = false,
      ) => (includeInactive || material.isActive ? [material] : []),
      saveMaterial: async (input: typeof material) => {
        ;(
          window as unknown as { __materialSaves: unknown[] }
        ).__materialSaves.push(input)
        material = { ...input, prices: [] }
      },
      listSuppliers: async () => [],
      listCatalogPrices: async () => [],
      saveSupplier: async () => {},
      addMaterialPrice: async () => {},
      saveMaterialImage: async () => {},
      getMaterialSquareImage: async () => null,
    }
    const element = document.createElement('div')
    document.body.replaceChildren(element)
    ;(ReactDOM.createRoot ?? ReactDOM.default.createRoot)(element).render(
      (React.createElement ?? React.default.createElement)(MaterialsPage, {
        role: 'purchaser',
        countryId: '00000000-0000-4000-8000-000000000012',
        projectId: '00000000-0000-4000-8000-000000000013',
        api,
      }),
    )
  }, locale)
}

test('cancelled material edit never populates a new material', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await mount(page)
  await page.getByRole('button', { name: '编辑材料', exact: true }).click()
  await expect(page.getByLabel('材料名称', { exact: true })).toHaveValue(
    'Synthetic previous material',
  )
  await page.getByRole('button', { name: /取\s*消/ }).click()
  await page.getByRole('button', { name: '新增材料', exact: true }).click()
  const dialog = page.getByRole('dialog')
  for (const name of [
    '材料名称',
    '型号',
    '规格',
    '单位',
    '材料编码 / SKU',
    '英语名称',
    '法语名称',
    '别名（以逗号分隔）',
    '品牌',
    '备注',
  ])
    await expect(dialog.getByLabel(name, { exact: true })).toHaveValue('')
  expect(errors).toEqual([])
})

for (const [locale, edit, save, active, inactiveToggle] of [
  ['zh', '编辑材料', '保存材料', '启用状态', '显示停用材料'],
  [
    'en',
    'Edit material',
    'Save material',
    'Active status',
    'Show inactive materials',
  ],
  [
    'fr',
    'Modifier le matériau',
    'Enregistrer le matériau',
    'État d’activation',
    'Afficher les matériaux désactivés',
  ],
]) {
  test(`material deactivation and same-row reactivation are reachable in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await mount(page, locale)
    await page.getByRole('button', { name: edit, exact: true }).click()
    await page.getByRole('dialog').getByLabel(active, { exact: true }).click()
    await page.getByRole('button', { name: save, exact: true }).click()
    await expect(
      page.getByText('Synthetic previous material', { exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole('switch', { name: inactiveToggle, exact: true })
      .click()
    await expect(
      page.getByText('Synthetic previous material', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: edit, exact: true }).click()
    await expect(
      page.getByRole('dialog').getByLabel(active, { exact: true }),
    ).not.toBeChecked()
    await page.getByRole('dialog').getByLabel(active, { exact: true }).click()
    await page.getByRole('button', { name: save, exact: true }).click()
    await page
      .getByRole('switch', { name: inactiveToggle, exact: true })
      .click()
    await expect(
      page.getByText('Synthetic previous material', { exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { __materialSaves: { categoryId: string }[] }
        ).__materialSaves.map((row) => row.categoryId),
      ),
    ).toEqual([
      '00000000-0000-4000-8000-000000000014',
      '00000000-0000-4000-8000-000000000014',
    ])
    expect(errors).toEqual([])
  })
}
