import { openShellPage } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'

async function openMaster(page: Page, role = 'administrator') {
  await page.addInitScript((role) => {
    let calls = 0
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (
              command === 'save_tax_template' ||
              command === 'save_exchange_rate'
            ) {
              calls++
              if (calls === 1) throw Error('synthetic rejection')
              return new Promise<void>((resolve) =>
                Object.assign(window, { __finishFinance: resolve }),
              )
            }
            if (command === 'list_tax_templates')
              return [
                {
                  id: 'test-tax',
                  businessCode: 'TEST-TAX',
                  name: 'Synthetic tax',
                  countryId: null,
                  rateBasisPoints: 0,
                  effectiveAt: '2026-01-01',
                  isActive: true,
                  version: 1,
                },
              ]
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
            if (
              command === 'list_reference_master_data' &&
              role === 'purchaser'
            )
              return [
                {
                  kind: 'material_category',
                  id: 'synthetic-category',
                  business_code: 'TEST-CAT',
                  name: 'Synthetic category',
                  is_active: true,
                  version: 1,
                },
                {
                  kind: 'unit',
                  id: 'synthetic-unit',
                  business_code: 'TEST-EA',
                  name: 'Synthetic unit',
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

test('tax rejected edit retry clears stale failure and disables row save while pending', async ({
  page,
}) => {
  await openMaster(page)
  await page
    .getByRole('navigation', { name: '基础资料分类' })
    .getByRole('button', { name: '税模板维护', exact: true })
    .click()
  await page.getByLabel('税模板名称-TEST-TAX').fill('Synthetic revised')
  const save = page.locator('button').filter({ hasText: '保存修改' })
  await save.click()
  await expect(
    page.getByText('税模板保存失败，请检查权限、日期、税率或关联国家'),
  ).toBeVisible()
  await save.click()
  await expect(save).toBeDisabled()
  await expect(page.getByText('正在保存，请稍候…')).toBeVisible()
  await expect(
    page.getByText('税模板保存失败，请检查权限、日期、税率或关联国家'),
  ).not.toBeVisible()
  await expect(page.locator('.ant-alert-success')).toHaveCount(0)
  await page.evaluate(() => {
    const finish = Reflect.get(window, '__finishFinance')
    if (typeof finish === 'function') finish()
  })
  await expect(page.getByText('税模板已保存；等待同步确认')).toBeVisible()
})

test('exchange rejected save retry shows pending and never repaints old failure as success', async ({
  page,
}) => {
  await openMaster(page)
  await page
    .getByRole('navigation', { name: '基础资料分类' })
    .getByRole('button', { name: '汇率历史', exact: true })
    .click()
  await page.getByLabel('源币种').click()
  await page
    .locator('.ant-select-item-option')
    .filter({ hasText: 'XOF' })
    .click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await page.getByLabel('目标币种').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: 'EUR' })
    .click()
  await page.getByLabel('汇率小数字符串').fill('1')
  await page.getByLabel('汇率生效日期').fill('2026-01-01')
  await page.getByLabel('手工汇率原因').fill('Synthetic reference')
  const save = page.locator('button').filter({ hasText: '新增手工汇率' })
  await save.click()
  await expect(
    page.getByText('汇率保存失败，请检查权限、日期或汇率格式'),
  ).toBeVisible()
  await save.click()
  await expect(save).toBeDisabled()
  await expect(page.getByText('正在保存，请稍候…')).toBeVisible()
  await expect(
    page.getByText('汇率保存失败，请检查权限、日期或汇率格式'),
  ).not.toBeVisible()
  await expect(page.locator('.ant-alert-success')).toHaveCount(0)
  await expect(page.getByLabel('手工汇率原因')).toHaveValue(
    'Synthetic reference',
  )
  await page.evaluate(() => {
    const finish = Reflect.get(window, '__finishFinance')
    if (typeof finish === 'function') finish()
  })
  await expect(page.getByText('手工汇率已归档；等待同步确认')).toBeVisible()
})
