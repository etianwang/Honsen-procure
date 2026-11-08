import { expect, test } from '@playwright/test'

for (const [locale, more, filter, search, exportLanguage] of [
  ['zh', '加载更多', '筛选', '搜索单号、项目或工地', 'Excel导出语言'],
  [
    'en',
    'Load more',
    'Filter',
    'Search number, project or site',
    'Excel export language',
  ],
  [
    'fr',
    'Charger plus',
    'Filtrer',
    'Rechercher numéro, projet ou chantier',
    'Langue de l’export Excel',
  ],
] as const) {
  for (const lateFailure of [false, true]) {
    test(`history excludes an old page after changing filters in ${locale}, late failure=${lateFailure}`, async ({
      page,
    }) => {
      await page.goto('/')
      await page.evaluate(
        async ({ locale, lateFailure }) => {
          const load = (path: string) => import(/* @vite-ignore */ path)
          const React = await load('/node_modules/.vite/deps/react.js')
          const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
          const { setUiLocale } = await load('/src/lib/ui-locale.ts')
          const { RequisitionHistoryPanel } = await load(
            '/src/components/RequisitionHistoryPanel.tsx',
          )
          setUiLocale(locale)
          const record = (id: string) => ({
            id,
            displayNo: id,
            projectName: 'Synthetic project',
            site: 'Synthetic site',
            workflowStatus: 'draft',
            procurementMode: 'honsen_self_purchase',
            primaryCurrency: 'EUR',
            totalMinor: '12345',
            updatedAt: 1,
            applicantName: 'Synthetic applicant',
            orderDate: '2026-11-09',
          })
          const host = document.createElement('div')
          document.body.replaceChildren(host)
          const createRoot = DOM.createRoot ?? DOM.default.createRoot
          const createElement =
            React.createElement ?? React.default.createElement
          let count = 0
          Object.assign(window, { __historyPageCalls: 0 })
          createRoot(host).render(
            createElement(RequisitionHistoryPanel, {
              projectId: 'project',
              applicantId: 'user',
              refreshKey: '1',
              canApprove: false,
              onCopy: () => {},
              api: {
                listRequisitionHistory: async (
                  cursor: unknown,
                  filter: { query?: string },
                ) => {
                  Object.assign(window, { __latestHistoryFilter: filter })
                  if (cursor) {
                    Object.assign(window, { __historyPageCalls: ++count })
                    return new Promise((resolve, reject) =>
                      Object.assign(window, {
                        __releaseHistoryPage: () =>
                          lateFailure
                            ? reject(Error('old page failed'))
                            : resolve({
                                records: [record('OLD-PAGE')],
                                nextCursor: null,
                              }),
                      }),
                    )
                  }
                  return {
                    records: [record(filter.query ? 'NEW-FILTER' : 'INITIAL')],
                    nextCursor: filter.query
                      ? null
                      : { updatedAt: 1, id: 'INITIAL' },
                  }
                },
              },
            }),
          )
        },
        { locale, lateFailure },
      )
      await expect(
        page.getByRole('button', { name: 'INITIAL', exact: true }),
      ).toBeVisible()
      await page.getByRole('button', { name: more, exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __historyPageCalls: number })
                .__historyPageCalls,
          ),
        )
        .toBe(1)
      await page.getByLabel(search, { exact: true }).fill('new')
      await page.locator('input[type="date"]').first().fill('2026-11-01')
      await page.locator('input[type="date"]').last().fill('2026-11-09')
      await page.getByRole('button', { name: filter, exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'NEW-FILTER', exact: true }),
      ).toBeVisible()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __latestHistoryFilter: unknown })
                .__latestHistoryFilter,
          ),
        )
        .toEqual({ query: 'new', dateFrom: '2026-11-01', dateTo: '2026-11-09' })
      await expect(
        page.getByText('Synthetic applicant', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('cell', { name: '2026-11-09', exact: true }),
      ).toBeVisible()
      await page.evaluate(() =>
        (
          window as Window & { __releaseHistoryPage: () => void }
        ).__releaseHistoryPage(),
      )
      await expect(page.getByText('OLD-PAGE', { exact: true })).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'NEW-FILTER', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByLabel(exportLanguage, { exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    })
  }
}
