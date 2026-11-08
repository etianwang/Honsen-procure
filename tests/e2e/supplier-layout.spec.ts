import { expect, test } from '@playwright/test'

for (const width of [1280, 1366, 1920]) {
  test(
    'French supplier columns and quote actions remain reachable at ' +
      width +
      'x720',
    async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.setViewportSize({ width, height: 720 })
      await page.addInitScript(() => {
        localStorage.setItem('honsen.procure.ui-locale', 'fr')
        const supplier = {
          id: '00000000-0000-4000-8000-000000000101',
          countryId: '00000000-0000-4000-8000-000000000001',
          businessCode: 'SYNTH-CODE-VERY-LONG',
          name: 'Fournisseur synthétique de matériaux de construction électriques',
          contactName: 'Contact synthétique',
          address: 'Adresse synthétique',
          city: 'Ville synthétique',
          country: null,
          phone: null,
          whatsapp: null,
          email: null,
          paymentTerms: null,
          deliveryLeadTime: null,
          notes: null,
          isActive: true,
          isBlacklisted: false,
          isPreferred: false,
          version: 1,
        }
        Object.assign(window, {
          __TAURI__: {
            core: {
              invoke: async (command: string) => {
                if (command === 'search_suppliers_page')
                  return { records: [supplier], nextCursor: null }
                if (command === 'list_supplier_prices')
                  return [
                    {
                      priceId: 'history-1',
                      materialId: 'material-1',
                      materialNameZh: '合成材料',
                      materialNameFr:
                        'Matériau synthétique avec une longue description',
                      materialNameEn: 'Synthetic material',
                      materialModel: 'SYNTH-MODEL',
                      materialSpecification: 'Spécification synthétique',
                      materialActive: true,
                      supplierId: supplier.id,
                      supplierName: supplier.name,
                      supplierActive: true,
                      isBlacklisted: false,
                      currency: 'XAF',
                      unitPriceMinor: '9007199254740993',
                      unit: 'pcs',
                      effectiveAt: '2026-11-09',
                      sourceNote: 'Référence synthétique conservée',
                      isActive: true,
                    },
                  ]
                if (command === 'list_suppliers')
                  throw Error('Unbounded legacy supplier read')
                return undefined
              },
            },
          },
        })
      })
      await page.goto('/')
      await page
        .getByRole('button', { name: 'Ouvrir l’aperçu', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Fournisseurs et prix', exact: true })
        .click()
      const suppliers = page.getByRole('region', {
        name: 'Liste des fournisseurs ; défilement horizontal',
      })
      const supplier = suppliers.getByRole('button', {
        name: 'Fournisseur synthétique de matériaux de construction électriques',
        exact: true,
      })
      await expect(supplier).toBeVisible()
      expect((await supplier.boundingBox())?.width).toBeGreaterThanOrEqual(160)
      await supplier.click()
      const edit = page.getByRole('button', {
        name: 'Modifier le fournisseur',
        exact: true,
      })
      await edit.scrollIntoViewIfNeeded()
      await expect(edit).toBeInViewport()
      const history = page.getByRole('region', {
        name: 'Historique des devis ; défilement horizontal',
      })
      await history.scrollIntoViewIfNeeded()
      await history.evaluate((el) => {
        el.scrollLeft = el.scrollWidth
      })
      await expect(history.getByRole('columnheader').last()).toBeInViewport()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.screenshot({
        path: '.cache/supplier-layout-fr-' + width + '.png',
      })
      expect(errors).toEqual([])
    },
  )
}
