import { expect, test } from '@playwright/test'
for (const [locale, label, more, retry, error, empty] of [
  [
    'zh',
    '材料',
    '加载更多材料',
    '重试',
    '材料查询失败，请重试',
    '未找到匹配材料',
  ],
  [
    'en',
    'Material',
    'Load more materials',
    'Retry',
    'Material search failed. Retry.',
    'No matching materials',
  ],
  [
    'fr',
    'Matériau',
    'Charger plus de matériaux',
    'Réessayer',
    'Échec de la recherche. Réessayez.',
    'Aucun matériau correspondant',
  ],
]) {
  test(
    'material picker debounce pagination recovery and keyboard ' + locale,
    async ({ page }) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await page.addInitScript(
        ({ locale }) => {
          localStorage.setItem('honsen.procure.ui-locale', locale)
          const requests: Array<{ query: string; after: unknown }> = []
          let failed = false
          let renamed = false
          const material = (i: number) => ({
            id: 'material-' + i,
            sku: 'SYNTH-' + i,
            nameZh: (renamed ? '更新材料' : '材料') + i,
            nameFr: 'Matériau ' + i,
            nameEn: (renamed ? 'Renamed material ' : 'Material ') + i,
            aliases: ['wire'],
            brand: null,
            model: 'MODEL',
            specification: '3x25',
            unit: 'm',
            notes: null,
            version: 1,
            prices: [],
          })
          Object.assign(window, {
            __materialRequests: requests,
            __renameMaterial: () => {
              renamed = true
            },
            __TAURI__: {
              core: {
                invoke: async (
                  command: string,
                  args?: { query?: string; after?: { id: string } },
                ) => {
                  if (command === 'search_catalog_page') {
                    const query = args?.query ?? ''
                    requests.push({ query, after: args?.after })
                    if (query === 'error' && !failed) {
                      failed = true
                      throw Error('synthetic')
                    }
                    if (query === 'old')
                      return new Promise((resolve) =>
                        Object.assign(window, {
                          __resolveOld: () =>
                            resolve({
                              records: [material(999)],
                              nextCursor: null,
                            }),
                        }),
                      )
                    if (query === 'none')
                      return { records: [], nextCursor: null }
                    if (query)
                      return { records: [material(777)], nextCursor: null }
                    return {
                      records: Array.from({ length: 50 }, (_, i) =>
                        material(i + (args?.after ? 50 : 0)),
                      ),
                      nextCursor: args?.after
                        ? null
                        : {
                            nameZh: '材料49',
                            model: 'MODEL',
                            id: 'material-49',
                          },
                    }
                  }
                  if (command === 'list_requisition_history')
                    return { records: [], nextCursor: null }
                  if (command === 'list_catalog_prices') return []
                  if (command === 'search_catalog') return []
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
      await page
        .getByRole('button', {
          name: /^(采购申请单|Purchase requisitions|Demandes d’achat)$/,
        })
        .click()
      const picker = page.getByRole('combobox', { name: label, exact: true })
      await picker.click()
      await expect(page.getByRole('button', { name: more })).toBeVisible()
      await page.getByRole('button', { name: more }).click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __materialRequests: unknown[] })
                .__materialRequests.length,
          ),
        )
        .toBe(2)
      expect(
        await page.locator('.ant-select-item-option').count(),
      ).toBeLessThan(30)
      await picker.fill('error')
      await expect(page.getByRole('alert')).toContainText(error)
      await page
        .getByRole('button', {
          name: locale === 'zh' ? /重\s*试/ : retry,
          exact: true,
        })
        .click()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await picker.fill('old')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & {
                  __materialRequests: Array<{ query: string }>
                }
              ).__materialRequests.at(-1)?.query,
          ),
        )
        .toBe('old')
      await picker.fill('none')
      await expect(
        page.locator('.ant-select-dropdown:visible').getByRole('status'),
      ).toContainText(empty)
      await page.evaluate(() =>
        (window as Window & { __resolveOld: () => void }).__resolveOld(),
      )
      await expect(
        page.locator('.ant-select-dropdown:visible').getByRole('status'),
      ).toContainText(empty)
      const before = await page.evaluate(
        () =>
          (window as Window & { __materialRequests: unknown[] })
            .__materialRequests.length,
      )
      await picker.pressSequentially(' copper', { delay: 10 })
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __materialRequests: unknown[] })
                .__materialRequests.length,
          ),
        )
        .toBe(before + 1)
      await picker.press('ArrowDown')
      await picker.press('Enter')
      await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
      await expect(
        page.getByLabel(/^(单位|Unit|Unité)$/, { exact: true }),
      ).toHaveValue('m')
      await picker.click()
      await picker.press('Escape')
      await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
      if (locale === 'en') {
        await expect(picker.locator('xpath=ancestor::label')).toContainText(
          '材料777 · MODEL',
        )
        await page.evaluate(() =>
          (
            window as Window & { __renameMaterial: () => void }
          ).__renameMaterial(),
        )
        await page
          .getByRole('button', { name: 'Add material line', exact: true })
          .click()
        const secondPicker = page
          .getByRole('combobox', { name: label, exact: true })
          .last()
        await secondPicker.click()
        await secondPicker.fill('renamed')
        await expect(
          page.getByText('Renamed material 777 · MODEL', { exact: true }),
        ).toBeVisible()
        await secondPicker.press('ArrowDown')
        await secondPicker.press('Enter')
        const selectedLabels = page
          .getByRole('combobox', { name: label, exact: true })
          .first()
          .locator('xpath=ancestor::label')
        await expect(selectedLabels).toContainText('材料777 · MODEL')
        await expect(
          secondPicker.locator('xpath=ancestor::label'),
        ).toContainText('更新材料777 · MODEL')
      }
      await page.screenshot({
        path: '.cache/material-picker-' + locale + '.png',
      })
      expect(errors).toEqual([])
    },
  )
}
