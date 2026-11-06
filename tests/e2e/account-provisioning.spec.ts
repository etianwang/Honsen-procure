import { expect, test } from '@playwright/test'

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
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await page.getByLabel('账号', { exact: true }).fill('synthetic')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-temporary')
  await page.locator('#captcha').fill('2')
  await page.locator('#cloud-captcha').fill('2')
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
  ).toEqual(['issue_local_captcha', 'issue_cloud_captcha', 'online_login'])
  await page.getByLabel('当前密码').fill('synthetic-temporary')
  await page.getByLabel('新密码（至少12位）').fill('synthetic-replacement')
  await page.getByRole('button', { name: '修改并重新登录' }).click()
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible()
})

test('account provisioning checks existing username and never offers reset', async ({
  page,
}) => {
  await page.addInitScript(() => {
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
                username: 'synthetic-admin',
                roles: ['administrator'],
                requires_password_change: false,
              }
            if (command === 'list_authorization_contexts') return []
            if (command === 'find_managed_accounts')
              return [
                {
                  id: '00000000-0000-4000-8000-000000000010',
                  username: 'synthetic-existing',
                },
              ]
            throw new Error('Unavailable')
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await page.getByLabel('账号', { exact: true }).fill('synthetic-admin')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-temporary')
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '离线登录', exact: true }).click()
  await page.getByRole('button', { name: '在线授权管理', exact: true }).click()
  await page.getByLabel('用户名', { exact: true }).fill('synthetic-existing')
  await page.getByRole('button', { name: '检查账号是否存在' }).click()
  await expect(page.getByText('账号已存在；不创建或重置密码。')).toBeVisible()
  await expect(page.getByLabel('账户 UUID')).toHaveValue(
    '00000000-0000-4000-8000-000000000010',
  )
  await expect(
    page.getByRole('button', { name: '创建账号', exact: true }),
  ).toBeDisabled()
  await expect(page.getByLabel('临时密码')).toHaveValue('')
})
for (const [
  locale,
  title,
  check,
  user,
  temp,
  photo,
  engineer,
  create,
  success,
] of [
  [
    'zh',
    '在线授权管理',
    '检查账号是否存在',
    '用户名',
    '临时密码',
    '员工照片引用',
    '工程申请人',
    '创建账号',
    '已创建；首次登录必须改密。',
  ],
  [
    'en',
    'Online authorization management',
    'Check account existence',
    'Username',
    'Temporary password',
    'Employee photo reference',
    'Engineer applicant',
    'Create account',
    'Created; first sign-in requires a password change.',
  ],
  [
    'fr',
    'Gestion des autorisations en ligne',
    'Vérifier le compte',
    'Nom utilisateur',
    'Mot de passe temporaire',
    'Référence photo employé',
    'Demandeur ingénieur',
    'Créer le compte',
    'Créé ; changement du mot de passe requis à la première connexion.',
  ],
]) {
  test(`account creation ${locale} clears password and uses exact scope`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.addInitScript(() => {
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
                  username: 'synthetic-admin',
                  roles: ['administrator'],
                  requires_password_change: false,
                }
              if (command === 'list_authorization_contexts') return []
              if (command === 'find_managed_accounts') return []
              if (command === 'create_managed_account')
                return { id: '00000000-0000-4000-8000-000000000010' }
              throw new Error('Unavailable')
            },
          },
        },
      })
    })
    await page.goto('/')
    await page.getByRole('button', { name: '获取验证码', exact: true }).click()
    await page.getByLabel('账号', { exact: true }).fill('synthetic-admin')
    await page.getByLabel('密码', { exact: true }).fill('synthetic-temporary')
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: '离线登录', exact: true }).click()
    await page
      .getByRole('button', { name: '在线授权管理', exact: true })
      .click()
    await page
      .getByRole('combobox', { name: '界面语言 / UI language / Langue' })
      .selectOption(locale)
    await expect(
      page.getByRole('heading', { name: title, exact: true, level: 2 }),
    ).toBeVisible()
    await page
      .locator('#managed-project-id')
      .fill('00000000-0000-4000-8000-000000000002')
    await page
      .locator('#managed-department-id')
      .fill('00000000-0000-4000-8000-000000000003')
    await page
      .locator('#managed-team-id')
      .fill('00000000-0000-4000-8000-000000000004')
    await page.getByLabel(user, { exact: true }).fill('synthetic-new')
    await page.getByRole('button', { name: check, exact: true }).click()
    await page.getByLabel(temp, { exact: true }).fill('synthetic-temporary')
    await expect(page.getByLabel(photo, { exact: true })).toHaveValue(
      'builtin:default-avatar:v1',
    )
    await page.getByLabel(engineer, { exact: true }).check()
    await page.getByRole('button', { name: create, exact: true }).click()
    await expect(page.getByText(success, { exact: true })).toBeVisible()
    await expect(page.getByLabel(temp, { exact: true })).toHaveValue('')
    expect(errors).toEqual([])
  })
}
