import { expect, test, type Page } from '@playwright/test'

test('username check gives immediate local feedback and preserves form on retry', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openAccounts(page)
  await page.evaluate(() => {
    const host = window as Window & {
      __TAURI__: {
        core: { invoke: (command: string, args?: object) => Promise<unknown> }
      }
      __finishCheck?: (fail: boolean) => void
    }
    const original = host.__TAURI__.core.invoke
    host.__TAURI__.core.invoke = (command, args) =>
      command === 'find_managed_accounts'
        ? new Promise((resolve, reject) => {
            host.__finishCheck = (fail) =>
              fail ? reject(new Error('Synthetic offline')) : resolve([])
          })
        : original(command, args)
  })
  await page.getByLabel('用户名', { exact: true }).fill('SyntheticRetry')
  await page.getByLabel('姓名', { exact: true }).fill('合成姓名')
  await page.getByLabel('临时密码', { exact: true }).fill('synthetic-temporary')
  await page
    .getByRole('button', { name: '检查账号是否存在', exact: true })
    .click()
  await expect(page.locator('#account-check-feedback')).toHaveText(
    '正在查询账号，请稍候。',
  )
  await expect(page.getByLabel('用户名', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('用户名', { exact: true })).toHaveAttribute(
    'aria-describedby',
    'account-check-feedback',
  )
  await expect(
    page.getByRole('button', { name: '正在检查…', exact: true }),
  ).toBeDisabled()
  await page.evaluate(() =>
    (
      window as Window & { __finishCheck?: (fail: boolean) => void }
    ).__finishCheck?.(true),
  )
  await expect(page.locator('#account-check-feedback')).toContainText(
    '无法查询账号',
  )
  await expect(page.getByLabel('临时密码', { exact: true })).toHaveValue(
    'synthetic-temporary',
  )
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('合成姓名')
  await page
    .getByRole('button', { name: '检查账号是否存在', exact: true })
    .click()
  await page.evaluate(() =>
    (
      window as Window & { __finishCheck?: (fail: boolean) => void }
    ).__finishCheck?.(false),
  )
  await expect(page.locator('#account-check-feedback')).toContainText(
    '账号可用',
  )
  await page.getByLabel('用户名', { exact: true }).fill('ChangedName')
  await expect(page.locator('#account-check-feedback')).toBeEmpty()
  expect(errors).toEqual([])
})

test('new usernames are ASCII alphanumeric while display names accept Chinese', async ({
  page,
}) => {
  await openAccounts(page)
  await page.getByLabel('姓名', { exact: true }).fill('合成姓名')
  await page.getByLabel('临时密码', { exact: true }).fill('synthetic-temporary')
  for (const invalid of ['测试1', 'User Name', 'User_Name', 'User-Name']) {
    await page.getByLabel('用户名', { exact: true }).fill(invalid)
    await expect(
      page.getByRole('button', { name: '检查账号是否存在', exact: true }),
    ).toBeDisabled()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: '新建用户名只能包含英文字母和数字' }),
    ).toBeVisible()
  }
  await page.getByLabel('用户名', { exact: true }).fill('MixedCaseUser9')
  await page
    .getByRole('button', { name: '检查账号是否存在', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: '下一步', exact: true }),
  ).toBeEnabled()
  await page.getByLabel('姓名', { exact: true }).fill('   ')
  await expect(
    page.getByRole('button', { name: '下一步', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '取消创建', exact: true }).click()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('')
})

test('display name is presented separately from the login name', async ({
  page,
}) => {
  await openAccounts(page, false, false, false, false, false, '合成工程员')
  await expect(page.locator('.signed-in-username')).toHaveText(
    '合成工程员 (synthetic-admin)',
  )
})

test('legacy session without a display name falls back to its stored username', async ({
  page,
}) => {
  await openAccounts(page)
  await expect(page.locator('.signed-in-username')).toHaveText(
    'synthetic-admin',
  )
})

