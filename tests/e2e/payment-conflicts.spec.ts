import { expect, test } from '@playwright/test'

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
              return Promise.reject({ code: 'sync_transport_error' })
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
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('synthetic-admin')
  await page.getByLabel('密码').fill('fixture-password')
  await page.getByLabel(/本地验证码/u).fill('2')
  await page.getByRole('button', { name: '离线登录' }).click()
  await page.getByRole('button', { name: '同步冲突', exact: true }).click()
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
