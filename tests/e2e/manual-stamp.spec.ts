import { expect, test } from '@playwright/test'
test('manual stamp duty is explicit, validated and sent with supplier terms', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async (
            command: string,
            args: {
              input?: {
                manualStampDutyMinor?: string
                taxRateBasisPoints?: number
              }
            },
          ) => {
            if (command === 'save_supplier_child_terms') {
              Object.assign(window, { __stampInput: args.input })
              return {
                subtotalMinor: '1250',
                lineDiscountMinor: '0',
                orderDiscountMinor: '0',
                freightMinor: '0',
                taxMinor: '241',
                totalMinor: '1528',
              }
            }
            throw Error(command)
          },
        },
      },
    })
  })
  await page.goto('/?test=supplier-terms', { waitUntil: 'domcontentloaded' })
  const stamp = page.getByLabel('印花税（手填，单据币种最小单位）')
  await expect(stamp).toHaveValue('0')
  await stamp.fill('-1')
  await page.getByRole('button', { name: '保存子单条款' }).click()
  expect(await page.evaluate(() => '__stampInput' in window)).toBe(false)
  await stamp.fill('37')
  await page.getByLabel('子单税率').fill('1925')
  await page.getByRole('button', { name: '保存子单条款' }).click()
  await expect(page.getByText('子单条款已保存，含税总额 1528。')).toBeVisible()
  expect(
    await page.evaluate(
      () => (window as Window & { __stampInput?: unknown }).__stampInput,
    ),
  ).toMatchObject({ manualStampDutyMinor: '37', taxRateBasisPoints: 1925 })
  expect(errors).toEqual([])
})

test('manual stamp edits appear in the visible order audit', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            if (command === 'list_order_comments') return []
            if (command === 'get_approval_policy')
              return { allowSelfApproval: false }
            if (command === 'list_order_audits')
              return [
                {
                  id: 'stamp-audit',
                  orderId: '00000000-0000-4000-8000-000000000301',
                  actorId: 'actor',
                  action: 'confirmed_revised',
                  reason: null,
                  previousJson: JSON.stringify({ manualStampDutyMinor: '0' }),
                  nextJson: JSON.stringify({ manualStampDutyMinor: '375' }),
                  createdAt: 1,
                },
              ]
            throw Error(command)
          },
        },
      },
    })
  })
  await page.goto('/?test=workflow', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('印花税（手填）', { exact: false })).toBeVisible()
  await expect(page.getByText('375', { exact: false })).toBeVisible()
  expect(errors).toEqual([])
})
