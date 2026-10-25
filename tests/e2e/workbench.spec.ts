import { expect, test } from '@playwright/test'

test('workbench replaces demo orders with authorized saved data and clears stale totals on failure', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      errors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, { __workbenchFail: false })
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'list_requisition_history') {
              if (
                (window as Window & { __workbenchFail?: boolean })
                  .__workbenchFail
              )
                throw new Error('unavailable')
              return {
                records: [
                  {
                    id: 'saved',
                    displayNo: 'SAVED-ORDER',
                    projectName: '授权项目',
                    site: '仓库',
                    workflowStatus: 'confirmed',
                    procurementMode: 'honsen_self_purchase',
                    primaryCurrency: 'XOF',
                    totalMinor: '1250',
                    updatedAt: 1,
                  },
                ],
                nextCursor: null,
              }
            }
            throw new Error(command)
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await expect(page.getByText('SAVED-ORDER', { exact: true })).toBeVisible()
  await expect(
    page.getByLabel('采购统计').getByText('1', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('PR-CI-ABJ-20261010-001')).toHaveCount(0)
  await page.evaluate(() => Object.assign(window, { __workbenchFail: true }))
  await page.getByRole('button', { name: '刷新待办' }).click()
  await expect(page.getByRole('alert')).toContainText('无法读取已保存订单')
  await expect(page.getByText('SAVED-ORDER', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('采购统计')).toHaveCount(0)
  expect(errors).toEqual([])
})
