import { selectShellLanguage } from './shell-controls'
import { expect, test } from '@playwright/test'
test('receipt locale switches preserve quantities, reasons and semantic messages', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?test=receipt')
  await page.getByLabel('fixture pipe 实收数量').fill('1.5')
  await page.getByLabel('超收原因', { exact: true }).fill('synthetic excess')
  await page
    .getByRole('button', { name: '按有条件完成关闭', exact: true })
    .click()
  await expect(
    page.getByText('有条件完成原因必填。', { exact: true }),
  ).toBeVisible()
  await selectShellLanguage(page, 'en')
  await expect(page.getByLabel('fixture pipe Received quantity')).toHaveValue(
    '1.5',
  )
  await expect(
    page.getByLabel('Over-receipt reason', { exact: true }),
  ).toHaveValue('synthetic excess')
  await expect(
    page.getByText('A conditional completion reason is required.', {
      exact: true,
    }),
  ).toBeVisible()
  await selectShellLanguage(page, 'fr')
  await expect(page.getByLabel('fixture pipe Quantité reçue')).toHaveValue(
    '1.5',
  )
  await expect(
    page.getByText('Un motif de clôture sous conditions est obligatoire.', {
      exact: true,
    }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Enregistrer la réception', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
