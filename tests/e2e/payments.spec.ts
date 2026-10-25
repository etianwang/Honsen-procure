import { test, expect } from '@playwright/test'

test('production payment screen records three payments and reverses once with a reason', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.addInitScript(() => {
    const orderId = '00000000-0000-4000-8000-000000000901'
    const records: {
      id: string
      payeeName: string
      amountMinor: string
      paymentDate: string
      paymentType: string
      status: string
      correctsExpenditureId?: string
    }[] = []
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              input?: (typeof records)[number] & {
                expenditureId?: string
                reason?: string
              }
            },
          ) {
            if (command === 'list_suppliers') return Promise.resolve([])
            if (command === 'list_confirmed_procurement_orders') {
              const paid = records.reduce(
                (s, r) =>
                  s +
                  (r.status === 'reversed' ? -1n : 1n) * BigInt(r.amountMinor),
                0n,
              )
              return Promise.resolve([
                {
                  id: orderId,
                  displayNo: 'SYNTHETIC-PAYMENT',
                  primaryCurrency: 'XOF',
                  procurementMode: 'honsen_self_purchase',
                  workflowStatus: 'executing',
                  lines: [],
                  children: [],
                  paymentSummary: {
                    currency: 'XOF',
                    payableMinor: '1000',
                    paidMinor: String(paid),
                    remainingMinor: String(1000n - paid),
                    overpaidMinor: '0',
                    status: paid === 0n ? 'unpaid' : 'partial',
                    records: [...records],
                  },
                },
              ])
            }
            if (command === 'record_procurement_expenditure' && args?.input) {
              records.push({ ...args.input, status: 'recorded' })
              return Promise.resolve()
            }
            if (command === 'reverse_procurement_expenditure' && args?.input) {
              const original = records.find(
                (r) => r.id === args.input?.expenditureId,
              )
              if (
                !original ||
                !args.input.reason?.trim() ||
                records.some((r) => r.correctsExpenditureId === original.id)
              )
                return Promise.reject(new Error('Invalid reversal'))
              records.push({
                ...original,
                id: args.input.id,
                status: 'reversed',
                correctsExpenditureId: original.id,
              })
              return Promise.resolve()
            }
            return Promise.reject(new Error('Unexpected command ' + command))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '采购执行', exact: true }).click()
  for (const amount of ['100', '200', '300']) {
    await page.getByLabel('收款方', { exact: true }).fill('Synthetic payee')
    await page
      .getByLabel('实际付款金额（最小单位）', { exact: true })
      .fill(amount)
    await page
      .getByRole('button', { name: '登记实际付款', exact: true })
      .click()
    await expect(
      page.getByLabel('实际付款金额（最小单位）', { exact: true }),
    ).toHaveValue('')
  }
  await expect(page.getByText(/累计实付 600/)).toBeVisible()
  await page
    .getByRole('button', { name: '冲销付款', exact: true })
    .first()
    .click()
  await page
    .getByLabel('冲销原因', { exact: true })
    .fill('Synthetic duplicate payment')
  await page.getByRole('button', { name: '确认冲销', exact: true }).click()
  await expect(page.getByText(/累计实付 500/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: '冲销付款', exact: true }),
  ).toHaveCount(2)
  expect(errors).toEqual([])
})
