import { expect, test } from '@playwright/test'

test('quote allocation rejection explains supplier binding and preserves the allocation form', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      errors.push(message.text())
  })
  await page.addInitScript(() =>
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async () => {
            throw { code: 'invalid_input' }
          },
        },
      },
    }),
  )
  await page.goto('/?test=allocation')
  for (const material of ['fixture cable', 'fixture pipe']) {
    await page.getByLabel(`${material} 供应商`).click()
    await page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      .last()
      .getByText('fixture supplier A', { exact: true })
      .click()
    await page.getByLabel(`${material} 子单编号`).fill('SAVED-DRAFT-NUMBER')
  }
  await page.getByRole('button', { name: '创建供应商子单' }).click()
  await expect(page.getByRole('alert')).toContainText(
    '目录报价只能分配给对应供应商',
  )
  await expect(page.getByLabel('fixture cable 子单编号')).toHaveValue(
    'SAVED-DRAFT-NUMBER',
  )
  await expect(page.getByText('已创建', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
