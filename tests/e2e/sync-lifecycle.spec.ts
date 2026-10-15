import { expect, test } from '@playwright/test'

test('authenticated online login pushes before pull and displays pending until acknowledgement', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const commands: string[] = []
    let pushes = 0
    let authorized = false
    const context = {
      countryId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      projectName: '项目甲',
      site: '甲工地',
      departmentId: '00000000-0000-4000-8000-000000000003',
      departmentName: '采购部',
      teamId: '00000000-0000-4000-8000-000000000004',
      teamName: '一班',
      currency: 'XOF',
      primaryCurrency: 'XOF',
      languagePair: 'zh_fr',
    }
    Object.assign(window, {
      __syncCommands: commands,
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(command: string) {
            commands.push(command)
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
                user_id: crypto.randomUUID(),
                username: 'test-en',
                roles: ['engineer'],
                requires_password_change: false,
              })
            if (command === 'push_pending_sync') {
              pushes += 1
              authorized = true
              return Promise.resolve({
                acceptedCount: pushes === 1 ? 0 : 1,
                pendingCount: pushes === 1 ? 1 : 0,
              })
            }
            if (command === 'pull_sync')
              return Promise.resolve({ appliedCount: 0, nextCursor: '1' })
            if (command === 'list_authorization_contexts')
              return Promise.resolve(authorized ? [context] : [])
            if (command === 'get_authorization_context')
              return authorized
                ? Promise.resolve(context)
                : new Promise((_, reject) =>
                    setTimeout(() => reject({ code: 'forbidden' }), 250),
                  )
            if (command === 'lock_session') return Promise.resolve()
            return Promise.reject(new Error(`unexpected ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('test-en')
  await page.getByLabel('密码').fill('test-password')
  await page.getByLabel(/本地验证码/).fill('2')
  await page.getByLabel(/云端验证码/).fill('2')
  await page.getByRole('button', { name: '在线登录' }).click()
  await expect(page.getByRole('status', { name: '同步状态' })).toContainText(
    '待同步 1',
  )
  await expect(page.getByLabel('当前授权范围')).toHaveCount(1)
  await page.waitForTimeout(300)
  await expect(page.getByLabel('当前授权范围')).toHaveCount(1)
  const firstCycle = await page.evaluate(
    () => (window as Window & { __syncCommands: string[] }).__syncCommands,
  )
  expect(firstCycle.indexOf('online_login')).toBeLessThan(
    firstCycle.indexOf('push_pending_sync'),
  )
  expect(firstCycle.indexOf('push_pending_sync')).toBeLessThan(
    firstCycle.indexOf('pull_sync'),
  )
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('status', { name: '同步状态' })).toContainText(
    '上次同步成功；新操作可能待同步',
  )
  expect(browserErrors).toEqual([])
})

test('offline login never pushes and lock stops later reconnect work', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const commands: string[] = []
    Object.assign(window, {
      __syncCommands: commands,
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(command: string) {
            commands.push(command)
            if (command === 'issue_local_captcha')
              return Promise.resolve({
                id: crypto.randomUUID(),
                question: '1 + 1 = ?',
              })
            if (command === 'issue_cloud_captcha')
              return Promise.reject({ code: 'sync_transport_error' })
            if (command === 'offline_login')
              return Promise.resolve({
                user_id: crypto.randomUUID(),
                username: 'test-en',
                roles: ['engineer'],
                requires_password_change: false,
              })
            if (command === 'list_authorization_contexts')
              return Promise.resolve([])
            if (command === 'get_authorization_context')
              return Promise.reject({ code: 'forbidden' })
            if (command === 'lock_session') return Promise.resolve()
            return Promise.reject(new Error(`unexpected ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('test-en')
  await page.getByLabel('密码').fill('test-password')
  await page.getByLabel(/本地验证码/).fill('2')
  await page.getByRole('button', { name: '离线登录' }).click()
  await expect(page.getByRole('status', { name: '同步状态' })).toContainText(
    '离线本地数据',
  )
  await page.getByRole('button', { name: '锁定' }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible()
  const commands = await page.evaluate(
    () => (window as Window & { __syncCommands: string[] }).__syncCommands,
  )
  expect(commands).not.toContain('push_pending_sync')
  expect(browserErrors).toEqual([])
})

test('failed CAPTCHA login never starts a sync cycle', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const commands: string[] = []
    Object.assign(window, {
      __syncCommands: commands,
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(command: string) {
            commands.push(command)
            if (
              command === 'issue_local_captcha' ||
              command === 'issue_cloud_captcha'
            )
              return Promise.resolve({
                id: crypto.randomUUID(),
                question: '1 + 1 = ?',
              })
            if (command === 'online_login')
              return Promise.reject({ code: 'invalid_credentials' })
            return Promise.reject(new Error(`unexpected ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('test-en')
  await page.getByLabel('密码').fill('bad-password')
  await page.getByLabel(/本地验证码/).fill('2')
  await page.getByLabel(/云端验证码/).fill('2')
  await page.getByRole('button', { name: '在线登录' }).click()
  await expect(
    page.getByText('在线登录失败，请检查连接并重新获取验证码。'),
  ).toBeVisible()
  const commands = await page.evaluate(
    () => (window as Window & { __syncCommands: string[] }).__syncCommands,
  )
  expect(commands).not.toContain('push_pending_sync')
  expect(browserErrors).toEqual([])
})
