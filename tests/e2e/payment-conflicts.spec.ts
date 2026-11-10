import { openShellPage } from './shell-controls'
import { expect, test } from '@playwright/test'

for (const explicitLocale of [undefined, 'fr-FR'] as const) {
  test(`conflict loading disables refresh and partial failure never announces empty explicit=${explicitLocale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.evaluate(async (explicitLocale) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { SyncConflictPanel } = await load(
        '/src/components/SyncConflictPanel.tsx',
      )
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(explicitLocale ? 'zh' : 'en')
      const host = window as Window & {
        __conflictCalls?: number
        __finishLocal?: () => void
        __failPayment?: () => void
      }
      host.__conflictCalls = 0
      const api = {
        listSyncConflicts: () => {
          host.__conflictCalls = (host.__conflictCalls ?? 0) + 1
          return new Promise((resolve) => {
            host.__finishLocal = () => resolve([])
          })
        },
        listPaymentSyncConflicts: () =>
          new Promise((_resolve, reject) => {
            host.__failPayment = () => reject(new Error('Synthetic offline'))
          }),
      }
      const target = document.createElement('div')
      const createRoot = DOM.createRoot ?? DOM.default.createRoot
      const createElement = React.createElement ?? React.default.createElement
      document.body.replaceChildren(target)
      createRoot(target).render(
        createElement(SyncConflictPanel, {
          api,
          locale: explicitLocale,
        }),
      )
    }, explicitLocale)
    await expect(page.getByRole('status')).toContainText(
      explicitLocale ? 'Chargement des conflits' : 'Loading sync conflicts',
    )
    if (explicitLocale) {
      await expect(
        page.getByRole('heading', { name: 'Conflits de synchronisation' }),
      ).toBeVisible()
      await expect(
        page.getByLabel('Motif de résolution', { exact: true }),
      ).toBeVisible()
    }
    await expect(
      page.locator('.sync-conflict-panel button').first(),
    ).toBeDisabled()
    await page.evaluate(async () => {
      const path = '/src/lib/ui-locale.ts'
      ;(await import(path)).setUiLocale('fr')
    })
    await expect(page.getByRole('status')).toContainText(
      'Chargement des conflits',
    )
    await page.evaluate(() => {
      const host = window as Window & {
        __finishLocal?: () => void
        __failPayment?: () => void
      }
      host.__finishLocal?.()
      host.__failPayment?.()
    })
    await expect(
      page.locator('.sync-conflict-panel button').first(),
    ).toBeEnabled()
    await expect(page.locator('.conflict-empty')).toHaveCount(0)
    await expect(page.locator('.conflict-feedback')).not.toBeEmpty()
    expect(
      await page.evaluate(
        () => (window as Window & { __conflictCalls?: number }).__conflictCalls,
      ),
    ).toBe(1)
    expect(errors).toEqual([])
  })
}

for (const previouslyLoaded of [false, true]) {
  test(`partial conflict read failure never masquerades as empty previous=${previouslyLoaded}`, async ({
    page,
  }) => {
    await page.addInitScript((previouslyLoaded) => {
      Object.assign(window, {
        __phase: previouslyLoaded ? 'loaded' : 'failed',
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
                  username: 'synthetic-admin',
                  roles: ['administrator'],
                  requires_password_change: false,
                }
              if (command === 'list_sync_conflicts') return []
              if (command === 'list_payment_sync_conflicts') {
                const phase = (window as unknown as { __phase: string }).__phase
                if (phase === 'failed') throw { code: 'network_unavailable' }
                if (phase === 'loaded')
                  return [
                    {
                      id: 'synthetic-preserved-conflict',
                      entityId: crypto.randomUUID(),
                      eventId: crypto.randomUUID(),
                      entityType: 'procurement_expenditure',
                      serverVersion: 1,
                      localPayloadJson: '{}',
                      serverPayloadJson: '{}',
                      serverOperation: 'upsert',
                    },
                  ]
                return []
              }
              return []
            },
          },
        },
      })
    }, previouslyLoaded)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('button', { name: '使用离线登录', exact: true })
      .click()
    await page.getByLabel('账号', { exact: true }).fill('synthetic-admin')
    await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
    await page.locator('#captcha').fill('2')
    await page.getByRole('button', { name: '离线登录', exact: true }).click()
    await openShellPage(page, 'conflicts')
    if (previouslyLoaded) {
      await expect(page.locator('.conflict-record')).toBeVisible()
      await page.evaluate(() => {
        ;(window as unknown as { __phase: string }).__phase = 'failed'
        window.dispatchEvent(new Event('honsen-procurement-synced'))
      })
    }
    await expect(
      page.getByText('没有待处理的同步冲突。', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByText('暂时无法读取云端付款冲突；原始记录保留，稍后刷新重试。', {
        exact: false,
      }),
    ).toBeVisible()
    if (previouslyLoaded)
      await expect(page.locator('.conflict-record')).toBeVisible()
    await page.screenshot({ path: '.cache/conflict-partial-error.png' })
    await page.evaluate(() => {
      ;(window as unknown as { __phase: string }).__phase = 'empty'
      window.dispatchEvent(new Event('honsen-procurement-synced'))
    })
    await expect(
      page.getByText('没有待处理的同步冲突。', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('暂时无法读取云端付款冲突；原始记录保留，稍后刷新重试。', {
        exact: false,
      }),
    ).toHaveCount(0)
  })
}

test('administrator reconciles immutable payments through the production conflict panel', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => {
    let state: 'pending' | 'confirmed' | undefined
    const conflictId = '00000000-0000-4000-8000-000000000731'
    const eventId = '00000000-0000-4000-8000-000000000732'
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              input?: { conflictId: string; eventId: string; reason: string }
            },
          ) {
            if (command === 'issue_local_captcha')
              return Promise.resolve({
                id: crypto.randomUUID(),
                question: '1 + 1 = ?',
              })
            if (command === 'issue_cloud_captcha')
              return Promise.reject({ code: 'network_unavailable' })
            if (command === 'offline_login')
              return Promise.resolve({
                user_id: '00000000-0000-4000-8000-000000000733',
                username: 'synthetic-admin',
                roles: ['administrator'],
                requires_password_change: false,
              })
            if (command === 'get_authorization_context')
              return Promise.reject({ code: 'forbidden' })
            if (command === 'list_sync_conflicts') return Promise.resolve([])
            if (command === 'list_payment_sync_conflicts')
              return Promise.resolve([
                {
                  id: conflictId,
                  eventId,
                  entityId: '00000000-0000-4000-8000-000000000734',
                  entityType: 'procurement_expenditure',
                  serverVersion: 1,
                  localPayloadJson: JSON.stringify({
                    payeeName: 'synthetic-local',
                    amountMinor: '100',
                    currency: 'XOF',
                  }),
                  serverPayloadJson: JSON.stringify({
                    payeeName: 'synthetic-server',
                    amountMinor: '200',
                    currency: 'XOF',
                  }),
                  serverOperation: 'upsert',
                  paymentResolutionState: state,
                  resolvedBy:
                    state === 'confirmed' ? 'synthetic-admin-id' : undefined,
                  resolvedAt:
                    state === 'confirmed' ? '2026-10-24T21:00:00Z' : undefined,
                  resolutionReason:
                    state === 'confirmed'
                      ? '核对原始付款凭证后采用云端账本'
                      : undefined,
                },
              ])
            if (command === 'resolve_payment_sync_conflict') {
              if (
                state ||
                args?.input?.conflictId !== conflictId ||
                args.input.eventId !== eventId ||
                !args.input.reason.trim()
              )
                return Promise.reject({ code: 'invalid_input' })
              state = 'pending'
              Object.assign(window, { __paymentResolutionInput: args.input })
              return Promise.resolve()
            }
            if (command === 'fixture_confirm_payment_resolution') {
              state = 'confirmed'
              window.dispatchEvent(new Event('honsen-procurement-synced'))
              return Promise.resolve()
            }
            return Promise.resolve([])
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '使用离线登录', exact: true }).click()
  await page.getByLabel('账号').fill('synthetic-admin')
  await page.getByLabel('密码').fill('fixture-password')
  await page.locator('#captcha').fill('2')
  await page.getByRole('button', { name: '离线登录' }).click()
  await openShellPage(page, 'conflicts')
  await page.getByText('比较本地与云端内容').click()
  await expect(page.getByText(/synthetic-local/)).toBeVisible()
  await expect(page.getByText(/synthetic-server/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: '保留本地', exact: true }),
  ).toHaveCount(0)
  const reconcile = page.getByRole('button', {
    name: '确认云端付款并保留冲突原件',
  })
  await reconcile.click()
  await expect(
    page.getByText('请填写处理原因。', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('处理原因').fill('核对原始付款凭证后采用云端账本')
  await reconcile.click()
  await expect(
    page.getByText('处置待同步，尚未获得服务器确认。', { exact: true }),
  ).toBeVisible()
  await expect(reconcile).toBeDisabled()
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __paymentResolutionInput?: unknown })
          .__paymentResolutionInput,
    ),
  ).resolves.toEqual({
    conflictId: '00000000-0000-4000-8000-000000000731',
    eventId: '00000000-0000-4000-8000-000000000732',
    reason: '核对原始付款凭证后采用云端账本',
  })
  await page.evaluate(() =>
    (
      window as Window & {
        __TAURI__: { core: { invoke(command: string): Promise<void> } }
      }
    ).__TAURI__.core.invoke('fixture_confirm_payment_resolution'),
  )
  await expect(page.getByText('服务器已确认付款对账处置。')).toBeVisible()
  await expect(page.getByText(/synthetic-admin-id/)).toBeVisible()
  await expect(page.getByText(/核对原始付款凭证后采用云端账本/)).toBeVisible()
  await expect(page.getByText(/synthetic-local/)).toBeVisible()
  await expect(errors).toEqual([])
})
