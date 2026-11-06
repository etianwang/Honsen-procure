import { expect, test, type Page } from '@playwright/test'

async function openMaster(page: Page, role = 'administrator') {
  await page.addInitScript((role) => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
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
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await page.getByLabel('账号', { exact: true }).fill('synthetic')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '离线登录', exact: true }).click()
  await page.getByRole('button', { name: '基础资料管理', exact: true }).click()
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
    await page
      .getByRole('combobox', { name: '界面语言 / UI language / Langue' })
      .selectOption(locale)
    await expect(
      page.getByRole('navigation', { name: navName }).getByRole('button'),
    ).toHaveCount(10)
    await expect(
      page.getByRole('textbox', { name: label, exact: true }),
    ).toHaveValue('SYNTH')
  }
})

test('engineer can browse all categories but cannot mutate them', async ({
  page,
}) => {
  await openMaster(page, 'engineer')
  const nav = page.getByRole('navigation', { name: '基础资料分类' })
  for (const name of [
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
  ]) {
    await nav.getByRole('button', { name, exact: true }).click()
    for (const input of await page
      .locator('.master-data-detail input:visible:not([readonly])')
      .all())
      await expect(input).toBeDisabled()
    for (const button of await page
      .locator('.master-data-detail button:visible')
      .all())
      await expect(button).toBeDisabled()
  }
})