test('legacy cached name collision is explicit and does not sign in another account', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'issue_local_captcha')
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'issue_cloud_captcha')
              throw { code: 'network_unavailable' }
            if (command === 'offline_login')
              throw { code: 'account_name_collision' }
            throw new Error('Unexpected command')
          },
        },
      },
    }),
  )
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '使用离线登录', exact: true }).click()
  await page.getByLabel('账号', { exact: true }).fill('LegacyName')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-temporary')
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '离线登录', exact: true }).click()
  await expect(
    page.getByText(
      '本地账号名称存在大小写冲突，请联系管理员处理；账号与历史数据已保留。',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible()
})

test('first-login password change blocks business effects and returns to login', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const commands: string[] = []
    Object.assign(window, {
      __accountCommands: commands,
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            commands.push(command)
            if (
              command === 'issue_local_captcha' ||
              command === 'issue_cloud_captcha'
            )
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'online_login')
              return {
                user_id: crypto.randomUUID(),
                username: 'synthetic',
                roles: ['engineer'],
                requires_password_change: true,
              }
            if (command === 'change_account_password') return undefined
            throw new Error(`Unexpected ${command}`)
          },
        },
      },
    })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await page.getByLabel('账号', { exact: true }).fill('synthetic')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-temporary')
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '在线登录', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '首次登录必须修改密码' }),
  ).toBeVisible()
  await page.waitForTimeout(300)
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __accountCommands: string[] }).__accountCommands,
    ),
  ).toEqual(['issue_cloud_captcha', 'online_login'])
  await page.getByLabel('当前密码').fill('synthetic-temporary')
  await page.getByLabel('新密码（至少12位）').fill('synthetic-replacement')
  await page.getByRole('button', { name: '修改并重新登录' }).click()
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible()
})

