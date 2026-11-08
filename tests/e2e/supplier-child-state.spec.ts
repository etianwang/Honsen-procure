import { expect, test } from '@playwright/test'
import { supplierText } from '../../apps/desktop/src/lib/supplier-workflow-messages'
import { receiptText } from '../../apps/desktop/src/lib/receipt-messages'
import { executionText } from '../../apps/desktop/src/lib/execution-messages'
import { historyText } from '../../apps/desktop/src/lib/history-locale'

for (const locale of ['zh', 'en', 'fr'] as const) {
  test(`SPO issuance requires resaving every changed term in ${locale}`, async ({
    page,
  }) => {
    const t = (key: Parameters<typeof supplierText>[1]) =>
      supplierText(locale, key)
    await page.addInitScript((locale) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      const savedTerms: unknown[] = []
      const sent: unknown[] = []
      Object.assign(window, {
        __savedTerms: savedTerms,
        __sentChild: sent,
        __TAURI__: {
          core: {
            invoke: async (command: string, args: unknown) => {
              if (command === 'save_supplier_child_terms') {
                savedTerms.push(args)
                return { totalMinor: '100' }
              }
              if (command === 'send_supplier_order') {
                sent.push(args)
                return { documentType: 'SPO', formalDocumentNo: 'TEST-SPO' }
              }
              throw Error(`Unexpected command: ${command}`)
            },
          },
        },
      })
    }, locale)
    await page.goto('/?test=supplier-terms')
    const send = page.getByRole('button', {
      name: t('发送供应商'),
      exact: true,
    })
    const save = page.getByRole('button', {
      name: t('保存子单条款'),
      exact: true,
    })
    await expect(send).toBeDisabled()
    for (const label of [
      t('子单税率'),
      t('印花税（手填，单据币种最小单位）'),
      t('子单单据折扣'),
      t('子单单据运费'),
      `fixture cable ${t('行折扣')}`,
      `fixture cable ${t('行运费')}`,
    ]) {
      await save.click()
      await expect(send).toBeEnabled()
      await page.getByLabel(label, { exact: true }).fill('1')
      await expect(send).toBeDisabled()
      await expect(
        page.getByText(t('请先保存税、折扣和运费条款。'), { exact: true }),
      ).toBeVisible()
    }
    await save.click()
    await expect(send).toBeEnabled()
    await page
      .getByRole('checkbox', { name: t('单价已含运费'), exact: true })
      .check()
    await expect(send).toBeDisabled()
    await send.dispatchEvent('click')
    expect(
      await page.evaluate(() => Reflect.get(window, '__sentChild')),
    ).toEqual([])
    await save.click()
    await expect(send).toBeEnabled()
    const persisted = await page.evaluate(() =>
      Reflect.get(window, '__savedTerms').at(-1),
    )
    expect(persisted).toMatchObject({
      input: {
        taxRateBasisPoints: 1,
        manualStampDutyMinor: '1',
        orderDiscount: { kind: 'fixed_minor', minor: '1' },
        orderFreight: { kind: 'fixed_minor', minor: '1' },
        lines: [
          {
            lineDiscount: { kind: 'fixed_minor', minor: '1' },
            lineFreight: { kind: 'fixed_minor', minor: '1' },
            freightIncluded: true,
          },
        ],
      },
    })
    await send.click()
    await expect(page.getByText(/TEST-SPO/)).toBeVisible()
    await expect(send).toBeDisabled()
    await expect(page.getByLabel(t('子单税率'), { exact: true })).toHaveValue(
      '',
    )
    await expect(
      page.getByRole('button', {
        name: historyText(locale, '正式单据预览 / Aperçu'),
        exact: true,
      }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => Reflect.get(window, '__sentChild')),
    ).toEqual([{ orderId: '00000000-0000-4000-8000-000000000451' }])
  })

  test(`execution child order status accurately gates terms and receipts in ${locale}`, async ({
    page,
  }) => {
    const t = (key: Parameters<typeof supplierText>[1]) =>
      supplierText(locale, key)
    const r = (key: Parameters<typeof receiptText>[1]) =>
      receiptText(locale, key)
    await page.addInitScript((locale) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      let draftStatus = 'draft'
      const paymentSummary = {
        currency: 'XOF',
        payableMinor: '0',
        paidMinor: '0',
        remainingMinor: '0',
        overpaidMinor: '0',
        status: 'unpaid',
        records: [],
      }
      const lines = [
        {
          id: 'line',
          materialName: 'Synthetic line',
          quantity: '2',
          receivedQuantity: '0',
          remainingQuantity: '2',
          unit: 'PCS',
          currency: 'XOF',
        },
      ]
      Object.assign(window, {
        __TAURI__: {
          core: {
            invoke: async (command: string) => {
              if (command === 'list_confirmed_procurement_orders')
                return [
                  {
                    id: 'parent',
                    displayNo: 'TEST-PARENT',
                    primaryCurrency: 'XOF',
                    procurementMode: 'honsen_self_purchase',
                    workflowStatus: 'approved',
                    lines,
                    paymentSummary,
                    countryId: '00000000-0000-4000-8000-000000000101',
                    children: [draftStatus, 'sent', 'completed', undefined].map(
                      (status, index) => ({
                        id: `child-${index}`,
                        displayNo: `TEST-CHILD-${index}`,
                        workflowStatus: status,
                        currency: 'XOF',
                        lines,
                        paymentSummary,
                      }),
                    ),
                  },
                ]
              if (command === 'save_supplier_child_terms')
                return { totalMinor: '100' }
              if (command === 'send_supplier_order') {
                draftStatus = 'sent'
                return { documentType: 'SPO', formalDocumentNo: 'TEST-ISSUED' }
              }
              if (command.startsWith('list_')) return []
              throw Error(`Unexpected command: ${command}`)
            },
          },
        },
      })
    }, locale)
    await page.goto('/')
    await page
      .getByRole('button', {
        name: /打开界面预览|Open interface preview|Ouvrir l’aperçu/,
      })
      .click()
    await page
      .getByRole('button', {
        name: executionText(locale, '采购执行'),
        exact: true,
      })
      .click()
    const child = (index: number) =>
      page.getByRole('region', {
        name: `${executionText(locale, '供应商子订单')} TEST-CHILD-${index}`,
        exact: true,
      })
    for (const index of [0, 1, 2, 3]) {
      const card = child(index)
      const tax = card.getByLabel(t('子单税率'), { exact: true })
      const save = card.getByRole('button', {
        name: t('保存子单条款'),
        exact: true,
      })
      const record = card.getByRole('button', {
        name: r('登记收货'),
        exact: true,
      })
      const close = card.getByRole('button', {
        name: r('按有条件完成关闭'),
        exact: true,
      })
      if (index === 0) {
        await expect(tax).toBeEnabled()
        await expect(save).toBeEnabled()
      } else {
        await expect(tax).toBeDisabled()
        await expect(tax).toHaveValue('')
        await expect(save).toBeDisabled()
      }
      if (index === 1) {
        await expect(record).toBeEnabled()
        await expect(close).toBeEnabled()
      } else {
        await expect(record).toBeDisabled()
        await expect(close).toBeDisabled()
        await expect(
          card.getByText(r('当前订单状态不允许登记收货或有条件完成。'), {
            exact: true,
          }),
        ).toBeVisible()
      }
      await expect(card.getByLabel(r('收货状态'))).toHaveText(
        r((['草稿', '已发送供应商', '已完成', '未知收货状态'] as const)[index]),
      )
      await expect(
        card.getByRole('button', {
          name: historyText(locale, '正式单据预览 / Aperçu'),
          exact: true,
        }),
      ).toBeVisible()
    }
    await child(0)
      .getByRole('button', { name: t('保存子单条款'), exact: true })
      .click()
    await child(0)
      .getByRole('button', { name: t('发送供应商'), exact: true })
      .click()
    await expect(child(0).getByLabel(r('收货状态'))).toHaveText(
      r('已发送供应商'),
    )
    await expect(
      child(0).getByRole('button', { name: r('登记收货'), exact: true }),
    ).toBeEnabled()
    await expect(
      child(0).getByRole('button', { name: t('保存子单条款'), exact: true }),
    ).toBeDisabled()
  })
}
