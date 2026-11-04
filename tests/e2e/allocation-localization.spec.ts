import { expect, test } from '@playwright/test'
for (const [locale, heading, button, error] of [
  [
    'en',
    'Supplier allocation',
    'Create supplier child orders',
    'Each material requires a supplier, child order number and locked exchange rate.',
  ],
  [
    'fr',
    'Répartition par fournisseur',
    'Créer les sous-commandes fournisseurs',
    'Chaque matériau exige un fournisseur, un numéro de sous-commande et un taux de change figé.',
  ],
]) {
  test(`supplier allocation uses ${locale}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(
      (locale) => localStorage.setItem('honsen.procure.ui-locale', locale),
      locale,
    )
    await page.goto('/?test=allocation')
    await expect(page.getByText(heading, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: button, exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(error)
    expect(errors).toEqual([])
  })
}