async function openAccounts(
  page: Page,
  empty = false,
  existing = false,
  recommended = false,
  online = false,
  superAdmin = false,
  displayName?: string,
) {
  await page.addInitScript(
    ({ empty, existing, recommended, superAdmin, displayName, online }) => {
      const id = (n: number) =>
        `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
      const records = [
        { kind: 'country', id: id(1), name: 'CI synthetic', is_active: true },
        { kind: 'country', id: id(5), name: 'CM synthetic', is_active: true },
        {
          kind: 'project',
          id: id(2),
          name: 'Bethel synthetic',
          country_id: id(1),
          is_active: true,
        },
        {
          kind: 'project',
          id: id(6),
          name: 'Minrex synthetic',
          country_id: id(5),
          is_active: true,
        },
        {
          kind: 'department',
          id: id(3),
          name: 'Engineering synthetic',
          is_active: true,
        },
        {
          kind: 'team',
          id: id(4),
          name: 'Team synthetic',
          department_id: id(3),
          is_active: true,
        },
      ]
      Object.assign(window, {
        __created: [],
        __TAURI_INTERNALS__: {},
        __TAURI__: {
          core: {
            invoke: async (command: string, args?: { input: unknown }) => {
              if (command === 'issue_cloud_captcha' && !online)
                throw { code: 'network_unavailable' }
              if (
                command === 'issue_local_captcha' ||
                command === 'issue_cloud_captcha'
              )
                return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
              if (command === 'offline_login' || command === 'online_login')
                return {
                  user_id: id(10),
                  username: 'synthetic-admin',
                  display_name: displayName,
                  roles: [superAdmin ? 'super_administrator' : 'administrator'],
                  requires_password_change: false,
                  password_change_recommended: recommended,
                }
              if (command === 'list_authorization_contexts')
                return empty
                  ? []
                  : [
                      { projectId: id(2), departmentId: id(3), teamId: id(4) },
                      { projectId: id(6), departmentId: id(3), teamId: id(4) },
                    ]
              if (['pull_sync', 'refresh_authorization'].includes(command))
                return {}
              if (command === 'push_pending_sync')
                return { acceptedCount: 0, pendingCount: 0 }
              if (command === 'sync_status')
                return {
                  pendingCount: 0,
                  conflictCount: 0,
                  quarantinedCount: 0,
                  lastSuccessAt: null,
                }
              if (command === 'list_reference_master_data')
                return empty ? [] : records
              if (command === 'find_managed_accounts')
                return existing
                  ? [{ id: id(11), username: 'SyntheticExisting' }]
                  : []
              if (command === 'change_account_password') {
                const e = (window as unknown as { __passwordError?: string })
                  .__passwordError
                if (e) throw { code: e }
                return undefined
              }
              if (command === 'list_managed_authorizations') return []
              if (command === 'create_managed_account') {
                ;(window as unknown as { __created: unknown[] }).__created.push(
                  args?.input,
                )
                return { id: id(11), username: 'SyntheticNew' }
              }
              throw new Error('Unavailable')
            },
          },
        },
      })
    },
    { empty, existing, recommended, superAdmin, displayName, online },
  )
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  if (!online)
    await page
      .getByRole('button', { name: '使用离线登录', exact: true })
      .click()
  await page.getByLabel('账号', { exact: true }).fill('synthetic-admin')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-temporary')
  await page.locator('#captcha').fill('2')
  await page
    .getByRole('button', {
      name: online ? '在线登录' : '离线登录',
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: '在线授权管理', exact: true }).click()
}

const languages = [
  [
    'zh',
    '用户名',
    '临时密码',
    '检查账号是否存在',
    '下一步',
    '上一步',
    '工程申请人',
    '国家',
    '项目',
    '部门',
    '班组',
    '创建账号',
    '已创建；首次登录必须改密。',
  ],
  [
    'en',
    'Username',
    'Temporary password',
    'Check account existence',
    'Next',
    'Back',
    'Engineer applicant',
    'Country',
    'Project',
    'Department',
    'Team',
    'Create account',
    'Created; first sign-in requires a password change.',
  ],
  [
    'fr',
    'Nom utilisateur',
    'Mot de passe temporaire',
    'Vérifier le compte',
    'Suivant',
    'Précédent',
    'Demandeur ingénieur',
    'Pays',
    'Projet',
    'Service',
    'Équipe',
    'Créer le compte',
    'Créé ; changement du mot de passe requis à la première connexion.',
  ],
]
for (const [
  locale,
  user,
  password,
  check,
  next,
  back,
  engineer,
  country,
  project,
  department,
  team,
  create,
  success,
] of languages) {
  test(`named account wizard ${locale} confirms exact scope without UUID input`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openAccounts(page)
    await page
      .getByRole('combobox', { name: '界面语言 / UI language / Langue' })
      .selectOption(locale)
    await page.getByLabel(user, { exact: true }).fill('SyntheticNew')
    await page
      .getByLabel(
        locale === 'zh'
          ? '姓名'
          : locale === 'fr'
            ? 'Nom affiché'
            : 'Display name',
        { exact: true },
      )
      .fill('合成姓名')
    await page.getByLabel(password, { exact: true }).fill('synthetic-temporary')
    if (locale === 'zh')
      await page.screenshot({ path: '.cache/account-wizard-basic-1280.png' })
    await expect(
      page.getByRole('button', { name: next, exact: true }),
    ).toBeDisabled()
    await page.getByRole('button', { name: check, exact: true }).click()
    await page.getByRole('button', { name: next, exact: true }).click()
    await page.getByLabel(engineer, { exact: true }).check()
    await page.getByRole('button', { name: next, exact: true }).click()
    await page
      .getByRole('combobox', { name: country, exact: true })
      .selectOption({ label: 'CI synthetic' })
    await page
      .getByRole('combobox', { name: project, exact: true })
      .selectOption({ label: 'Bethel synthetic' })
    await page
      .getByRole('combobox', { name: department, exact: true })
      .selectOption({ label: 'Engineering synthetic' })
    await page
      .getByRole('combobox', { name: team, exact: true })
      .selectOption({ label: 'Team synthetic' })
    if (locale === 'zh')
      await page.screenshot({ path: '.cache/account-wizard-scope-1280.png' })
    await page
      .getByRole('combobox', { name: country, exact: true })
      .selectOption({ label: 'CM synthetic' })
    await expect(
      page.getByRole('combobox', { name: project, exact: true }),
    ).toHaveValue('')
    await expect(
      page.getByRole('combobox', { name: team, exact: true }),
    ).toBeDisabled()
    await page
      .getByRole('combobox', { name: country, exact: true })
      .selectOption({ label: 'CI synthetic' })
    await page
      .getByRole('combobox', { name: project, exact: true })
      .selectOption({ label: 'Bethel synthetic' })
    await page
      .getByRole('combobox', { name: department, exact: true })
      .selectOption({ label: 'Engineering synthetic' })
    await page
      .getByRole('combobox', { name: team, exact: true })
      .selectOption({ label: 'Team synthetic' })
    if (locale === 'zh')
      await page.screenshot({ path: '.cache/account-wizard-scope-1280.png' })
    await page.getByRole('button', { name: next, exact: true }).click()
    await expect(page.locator('.wizard-summary')).toContainText(
      'Bethel synthetic',
    )
    await expect(page.locator('.wizard-summary')).not.toContainText(
      'synthetic-temporary',
    )
    await page.getByRole('button', { name: back, exact: true }).click()
    await expect(
      page.getByRole('combobox', { name: team, exact: true }),
    ).toHaveValue('00000000-0000-4000-8000-000000000004')
    await page.getByRole('button', { name: next, exact: true }).click()
    await expect(page.locator('body')).not.toContainText(
      '00000000-0000-4000-8000',
    )
    await expect(page.locator('input[placeholder*="UUID"]')).toHaveCount(0)
    await page
      .locator('.account-wizard')
      .getByRole('button', { name: create, exact: true })
      .click()
    await expect(page.getByText(success, { exact: true })).toBeVisible()
    expect(
      await page.evaluate(
        () => (window as unknown as { __created: unknown[] }).__created,
      ),
    ).toEqual([
      expect.objectContaining({
        username: 'SyntheticNew',
        displayName: '合成姓名',
        roles: ['engineer'],
        employeePhotoKey: 'builtin:default-avatar:v1',
        scope: {
          projectId: '00000000-0000-4000-8000-000000000002',
          departmentId: '00000000-0000-4000-8000-000000000003',
          teamId: '00000000-0000-4000-8000-000000000004',
        },
      }),
    ])
  })
}

test('existing account is never reset and cancellation clears the draft', async ({
  page,
}) => {
  await openAccounts(page, false, true)
  await page.getByLabel('用户名', { exact: true }).fill('syntheticexisting')
  await page.getByLabel('临时密码', { exact: true }).fill('synthetic-temporary')
  await page
    .getByRole('button', { name: '检查账号是否存在', exact: true })
    .click()
  await expect(page.getByText('账号已存在；不创建或重置密码。')).toBeVisible()
  await expect(page.getByLabel('临时密码', { exact: true })).toHaveValue('')
  await expect(
    page.getByRole('button', { name: '下一步', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '取消创建', exact: true }).click()
  await expect(page.getByLabel('用户名', { exact: true })).toHaveValue('')
})

test('empty reference data cannot submit invented scope', async ({ page }) => {
  await openAccounts(page, true)
  await page.getByLabel('用户名', { exact: true }).fill('SyntheticNew')
  await page.getByLabel('姓名', { exact: true }).fill('合成姓名')
  await page.getByLabel('临时密码', { exact: true }).fill('synthetic-temporary')
  await page
    .getByRole('button', { name: '检查账号是否存在', exact: true })
    .click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByLabel('工程申请人', { exact: true }).check()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: '国家', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '下一步', exact: true }),
  ).toBeDisabled()
})

for (const width of [1280, 1024, 760]) {
  test(`sidebar stays in place while content scrolls at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 768 })
    await openAccounts(page)
    const sidebar = page.locator('.sidebar'),
      content = page.locator('.content')
    const before = await sidebar.boundingBox()
    await content.evaluate((el) => {
      const spacer = document.createElement('div')
      spacer.style.height = '1800px'
      el.appendChild(spacer)
      el.scrollTop = 900
    })
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await sidebar.boundingBox()).toEqual(before)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await expect(
      sidebar.getByRole('button', { name: '首页', exact: true }),
    ).toBeVisible()
  })
}

