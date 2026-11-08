import { expect, test } from '@playwright/test'
test('login locale switches persist and translate preview controls', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page
    .getByRole('button', { name: '界面语言 / UI language / Langue' })
    .click()
  await page.getByRole('menuitem', { name: 'English', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Sign in to HONSEN Procure' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: '界面语言 / UI language / Langue' })
    .click()
  await page.getByRole('menuitem', { name: 'Français', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Ouvrir l’aperçu', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Connexion à HONSEN Procure' }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('compact login language menu preserves entered credentials and captcha', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (
              command === 'issue_local_captcha' ||
              command === 'issue_cloud_captcha'
            )
              return { id: 'synthetic-captcha', question: '3 + 4 = ?' }
            throw new Error('Unexpected command')
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByLabel('账号', { exact: true }).fill('synthetic-user')
  await page
    .getByLabel('密码', { exact: true })
    .fill('synthetic-unsaved-password')
  await page.locator('#captcha').fill('7')
  const picker = page.getByRole('button', {
    name: '界面语言 / UI language / Langue',
  })
  await picker.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'Français', exact: true }).click()
  await expect(picker).toContainText('Français')
  await expect(page.locator('#account')).toHaveValue('synthetic-user')
  await expect(page.locator('#password')).toHaveValue(
    'synthetic-unsaved-password',
  )
  await expect(page.locator('#captcha')).toHaveValue('7')
  expect(
    await picker.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThan(180)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await expect(page.getByRole('menu')).not.toBeVisible()
  await page.screenshot({ path: '.cache/login-picker-preview.png' })
  expect(errors).toEqual([])
})
