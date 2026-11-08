import { expect, test } from '@playwright/test'
for (const [
  locale,
  nav,
  manage,
  edit,
  save,
  nameLabel,
  previous,
  next,
  retry,
] of [
  [
    'zh',
    '材料库',
    '供应商管理',
    '编辑供应商',
    '保存供应商',
    '供应商名称',
    '上一页',
    '下一页',
    '重试',
  ],
  [
    'en',
    'Materials',
    'Supplier management',
    'Edit supplier',
    'Save supplier',
    'Supplier name',
    'Previous page',
    'Next page',
    'Retry',
  ],
  [
    'fr',
    'Matériaux',
    'Gestion des fournisseurs',
    'Modifier le fournisseur',
    'Enregistrer le fournisseur',
    'Nom du fournisseur',
    'Page précédente',
    'Page suivante',
    'Réessayer',
  ],
]) {
  test(
    'material supplier manager pages all statuses and retries reads without duplicate writes ' +
      locale,
    async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.addInitScript(
        ({ locale }) => {
          localStorage.setItem('honsen.procure.ui-locale', locale)
          const reads: Array<{
            countryId: string
            selectableOnly: boolean
            query: string
            after: unknown
          }> = []
          const writes: Array<{ id: string; countryId: string; name: string }> =
            []
          let successes = 0
          let failRead = false
          let renamed = 'Synthetic supplier 0'
          const row = (i: number, countryId: string) => ({
            id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
            countryId,
            businessCode: 'SYNTH-' + i,
            name: i === 0 ? renamed : 'Synthetic supplier ' + i,
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
            isActive: i !== 1,
            isBlacklisted: i === 2,
            isPreferred: false,
            version: 1,
          })
          Object.assign(window, {
            __managerReads: reads,
            __managerWrites: writes,
            __managerSaveSuccesses: () => successes,
            __TAURI__: {
              core: {
                invoke: async (
                  command: string,
                  args?: {
                    query?: string
                    countryId?: string
                    after?: unknown
                    selectableOnly?: boolean
                    supplier?: { id: string; countryId: string; name: string }
                  },
                ) => {
                  if (command === 'search_catalog_page')
                    return { records: [], nextCursor: null }
                  if (command === 'list_suppliers')
                    throw Error('Legacy unbounded supplier read')
                  if (command === 'search_suppliers_page') {
                    const query = args?.query ?? '',
                      countryId = args?.countryId ?? ''
                    reads.push({
                      countryId,
                      query,
                      after: args?.after,
                      selectableOnly: args?.selectableOnly ?? false,
                    })
                    if (failRead) {
                      failRead = false
                      throw Error(
                        'Synthetic read failure after successful write',
                      )
                    }
                    if (query === 'old')
                      return new Promise((resolve) =>
                        Object.assign(window, {
                          __resolveOldManager: () =>
                            resolve({
                              records: [row(999, countryId)],
                              nextCursor: null,
                            }),
                        }),
                      )
                    if (query)
                      return {
                        records: [row(777, countryId)],
                        nextCursor: null,
                      }
                    return {
                      records: Array.from(
                        { length: args?.after ? 5 : 50 },
                        (_, i) => row(i + (args?.after ? 50 : 0), countryId),
                      ),
                      nextCursor: args?.after
                        ? null
                        : {
                            isActive: true,
                            name: 'Synthetic supplier 49',
                            id: row(49, countryId).id,
                          },
                    }
                  }
                  if (command === 'save_supplier') {
                    const input = args?.supplier
                    if (!input) throw Error('Missing synthetic supplier input')
                    writes.push(input)
                    return new Promise((resolve, reject) =>
                      Object.assign(window, {
                        __settleManagerWrite: (ok: boolean) => {
                          if (!ok) {
                            reject(Error('Synthetic write rejection'))
                            return
                          }
                          renamed = input.name
                          successes++
                          failRead = true
                          resolve(undefined)
                        },
                      }),
                    )
                  }
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
      await page.getByRole('button', { name: nav, exact: true }).click()
      await page.getByRole('button', { name: manage, exact: true }).click()
      const manager = page.getByRole('dialog', { name: manage, exact: true })
      const pager = manager.getByRole('navigation')
      await expect(manager.locator('tbody tr')).toHaveCount(50)
      await expect(
        manager.getByText(
          locale === 'zh' ? '停用' : locale === 'en' ? 'Inactive' : 'Inactif',
          { exact: true },
        ),
      ).toBeVisible()
      await expect(
        manager.getByText(
          locale === 'zh'
            ? '黑名单'
            : locale === 'en'
              ? 'Blacklisted'
              : 'Liste noire',
          { exact: true },
        ),
      ).toBeVisible()
      await pager.getByRole('button', { name: next, exact: true }).click()
      await expect(manager.locator('tbody tr')).toHaveCount(5)
      await pager.getByRole('button', { name: previous, exact: true }).click()
      await expect(manager.locator('tbody tr')).toHaveCount(50)
      const search = manager.locator('#materials-supplier-search')
      await search.fill('old')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & { __managerReads: Array<{ query: string }> }
              ).__managerReads.at(-1)?.query,
          ),
        )
        .toBe('old')
      await search.fill('fresh')
      await expect(
        manager.getByText('Synthetic supplier 777', { exact: true }),
      ).toBeVisible()
      await page.evaluate(() =>
        (
          window as Window & { __resolveOldManager: () => void }
        ).__resolveOldManager(),
      )
      await expect(
        manager.getByText('Synthetic supplier 999', { exact: true }),
      ).toHaveCount(0)
      await search.fill('')
      await expect(manager.locator('tbody tr')).toHaveCount(50)
      const first = manager.getByRole('row').filter({
        has: page.getByRole('cell', { name: 'SYNTH-0', exact: true }),
      })
      await first.getByRole('button', { name: edit, exact: true }).click()
      const editor = page.getByRole('dialog', { name: edit, exact: true })
      const name = editor.getByLabel(nameLabel, { exact: true })
      await name.fill('Synthetic renamed supplier')
      await editor.getByRole('button', { name: save, exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __managerWrites: unknown[] })
                .__managerWrites.length,
          ),
        )
        .toBe(1)
      await expect(name).toBeDisabled()
      await page.evaluate(() =>
        (
          window as Window & { __settleManagerWrite: (ok: boolean) => void }
        ).__settleManagerWrite(false),
      )
      await expect(editor.getByRole('alert')).toBeVisible()
      await expect(name).toHaveValue('Synthetic renamed supplier')
      await editor.getByRole('button', { name: save, exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __managerWrites: unknown[] })
                .__managerWrites.length,
          ),
        )
        .toBe(2)
      await page.evaluate(() =>
        (
          window as Window & { __settleManagerWrite: (ok: boolean) => void }
        ).__settleManagerWrite(true),
      )
      await expect(editor).not.toBeVisible()
      const warning = manager.getByRole('alert')
      await expect(warning).toHaveClass(/ant-alert-warning/)
      await expect(warning).toContainText(
        locale === 'zh'
          ? '不要重复保存'
          : locale === 'en'
            ? 'do not save again'
            : 'pas l’enregistrement',
      )
      await warning
        .getByRole('button', {
          name: locale === 'zh' ? /重\s*试/ : retry,
          exact: true,
        })
        .click()
      await expect(
        manager.getByText('Synthetic renamed supplier', { exact: true }),
      ).toBeVisible()
      const writes = await page.evaluate(
        () =>
          (
            window as Window & {
              __managerWrites: Array<{
                id: string
                countryId: string
                name: string
              }>
            }
          ).__managerWrites,
      )
      const reads = await page.evaluate(
        () =>
          (
            window as Window & {
              __managerReads: Array<{
                countryId: string
                selectableOnly: boolean
              }>
            }
          ).__managerReads,
      )
      expect(writes).toHaveLength(2)
      expect(writes[0].id).toBe(writes[1].id)
      expect(writes[1].countryId).toBe(reads[0].countryId)
      expect(
        reads.every(
          (read) =>
            !read.selectableOnly && /^[0-9a-f-]{36}$/.test(read.countryId),
        ),
      ).toBe(true)
      expect(
        await page.evaluate(() =>
          (
            window as Window & { __managerSaveSuccesses: () => number }
          ).__managerSaveSuccesses(),
        ),
      ).toBe(1)
      await page.screenshot({
        path: '.cache/material-supplier-manager-' + locale + '.png',
      })
      expect(errors).toEqual([])
    },
  )
}
