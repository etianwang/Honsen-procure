import { expect, test } from '@playwright/test'
for (const [locale, search, empty] of [
  ['en', 'Search materials', 'No matching materials'],
  ['fr', 'Rechercher des matériaux', 'Aucun matériau correspondant'],
]) {
  test(`catalog search and empty state use ${locale}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(
      (locale) => localStorage.setItem('honsen.procure.ui-locale', locale),
      locale,
    )
    await page.goto('/?test=catalog')
    await expect(page.getByText('fixture supplier D')).toBeVisible()
    await page
      .getByLabel(search, { exact: true })
      .fill('nonexistent synthetic material')
    await expect(
      page.getByRole('status').filter({ hasText: empty }),
    ).toHaveText(empty)
    expect(errors).toEqual([])
  })
}
