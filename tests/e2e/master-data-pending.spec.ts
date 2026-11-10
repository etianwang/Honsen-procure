import { openShellPage } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'

async function openMaster(page: Page, role = 'administrator') {
  await page.addInitScript((role) => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'issue_cloud_captcha')
              throw { code: 'network_unavailable' }
            if (command === 'issue_local_captcha')
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'offline_login')
              return {
                user_id: crypto.randomUUID(),
                username: 'synthetic',
                roles: [role],
                requires_password_change: false,
              }
            if (command === 'list_project_defaults')
              return [
                {
                  projectId: 'synthetic-project',
                  projectName: 'Synthetic project',
                  site: 'Synthetic site',
                  departmentTitle: 'Synthetic department',
                  companyAddress: 'Synthetic address',
                  companyContact: 'Synthetic contact',
                  defaultCurrency: 'XOF',
                  defaultLanguagePair: 'zh_fr',
                  defaultTaxTemplateId: null,
                  taxTemplateName: null,
                },
              ]
            if (command === 'save_reference_master_data') {
              return new Promise<void>((resolve, reject) => {
                Object.assign(window, {
                  __settleMasterSave: (ok: boolean) =>
                    ok ? resolve() : reject(Error('synthetic rejection')),
                })
              })
            }
            if (command === 'list_reference_master_data')
              return [
                {
                  kind: 'department',
                  id: 'synthetic-department',
                  business_code: 'TEST-DEP',
                  name: 'Synthetic department',
                  is_active: true,
                  version: 1,
                },
              ]
            if (
              [
                'list_reference_master_data',
                'list_tax_templates',
                'list_exchange_rates',
                'list_authorization_contexts',
              ].includes(command)
            )
              return []
            throw Error('Unavailable')
          },
        },
      },
    })
  }, role)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '使用离线登录', exact: true }).click()
  await page.getByLabel('账号', { exact: true }).fill('synthetic')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '离线登录', exact: true }).click()
  await openShellPage(page, 'master-data')
  await expect(
    page.getByRole('navigation', { name: '基础资料分类' }),
  ).toBeVisible()
}

test('team create freezes controls during save and retains draft after rejection', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await openMaster(page)
  await page
    .getByRole('navigation', { name: '基础资料分类' })
    .getByRole('button', { name: '团队', exact: true })
    .click()
  await page.getByRole('button', { name: '新增团队', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增团队' })
  const code = dialog.getByLabel('团队代码', { exact: true })
  const name = dialog.getByLabel('团队名称', { exact: true })
  const parent = dialog.getByRole('combobox', { name: '团队所属部门' })
  await code.fill('TEST-TEAM')
  await name.fill('Synthetic team')
  await parent.click()
  await page.getByText('Synthetic department', { exact: true }).last().click()
  await expect(code).toHaveAttribute('aria-required', 'true')
  await expect(code).toHaveAttribute('aria-describedby', 'team-create-1-hint')
  await dialog.getByRole('button', { name: '新增团队', exact: true }).click()
  await expect(code).toBeDisabled()
  await expect(name).toBeDisabled()
  await expect(parent).toBeDisabled()
  await expect(dialog.getByRole('button', { name: /取\s*消/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.evaluate(() =>
    (
      window as Window & { __settleMasterSave: (ok: boolean) => void }
    ).__settleMasterSave(false),
  )
  await expect(dialog.getByRole('alert')).toContainText(
    '保存被拒绝，请检查权限或关联资料',
  )
  await expect(dialog.getByRole('alert')).toBeInViewport()
  await expect(code).toHaveValue('TEST-TEAM')
  await expect(name).toHaveValue('Synthetic team')
  await expect(parent).toBeEnabled()
  await expect(dialog).toContainText('Synthetic department')
  await page.screenshot({ path: '.cache/master-data-rejected-retained.png' })
  await dialog.getByRole('button', { name: '新增团队', exact: true }).click()
  await expect(code).toBeDisabled()
  await page.evaluate(() =>
    (
      window as Window & { __settleMasterSave: (ok: boolean) => void }
    ).__settleMasterSave(true),
  )
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'TEST-TEAM', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
