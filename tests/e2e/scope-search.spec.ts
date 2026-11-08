import { expect, test } from '@playwright/test'

for (const [locale, scopeLabel, emptyLabel] of [
  ['zh', '当前授权范围', '没有匹配的已授权范围'],
  ['en', 'Current authorization scope', 'No matching authorized scope'],
  ['fr', 'Périmètre autorisé actuel', 'Aucun périmètre autorisé correspondant'],
] as const) {
  test(`authorized scope search is local, bounded and keyboard accessible in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.addInitScript(() => {
      const id = (n: number) =>
        `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
      const contexts = Array.from({ length: 300 }, (_, i) => ({
        projectId: id(i + 1),
        projectName: `Synthetic Zone${i}`,
        site: `Synthetic Site${i}`,
        departmentId: id(1001),
        departmentName: 'Électricité 电气 Electrical',
        teamId: id(1002),
        teamName: 'Synthetic team',
        countryId: id(1003),
        currency: 'EUR',
        primaryCurrency: 'EUR',
        languagePair: 'zh_fr',
      }))
      let current = contexts[0]
      const selections: unknown[] = []
      Object.assign(window, {
        __scopeSelections: selections,
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (
              command: string,
              args?: { selection?: { projectId: string } },
            ) => {
              if (
                command === 'issue_local_captcha' ||
                command === 'issue_cloud_captcha'
              )
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'online_login')
                return {
                  user_id: id(1004),
                  username: 'SyntheticScopeAdmin',
                  roles: ['administrator'],
                  requires_password_change: false,
                }
              if (command === 'list_authorization_contexts') return contexts
              if (command === 'get_authorization_context') return current
              if (command === 'select_authorization_context') {
                selections.push(args?.selection)
                current =
                  contexts.find(
                    (context) =>
                      context.projectId === args?.selection?.projectId,
                  ) ?? current
                return undefined
              }
              if (command === 'list_requisition_history')
                return { records: [], nextCursor: null }
              if (command === 'push_pending_sync')
                return { acceptedCount: 0, pendingCount: 0 }
              if (command === 'sync_status')
                return {
                  pendingCount: 0,
                  conflictCount: 0,
                  quarantinedCount: 0,
                  lastSuccessAt: null,
                }
              if (
                command === 'pull_sync' ||
                command === 'refresh_authorization'
              )
                return {}
              throw new Error('Synthetic unavailable')
            },
          },
        },
      })
    })
    await page.goto('/')
    await page.getByLabel('账号', { exact: true }).fill('SyntheticScopeAdmin')
    await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: '在线登录', exact: true }).click()
    await page
      .getByLabel('界面语言 / UI language / Langue')
      .selectOption(locale)
    const scope = page.getByRole('combobox', { name: scopeLabel, exact: true })
    await scope.click()
    await expect
      .poll(() => page.locator('.ant-select-item-option').count())
      .toBeGreaterThan(0)
    await expect(page.locator('.ant-select-item-option')).not.toHaveCount(300)
    await scope.fill('NoAuthorizedMatch')
    await expect(
      page.getByRole('status').filter({ hasText: emptyLabel }),
    ).toBeVisible()
    await scope.fill('Zone259 electricite')
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __scopeSelections: unknown[] })
            .__scopeSelections.length,
      ),
    ).toBe(0)
    await scope.press('ArrowDown')
    await scope.press('Enter')
    await expect(page.locator('.honsen-shell-scope')).toContainText(
      'Synthetic Zone259',
    )
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __scopeSelections: unknown[] })
              .__scopeSelections,
        ),
      )
      .toEqual([
        {
          projectId: '00000000-0000-4000-8000-000000000260',
          departmentId: '00000000-0000-4000-8000-000000001001',
          teamId: '00000000-0000-4000-8000-000000001002',
        },
      ])
    await scope.click()
    await scope.fill('Zone10')
    await scope.press('Escape')
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
    await expect(page.locator('.honsen-shell-scope')).toContainText(
      'Synthetic Zone259',
    )
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height })
      await expect(scope).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }
    expect(errors).toEqual([])
  })
}
