import { expect, test } from '@playwright/test'

for (const [locale, details, failureCode] of [
  ['zh', '同步详情', ''],
  ['en', 'Sync details', ''],
  ['fr', 'Détails de synchronisation', ''],
  ['zh', '同步详情', 'quarantine-only'],
  ['en', 'Sync details', 'quarantine-only'],
  ['fr', 'Détails de synchronisation', 'quarantine-only'],
  ['zh', '同步详情', 'reauthentication_required'],
  ['zh', '同步详情', 'upgrade_required'],
  ['zh', '同步详情', 'sync_account_boundary'],
] as const) {
  test(`shell groups and sync details support keyboard and long scope in ${locale} ${failureCode}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.addInitScript((failureCode) => {
      const context = {
        projectId: '00000000-0000-4000-8000-000000000001',
        projectName:
          'Synthetic long project name for responsive enterprise controls',
        site: 'Synthetic site',
        departmentId: '00000000-0000-4000-8000-000000000002',
        departmentName: 'Département des travaux et approvisionnements',
        teamId: '00000000-0000-4000-8000-000000000003',
        teamName: 'Équipe synthétique',
        currency: 'EUR',
        primaryCurrency: 'EUR',
        languagePair: 'zh_fr',
      }
      Object.assign(window, {
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (command: string) => {
              if (
                command === 'issue_local_captcha' ||
                command === 'issue_cloud_captcha'
              )
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'online_login')
                return {
                  user_id: '00000000-0000-4000-8000-000000000004',
                  username: 'SyntheticAdmin',
                  roles: ['administrator'],
                  requires_password_change: false,
                }
              if (command === 'get_authorization_context') return context
              if (command === 'list_authorization_contexts') return [context]
              if (command === 'list_requisition_history')
                return { records: [], nextCursor: null }
              if (
                command === 'refresh_authorization' ||
                command === 'pull_sync'
              )
                return {}
              if (
                command === 'push_pending_sync' &&
                failureCode &&
                failureCode !== 'quarantine-only'
              )
                throw { code: failureCode }
              if (command === 'push_pending_sync')
                return {
                  acceptedCount: 0,
                  pendingCount: failureCode === 'quarantine-only' ? 0 : 7,
                }
              if (command === 'sync_status')
                return {
                  pendingCount: failureCode === 'quarantine-only' ? 0 : 7,
                  conflictCount: failureCode === 'quarantine-only' ? 0 : 2,
                  quarantinedCount: 3,
                  quoteRejectedCount: failureCode === 'quarantine-only' ? 0 : 4,
                  lastSuccessAt: 1730000000,
                }
              throw new Error('Synthetic unavailable')
            },
          },
        },
      })
    }, failureCode)
    await page.goto('/')
    await page.getByLabel('账号', { exact: true }).fill('SyntheticAdmin')
    await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: '在线登录', exact: true }).click()
    await page
      .getByLabel('界面语言 / UI language / Langue')
      .selectOption(locale)
    const status = page.getByRole('status').first()
    if (failureCode === 'quarantine-only') {
      const label =
        locale === 'zh'
          ? '待归属旧事件'
          : locale === 'fr'
            ? 'Événements anciens non attribués'
            : 'Unassigned legacy events'
      await expect(status).toContainText(label + ' 3')
      await expect(status).toContainText('0')
    } else if (failureCode) {
      const warning =
        failureCode === 'reauthentication_required'
          ? '登录已失效，请重新在线登录'
          : failureCode === 'upgrade_required'
            ? '服务版本已停用，请升级客户端；本地数据已保留'
            : '多账号拉取已暂停，需先完成账号隔离恢复'
      await expect(status).toContainText(warning)
    } else {
      await expect(status).toContainText('7')
      await expect(status).toContainText('4')
    }
    await expect(
      page.locator('.honsen-shell-sync details'),
    ).not.toHaveAttribute('open', '')
    const summary = page.locator('.honsen-shell-sync summary')
    await expect(summary).toHaveText(details)
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.honsen-shell-sync dl')).toBeVisible()
    if (failureCode !== 'reauthentication_required')
      await expect(page.locator('.honsen-shell-sync dl')).toContainText('3')
    await page.keyboard.press('Escape')
    await expect(page.locator('.honsen-shell-sync dl')).not.toBeVisible()
    await expect(summary).toBeFocused()
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height })
      await expect(page.locator('.honsen-shell-language')).toBeVisible()
      await expect(page.locator('.honsen-shell-scope')).toBeVisible()
      await expect(page.locator('.signed-in-username')).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }

    expect(errors).toEqual([])
  })
}
