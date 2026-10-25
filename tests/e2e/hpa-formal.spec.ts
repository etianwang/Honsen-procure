import { expect, test } from '@playwright/test'

test('purchaser issues HPA from approved history and can retry a rejected issue without losing the saved detail', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      errors.push(message.text())
  })
  await page.addInitScript(() => {
    const context = {
      countryId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      projectName: 'HPA fixture project',
      site: 'HPA fixture site',
      departmentId: '00000000-0000-4000-8000-000000000003',
      departmentName: 'fixture department',
      teamId: '00000000-0000-4000-8000-000000000004',
      teamName: 'fixture team',
      currency: 'XOF',
      primaryCurrency: 'XOF',
      languagePair: 'zh_fr',
    }
    const id = '00000000-0000-4000-8000-000000000009'
    let status = 'approved'
    let issueAttempts = 0
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string, args?: { orderId?: string }) => {
            if (command === 'issue_local_captcha')
              return { id: crypto.randomUUID(), question: '1 + 1 = ?' }
            if (command === 'issue_cloud_captcha')
              throw new Error('offline fixture')
            if (command === 'offline_login')
              return {
                user_id: '00000000-0000-4000-8000-000000000007',
                username: 'fixture purchaser',
                roles: ['purchaser'],
                requires_password_change: false,
              }
            if (command === 'list_authorization_contexts') return [context]
            if (command === 'get_authorization_context') return context
            if (command === 'list_requisition_history')
              return {
                records: [
                  {
                    id,
                    displayNo: 'HPA-APPROVED-FIXTURE',
                    projectName: context.projectName,
                    site: context.site,
                    workflowStatus: status,
                    procurementMode: 'honsen_self_purchase',
                    primaryCurrency: 'XOF',
                    totalMinor: '2500',
                    updatedAt: 1,
                  },
                ],
                nextCursor: null,
              }
            if (command === 'get_requisition_detail')
              return {
                id,
                displayNo: 'HPA-APPROVED-FIXTURE',
                formalDocumentNo:
                  status === 'executing'
                    ? 'HC-HP-20261025-HPA-ABCDEFGH-1'
                    : null,
                applicantId: '00000000-0000-4000-8000-000000000008',
                projectName: context.projectName,
                projectId: context.projectId,
                site: context.site,
                workflowStatus: status,
                procurementMode: 'honsen_self_purchase',
                orderDate: '2026-10-25',
                deliveryAddress: 'fixture address',
                expectedDeliveryDate: null,
                notes: null,
                primaryCurrency: 'XOF',
                totalMinor: '2500',
                lines: [
                  {
                    materialName: 'HPA frozen material',
                    model: 'M',
                    specification: 'S',
                    quantity: '2',
                    unit: 'pcs',
                    currency: 'XOF',
                    unitPriceMinor: '1250',
                    lineTotalMinor: '2500',
                  },
                ],
                attachments: [],
                audits: [],
              }
            if (
              command === 'list_order_comments' ||
              command === 'list_order_audits'
            )
              return []
            if (command === 'issue_honsen_formal_order') {
              issueAttempts += 1
              Object.assign(window, {
                hpaIssuedOrderId: args?.orderId,
                hpaIssueAttempts: issueAttempts,
              })
              if (issueAttempts === 1) throw { code: 'forbidden' }
              status = 'executing'
              return {
                documentType: 'HPA',
                formalDocumentNo: 'HC-HP-20261025-HPA-ABCDEFGH-1',
                formalInstallationId: crypto.randomUUID(),
                formalSequence: 1,
              }
            }
            throw new Error(`unexpected HPA fixture command: ${command}`)
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('fixture')
  await page.getByLabel('密码').fill('synthetic-password')
  await page.getByLabel(/本地验证码/).fill('2')
  await page.getByRole('button', { name: '离线登录' }).click()
  await page.getByRole('button', { name: '采购申请单' }).click()
  await page
    .getByRole('button', { name: '查看详情：HPA-APPROVED-FIXTURE' })
    .click()
  await page.getByRole('button', { name: '正式签发 HPA' }).click()
  await expect(page.getByRole('alert')).toContainText('正式下达失败')
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    'HPA frozen material',
  )
  await page.getByRole('button', { name: '正式签发 HPA' }).click()
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    'HC-HP-20261025-HPA-ABCDEFGH-1',
  )
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    'executing',
  )
  await expect(page.getByRole('button', { name: '正式签发 HPA' })).toHaveCount(
    0,
  )
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    '1250',
  )
  expect(
    await page.evaluate(
      () => (window as Window & { hpaIssueAttempts?: number }).hpaIssueAttempts,
    ),
  ).toBe(2)
  expect(errors).toEqual([])
})
