import { test, expect } from '@playwright/test'

test('execution locale updates existing payment and attachment catalogs without losing input', async ({
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
  await page
    .getByLabel('收款方', { exact: true })
    .fill('Synthetic retained payee')
  const language = page.getByLabel('界面语言 / UI language / Langue')
  await language.selectOption('en')
  await expect(
    page
      .getByRole('heading', { name: 'Purchasing execution', exact: true })
      .last(),
  ).toBeVisible()
  await expect(
    page.getByText('Primary currency', { exact: false }),
  ).toBeVisible()
  await expect(page.getByLabel('Payee', { exact: true })).toHaveValue(
    'Synthetic retained payee',
  )
  await expect(
    page.getByText('Attachments and vouchers', { exact: true }),
  ).toBeVisible()
  await language.selectOption('fr')
  await expect(
    page
      .getByRole('heading', { name: 'Exécution des achats', exact: true })
      .last(),
  ).toBeVisible()
  await expect(
    page.getByText('Pièces jointes et justificatifs', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Enregistrer le paiement', exact: true }),
  ).toBeVisible()
  await language.selectOption('zh')
  await expect(page.getByLabel('收款方', { exact: true })).toHaveValue(
    'Synthetic retained payee',
  )
  expect(errors).toEqual([])
})
