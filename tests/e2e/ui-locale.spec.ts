import {
  openShellAccount,
  openShellPage,
  selectShellLanguage,
} from './shell-controls'
import { expect, test } from '@playwright/test'

test('shell language persists while preserving the current route and unsaved draft', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await openShellPage(page, 'requisition')
  await page.getByLabel('税率（基点）').fill('537')
  await selectShellLanguage(page, 'en')
  await expect(
    page.getByRole('heading', { name: 'Purchase requisitions', exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-shell-group=catalog]')).toBeVisible()
  await expect(page.getByLabel('Tax rate (basis points)')).toHaveValue('537')
  await page
    .getByRole('button', { name: 'Submit for confirmation', exact: true })
    .click()
  await expect(
    page.getByText(
      'Complete materials, quantities and amounts before submitting.',
    ),
  ).toBeVisible()
  await selectShellLanguage(page, 'fr')
  await expect(
    page.getByRole('heading', { name: 'Demandes d’achat', exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-shell-group=catalog]')).toBeVisible()
  await expect(page.getByLabel('Taux de taxe (points de base)')).toHaveValue(
    '537',
  )
  await expect(
    page.getByText(
      'Renseignez matériaux, quantités et montants avant soumission.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Ouvrir l’aperçu' }).click()
  await openShellAccount(page)
  await expect(page.getByLabel('界面语言 / UI language / Langue')).toHaveValue(
    'fr',
  )
  await expect(
    page.getByRole('button', { name: 'Accueil', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
