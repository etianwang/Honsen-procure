import { expect, test } from '@playwright/test'

test('SPO send retries without losing saved terms and displays the trusted formal number', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    let attempts = 0
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async (
            command: string,
            args: { input?: { taxRateBasisPoints: number } },
          ) => {
            if (command === 'save_supplier_child_terms') {
              Object.assign(window, {
                __savedSpoTax: args.input?.taxRateBasisPoints,
              })
              return {
                subtotalMinor: '1250',
                lineDiscountMinor: '0',
                orderDiscountMinor: '0',
                freightMinor: '0',
                taxMinor: '63',
                totalMinor: '1313',
              }
            }
            if (command === 'send_supplier_order') {
              attempts += 1
              if (attempts === 1) throw { code: 'database' }
              return {
                documentType: 'SPO',
                formalDocumentNo: 'CI-P1-20261104-SPO-00000001-1',
              }
            }
            throw new Error('Unexpected fixture command: ' + command)
          },
        },
      },
    })
  })
  await page.goto('/?test=supplier-terms')
  await page.getByLabel('子单税率').fill('500')
  await page.getByRole('button', { name: '保存子单条款' }).click()
  await expect(page.getByText('子单条款已保存，含税总额 1313。')).toBeVisible()
  await page.getByRole('button', { name: '发送供应商' }).click()
  await expect(page.getByText(/原条款已保留/)).toBeVisible()
  await expect(page.getByLabel('子单税率')).toHaveValue('500')
  await page.getByRole('button', { name: '发送供应商' }).click()
  await expect(page.getByText(/CI-P1-20261104-SPO-00000001-1/)).toBeVisible()
  expect(errors).toEqual([])
})
