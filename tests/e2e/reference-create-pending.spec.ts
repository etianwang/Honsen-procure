import { expect, test, type Page } from '@playwright/test'

async function openMaster(page: Page, role = 'administrator') {
  await page.addInitScript((role) => {
    let calls = 0
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'save_reference_master_data') {
              calls++
              Object.assign(window, { __referenceCalls: calls })
              if (calls === 1) throw Error('synthetic rejection')
              return new Promise<void>((resolve) =>
                Object.assign(window, { __finishReference: resolve }),
              )
            }
            if (command === 'list_reference_master_data')
              return [
                {
                  kind: 'country',
                  id: 'synthetic-country',
                  business_code: 'SYNTH',
                  name: 'Synthetic country',
                  time_zone: 'Africa/Abidjan',
                  is_active: true,
                  version: 1,
                },
                {
                  kind: 'project',
                  id: 'synthetic-project',
                  country_id: 'synthetic-country',
                  business_code: 'SYNTH-PROJECT',
                  name: 'Synthetic project',
                  site: 'Synthetic site',
                  department_name: 'Synthetic department',
                  default_currency: 'XOF',
                  default_language_pair: 'zh_fr',
                  is_active: true,
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
  await page.getByRole('button', { name: '基础资料管理', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: '基础资料分类' }),
  ).toBeVisible()
}

const configurations = [
  {
    kind: 'country',
    nav: ['国家', 'Country', 'Pays'],
    add: ['新增国家', 'Add country', 'Ajouter : pays'],
    code: ['国家代码', 'country code', 'code : pays'],
    name: ['国家名称', 'country name', 'nom : pays'],
  },
  {
    kind: 'project',
    nav: ['项目', 'Project', 'Projet'],
    add: ['新增项目', 'Add project', 'Ajouter : projet'],
    code: ['项目代码', 'project code', 'code : projet'],
    name: ['项目名称', 'project name', 'nom : projet'],
    parent: ['项目国家', 'project country', 'pays : projet'],
    parentValue: 'Synthetic country',
  },
  {
    kind: 'site',
    nav: ['项目站点', 'Project sites', 'Sites du projet'],
    add: ['新增站点', 'Add site', 'Ajouter : site'],
    code: ['站点代码', 'site code', 'code : site'],
    name: ['站点名称', 'site name', 'nom : site'],
    parent: ['站点项目', 'site project', 'projet : site'],
    parentValue: 'Synthetic project',
  },
]
for (const [index, locale] of ['zh', 'en', 'fr'].entries()) {
  for (const config of configurations) {
    test(`${config.kind} creation pending/rejected retry remains truthful in ${locale}`, async ({
      page,
    }) => {
      await openMaster(page)
      await page
        .getByRole('combobox', { name: '界面语言 / UI language / Langue' })
        .selectOption(locale)
      const nav = page.locator('.master-data-navigation')
      await nav
        .getByRole('button', { name: config.nav[index], exact: true })
        .click()
      const panel = page.locator('#master-data-reference-panel')
      const code = panel.getByLabel(config.code[index], { exact: true })
      const name = panel.getByLabel(config.name[index], { exact: true })
      const add = panel.locator('button').filter({ hasText: config.add[index] })
      await expect(add).toBeDisabled()
      await expect(code).toHaveAttribute('aria-required', 'true')
      await code.fill('TEST-NEW')
      await name.fill('Synthetic new record')
      if (config.parent) {
        await panel.getByLabel(config.parent[index], { exact: true }).click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: config.parentValue })
          .click()
      }
      if (config.kind === 'project') {
        await panel
          .getByLabel(
            [
              '项目默认站点',
              'project default site',
              'site par défaut : projet',
            ][index],
            { exact: true },
          )
          .fill('Synthetic site')
        await panel
          .getByLabel(
            ['项目部门', 'project department', 'département : projet'][index],
            { exact: true },
          )
          .fill('Synthetic department')
      }
      await add.click()
      const localNotice = panel.getByRole('status').filter({
        hasText: [
          '正在保存，请稍候',
          'Saving, please wait',
          'Enregistrement en cours',
        ][index],
      })
      await expect(panel.locator('.ant-alert-error')).toBeVisible()
      await expect(code).toHaveValue('TEST-NEW')
      await expect(name).toHaveValue('Synthetic new record')
      await add.click()
      await expect(add).toBeDisabled()
      await expect(code).toBeDisabled()
      await expect(name).toBeDisabled()
      if (config.parent)
        await expect(
          panel.getByLabel(config.parent[index], { exact: true }),
        ).toBeDisabled()
      await add.dispatchEvent('click')
      expect(
        await page.evaluate(() => Reflect.get(window, '__referenceCalls')),
      ).toBe(2)
      await expect(panel.locator('.ant-alert-error')).toHaveCount(0)
      await expect(panel.locator('.ant-alert-success')).toHaveCount(0)
      await expect(localNotice).toContainText(
        ['正在保存，请稍候', 'Saving, please wait', 'Enregistrement en cours'][
          index
        ],
      )
      await page.evaluate(() => {
        const finish = Reflect.get(window, '__finishReference')
        if (typeof finish === 'function') finish()
      })
      await expect(panel.locator('.ant-alert-success')).toBeVisible()
      await expect(code).toHaveValue('')
      await expect(name).toHaveValue('')
      await expect(add).toBeDisabled()
      await add.dispatchEvent('click')
      expect(
        await page.evaluate(() => Reflect.get(window, '__referenceCalls')),
      ).toBe(2)
    })
  }
}
