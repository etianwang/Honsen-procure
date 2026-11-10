import { selectShellLanguage } from './shell-controls'
import { expect, test } from '@playwright/test'

for (const [locale, details, failureCode, roles = ['administrator']] of [
  ['zh', '同步详情', ''],
  ['en', 'Sync details', ''],
  ['fr', 'Détails de synchronisation', ''],
  ['zh', '同步详情', 'quarantine-only'],
  ['en', 'Sync details', 'quarantine-only'],
  ['fr', 'Détails de synchronisation', 'quarantine-only'],
  ['zh', '同步详情', 'reauthentication_required'],
  ['zh', '同步详情', 'upgrade_required'],
  ['zh', '同步详情', 'sync_account_boundary'],
  ['zh', '同步详情', '', ['purchaser']],
  ['zh', '同步详情', '', ['engineer']],
  ['zh', '同步详情', '', ['viewer']],
  ['zh', '同步详情', '', ['super_administrator']],
  ['zh', '同步详情', '', ['super_administrator', 'purchaser']],
] as const) {
  test(`shell groups and sync details support keyboard and long scope in ${locale} ${failureCode} ${roles.join('+')}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.addInitScript(
      ({ failureCode, roles }) => {
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
                    roles,
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
                    quoteRejectedCount:
                      failureCode === 'quarantine-only' ? 0 : 4,
                    lastSuccessAt: 1730000000,
                  }
                throw new Error('Synthetic unavailable')
              },
            },
          },
        })
      },
      { failureCode, roles },
    )
    await page.goto('/')
    await page.getByLabel('账号', { exact: true }).fill('SyntheticAdmin')
    await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: '在线登录', exact: true }).click()
    await selectShellLanguage(page, locale)
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
    const dialog = page.getByRole('dialog', { name: details })
    await expect(dialog).not.toBeVisible()
    const summary = page.getByRole('button', { name: details })
    const toolbar = page.locator('.honsen-shell-toolbar')
    const content = page.locator('.content')
    const before = await content.boundingBox()
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(dialog.locator('dl')).toBeVisible()
    if (failureCode !== 'reauthentication_required')
      await expect(dialog.locator('dl')).toContainText('3')
    expect((await content.boundingBox())?.y).toBe(before?.y)
    await page.keyboard.press('Escape')
    await expect(dialog.locator('dl')).not.toBeVisible()
    await expect(summary).toBeFocused()
    for (const [width, height] of [
      [720, 480],
      [854, 480],
      [1024, 576],
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height })
      expect((await toolbar.boundingBox())?.height).toBe(52)
      await expect(page.locator('.honsen-shell-sidebar')).toHaveCSS(
        'width',
        width <= 900 ? '52px' : width <= 1100 ? '176px' : '214px',
      )
      await expect(page.locator('.honsen-shell-scope')).toBeVisible()
      const account = page.locator('.honsen-shell-user')
      await expect(account).toBeVisible()
      const scopeBox = await page.locator('.honsen-shell-scope').boundingBox()
      const statusBox = await summary.boundingBox()
      const accountBox = await account.boundingBox()
      expect(scopeBox!.x + scopeBox!.width).toBeLessThan(statusBox!.x)
      expect(statusBox!.x + statusBox!.width).toBeLessThan(accountBox!.x)
      expect(accountBox!.x + accountBox!.width).toBeLessThan(width)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }

    const isPurchasing = roles.some(
      (role) => role === 'purchaser' || role === 'administrator',
    )
    const isGovernance = roles.some(
      (role) => role === 'super_administrator' || role === 'administrator',
    )
    const group = (name: string) => page.locator(`[data-shell-group="${name}"]`)
    await expect(group('execution')).toHaveCount(isPurchasing ? 1 : 0)
    await expect(group('master-data')).toHaveCount(
      isPurchasing || isGovernance ? 1 : 0,
    )
    await expect(group('system')).toHaveCount(isGovernance ? 1 : 0)
    await group('requisition').click()
    await expect(page.locator('[data-shell-entry=new]')).toHaveCount(
      isPurchasing || roles.includes('engineer') ? 1 : 0,
    )
    await expect(page.locator('[data-shell-entry=review]')).toHaveCount(
      isPurchasing ? 1 : 0,
    )
    await group('catalog').click()
    await expect(group('requisition')).toHaveAttribute('aria-expanded', 'false')
    await expect(group('catalog')).toHaveAttribute('aria-expanded', 'true')
    if (locale === 'zh' && roles[0] === 'administrator' && !failureCode) {
      await page.setViewportSize({ width: 1280, height: 720 })
      await expect(page.locator('.honsen-scope-summary')).toContainText(
        'Équipe synthétique',
      )
      const contentTop = (await content.boundingBox())?.y
      const scope = page.getByRole('combobox', { name: '当前授权范围' })
      await scope.click()
      await expect(page.locator('.honsen-scope-fields')).toBeVisible()
      expect((await content.boundingBox())?.y).toBe(contentTop)
      await scope.press('Escape')
      const account = page.locator('.honsen-shell-user')
      await account.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: '账号菜单' })).toBeVisible()
      expect((await content.boundingBox())?.y).toBe(contentTop)
      await page.keyboard.press('Escape')
      await expect(account).toBeFocused()
      await page.screenshot({
        path: '.cache/contextual-shell-browser-expanded.png',
        animations: 'disabled',
      })
      await page.locator('.honsen-sidebar-toggle').click()
      await expect(page.locator('.honsen-shell-sidebar')).toHaveCSS(
        'width',
        '52px',
      )
      await group('catalog').focus()
      await page.keyboard.press('Enter')
      const materials = page.locator('[data-shell-route=materials]')
      await expect(materials).toBeFocused()
      await page.screenshot({
        path: '.cache/contextual-shell-browser-rail.png',
        animations: 'disabled',
      })
      await page.keyboard.press('Escape')
      await expect(group('catalog')).toBeFocused()
      await expect(materials).not.toBeVisible()
    }
    expect(errors).toEqual([])
  })
}
