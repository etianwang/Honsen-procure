import { expect, test } from '@playwright/test'
for (const [locale, title, reason, error] of [
  ['en', 'Sync conflicts', 'Resolution reason', 'Enter a resolution reason.'],
  [
    'fr',
    'Conflits de synchronisation',
    'Motif de résolution',
    'Saisissez un motif de résolution.',
  ],
]) {
  test(`sync conflict controls use ${locale}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(
      (locale) => localStorage.setItem('honsen.procure.ui-locale', locale),
      locale,
    )
    await page.goto('/?test=sync-conflict')
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', {
        name: locale === 'en' ? 'Use server' : 'Utiliser la version serveur',
        exact: true,
      })
      .click()
    await expect(page.getByRole('status')).toHaveText(error)
    await page.getByLabel(reason, { exact: true }).fill('synthetic resolution')
    expect(errors).toEqual([])
  })
}
for (const [locale, button, reason, error] of [
  [
    'en',
    'Save policy',
    'Policy change reason',
    'A policy change reason is required.',
  ],
  [
    'fr',
    'Enregistrer la politique',
    'Motif de modification de la politique',
    'Un motif de modification est obligatoire.',
  ],
]) {
  test(`approval policy controls use ${locale}`, async ({ page }) => {
    await page.addInitScript(
      (locale) => localStorage.setItem('honsen.procure.ui-locale', locale),
      locale,
    )
    await page.goto('/?test=workflow')
    await page.getByRole('button', { name: button, exact: true }).click()
    await expect(page.getByText(error, { exact: true })).toBeVisible()
    await page
      .getByLabel(reason, { exact: true })
      .fill('synthetic policy reason')
    await expect(page.getByLabel(reason, { exact: true })).toHaveValue(
      'synthetic policy reason',
    )
  })
}
