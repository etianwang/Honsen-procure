import { expect, test } from '@playwright/test'

for (const [locale, label] of [
  ['zh', '搜索编码或名称'],
  ['en', 'Search code or name'],
  ['fr', 'Rechercher par code ou nom'],
] as const) {
  test(`reference dictionary searches all pages by code and name in ${locale}`, async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('button', { name: '打开界面预览', exact: true })
      .waitFor()
    await page.evaluate(async (locale) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      const { ReferenceDataTable } = await load(
        '/src/components/ReferenceDataTable.tsx',
      )
      setUiLocale(locale)
      const host = document.createElement('div')
      document.body.replaceChildren(host)
      const createRoot = DOM.createRoot ?? DOM.default.createRoot
      const createElement = React.createElement ?? React.default.createElement
      createRoot(host).render(
        createElement(ReferenceDataTable, {
          rowKey: 'id',
          dataSource: Array.from({ length: 61 }, (_, i) => ({
            id: String(i),
            business_code: `UNIT-${String(i).padStart(3, '0')}`,
            name: i === 60 ? 'Équipe spéciale' : 'Synthetic unit',
          })),
          columns: [
            { title: 'Code', dataIndex: 'business_code' },
            { title: 'Name', dataIndex: 'name' },
          ],
        }),
      )
    }, locale)
    await expect(page.getByRole('row')).toHaveCount(26)
    await page.getByTitle('3', { exact: true }).click()
    await expect(
      page.getByRole('cell', { name: 'UNIT-060', exact: true }),
    ).toBeVisible()
    await page.getByLabel(label, { exact: true }).fill('unit-060 equipe')
    await expect(page.getByRole('row')).toHaveCount(2)
    await expect(
      page.getByRole('cell', { name: 'Équipe spéciale', exact: true }),
    ).toBeVisible()
    await page.getByLabel(label, { exact: true }).fill('no match')
    await expect(
      page.getByRole('cell', { name: 'UNIT-060', exact: true }),
    ).toHaveCount(0)
    await page.getByLabel(label, { exact: true }).fill('')
    await expect(page.getByRole('row')).toHaveCount(26)
    await expect(
      page.getByRole('cell', { name: 'UNIT-000', exact: true }),
    ).toBeVisible()
  })
}
