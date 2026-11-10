import { openShellAccount } from './shell-controls'
import { expect, test } from '@playwright/test'

for (const failOldRead of [false, true]) {
  test(`late scope read cannot cross a lock and account boundary failure=${failOldRead}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((failOldRead) => {
      const id = (n: number) =>
        `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
      const scope = (n: number, name: string) => ({
        projectId: id(n),
        projectName: name,
        site: name,
        departmentId: id(10),
        departmentName: 'Synthetic department',
        teamId: id(11),
        teamName: 'Synthetic team',
        countryId: id(12),
        currency: 'EUR',
        primaryCurrency: 'EUR',
        languagePair: 'zh_fr',
      })
      const first = scope(1, 'Private A initial')
      const late = scope(2, 'Private A late')
      const second = scope(3, 'Account B current')
      let account = ''
      let selectedOld = false
      const host = window as Window & {
        __finishOldScope?: () => Promise<void>
        __scopeHistoryProjects?: (string | undefined)[]
      }
      host.__scopeHistoryProjects = []
      Object.assign(window, {
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (
              command: string,
              args?: {
                request?: { username?: string }
                filter?: { projectId?: string }
              },
            ) => {
              if (command === 'issue_cloud_captcha')
                throw { code: 'network_unavailable' }
              if (command === 'issue_local_captcha')
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'offline_login') {
                account = args?.request?.username ?? ''
                return {
                  user_id: id(account === 'account-a' ? 100 : 101),
                  username: account,
                  roles: ['engineer'],
                  requires_password_change: false,
                }
              }
              if (command === 'list_authorization_contexts')
                return account === 'account-a' ? [first, late] : [second]
              if (command === 'select_authorization_context') {
                selectedOld = true
                return undefined
              }
              if (command === 'get_authorization_context') {
                if (account === 'account-a' && selectedOld)
                  return new Promise((resolve, reject) => {
                    host.__finishOldScope = () => {
                      if (failOldRead)
                        reject(new Error('Synthetic old account failure'))
                      else resolve(late)
                      return new Promise<void>((done) =>
                        requestAnimationFrame(() =>
                          requestAnimationFrame(() => done()),
                        ),
                      )
                    }
                  })
                return account === 'account-a' ? first : second
              }
              if (command === 'list_requisition_history') {
                host.__scopeHistoryProjects?.push(args?.filter?.projectId)
                return { records: [], nextCursor: null }
              }
              if (command === 'lock_session') {
                account = ''
                return undefined
              }
              if (command === 'sync_status')
                return {
                  pendingCount: 0,
                  conflictCount: 0,
                  quarantinedCount: 0,
                  lastSuccessAt: null,
                }
              throw new Error('Synthetic unavailable')
            },
          },
        },
      })
    }, failOldRead)
    await page.goto('/')
    const login = async (username: string) => {
      await page
        .getByRole('button', { name: '使用离线登录', exact: true })
        .click()
      await page.getByLabel('账号', { exact: true }).fill(username)
      await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
      await page.locator('#captcha').fill('2')
      await page.getByRole('button', { name: '离线登录', exact: true }).click()
    }
    await login('account-a')
    const picker = page.getByRole('combobox', {
      name: '当前授权范围',
      exact: true,
    })
    await picker.fill('Private A late')
    await picker.press('ArrowDown')
    await picker.press('Enter')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            typeof (window as Window & { __finishOldScope?: unknown })
              .__finishOldScope,
        ),
      )
      .toBe('function')
    await openShellAccount(page)
    await page.getByRole('button', { name: '锁定', exact: true }).click()
    await login('account-b')
    await expect(page.locator('.honsen-shell-scope')).toContainText(
      'Account B current',
    )
    const before = await page.evaluate(
      () =>
        (window as Window & { __scopeHistoryProjects: string[] })
          .__scopeHistoryProjects.length,
    )
    await page.evaluate(() =>
      (
        window as Window & { __finishOldScope: () => Promise<void> }
      ).__finishOldScope(),
    )
    await expect(page.locator('.honsen-shell-scope')).toContainText(
      'Account B current',
    )
    await expect(page.getByText('Private A late', { exact: true })).toHaveCount(
      0,
    )
    await expect(
      page.getByText('无法切换到所选授权范围。', { exact: true }),
    ).toHaveCount(0)
    const newProjects = await page.evaluate(
      (before) =>
        (
          window as Window & { __scopeHistoryProjects: string[] }
        ).__scopeHistoryProjects.slice(before),
      before,
    )
    expect(
      newProjects.every(
        (project) => project === '00000000-0000-4000-8000-000000000003',
      ),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
