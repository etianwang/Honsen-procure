import { expect, test, type Page } from '@playwright/test'

test('account reload and saving show pending states and translate retained failure', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mount(page)
  await page
    .getByLabel('Display name', { exact: true })
    .fill('Synthetic retained edit')
  await page.evaluate(() => {
    const host = window as Window & {
      __TAURI__: {
        core: { invoke: (command: string, args?: object) => Promise<unknown> }
      }
      __finishAccountRequest?: (fail: boolean) => void
    }
    const original = host.__TAURI__.core.invoke
    host.__TAURI__.core.invoke = (command, args) =>
      new Promise((resolve, reject) => {
        host.__finishAccountRequest = (fail) =>
          fail
            ? reject(new Error('Synthetic offline'))
            : resolve(original(command, args))
      })
  })
  await page
    .getByRole('button', { name: 'Save account settings', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Saving account')
  await expect(page.getByLabel('Display name', { exact: true })).toBeDisabled()
  await page.evaluate(() =>
    (
      window as Window & { __finishAccountRequest?: (fail: boolean) => void }
    ).__finishAccountRequest?.(true),
  )
  await expect(page.getByRole('status')).toContainText('Unable to save')
  await page.evaluate(async () => {
    const path = '/src/lib/ui-locale.ts'
    ;(await import(path)).setUiLocale('fr')
  })
  await expect(page.getByRole('status')).toContainText(
    'Enregistrement impossible',
  )
  await expect(page.getByLabel('Nom affiché', { exact: true })).toHaveValue(
    'Synthetic retained edit',
  )
  await page
    .getByRole('button', { name: 'Recharger le compte', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Chargement du compte')
  await expect(
    page.getByRole('button', { name: 'Recharger le compte', exact: true }),
  ).toBeDisabled()
  await page.evaluate(() =>
    (
      window as Window & { __finishAccountRequest?: (fail: boolean) => void }
    ).__finishAccountRequest?.(false),
  )
  await expect(page.getByLabel('Nom affiché', { exact: true })).toHaveValue(
    'Synthetic',
  )
  expect(errors).toEqual([])
})

async function mount(page: Page, protectedAccount = false) {
  await page.goto('/')
  await page.evaluate(async (protectedAccount) => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = await load('/node_modules/.vite/deps/react.js')
    const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
    const { ManagedAccountEditor } = await load(
      '/src/components/ManagedAccountEditor.tsx',
    )
    const { setUiLocale } = await load('/src/lib/ui-locale.ts')
    setUiLocale('en')
    const state = window as unknown as {
      calls: object[]
      conflict: boolean
      __TAURI__: object
    }
    state.calls = []
    let details = {
      id: '00000000-0000-4000-8000-000000000001',
      username: protectedAccount ? 'admin' : 'Zhanghekai',
      displayName: 'Synthetic',
      roles: protectedAccount ? ['super_administrator'] : ['engineer'],
      uiLocale: 'en-US',
      isEnabled: true,
      requiresPasswordChange: true,
      isLocked: true,
      accountVersion: '12',
    }
    state.__TAURI__ = {
      core: {
        invoke: async (command: string, args: { input?: object }) => {
          if (command === 'get_managed_account_details') return details
          if (command === 'update_managed_account') {
            state.calls.push(args)
            if (state.conflict) throw { code: 'account_conflict' }
            details = {
              ...details,
              ...args.input,
              accountVersion: String(Number(details.accountVersion) + 1),
            }
            return details
          }
          throw new Error(command)
        },
      },
    }
    const element = document.createElement('div')
    document.body.replaceChildren(element)
    ;(DOM.createRoot ?? DOM.default.createRoot)(element).render(
      (React.createElement ?? React.default.createElement)(
        ManagedAccountEditor,
        { accountId: details.id, role: 'super_administrator' },
      ),
    )
  }, protectedAccount)
}

test('normal account settings use versioned updates and retain login identity', async ({
  page,
}) => {
  await mount(page)
  await page.getByLabel('Display name', { exact: true }).fill('张和凯')
  await page.getByLabel('Purchaser', { exact: true }).check()
  await page
    .getByRole('button', { name: 'Save account settings', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Saved.')
  expect(
    await page.evaluate(() => (window as unknown as { calls: object[] }).calls),
  ).toEqual([
    {
      accountId: '00000000-0000-4000-8000-000000000001',
      input: {
        expectedAccountVersion: '12',
        displayName: '张和凯',
        roles: ['engineer', 'purchaser'],
      },
    },
  ])
  await page
    .getByRole('button', { name: 'Disable account', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Enable account', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Unlock sign-in', exact: true })
    .click()
})

test('stale account changes require explicit reload and preserve edits', async ({
  page,
}) => {
  await mount(page)
  await page.getByLabel('Display name', { exact: true }).fill('Keep edit')
  await page.evaluate(() => {
    ;(window as unknown as { conflict: boolean }).conflict = true
  })
  await page
    .getByRole('button', { name: 'Save account settings', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('changed elsewhere')
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
    'Keep edit',
  )
  await expect(
    page.getByRole('button', { name: 'Save account settings', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Reload account', exact: true })
    .click()
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
    'Synthetic',
  )
})

test('permanent admin has no disable or role edit controls', async ({
  page,
}) => {
  await mount(page, true)
  await expect(
    page.getByText('Protected administrator:', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Disable account', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
})
