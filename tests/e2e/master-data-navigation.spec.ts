import { openShellPage, selectShellLanguage } from './shell-controls'
import { expect, test, type Page } from '@playwright/test'

async function openMaster(page: Page, role = 'administrator', enter = true) {
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
  if (!enter) return
  await openShellPage(page, 'master-data')
  await expect(
    page.getByRole('navigation', { name: '基础资料分类' }),
  ).toBeVisible()
}

test('all ten master categories retain reference, tax, rate and project drafts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openMaster(page)
  const nav = page.getByRole('navigation', { name: '基础资料分类' })
  const names = [
    '国家',
    '项目',
    '项目站点',
    '部门',
    '团队',
    '单位',
    '材料分类',
    '税模板维护',
    '汇率历史',
    '项目默认设置',
  ]
  await expect(nav.getByRole('button')).toHaveCount(10)
  for (const name of names) {
    await nav.getByRole('button', { name, exact: true }).click()
    await expect(
      nav.getByRole('button', { name, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#master-data-detail-title')).toHaveText(name)
  }
  await page
    .getByLabel('页脚联系方式', { exact: true })
    .fill('Unsaved project contact')
  await nav.getByRole('button', { name: '国家', exact: true }).click()
  await page
    .getByRole('textbox', { name: '国家代码', exact: true })
    .fill('SYNTH')
  await nav.getByRole('button', { name: '税模板维护', exact: true }).click()
  await page
    .getByRole('textbox', { name: '税模板名称', exact: true })
    .fill('Unsaved tax')
  await nav.getByRole('button', { name: '汇率历史', exact: true }).click()
  await page
    .getByRole('textbox', { name: '汇率小数字符串', exact: true })
    .fill('1.25')
  for (const [name, label, value] of [
    ['国家', '国家代码', 'SYNTH'],
    ['税模板维护', '税模板名称', 'Unsaved tax'],
    ['汇率历史', '汇率小数字符串', '1.25'],
    ['项目默认设置', '页脚联系方式', 'Unsaved project contact'],
  ]) {
    await nav.getByRole('button', { name, exact: true }).click()
    await expect(
      page.getByRole('textbox', { name: label, exact: true }),
    ).toHaveValue(value)
  }
  await page.locator('.content').evaluate((el) => {
    el.scrollTop = 0
  })
  await expect(page.locator('#master-data-detail-title')).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '.cache/master-data-project-defaults-1024.png',
    animations: 'disabled',
  })
  await nav.getByRole('button', { name: '国家', exact: true }).click()
  await page.locator('.content').evaluate((el) => {
    el.scrollTop = 0
  })
  await expect(page.locator('#master-data-detail-title')).toBeInViewport()
  await page.screenshot({
    path: '.cache/master-data-country-1024.png',
    animations: 'disabled',
  })
  const sidebar = page.locator('.sidebar'),
    before = await sidebar.boundingBox()
  await page.locator('.content').evaluate((el) => {
    const spacer = document.createElement('div')
    spacer.style.height = '1600px'
    el.appendChild(spacer)
    el.scrollTop = 700
  })
  expect(
    await page.locator('.content').evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(0)
  expect(await sidebar.boundingBox()).toEqual(before)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '.cache/master-data-navigation-1024.png',
    animations: 'disabled',
  })
})

test('master navigation translates without losing country draft', async ({
  page,
}) => {
  await openMaster(page)
  await page
    .getByRole('textbox', { name: '国家代码', exact: true })
    .fill('SYNTH')
  for (const [locale, navName, label] of [
    ['en', 'Master data categories', 'country code'],
    ['fr', 'Catégories des données de référence', 'code : pays'],
    ['zh', '基础资料分类', '国家代码'],
  ]) {
    await selectShellLanguage(page, locale)
    await expect(
      page.getByRole('navigation', { name: navName }).getByRole('button'),
    ).toHaveCount(10)
    await expect(
      page.getByRole('textbox', { name: label, exact: true }),
    ).toHaveValue('SYNTH')
  }
})

test('engineer has no master data entry because trusted reads require procurement or governance authority', async ({
  page,
}) => {
  await openMaster(page, 'engineer', false)
  await expect(page.getByRole('heading', { name: '今日概览' })).toBeVisible()
  await expect(page.locator('[data-shell-group=master-data]')).toHaveCount(0)
})

test('purchaser sees category administrator requirement while ordinary units remain editable', async ({
  page,
}) => {
  await openMaster(page, 'purchaser')
  const nav = page.getByRole('navigation', { name: '基础资料分类' })
  await nav.getByRole('button', { name: '材料分类', exact: true }).click()
  const panel = page.locator('#master-data-reference-panel')
  await expect(
    panel.getByRole('button', { name: '新增材料分类', exact: true }),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: '新增材料分类', exact: true }),
  ).toBeDisabled()
  await expect(
    panel.getByText('材料分类维护需要管理员或超级管理员权限', { exact: true }),
  ).toBeVisible()
  await expect(panel.getByLabel('编辑材料分类名称-TEST-CAT')).toBeDisabled()
  await expect(panel.getByRole('button', { name: /停\s*用/ })).toBeDisabled()
  await nav.getByRole('button', { name: '单位', exact: true }).click()
  const units = page.locator('#master-data-reference-panel')
  await expect(
    units.getByRole('button', { name: '新增单位', exact: true }),
  ).toBeEnabled()
  await expect(units.getByLabel('编辑单位名称-TEST-EA')).toBeEnabled()
  await expect(units.getByRole('button', { name: /停\s*用/ })).toBeEnabled()
})