for (const recommended of [false, true]) {
  test(`signed-in password change is reachable and returns to login recommended=${recommended}`, async ({
    page,
  }) => {
    await openAccounts(page, false, false, recommended, true)
    await expect(
      page.getByText('初始密码仍在使用，建议修改密码；可继续使用系统'),
    ).toHaveCount(recommended ? 1 : 0)
    await page
      .locator('.topbar')
      .getByRole('button', { name: '修改密码', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: '修改密码', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('当前密码', { exact: true }).focus()
    await expect
      .poll(() => dialog.evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBe(1)
    if (!recommended)
      await page.screenshot({
        path: '.cache/account-password-dialog.png',
        animations: 'disabled',
      })
    await dialog
      .getByLabel('当前密码', { exact: true })
      .fill('synthetic-old-password')
    await dialog
      .getByLabel('新密码（至少12位）', { exact: true })
      .fill('synthetic-new-password')
    await dialog
      .getByLabel('确认新密码', { exact: true })
      .fill('does-not-match')
    await expect(
      dialog.getByRole('button', { name: '修改并重新登录', exact: true }),
    ).toBeDisabled()
    await dialog
      .getByLabel('确认新密码', { exact: true })
      .fill('synthetic-new-password')
    await dialog
      .getByRole('button', { name: '修改并重新登录', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: '登录 HONSEN Procure', exact: true }),
    ).toBeVisible()
  })
}

for (const [code, message] of [
  ['invalid_credentials', '当前密码不正确。请重新输入后重试。'],
  [
    'sync_transport_error',
    '无法确认云端改密结果。请检查网络；若新密码已生效，请用新密码重新登录。',
  ],
]) {
  test(`password change ${code} preserves dialog and clears secrets`, async ({
    page,
  }) => {
    await openAccounts(page, false, false, false, true)
    await page.evaluate((code) => {
      ;(window as unknown as { __passwordError: string }).__passwordError = code
    }, code)
    await page
      .locator('.topbar')
      .getByRole('button', { name: '修改密码', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: '修改密码', exact: true })
    await dialog
      .getByLabel('当前密码', { exact: true })
      .fill('synthetic-old-password')
    await dialog
      .getByLabel('新密码（至少12位）', { exact: true })
      .fill('synthetic-new-password')
    await dialog
      .getByLabel('确认新密码', { exact: true })
      .fill('synthetic-new-password')
    await dialog
      .getByRole('button', { name: '修改并重新登录', exact: true })
      .click()
    await expect(dialog.getByText(message, { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('当前密码', { exact: true })).toHaveValue('')
    await expect(
      dialog.getByLabel('新密码（至少12位）', { exact: true }),
    ).toHaveValue('')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })
}

test('offline password change stays disabled and home preserves scope warning', async ({
  page,
}) => {
  await openAccounts(page, false, false, true)
  await expect(
    page
      .locator('.topbar')
      .getByRole('button', { name: '修改密码', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText('修改密码需要在线登录和可用连接。', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await page.screenshot({ path: '.cache/account-home-overview.png' })
  await expect(
    page.getByRole('dialog', { name: '修改密码', exact: true }),
  ).toHaveCount(0)
})

test('super administrator governance notice does not claim password change grants scope', async ({
  page,
}) => {
  await openAccounts(page, false, false, true, true, true)
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await expect(
    page.getByText(
      '超级管理员负责账号、角色和授权治理；该角色本身不授予日常采购业务权限。',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText(
      '当前没有可用的项目业务授权。请联系授权管理员分配项目、部门和班组；修改密码不会授予这些权限。',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page
      .locator('.topbar')
      .getByRole('button', { name: '修改密码', exact: true }),
  ).toBeEnabled()
})
