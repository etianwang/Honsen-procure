import { expect, test } from '@playwright/test'
test('login locale switches persist and translate preview controls', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByLabel('界面语言 / UI language / Langue').selectOption('en')
  await expect(
    page.getByRole('heading', { name: 'Sign in to HONSEN Procure' }),
  ).toBeVisible()
  await page.getByLabel('界面语言 / UI language / Langue').selectOption('fr')
  await expect(
    page.getByRole('button', { name: 'Ouvrir l’aperçu', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Connexion à HONSEN Procure' }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
