import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, username: string) {
  await page.getByLabel('账号', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await page.getByLabel('本地验证码：1 + 1 = ?').fill('2')
  await page.getByRole('button', { name: '离线登录', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Synthetic IPC responses exercise the real login page and production shell.
    const common = {
      site: '测试工地',
      departmentId: 'department',
      departmentName: '采购部',
      teamId: 'team',
      teamName: '采购组',
      currency: 'XOF',
      primaryCurrency: 'XOF',
      languagePair: 'zh_fr',
    }
    const contexts = [
      {
        ...common,
        countryId: 'ci',
        countryName: '科特迪瓦',
        projectId: 'bethel',
        projectName: 'Bethel2 办公楼',
      },
      {
        ...common,
        countryId: 'cm',
        countryName: '喀麦隆',
        projectId: 'douala',
        projectName: '杜阿拉工程',
      },
      {
        ...common,
        countryId: 'ga',
        countryName: '加蓬',
        projectId: 'libreville',
        projectName: '利伯维尔工程',
      },
    ]
    let username = ''
    let selected = contexts[0]
    let hold = false
    Object.assign(window, {
      __holdHeaderSelection: () => {
        hold = true
      },
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          async invoke(
            command: string,
            args?: {
              request?: { username: string }
              selection?: { projectId: string }
            },
          ) {
            if (command === 'issue_local_captcha')
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'issue_cloud_captcha')
              throw new Error('offline fixture')
            if (command === 'offline_login') {
              username = args?.request?.username ?? ''
              selected = contexts[username === '沈奕文' ? 0 : 2]
              return {
                user_id:
                  username === '沈奕文'
                    ? 'purchaser-account'
                    : 'administrator-account',
                username,
                roles: [username === '沈奕文' ? 'purchaser' : 'administrator'],
                requires_password_change: false,
              }
            }
            if (command === 'list_authorization_contexts')
              return username === '沈奕文'
                ? contexts.slice(0, 2)
                : contexts.slice(2)
            if (command === 'get_authorization_context') {
              if (hold && username === '沈奕文') {
                hold = false
                const captured = selected
                return new Promise((resolve) =>
                  Object.assign(window, {
                    __releaseHeaderSelection: () => resolve(captured),
                  }),
                )
              }
              return selected
            }
            if (command === 'select_authorization_context') {
              const allowed =
                username === '沈奕文' ? contexts.slice(0, 2) : contexts.slice(2)
              const next = allowed.find(
                (context) => context.projectId === args?.selection?.projectId,
              )
              if (!next) {
                Object.assign(window, { __headerSelectionRejected: true })
                throw new Error('forbidden')
              }
              selected = next
              return
            }
            if (command === 'list_requisition_history')
              return { records: [], nextCursor: null }
            if (command === 'lock_session') return
            throw new Error(`unsupported fixture command: ${command}`)
          },
        },
      },
    })
  })
})

test('real session username, avatar and authorized country/project follow login and selection', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      errors.push(message.text())
  })
  await page.goto('/')
  await login(page, '沈奕文')
  const identity = page.getByLabel('当前登录用户')
  const context = page.getByLabel('当前国家及项目')
  await expect(identity).toContainText('沈奕文 · 采购员')
  await expect(identity.locator('.avatar')).toHaveText('沈')
  await expect(context).toHaveText('科特迪瓦 / Bethel2 办公楼')
  const selector = page.getByLabel('当前授权范围')
  await expect(selector.locator('option')).toHaveCount(2)
  await expect(selector).not.toContainText('加蓬')
  await selector.selectOption('douala:department:team')
  await expect(context).toHaveText('喀麦隆 / 杜阿拉工程')
  // Tamper only with the selection request; no identity/content is injected.
  await selector.evaluate((element) => {
    const select = element as HTMLSelectElement
    select.add(new Option('unauthorized', 'forbidden:department:team'))
    select.value = 'forbidden:department:team'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => '__headerSelectionRejected' in window)
  await expect(selector).toHaveValue('douala:department:team')
  await expect(context).toHaveText('喀麦隆 / 杜阿拉工程')
  await page.getByRole('button', { name: '锁定', exact: true }).click()
  await login(page, '张和凯')
  await expect(identity).toContainText('张和凯 · 审批管理员')
  await expect(identity.locator('.avatar')).toHaveText('张')
  await expect(context).toHaveText('加蓬 / 利伯维尔工程')
  await expect(page.locator('.topbar')).not.toContainText('沈奕文')
  await expect(selector.locator('option')).toHaveCount(1)
  for (const width of [1024, 760, 480]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(identity).toBeVisible()
    await expect(context).toBeVisible()
    const bounds = await page.locator('.topbar').evaluate((header) => {
      const box = header.getBoundingClientRect()
      return [
        ...header.querySelectorAll(
          'select, .account-identity, .authorization-summary',
        ),
      ].every((item) => {
        const rect = item.getBoundingClientRect()
        return (
          rect.left >= box.left &&
          rect.right <= box.right &&
          rect.bottom <= box.bottom
        )
      })
    })
    expect(bounds).toBe(true)
  }
  expect(errors).toEqual([])
})

test('a late previous-account context response cannot replace the next account header', async ({
  page,
}) => {
  await page.goto('/')
  await login(page, '沈奕文')
  await expect(page.getByLabel('当前国家及项目')).toHaveText(
    '科特迪瓦 / Bethel2 办公楼',
  )
  await page.evaluate(() =>
    (
      window as Window & { __holdHeaderSelection: () => void }
    ).__holdHeaderSelection(),
  )
  await page.getByLabel('当前授权范围').selectOption('douala:department:team')
  await page.waitForFunction(() => '__releaseHeaderSelection' in window)
  await page.getByRole('button', { name: '锁定', exact: true }).click()
  await login(page, '张和凯')
  await expect(page.getByLabel('当前国家及项目')).toHaveText(
    '加蓬 / 利伯维尔工程',
  )
  await page.evaluate(() =>
    (
      window as Window & { __releaseHeaderSelection: () => void }
    ).__releaseHeaderSelection(),
  )
  await expect(page.getByLabel('当前登录用户')).toContainText(
    '张和凯 · 审批管理员',
  )
  await expect(page.getByLabel('当前国家及项目')).toHaveText(
    '加蓬 / 利伯维尔工程',
  )
})
