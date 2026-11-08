import { expect, test } from '@playwright/test'
for (const [locale, nav, maintain, supplierLabel, retry] of [
  ['zh', '材料库', '维护报价', '供应商', '重试'],
  ['en', 'Materials', 'Maintain quote', 'Supplier', 'Retry'],
  ['fr', 'Matériaux', 'Gérer le devis', 'Fournisseur', 'Réessayer'],
]) {
  test(
    'material quote opens with bounded explicit country supplier search ' +
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
          const requests: Array<{
            countryId: string
            selectableOnly: boolean
            query: string
          }> = []
          let failed = false
          const material = {
            id: '00000000-0000-4000-8000-000000000101',
            sku: 'SYNTH-M',
            nameZh: '合成材料',
            nameFr: 'Matériau synthétique',
            nameEn: 'Synthetic material',
            model: 'MODEL',
            specification: 'Synthetic specification',
            unit: 'pcs',
            aliases: [],
            brand: null,
            notes: null,
            isActive: true,
            version: 1,
            prices: [
              {
                priceId: '00000000-0000-4000-8000-000000000201',
                supplierId: '00000000-0000-4000-8000-000000000301',
                supplierName: 'Known synthetic vendor',
                isPreferredSupplier: false,
                currency: 'XAF',
                unitPriceMinor: '9007199254740993',
                unit: 'pcs',
                effectiveAt: '2026-11-09',
              },
            ],
          }
          Object.assign(window, {
            __materialQuoteSupplierRequests: requests,
            __materialQuoteLegacyReads: 0,
            __TAURI__: {
              core: {
                invoke: async (
                  command: string,
                  args?: {
                    countryId?: string
                    selectableOnly?: boolean
                    query?: string
                  },
                ) => {
                  if (command === 'search_catalog_page')
                    return { records: [material], nextCursor: null }
                  if (command === 'get_material_square_image') return null
                  if (command === 'list_suppliers') {
                    Object.assign(window, { __materialQuoteLegacyReads: 1 })
                    throw Error(
                      'Unbounded supplier load not permitted for quote editor',
                    )
                  }
                  if (command === 'search_suppliers_page') {
                    requests.push({
                      countryId: args?.countryId ?? '',
                      selectableOnly: args?.selectableOnly ?? false,
                      query: args?.query ?? '',
                    })
                    if (!failed) {
                      failed = true
                      throw Error('Synthetic query failure')
                    }
                    return {
                      records: [
                        {
                          id: '00000000-0000-4000-8000-000000000301',
                          countryId: args?.countryId,
                          businessCode: 'SYNTH-V',
                          name: 'Known synthetic vendor',
                          contactName: null,
                          address: null,
                          city: null,
                          country: null,
                          phone: null,
                          whatsapp: null,
                          email: null,
                          paymentTerms: null,
                          deliveryLeadTime: null,
                          isActive: true,
                          isBlacklisted: false,
                          isPreferred: false,
                          version: 1,
                        },
                      ],
                      nextCursor: null,
                    }
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
      await expect(
        page.getByText('Known synthetic vendor', { exact: true }),
      ).toBeVisible()
      await page.getByRole('button', { name: maintain, exact: true }).click()
      const dialog = page.getByRole('dialog')
      const picker = dialog.getByRole('combobox', {
        name: supplierLabel,
        exact: true,
      })
      await expect(picker).toHaveValue('')
      expect(
        await page.evaluate(
          () =>
            (window as Window & { __materialQuoteSupplierRequests: unknown[] })
              .__materialQuoteSupplierRequests.length,
        ),
      ).toBe(0)
      await picker.click()
      await expect(dialog).toBeVisible()
      await expect(page.getByRole('alert')).toBeVisible()
      await page
        .getByRole('button', {
          name: locale === 'zh' ? /重\s*试/ : retry,
          exact: true,
        })
        .click()
      await expect(
        page
          .locator('.ant-select-dropdown:visible')
          .getByText('SYNTH-V · Known synthetic vendor', { exact: true }),
      ).toBeVisible()
      await expect(picker).toHaveValue('')
      const requests = await page.evaluate(
        () =>
          (
            window as Window & {
              __materialQuoteSupplierRequests: Array<{
                countryId: string
                selectableOnly: boolean
              }>
            }
          ).__materialQuoteSupplierRequests,
      )
      expect(requests).toHaveLength(2)
      expect(
        requests.every(
          (row) => /^[0-9a-f-]{36}$/.test(row.countryId) && row.selectableOnly,
        ),
      ).toBe(true)
      expect(
        await page.evaluate(
          () =>
            (window as Window & { __materialQuoteLegacyReads: number })
              .__materialQuoteLegacyReads,
        ),
      ).toBe(0)
      expect(errors).toEqual([])
    },
  )
}
