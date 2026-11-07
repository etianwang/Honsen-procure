import { expect, test } from '@playwright/test'

test('a delayed cloud CAPTCHA never clears the new local answer', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let resolveCloud: (value: object) => void
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __releaseCloud: () =>
        resolveCloud({ id: crypto.randomUUID(), question: '2 + 2 = ?' }),
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'issue_local_captcha')
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'issue_cloud_captcha')
              return new Promise((resolve) => {
                resolveCloud = resolve
              })
            throw new Error('Unexpected command')
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(page.getByLabel('本地验证码：1 + 1 = ?')).toBeVisible()
  await page.locator('#captcha').fill('2')
  await page.evaluate(() =>
    (window as unknown as { __releaseCloud: () => void }).__releaseCloud(),
  )
  await expect(page.getByLabel('云端验证码：2 + 2 = ?')).toBeVisible()
  await expect(page.locator('#captcha')).toHaveValue('2')
})

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

for (const [code, expected] of [
  ['invalid_credentials', '账号、密码或验证码无效。'],
  [
    'credential_storage_error',
    '无法安全保存登录凭据，请检查 Windows 凭据存储。',
  ],
  ['sync_transport_error', '无法完成 HTTPS 登录，请检查网络或服务器响应。'],
]) {
  test(`login ${code} remains visible when refreshed cloud CAPTCHA immediately fails`, async ({
    page,
  }) => {
    await page.addInitScript((failureCode) => {
      let attempts = 0
      Object.assign(window, {
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (command: string) => {
              if (command === 'issue_local_captcha')
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'issue_cloud_captcha') {
                if (++attempts > 1) throw { code: 'sync_transport_error' }
                return { id: crypto.randomUUID(), question: '2 + 2 = ?' }
              }
              if (command === 'online_login') throw { code: failureCode }
              throw new Error('Unexpected command')
            },
          },
        },
      })
    }, code)
    await page.goto('/')
    await page.getByRole('button', { name: '获取验证码', exact: true }).click()
    await page.getByLabel('账号', { exact: true }).fill('synthetic')
    await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
    await page.locator('#captcha').fill('2')
    await page.locator('#cloud-captcha').fill('4')
    await page.getByRole('button', { name: '在线登录', exact: true }).click()
    await expect(page.getByText(expected, { exact: true })).toBeVisible()
    await expect(
      page.getByText('无法获取云端验证码，请检查网络后重试。'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: '重新获取云端验证码', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: '在线登录', exact: true }),
    ).toBeDisabled()
    await expect(page.getByLabel('账号', { exact: true })).toHaveValue(
      'synthetic',
    )
    await expect(page.getByLabel('密码', { exact: true })).toHaveValue(
      'synthetic-password',
    )
  })
}
