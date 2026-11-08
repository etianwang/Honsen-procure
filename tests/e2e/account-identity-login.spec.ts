import { expect, test } from '@playwright/test'

for (const [locale, hint, captchaButton, loginButton] of [
  ['zh', '已有非英文用户名仍可使用。', '使用离线登录', '离线登录'],
  [
    'en',
    'Existing non-English usernames remain supported.',
    'Use offline sign-in',
    'Sign in offline',
  ],
  [
    'fr',
    'Les noms utilisateurs non anglais existants restent acceptés.',
    'Utiliser la connexion hors ligne',
    'Connexion hors ligne',
  ],
]) {
  test(`legacy login input remains unchanged and identity guidance is translated ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((locale) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      Object.assign(window, {
        __legacyInputUnchanged: false,
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (
              command: string,
              args?: { request?: { username: string; password: string } },
            ) => {
              if (command === 'issue_cloud_captcha')
                throw { code: 'network_unavailable' }
              if (command === 'issue_local_captcha')
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'offline_login') {
                Object.assign(window, {
                  __legacyInputUnchanged:
                    args?.request?.username === '测试dEV' &&
                    args?.request?.password === 'Synthetic-CaseSensitive',
                })
                return {
                  user_id: crypto.randomUUID(),
                  username: '测试Dev',
                  roles: ['engineer'],
                  requires_password_change: true,
                }
              }
              throw new Error('Unexpected command')
            },
          },
        },
      })
    }, locale)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.login-account-hint')).toContainText(hint)
    await page.locator('#account').fill('测试dEV')
    await page.locator('#password').fill('Synthetic-CaseSensitive')
    await page.getByRole('button', { name: captchaButton, exact: true }).click()
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: loginButton, exact: true }).click()
    await expect(page.locator('.login-page')).toHaveCount(0)
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __legacyInputUnchanged: boolean })
            .__legacyInputUnchanged,
      ),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
