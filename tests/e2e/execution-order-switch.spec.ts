import { expect, test } from '@playwright/test'
test('switching approved parent orders isolates supplier allocation drafts without RFQ', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    Object.assign(window, {
      __allocations: [],
      __commands: [],
      __TAURI__: {
        core: {
          invoke: async (command: string, args?: unknown) => {
            ;(window as unknown as { __commands: string[] }).__commands.push(
              command,
            )
            if (command === 'list_confirmed_procurement_orders')
              return ['A', 'B'].map((n) => ({
                id: 'parent' + n,
                displayNo: 'PARENT-' + n,
                primaryCurrency: 'XOF',
                procurementMode: 'honsen_self_purchase',
                workflowStatus: 'approved',
                children: [],
                paymentSummary: null,
                lines: [
                  {
                    id: 'line' + n,
                    materialName: '材料' + n,
                    quantity: '1',
                    unit: 'pcs',
                    currency: 'XOF',
                    receivedQuantity: '0',
                    remainingQuantity: '1',
                  },
                ],
              }))
            if (command === 'list_suppliers')
              return [
                {
                  id: 'supplier',
                  name: 'Synthetic supplier',
                  isActive: true,
                  isBlacklisted: false,
                },
              ]
            if (command === 'allocate_supplier_child_orders') {
              ;(
                window as unknown as { __allocations: unknown[] }
              ).__allocations.push(args)
              return []
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
  await page.getByLabel('材料A 子单编号', { exact: true }).fill('A-DRAFT')
  await page.getByRole('button', { name: 'PARENT-B', exact: true }).click()
  await expect(page.getByLabel('材料B 子单编号', { exact: true })).toHaveValue(
    '',
  )
  await page
    .getByRole('combobox', { name: '材料B 供应商', exact: true })
    .click()
  await page.getByText('Synthetic supplier', { exact: true }).click()
  await page.getByLabel('材料B 子单编号', { exact: true }).fill('B-CHILD')
  await page
    .getByRole('button', { name: '创建供应商子单', exact: true })
    .click()
  expect(
    await page.evaluate(
      () => (window as unknown as { __allocations: unknown[] }).__allocations,
    ),
  ).toEqual([
    {
      parentOrderId: 'parentB',
      allocations: [
        {
          parentItemId: 'lineB',
          supplierId: 'supplier',
          currency: 'XOF',
          childDisplayNo: 'B-CHILD',
          lockedExchangeRateDecimal: '1',
        },
      ],
    },
  ])
  expect(
    await page.evaluate(
      () => (window as unknown as { __commands: string[] }).__commands,
    ),
  ).not.toContain('create_rfq')
  expect(errors).toEqual([])
})
