import { openShellPage } from './shell-controls'
import { expect, test } from '@playwright/test'

test('shared desktop theme preserves readable controls and bounded workspace', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  const preview = page.getByRole('button', { name: '打开界面预览' })
  await expect(preview).toHaveCSS('border-radius', '6px')
  await expect(page.locator('body')).toHaveCSS('font-size', '14px')
  await preview.click()
  await expect(page.getByRole('heading', { name: '今日概览' })).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCSS(
    'background-color',
    'rgb(18, 60, 50)',
  )
  await expect(page.locator('.workspace')).toHaveCSS(
    'background-color',
    'rgb(245, 247, 246)',
  )
  await openShellPage(page, 'materials')
  await expect(
    page.getByRole('heading', { name: '材料库总览' }).last(),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
})
