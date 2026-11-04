import { expect, test } from '@playwright/test'

test('master data and tax drafts survive persistent UI language switches', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = await load('/node_modules/.vite/deps/react.js')
    const ReactDOM = await load('/node_modules/.vite/deps/react-dom_client.js')
    const { MasterDataManager } = await load(
      '/src/components/MasterDataManager.tsx',
    )
    const { TaxTemplateEditor } = await load(
      '/src/components/TaxTemplateEditor.tsx',
    )
    const { CategoryRepairPanel } = await load(
      '/src/components/CategoryRepairPanel.tsx',
    )
    const { ExchangeRateEditor } = await load(
      '/src/components/ExchangeRateEditor.tsx',
    )
    const { setUiLocale } = await load('/src/lib/ui-locale.ts')
    setUiLocale('zh')
    const node = document.createElement('div')
    document.body.replaceChildren(node)
    const root = (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(node)
    const createElement = React.createElement ?? React.default.createElement
    const api = {}
    root.render(
      createElement(
        React.Fragment ?? React.default.Fragment,
        null,
        createElement(MasterDataManager, {
          api,
          records: [],
          canEdit: true,
        }),
        createElement(TaxTemplateEditor, {
          api,
          templates: [],
          countries: [],
          canEdit: true,
        }),
        createElement(ExchangeRateEditor, { api, rates: [], canEdit: true }),
        createElement(CategoryRepairPanel, {
          api: {
            listLocal: async () => [],
            listRemote: async () => [],
            listPending: async () => [],
          },
        }),
      ),
    )
  })
  await page
    .getByRole('textbox', { name: '国家代码', exact: true })
    .fill('SYNTH')
  await page
    .getByRole('textbox', { name: '税模板名称', exact: true })
    .fill('Unsaved tax')
  await page
    .getByRole('textbox', { name: '汇率小数字符串', exact: true })
    .fill('1.25')
  await page
    .getByRole('textbox', { name: '分类新编码', exact: true })
    .fill('REPAIR_TEST')
  for (const [locale, heading, countryCode, taxName] of [
    ['en', 'Administrative master data', 'country code', 'Tax template name'],
    [
      'fr',
      'Données de référence administratives',
      'code : pays',
      'Nom du modèle fiscal',
    ],
    ['zh', '管理员基础资料', '国家代码', '税模板名称'],
  ]) {
    await page.evaluate(async (locale) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
    }, locale)
    await expect(page.getByText(heading, { exact: true })).toBeVisible()
    await expect(
      page.getByRole('textbox', {
        name:
          locale === 'en'
            ? 'New category code'
            : locale === 'fr'
              ? 'Nouveau code de catégorie'
              : '分类新编码',
        exact: true,
      }),
    ).toHaveValue('REPAIR_TEST')
    await expect(
      page.getByRole('textbox', { name: countryCode, exact: true }),
    ).toHaveValue('SYNTH')
    await expect(
      page.getByRole('textbox', { name: taxName, exact: true }),
    ).toHaveValue('Unsaved tax')
    await expect(
      page.getByRole('textbox', {
        name:
          locale === 'en'
            ? 'Decimal exchange rate'
            : locale === 'fr'
              ? 'Taux de change décimal'
              : '汇率小数字符串',
        exact: true,
      }),
    ).toHaveValue('1.25')
    expect(
      await page.evaluate(() =>
        localStorage.getItem('honsen.procure.ui-locale'),
      ),
    ).toBe(locale)
  }
  expect(errors).toEqual([])
})
