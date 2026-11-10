import { selectShellLanguage } from './shell-controls'
import { expect, test } from '@playwright/test'

for (const [locale, approval, history, statusLabel, projectLabel] of [
  ['zh', '待审批', '打开请购历史', '请购状态', '仅当前项目'],
  [
    'en',
    'Awaiting approval',
    'Open requisition history',
    'Requisition status',
    'Current project only',
  ],
  [
    'fr',
    'En attente d’approbation',
    'Ouvrir l’historique des demandes',
    'Statut de la demande',
    'Projet actuel uniquement',
  ],
] as const) {
  test(`home history opens exact scoped filters in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(() => {
      let mode = 'data'
      const context = {
        projectId: '00000000-0000-4000-8000-000000000001',
        projectName: '合成项目',
        site: 'Test',
        departmentId: '00000000-0000-4000-8000-000000000002',
        departmentName: 'Test',
        teamId: '00000000-0000-4000-8000-000000000003',
        teamName: 'Test',
        currency: 'EUR',
        primaryCurrency: 'EUR',
        languagePair: 'zh_fr',
      }
      Object.assign(window, {
        __historyFilters: [] as unknown[],
        __homeMode: (value: string) => {
          mode = value
        },
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (
              command: string,
              args?: {
                filter?: { workflowStatus?: string; projectId?: string }
                orderId?: string
              },
            ) => {
              if (command === 'issue_local_captcha')
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'issue_cloud_captcha')
                throw { code: 'network_unavailable' }
              if (command === 'offline_login')
                return {
                  user_id: '00000000-0000-4000-8000-000000000004',
                  username: 'test',
                  roles: ['purchaser'],
                  requires_password_change: false,
                }
              if (command === 'get_authorization_context') return context
              if (command === 'list_authorization_contexts') return [context]
              if (command === 'get_requisition_detail') {
                Object.assign(window, { __homeDetailId: args?.orderId })
                throw new Error('Synthetic denied detail')
              }
              if (command === 'list_requisition_history') {
                ;(
                  window as Window & { __historyFilters: unknown[] }
                ).__historyFilters.push(args?.filter)
                if (mode === 'error') throw Error('read denied')
                return {
                  records:
                    mode === 'empty'
                      ? []
                      : [
                          {
                            id: '00000000-0000-4000-8000-000000000005',
                            displayNo:
                              'REQ-00000000-0000-4000-8000-000000000005',
                            projectName: '合成项目',
                            site: 'Test',
                            workflowStatus: 'pending_confirmation',
                            procurementMode: 'honsen_self_purchase',
                            primaryCurrency: 'EUR',
                            totalMinor: '12345',
                            updatedAt: 1,
                          },
                        ],
                  nextCursor: null,
                }
              }
              throw Error('Unexpected command ' + command)
            },
          },
        },
      })
    })
    await page.goto('/')
    await page
      .getByRole('button', { name: '使用离线登录', exact: true })
      .click()
    await page.getByLabel('账号').fill('test')
    await page.getByLabel('密码').fill('synthetic-password')
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: '离线登录' }).click()

    await selectShellLanguage(page, locale)
    await expect(page.locator('.home-workbench')).not.toContainText(
      'REQ-00000000',
    )
    await page
      .locator('.metric')
      .first()
      .getByRole('button', { name: approval, exact: true })
      .click()
    await expect(
      page.getByRole('combobox', { name: statusLabel, exact: true }),
    ).toHaveValue('pending_confirmation')
    await expect(page.getByLabel(projectLabel, { exact: true })).toBeChecked()
    const filters = await page.evaluate(
      () =>
        (
          window as Window & {
            __historyFilters: { workflowStatus?: string; projectId?: string }[]
          }
        ).__historyFilters,
    )
    expect(filters.at(-1)).toEqual({
      workflowStatus: 'pending_confirmation',
      projectId: '00000000-0000-4000-8000-000000000001',
    })
    const homeLabel =
      locale === 'zh' ? '首页' : locale === 'fr' ? 'Accueil' : 'Home'
    for (const [metric, button, expected] of [
      [1, 0, 'approved'],
      [1, 1, 'confirmed'],
      [1, 2, 'executing'],
      [2, 0, 'formally_issued'],
      [2, 1, 'receiving'],
    ] as const) {
      await page.getByRole('button', { name: homeLabel, exact: true }).click()
      await page
        .locator('.metric')
        .nth(metric)
        .getByRole('button')
        .nth(button)
        .click()
      await expect(
        page.getByRole('combobox', { name: statusLabel, exact: true }),
      ).toHaveValue(expected)
    }
    await page.getByRole('button', { name: homeLabel, exact: true }).click()
    await page.getByRole('button', { name: history, exact: true }).click()
    await expect(
      page.getByRole('combobox', { name: statusLabel, exact: true }),
    ).toHaveValue('')
    await expect(page.getByLabel(projectLabel, { exact: true })).toBeChecked()
    await page.getByRole('button', { name: homeLabel, exact: true }).click()
    await page.locator('.home-workbench table').getByRole('button').click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __homeDetailId?: string }).__homeDetailId,
        ),
      )
      .toBe('00000000-0000-4000-8000-000000000005')
    await expect(page.getByRole('alert')).toBeVisible()
    expect(errors).toEqual([])
  })
}
