import { openShellPage } from './shell-controls'
import { expect, test } from '@playwright/test'

test('market start exposes local failure then success and blocks duplicate starts', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.addInitScript(() => {
    const payments: {
      id: string
      payeeName: string
      currency: string
      amountMinor: string
      paymentDate: string
      paymentType: string
      status: string
    }[] = []
    let status = 'confirmed'
    let receiptCount = 0
    let startCalls = 0
    const orderId = '00000000-0000-4000-8000-000000000811'
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              orderId?: string
              input?: { orderId: string } & (typeof payments)[number]
            },
          ) {
            if (command === 'list_confirmed_procurement_orders') {
              const paid = payments.reduce(
                (total, payment) => total + BigInt(payment.amountMinor),
                0n,
              )
              return Promise.resolve(
                status === 'completed'
                  ? []
                  : [
                      {
                        countryId: '00000000-0000-4000-8000-000000000101',
                        id: orderId,
                        displayNo: 'HONSEN-MARKET-1',
                        primaryCurrency: 'XOF',
                        procurementMode: 'honsen_self_purchase',
                        workflowStatus: status,
                        children: [],
                        paymentSummary: {
                          currency: 'XOF',
                          payableMinor: '2000',
                          paidMinor: paid.toString(),
                          remainingMinor: (paid < 2000n
                            ? 2000n - paid
                            : 0n
                          ).toString(),
                          overpaidMinor: (paid > 2000n
                            ? paid - 2000n
                            : 0n
                          ).toString(),
                          status:
                            paid === 0n
                              ? 'unpaid'
                              : paid < 2000n
                                ? 'partial'
                                : 'paid',
                          records: [...payments],
                        },
                        lines: [
                          {
                            id: '00000000-0000-4000-8000-000000000812',
                            materialName: 'market cement',
                            quantity: '2',
                            unit: '袋',
                            currency: 'XOF',
                            receivedQuantity:
                              receiptCount === 0
                                ? '0'
                                : receiptCount === 1
                                  ? '1'
                                  : '2',
                            remainingQuantity:
                              receiptCount === 0
                                ? '2'
                                : receiptCount === 1
                                  ? '1'
                                  : '0',
                          },
                        ],
                      },
                    ],
              )
            }
            if (
              command === 'list_attachments' ||
              command === 'list_attachment_targets'
            )
              return Promise.resolve([])
            if (command === 'list_suppliers') return Promise.resolve([])
            if (command === 'list_rfqs') return Promise.resolve([])
            if (command === 'start_honsen_market_execution') {
              startCalls += 1
              Object.assign(window, { __startCalls: startCalls })
              if (startCalls === 1)
                return Promise.reject(new Error('synthetic failure'))
              if (args?.orderId !== orderId)
                return Promise.reject(new Error('wrong order'))
              return new Promise<void>((resolve) =>
                setTimeout(() => {
                  status = 'executing'
                  resolve()
                }, 500),
              )
            }
            if (command === 'record_receipt') {
              if (args?.input?.orderId !== orderId)
                return Promise.reject(new Error('wrong order'))
              receiptCount += 1
              status = receiptCount === 1 ? 'receiving' : 'completed'
              return Promise.resolve({
                id: crypto.randomUUID(),
                orderId,
                workflowStatus: status,
                receivedItemCount: 1,
              })
            }
            if (command === 'record_procurement_expenditure') {
              if (args?.input?.orderId !== orderId)
                return Promise.reject(new Error('wrong order'))
              Object.assign(window, { __paymentAmount: args.input.amountMinor })
              payments.push({ ...args.input, status: 'recorded' })
              return Promise.resolve()
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await openShellPage(page, 'execution')
  await expect(page.getByRole('button', { name: '开始市场直采' })).toBeVisible()
  await page.getByRole('button', { name: '开始市场直采' }).click()
  const detail = page.getByRole('region', { name: '采购执行详情' })
  await expect(detail.getByRole('alert')).toContainText('无法开始市场直采')
  await expect(detail.locator('.ant-alert-error')).toBeVisible()
  await page.getByRole('button', { name: '开始市场直采' }).click()
  await expect(
    page.getByRole('button', { name: '开始市场直采' }),
  ).toBeDisabled()
  await expect(
    detail.getByRole('status').filter({ hasText: '市场直采已开始' }),
  ).toContainText('市场直采已开始')
  await expect(detail.locator('.ant-alert-success')).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, '__startCalls'))).toBe(2)
  await expect(page.getByLabel('收货状态')).toHaveText('采购执行中')
  await expect(
    page.getByRole('button', { name: '创建询价单', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '创建供应商子单', exact: true }),
  ).toHaveCount(0)
  await page.getByLabel('收款方', { exact: true }).fill('fixture cash seller')
  await page
    .getByLabel('实际付款金额（最小单位）', { exact: true })
    .fill('1200')
  await page.getByRole('button', { name: '登记实际付款', exact: true }).click()
  await expect(page.getByText('实际付款已登记，等待同步确认。')).toBeVisible()
  await expect(
    page.evaluate(
      () => (window as Window & { __paymentAmount?: string }).__paymentAmount,
    ),
  ).resolves.toBe('1200')
  await expect(page.getByText('缺少付款凭证', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'fixture cash seller' }),
  ).toContainText('1200 XOF')
  await expect(page.getByText(/累计实付 1200/)).toBeVisible()
  await page.getByLabel('market cement 实收数量').fill('1')
  await page.getByRole('button', { name: '登记收货' }).click()
  await expect(page.getByLabel('收货状态')).toHaveText('收货中')
  await expect(page.getByText('累计实收 1 袋 · 待收 1 袋')).toBeVisible()
  await page.getByLabel('market cement 实收数量').fill('1')
  await page.getByRole('button', { name: '登记收货' }).click()
  await expect(page.getByText('没有可执行的已确认采购申请')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('receipt validation errors and successful registration use distinct feedback', async ({
  page,
}) => {
  await page.goto('/?test=receipt')
  await page.getByRole('button', { name: '登记收货', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('至少填写一条实收数量。')
  await expect(page.locator('.ant-alert-error')).toBeVisible()
  await page.getByLabel('fixture pipe 实收数量').fill('1')
  await page.getByRole('button', { name: '登记收货', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('收货已登记，共 1 条明细。')
  await expect(page.locator('.ant-alert-success')).toBeVisible()
})
