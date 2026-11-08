import { expect, test } from '@playwright/test'

for (const [locale, add, code, name, save, success] of [
  [
    'zh',
    '新增供应商',
    '供应商编码',
    '供应商名称',
    '保存供应商',
    '供应商已保存到本地；等待同步确认。',
  ],
  [
    'en',
    'Add supplier',
    'Supplier code',
    'Supplier name',
    'Save supplier',
    'Supplier saved locally; awaiting synchronization acknowledgement.',
  ],
  [
    'fr',
    'Ajouter un fournisseur',
    'Code fournisseur',
    'Nom du fournisseur',
    'Enregistrer le fournisseur',
    'Fournisseur enregistré localement ; synchronisation en attente.',
  ],
] as const) {
  test(`supplier editor excludes repeated saves and retains a rejected draft in ${locale}`, async ({
    page,
  }) => {
    await page.addInitScript((locale) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      const writes: unknown[] = []
      Object.assign(window, {
        __supplierWrites: writes,
        __TAURI__: {
          core: {
            invoke: async (command: string, args?: { supplier?: unknown }) => {
              if (command === 'search_suppliers_page')
                return { records: [], nextCursor: null }
              if (command === 'list_supplier_prices') return []
              if (command === 'save_supplier') {
                writes.push(args?.supplier)
                return new Promise((resolve, reject) =>
                  Object.assign(window, {
                    __settleSupplier: (fail: boolean) =>
                      fail
                        ? reject(Error('Synthetic denied'))
                        : resolve(undefined),
                  }),
                )
              }
              return undefined
            },
          },
        },
      })
    }, locale)
    await page.goto('/')
    await page
      .getByRole('button', {
        name: /打开界面预览|Open interface preview|Ouvrir l’aperçu/,
      })
      .click()
    await page
      .getByRole('button', {
        name: /^(供应商与价格|Suppliers and prices|Fournisseurs et prix)$/,
      })
      .click()
    await page.getByRole('button', { name: add, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: add, exact: true })
    await dialog.getByLabel(code, { exact: true }).fill('SYNTH-GUARDED')
    const input = dialog.getByLabel(name, { exact: true })
    await input.fill('Synthetic pending supplier')
    const button = dialog.getByRole('button', { name: save, exact: true })
    await button.click()
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('aria-busy', 'true')
    await expect(input).toBeDisabled()
    await dialog.locator('form').dispatchEvent('submit')
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __supplierWrites: unknown[] }).__supplierWrites
            .length,
      ),
    ).toBe(1)
    await page.evaluate(() =>
      (
        window as Window & { __settleSupplier: (fail: boolean) => void }
      ).__settleSupplier(true),
    )
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(input).toHaveValue('Synthetic pending supplier')
    await button.click()
    await expect(button).toBeDisabled()
    await page.evaluate(() =>
      (
        window as Window & { __settleSupplier: (fail: boolean) => void }
      ).__settleSupplier(false),
    )
    await expect(dialog).not.toBeVisible()
    await expect(
      page.getByRole('status').filter({ hasText: success }),
    ).toBeVisible()
    const writes = await page.evaluate(
      () =>
        (window as Window & { __supplierWrites: Array<{ countryId: string }> })
          .__supplierWrites,
    )
    expect(writes).toHaveLength(2)
    for (const write of writes)
      expect(write).toMatchObject({
        businessCode: 'SYNTH-GUARDED',
        name: 'Synthetic pending supplier',
        countryId: writes[0].countryId,
      })
    expect(writes[0].countryId).toMatch(/^[0-9a-f-]{36}$/)
  })
}
