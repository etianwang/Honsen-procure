import { expect, test } from '@playwright/test'
test('receipt submission is single flight and clears quantities only after acknowledgement', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __receiptCalls: [],
      __finishReceipt: null,
      __TAURI__: {
        core: {
          invoke: async (command: string, args?: unknown) => {
            if (command === 'list_suppliers') return []
            if (command === 'list_confirmed_procurement_orders')
              return [
                {
                  id: 'parent',
                  displayNo: 'SYNTHETIC-RECEIPT',
                  primaryCurrency: 'XOF',
                  procurementMode: 'honsen_self_purchase',
                  workflowStatus: 'executing',
                  children: [],
                  paymentSummary: null,
                  lines: [
                    {
                      id: 'line',
                      materialName: '合成材料',
                      quantity: '10',
                      unit: 'pcs',
                      currency: 'XOF',
                      receivedQuantity: '0',
                      remainingQuantity: '10',
                    },
                  ],
                },
              ]
            if (command === 'record_receipt') {
              ;(
                window as unknown as { __receiptCalls: unknown[] }
              ).__receiptCalls.push(args)
              return new Promise((resolve, reject) => {
                Object.assign(window, {
                  __finishReceipt: (ok: boolean) =>
                    ok
                      ? resolve({
                          workflowStatus: 'receiving',
                          receivedItemCount: 1,
                        })
                      : reject({ code: 'sync_transport_error' }),
                })
              })
            }
            return []
          },
        },
      },
    })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '打开界面预览', exact: true }).click()
  await page.getByRole('button', { name: '采购执行', exact: true }).click()
  const quantity = page.getByLabel('合成材料 实收数量', { exact: true }),
    submit = page.getByRole('button', { name: '登记收货', exact: true })
  await quantity.fill('1')
  await submit.evaluate((el) => {
    ;(el as HTMLButtonElement).click()
    ;(el as HTMLButtonElement).click()
  })
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __receiptCalls: unknown[] }).__receiptCalls
          .length,
    ),
  ).toBe(1)
  await expect(submit).toBeDisabled()
  await page.evaluate(() =>
    (
      window as unknown as { __finishReceipt: (ok: boolean) => void }
    ).__finishReceipt(false),
  )
  await expect(submit).toBeEnabled()
  await expect(quantity).toHaveValue('1')
  await submit.click()
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __receiptCalls: unknown[] }).__receiptCalls
          .length,
    ),
  ).toBe(2)
  await page.evaluate(() =>
    (
      window as unknown as { __finishReceipt: (ok: boolean) => void }
    ).__finishReceipt(true),
  )
  await expect(quantity).toHaveValue('')
})

test('supplier child refresh shows actual closed status and blocks further receipt actions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let status = 'sent'
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'list_suppliers') return []
            if (command === 'list_confirmed_procurement_orders')
              return [
                {
                  id: 'parent',
                  displayNo: 'SYNTHETIC-PARENT',
                  primaryCurrency: 'XOF',
                  procurementMode: 'honsen_self_purchase',
                  workflowStatus: 'executing',
                  paymentSummary: null,
                  lines: [],
                  children: [
                    {
                      id: 'child',
                      displayNo: 'SYNTHETIC-SPO',
                      currency: 'XOF',
                      workflowStatus: status,
                      paymentSummary: null,
                      lines: [
                        {
                          id: 'line',
                          materialName: '合成子单材料',
                          quantity: '10',
                          unit: 'pcs',
                          currency: 'XOF',
                          receivedQuantity: '1',
                          remainingQuantity: '9',
                        },
                      ],
                    },
                  ],
                },
              ]
            if (command === 'close_supplier_order_with_conditions') {
              status = 'completed_with_conditions'
              return undefined
            }
            return []
          },
        },
      },
    })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '打开界面预览', exact: true }).click()
  await page.getByRole('button', { name: '采购执行', exact: true }).click()
  const child = page.getByRole('region', {
    name: '供应商子订单 SYNTHETIC-SPO',
    exact: true,
  })
  await expect(page.getByLabel('收货状态', { exact: true })).toHaveCount(1)
  await expect(child.getByLabel('收货状态', { exact: true })).toHaveText(
    '已发送供应商',
  )
  await page
    .getByLabel('有条件完成原因', { exact: true })
    .fill('Synthetic accepted shortage')
  await page
    .getByRole('button', { name: '按有条件完成关闭', exact: true })
    .click()
  await expect(child.getByLabel('收货状态', { exact: true })).toHaveText(
    '已完成（有条件）',
  )
  await expect(
    child.getByRole('button', { name: '登记收货', exact: true }),
  ).toBeDisabled()
  await expect(
    child.getByRole('button', { name: '按有条件完成关闭', exact: true }),
  ).toBeDisabled()
  await expect(
    child.getByLabel('合成子单材料 实收数量', { exact: true }),
  ).toBeDisabled()
})
