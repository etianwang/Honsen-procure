import { expect, test } from '@playwright/test'

test('cloud CAPTCHA failure explains disabled login and offers a working retry', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    let attempts = 0
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'issue_local_captcha')
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'issue_cloud_captcha') {
              if (++attempts === 1) throw new Error('synthetic network failure')
              return { id: crypto.randomUUID(), question: '2 + 2 = ?' }
            }
            throw new Error('Unexpected command')
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(
    page.getByText('无法获取云端验证码，请检查网络后重试。'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '在线登录', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: '重新获取云端验证码', exact: true })
    .click()
  await expect(page.getByLabel('云端验证码：2 + 2 = ?')).toBeVisible()
  await expect(
    page.getByText('无法获取云端验证码，请检查网络后重试。'),
  ).not.toBeVisible()
  await page.locator('#cloud-captcha').fill('4')
  await expect(
    page.getByRole('button', { name: '在线登录', exact: true }),
  ).toBeEnabled()
  expect(errors).toEqual([])
})
