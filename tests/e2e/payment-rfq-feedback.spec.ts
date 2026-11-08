import { expect, test } from '@playwright/test'
import { supplierText } from '../../apps/desktop/src/lib/supplier-workflow-messages'
import { paymentMessages } from '../../apps/desktop/src/lib/payment-messages'
import { executionText } from '../../apps/desktop/src/lib/execution-messages'

for (const locale of ['zh', 'en', 'fr'] as const) {
  test(`RFQ creation retains rejected input and exposes pending/success in ${locale}`, async ({
    page,
  }) => {
    const t = (key: Parameters<typeof supplierText>[1]) =>
      supplierText(locale, key)
    await page.addInitScript((locale) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      let calls = 0
      Object.assign(window, {
        __TAURI__: {
          core: {
            invoke: async (
              command: string,
              args?: { input: Record<string, unknown> },
            ) => {
              if (command === 'list_rfqs') return []
              if (command === 'create_rfq') {
                calls++
                Object.assign(window, { __rfqCalls: calls })
                if (calls === 1) throw Error('synthetic denial')
                await new Promise<void>((resolve) =>
                  Object.assign(window, { __finishRfq: resolve }),
                )
                return { ...args?.input, itemCount: 1, status: 'draft' }
              }
              throw Error('unexpected command')
            },
          },
        },
      })
    }, locale)
    await page.goto('/?test=rfq')
    await page.getByLabel(t('RFQ 供应商')).click()
    await page
      .locator('.ant-select-item-option')
      .filter({ hasText: 'fixture RFQ supplier' })
      .click()
    await page.getByLabel(t('询价单编号')).fill('TEST-RFQ')
    const create = page.locator('button').filter({ hasText: t('创建询价单') })
    await create.click()
    await expect(page.getByRole('alert')).toHaveText(
      t('创建失败：请确认内部请购单已确认且该币种有材料。'),
    )
    await expect(page.getByLabel(t('询价单编号'))).toHaveValue('TEST-RFQ')
    await create.click()
    await expect(create).toBeDisabled()
    await expect(page.getByLabel(t('询价单编号'))).toBeDisabled()
    await page.evaluate(() => {
      const finish = Reflect.get(window, '__finishRfq')
      if (typeof finish === 'function') finish()
    })
    await expect(page.locator('.ant-alert-success')).toContainText('TEST-RFQ')
    expect(await page.evaluate(() => Reflect.get(window, '__rfqCalls'))).toBe(2)
  })

  test(`payment labels and modal rejection/retry feedback in ${locale}`, async ({
    page,
  }) => {
    const t =
      paymentMessages[
        locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'fr-FR'
      ]
    await page.addInitScript((locale) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      let calls = 0
      Object.assign(window, {
        __TAURI__: {
          core: {
            invoke: async (command: string) => {
              if (command === 'list_confirmed_procurement_orders')
                return [
                  {
                    id: 'order',
                    displayNo: 'TEST-ORDER',
                    primaryCurrency: 'XOF',
                    procurementMode: 'honsen_self_purchase',
                    workflowStatus: 'executing',
                    children: [],
                    lines: [],
                    paymentSummary: {
                      currency: 'XOF',
                      payableMinor: '100',
                      paidMinor: '100',
                      remainingMinor: '0',
                      overpaidMinor: '0',
                      status: 'paid',
                      records: [
                        {
                          id: 'payment',
                          paymentDate: '2026-01-01',
                          payeeName: 'Synthetic',
                          amountMinor: '100',
                          status: 'recorded',
                          voucherReference: null,
                        },
                      ],
                    },
                  },
                ]
              if (
                [
                  'list_suppliers',
                  'list_attachments',
                  'list_attachment_targets',
                  'list_rfqs',
                ].includes(command)
              )
                return []
              if (command === 'reverse_procurement_expenditure') {
                calls++
                if (calls === 1) throw Error('synthetic denial')
                return
              }
              throw Error('unexpected command: ' + command)
            },
          },
        },
      })
    }, locale)
    await page.goto('/')
    await page
      .getByRole('button', {
        name: /打开界面预览|Open interface preview|Ouvrir/,
      })
      .click()
    await page
      .getByRole('button', {
        name: executionText(locale, '采购执行'),
        exact: true,
      })
      .click()
    await expect(
      page.locator('label').filter({ hasText: t.type }),
    ).toBeVisible()
    await expect(
      page.locator('label').filter({ hasText: t.method }),
    ).toBeVisible()
    await page.getByRole('button', { name: t.reverse, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: t.reverse })
    await dialog.getByLabel(t.reason).fill('Synthetic correction reason')
    await dialog.getByRole('button', { name: t.confirm, exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText(t.error)
    await expect(dialog.getByLabel(t.reason)).toHaveValue(
      'Synthetic correction reason',
    )
    await dialog.getByRole('button', { name: t.confirm, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(t.reversed, { exact: true })).toBeVisible()
  })
}
