import { selectShellLanguage } from './shell-controls'
import { expect, test } from '@playwright/test'

test('home translates live data, errors and empty states in one chosen language', async ({
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
      __homeMode: (value: string) => {
        mode = value
      },
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
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
            if (command === 'list_requisition_history') {
              if (mode === 'error') throw Error('read denied')
              return {
                records:
                  mode === 'empty'
                    ? []
                    : [
                        {
                          id: '00000000-0000-4000-8000-000000000005',
                          displayNo: 'SYNTH-1',
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
  await page.getByRole('button', { name: '使用离线登录', exact: true }).click()
  await page.getByLabel('账号').fill('test')
  await page.getByLabel('密码').fill('synthetic-password')
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '离线登录' }).click()
  await expect(page.getByRole('heading', { name: '今日概览' })).toBeVisible()
  await selectShellLanguage(page, 'en')
  await expect(
    page.getByRole('heading', { name: 'Overview today' }),
  ).toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'Awaiting approval' }),
  ).toBeVisible()
  await expect(page.getByText(/EUR.*123\.45/)).toBeVisible()
  await selectShellLanguage(page, 'fr')
  await expect(page.getByRole('heading', { name: 'Vue du jour' })).toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'En attente d’approbation' }),
  ).toBeVisible()
  await expect(page.getByText(/123,45.*EUR/)).toBeVisible()
  await page.evaluate(() =>
    (window as Window & { __homeMode: (v: string) => void }).__homeMode(
      'error',
    ),
  )
  await page.getByRole('button', { name: 'Actualiser les tâches' }).click()
  await expect(page.getByRole('alert')).toContainText('Impossible de lire')
  await expect(page.getByText('SYNTH-1')).toHaveCount(0)
  await page.evaluate(() =>
    (window as Window & { __homeMode: (v: string) => void }).__homeMode(
      'empty',
    ),
  )
  await page.getByRole('button', { name: 'Actualiser les tâches' }).click()
  await expect(
    page.getByText('Aucune commande à traiter dans le périmètre autorisé.'),
  ).toBeVisible()
  expect(errors).toEqual([])
})
