import { openShellPage } from './shell-controls'
import { expect, test } from '@playwright/test'

for (const [
  locale,
  nav,
  searchLabel,
  paginationLabel,
  previous,
  next,
  retry,
  inactive,
  scrollLabel,
  actionLabel,
] of [
  [
    'zh',
    '材料库',
    '搜索材料',
    '材料分页',
    '上一页',
    '下一页',
    '重试',
    '显示停用材料',
    '材料表格，可横向滚动',
    '操作',
  ],
  [
    'en',
    'Materials',
    'Search materials',
    'Material pages',
    'Previous page',
    'Next page',
    'Retry',
    'Show inactive materials',
    'Materials table; scroll horizontally',
    'Actions',
  ],
  [
    'fr',
    'Matériaux',
    'Rechercher des matériaux',
    'Pages des matériaux',
    'Page précédente',
    'Page suivante',
    'Réessayer',
    'Afficher les matériaux désactivés',
    'Tableau des matériaux ; défilement horizontal',
    'Actions',
  ],
]) {
  test(
    'materials database pages feedback and bounded local scrolling ' + locale,
    async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 })
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(e.message))
      await page.addInitScript(
        ({ locale }) => {
          localStorage.setItem('honsen.procure.ui-locale', locale)
          const requests: Array<{
            query: string
            after: unknown
            includeInactive: boolean
            projectId: string
          }> = []
          let rejected = false
          let holdNextRead = false
          const material = (i: number, active = true) => ({
            id: 'synthetic-material-' + i,
            sku: 'SYNTH-' + i,
            nameZh: '合成材料' + i,
            nameFr: 'Matériau synthétique ' + i,
            nameEn: 'Synthetic material ' + i,
            aliases: [],
            brand: null,
            model: 'MODEL',
            specification: 'Synthetic specification',
            unit: 'pcs',
            notes: null,
            version: 1,
            isActive: active,
            prices: [],
          })
          Object.assign(window, {
            __materialsRequests: requests,
            __holdNextMaterialsRead: () => {
              holdNextRead = true
            },
            __TAURI__: {
              core: {
                invoke: async (
                  command: string,
                  args?: {
                    query?: string
                    after?: unknown
                    includeInactive?: boolean
                    projectId?: string
                  },
                ) => {
                  if (command === 'search_catalog_page') {
                    const query = args?.query ?? ''
                    requests.push({
                      query,
                      after: args?.after,
                      includeInactive: args?.includeInactive ?? false,
                      projectId: args?.projectId ?? '',
                    })
                    if (holdNextRead) {
                      holdNextRead = false
                      return new Promise((resolve) =>
                        Object.assign(window, {
                          __resolveMaterialsFilter: () =>
                            resolve({
                              records: Array.from({ length: 50 }, (_, i) =>
                                material(i),
                              ),
                              nextCursor: {
                                nameZh: '合成材料49',
                                model: 'MODEL',
                                id: 'synthetic-material-49',
                              },
                            }),
                        }),
                      )
                    }
                    if (query === 'error' && !rejected) {
                      rejected = true
                      throw Error('Synthetic read failure')
                    }
                    if (query === 'old')
                      return new Promise((resolve) =>
                        Object.assign(window, {
                          __resolveMaterialsOld: () =>
                            resolve({
                              records: [material(999)],
                              nextCursor: null,
                            }),
                        }),
                      )
                    if (query === 'none')
                      return { records: [], nextCursor: null }
                    if (args?.includeInactive)
                      return {
                        records: [material(1000, false)],
                        nextCursor: null,
                      }
                    if (query)
                      return { records: [material(777)], nextCursor: null }
                    return {
                      records: Array.from(
                        { length: args?.after ? 5 : 50 },
                        (_, i) => material(i + (args?.after ? 50 : 0)),
                      ),
                      nextCursor: args?.after
                        ? null
                        : {
                            nameZh: '合成材料49',
                            model: 'MODEL',
                            id: 'synthetic-material-49',
                          },
                    }
                  }
                  if (command === 'get_material_square_image') return null
                  if (command === 'search_catalog')
                    throw Error(
                      'Legacy catalog must not be used by native material page',
                    )
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
      await openShellPage(page, 'materials')
      const search = page.getByRole('searchbox', {
        name: searchLabel,
        exact: true,
      })
      await expect(
        page.locator('label[for="materials-search-input"] span').first(),
      ).toHaveText(searchLabel)
      const pager = page.getByRole('navigation', { name: paginationLabel })
      const region = page.getByRole('region', { name: scrollLabel })
      const name = (i: number) =>
        locale === 'fr'
          ? 'Matériau synthétique ' + i
          : locale === 'en'
            ? 'Synthetic material ' + i
            : '合成材料' + i
      await expect(region.getByRole('row')).toHaveCount(51)
      await expect(region.getByText(name(0), { exact: true })).toBeVisible()
      await expect(pager.getByRole('status')).toContainText('50')
      await expect(
        pager.getByRole('button', { name: previous, exact: true }),
      ).toBeDisabled()
      await pager.getByRole('button', { name: next, exact: true }).click()
      await expect(
        pager.getByRole('button', { name: next, exact: true }),
      ).toBeDisabled()
      await expect(region.getByRole('row')).toHaveCount(6)
      await expect(region.getByText(name(50), { exact: true })).toBeVisible()
      await expect(pager.getByRole('status')).toContainText('5')
      const beforeFilter = await page.evaluate(
        () =>
          (window as Window & { __materialsRequests: unknown[] })
            .__materialsRequests.length,
      )
      const applyFilter = page.getByRole('button', {
        name:
          locale === 'zh' ? /筛\s*选/ : locale === 'en' ? 'Filter' : 'Filtrer',
        exact: true,
      })
      await page.evaluate(() =>
        (
          window as Window & { __holdNextMaterialsRead: () => void }
        ).__holdNextMaterialsRead(),
      )
      await applyFilter.click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __materialsRequests: unknown[] })
                .__materialsRequests.length,
          ),
        )
        .toBe(beforeFilter + 1)
      await expect(applyFilter).toBeDisabled()
      await expect(applyFilter).toHaveClass(/ant-btn-loading/)
      await page.evaluate(() =>
        (
          window as Window & { __resolveMaterialsFilter: () => void }
        ).__resolveMaterialsFilter(),
      )
      await expect(region.getByRole('row')).toHaveCount(51)
      await expect(region.getByText(name(0), { exact: true })).toBeVisible()
      await expect(
        pager.getByRole('button', { name: previous, exact: true }),
      ).toBeDisabled()
      expect(
        await page.evaluate(
          () =>
            (window as Window & { __materialsRequests: unknown[] })
              .__materialsRequests.length,
        ),
      ).toBe(beforeFilter + 1)
      await pager.getByRole('button', { name: next, exact: true }).click()
      await expect(region.getByRole('row')).toHaveCount(6)
      await pager.getByRole('button', { name: previous, exact: true }).click()
      await expect(region.getByRole('row')).toHaveCount(51)
      await page.getByRole('switch', { name: inactive }).click()
      await expect(region.getByText(name(1000), { exact: true })).toBeVisible()
      expect(
        await page.evaluate(
          () =>
            (
              window as Window & {
                __materialsRequests: Array<{ includeInactive: boolean }>
              }
            ).__materialsRequests.at(-1)?.includeInactive,
        ),
      ).toBe(true)
      await page.getByRole('switch', { name: inactive }).click()
      await expect(region.getByRole('row')).toHaveCount(51)
      await search.fill('error')
      await expect(page.getByRole('alert')).toBeVisible()
      await page
        .getByRole('button', {
          name: locale === 'zh' ? /重\s*试/ : retry,
          exact: true,
        })
        .click()
      await expect(region.getByText(name(777), { exact: true })).toBeVisible()
      await search.fill('old')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & {
                  __materialsRequests: Array<{ query: string }>
                }
              ).__materialsRequests.at(-1)?.query,
          ),
        )
        .toBe('old')
      await search.fill('none')
      await expect(region).toHaveCount(0)
      await expect(pager.getByRole('status')).toContainText('0')
      await page.evaluate(() =>
        (
          window as Window & { __resolveMaterialsOld: () => void }
        ).__resolveMaterialsOld(),
      )
      await expect(page.getByText(name(999), { exact: true })).toHaveCount(0)
      const before = await page.evaluate(
        () =>
          (window as Window & { __materialsRequests: unknown[] })
            .__materialsRequests.length,
      )
      await search.pressSequentially(' copper', { delay: 10 })
      await expect(region.getByText(name(777), { exact: true })).toBeVisible()
      expect(
        await page.evaluate(
          () =>
            (window as Window & { __materialsRequests: unknown[] })
              .__materialsRequests.length,
        ),
      ).toBe(before + 1)
      await region.evaluate((el) => {
        el.scrollLeft = el.scrollWidth
      })
      await expect(
        region.getByRole('columnheader', { name: actionLabel, exact: true }),
      ).toBeInViewport()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.screenshot({
        path: '.cache/materials-page-' + locale + '-720.png',
      })
      const requests = await page.evaluate(
        () =>
          (
            window as Window & {
              __materialsRequests: Array<{
                query: string
                after: unknown
                projectId: string
              }>
            }
          ).__materialsRequests,
      )
      expect(
        requests.some((r) => r.after !== null && r.after !== undefined),
      ).toBe(true)
      expect(requests.every((r) => /^[0-9a-f-]{36}$/.test(r.projectId))).toBe(
        true,
      )
      expect(errors).toEqual([])
    },
  )
}
