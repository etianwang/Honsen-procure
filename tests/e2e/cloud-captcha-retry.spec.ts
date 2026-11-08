import { expect, test, type Page } from '@playwright/test'
async function fill(page: Page) {
  await page.locator('#account').fill('synthetic-user')
  await page.locator('#password').fill('synthetic-unsaved')
  await page.locator('#captcha').fill('4')
}
// DOM contract regression only; real Windows authentication remains separately accepted.
test('auto online probe presents exactly one cloud challenge and no local request', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __calls: [] as string[],
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string, args?: object) => {
            ;(window as unknown as { __calls: string[] }).__calls.push(command)
            if (command === 'issue_cloud_captcha')
              return { id: crypto.randomUUID(), question: '2 + 2 = ?' }
            if (command === 'online_login') {
              Object.assign(window, { __request: args })
              throw { code: 'invalid_credentials' }
            }
            throw Error('Unexpected')
          },
        },
      },
    })
  })
  await page.goto('/')
  await expect(page.getByLabel('云端验证码：2 + 2 = ?')).toBeVisible()
  await expect(page.locator('#captcha')).toHaveCount(1)
  await expect(page.getByText('本地验证码', { exact: false })).toHaveCount(0)
  await fill(page)
  await page.getByRole('button', { name: '在线登录', exact: true }).click()
  await expect(
    page.getByText('账号、密码或验证码无效。', { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => (window as unknown as { __calls: string[] }).__calls,
    ),
  ).not.toContain('issue_local_captcha')
  expect(
    await page.evaluate(() =>
      Object.keys(
        (window as unknown as { __request: { request: object } }).__request
          .request,
      ).sort(),
    ),
  ).toEqual(['cloudCaptchaAnswer', 'cloudCaptchaId', 'password', 'username'])
  await expect(
    page.getByRole('button', { name: '使用离线登录', exact: true }),
  ).toHaveCount(0)
})
test('network failure asks permission to use offline and retains fields on retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let online = false
    Object.assign(window, {
      __networkUp: () => {
        online = true
      },
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'issue_cloud_captcha') {
              if (!online) throw { code: 'network_unavailable' }
              return { id: crypto.randomUUID(), question: '2 + 2 = ?' }
            }
            if (command === 'issue_local_captcha')
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'offline_login')
              throw { code: 'offline_window_expired' }
            throw Error('Unexpected')
          },
        },
      },
    })
  })
  await page.goto('/')
  await expect(
    page.getByText('暂时无法连接服务器。是否使用离线登录？', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('#captcha')).toHaveCount(0)
  await page.locator('#account').fill('synthetic-user')
  await page.locator('#password').fill('synthetic-unsaved')
  await page.getByRole('button', { name: '使用离线登录', exact: true }).click()
  await expect(page.getByLabel('本地验证码：1 + 1 = ?')).toBeVisible()
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '离线登录', exact: true }).click()
  await expect(
    page.getByText('离线验证已过期，请重新连接云端登录。', { exact: true }),
  ).toBeVisible()
  await page.evaluate(() =>
    (window as unknown as { __networkUp: () => void }).__networkUp(),
  )
  await page.getByRole('button', { name: '重新尝试联网', exact: true }).click()
  await expect(page.getByLabel('云端验证码：2 + 2 = ?')).toBeVisible()
  await expect(page.locator('#captcha')).toHaveValue('')
  await expect(page.locator('#account')).toHaveValue('synthetic-user')
  await expect(page.locator('#password')).toHaveValue('synthetic-unsaved')
})
for (const code of [
  'invalid_credentials',
  'account_locked',
  'upgrade_required',
  'auth_retry_later',
  'auth_protocol_error',
]) {
  test(`${code} never offers offline even if subsequent probe fails`, async ({
    page,
  }) => {
    await page.addInitScript((failure) => {
      let probes = 0
      Object.assign(window, {
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (command: string) => {
              if (command === 'issue_cloud_captcha') {
                if (++probes > 1) throw { code: 'network_unavailable' }
                return { id: crypto.randomUUID(), question: '2 + 2 = ?' }
              }
              if (command === 'online_login') throw { code: failure }
              throw Error('Unexpected')
            },
          },
        },
      })
    }, code)
    await page.goto('/')
    await expect(page.locator('#captcha')).toBeVisible()
    await fill(page)
    await page.getByRole('button', { name: '在线登录', exact: true }).click()
    await expect(
      page.getByRole('alert').filter({ hasText: /无效|锁定|停用|频繁|异常/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: '使用离线登录', exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: '重新尝试联网', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: '使用离线登录', exact: true }),
    ).toHaveCount(0)
  })
}
test('delayed automatic challenge preserves credentials and locale without a second probe', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let resolveCloud: (value: object) => void
    Object.assign(window, {
      __cloudCalls: 0,
      __releaseCloud: () =>
        resolveCloud({ id: crypto.randomUUID(), question: '2 + 2 = ?' }),
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'issue_cloud_captcha') {
              ;(window as unknown as { __cloudCalls: number }).__cloudCalls++
              return new Promise((resolve) => {
                resolveCloud = resolve
              })
            }
            throw Error('Unexpected')
          },
        },
      },
    })
  })
  await page.goto('/')
  await expect(page.getByText('正在连接云端…', { exact: true })).toBeVisible()
  await page.locator('#account').fill('synthetic-user')
  await page.locator('#password').fill('synthetic-unsaved')
  await page
    .getByRole('button', { name: '界面语言 / UI language / Langue' })
    .click()
  await page.getByRole('menuitem', { name: 'Français', exact: true }).click()
  await page.evaluate(() =>
    (window as unknown as { __releaseCloud: () => void }).__releaseCloud(),
  )
  await expect(page.getByLabel('CAPTCHA serveur：2 + 2 = ?')).toBeVisible()
  await expect(page.locator('#account')).toHaveValue('synthetic-user')
  await expect(page.locator('#password')).toHaveValue('synthetic-unsaved')
  expect(
    await page.evaluate(
      () => (window as unknown as { __cloudCalls: number }).__cloudCalls,
    ),
  ).toBe(1)
})
