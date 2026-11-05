import { expect, test } from '@playwright/test'

test('retired API displays upgrade guidance while local login remains available', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(command: string) {
            if (command === 'issue_local_captcha')
              return Promise.resolve({
                id: crypto.randomUUID(),
                question: '1 + 1 = ?',
              })
            if (command === 'issue_cloud_captcha')
              return Promise.reject({ code: 'upgrade_required' })
            return Promise.reject(new Error(`unexpected ${command}`))
          },
        },
      },
    })
  })
  test.setTimeout(90_000)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '获取验证码' }).click()
  await expect(page.getByRole('alert')).toContainText(
    '服务版本已停用，请升级客户端；本地数据已保留',
  )
  await expect(page.getByRole('button', { name: '离线登录' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '在线登录' })).toBeDisabled()
  await page
    .getByRole('button', { name: '界面语言 / UI language / Langue' })
    .click()
  await page.getByRole('menuitem', { name: 'English' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'API version retired; upgrade the client. Local data is retained.',
  )
  expect(errors).toEqual([])
})

test('initial password advisory allows the authenticated workspace', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(command: string) {
            if (
              command === 'issue_local_captcha' ||
              command === 'issue_cloud_captcha'
            )
              return Promise.resolve({
                id: crypto.randomUUID(),
                question: '1 + 1 = ?',
              })
            if (command === 'online_login')
              return Promise.resolve({
                user_id: '00000000-0000-4000-8000-000000000001',
                username: 'admin',
                roles: ['super_administrator'],
                requires_password_change: false,
                password_change_recommended: true,
              })
            if (command === 'push_pending_sync')
              return Promise.resolve({ acceptedCount: 0, pendingCount: 0 })
            if (command === 'pull_sync')
              return Promise.resolve({ appliedCount: 0, nextCursor: '0' })
            if (command === 'sync_status')
              return Promise.resolve({
                pendingCount: 0,
                conflictCount: 0,
                quarantinedCount: 0,
                lastSuccessAt: null,
              })
            if (command === 'list_authorization_contexts')
              return Promise.resolve([])
            return Promise.reject({ code: 'forbidden' })
          },
        },
      },
    })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('runtime-fixture')
  await page.getByLabel(/本地验证码/u).fill('2')
  await page.getByLabel(/云端验证码/u).fill('2')
  await page.getByRole('button', { name: '在线登录' }).click()
  await expect(
    page.getByText('初始密码仍在使用，建议修改密码；可继续使用系统'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '今日概览' })).toBeVisible()
  expect(errors).toEqual([])
})
