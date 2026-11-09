import { expect, test } from '@playwright/test'
import { receiptText } from '../../apps/desktop/src/lib/receipt-messages'
import { paymentMessages } from '../../apps/desktop/src/lib/payment-messages'

for (const locale of ['zh', 'en', 'fr'] as const) {
  for (const action of ['receipt', 'close', 'payment', 'reverse']) {
    test(`${action} deferred retry locks inputs without dropping drafts in ${locale}`, async ({
      page,
    }) => {
      await page.goto('/')
      await page.evaluate(
        async ({ locale, action }) => {
          const load = (path: string) => import(/* @vite-ignore */ path)
          const React = await load('/node_modules/.vite/deps/react.js')
          const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
          const { setUiLocale } = await load('/src/lib/ui-locale.ts')
          setUiLocale(locale)
          let calls = 0
          const request = async (payload: unknown) => {
            calls++
            Object.assign(window, {
              __pendingCalls: calls,
              __pendingPayload: payload,
            })
            if (calls === 1) throw Error('synthetic rejection')
            await new Promise<void>((resolve) =>
              Object.assign(window, { __finishPending: resolve }),
            )
          }
          let Component
          let props
          if (action === 'receipt' || action === 'close') {
            Component = (await load('/src/components/ReceiptPanel.tsx'))
              .ReceiptPanel
            props = {
              orderId: 'synthetic-order',
              receiverId: 'synthetic-receiver',
              initialStatus: 'executing',
              lines: [
                {
                  id: 'line',
                  materialName: 'Synthetic material',
                  unit: 'PCS',
                  orderedQuantity: '2',
                  receivedQuantity: '0',
                  remainingQuantity: '2',
                },
              ],
              api: {
                recordReceipt: async (input: unknown) => {
                  await request(input)
                  return { workflowStatus: 'receiving', receivedItemCount: 1 }
                },
                closeSupplierOrderWithConditions: async (
                  id: string,
                  reason: string,
                ) => {
                  await request({ id, reason })
                },
              },
            }
          } else {
            Component = (
              await load('/src/components/ProcurementExpenditurePanel.tsx')
            ).ProcurementExpenditurePanel
            props = {
              orderId: 'synthetic-order',
              currency: 'XOF',
              locale:
                locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'fr-FR',
              summary: {
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
              api: { record: request, reverse: request },
            }
          }
          const host = document.createElement('div')
          document.body.replaceChildren(host)
          const createRoot = DOM.createRoot ?? DOM.default.createRoot
          const createElement =
            React.createElement ?? React.default.createElement
          createRoot(host).render(createElement(Component, props))
        },
        { locale, action },
      )
      const payment =
        paymentMessages[
          locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'fr-FR'
        ]
      const r = (key: Parameters<typeof receiptText>[1]) =>
        receiptText(locale, key)
      const receipt = action === 'receipt' || action === 'close'
      if (action === 'receipt')
        await page.getByLabel(`Synthetic material ${r('实收数量')}`).fill('1')
      if (action === 'close')
        await page
          .getByLabel(r('有条件完成原因'))
          .fill('Synthetic close reason')
      if (action === 'payment') {
        await page.getByLabel(payment.payee).fill('Synthetic payee')
        await page.getByLabel(payment.amount).fill('100')
      }
      if (action === 'reverse') {
        await page
          .getByRole('button', { name: payment.reverse, exact: true })
          .click()
        await page.getByLabel(payment.reason).fill('Synthetic reversal reason')
      }
      const scope =
        action === 'reverse'
          ? page.getByRole('dialog', { name: payment.reverse })
          : page.locator('body')
      const title =
        action === 'receipt'
          ? r('登记收货')
          : action === 'close'
            ? r('按有条件完成关闭')
            : action === 'payment'
              ? payment.record
              : payment.confirm
      const button = scope.locator('button').filter({ hasText: title })
      await button.click()
      await expect(scope.locator('.ant-alert-error')).toBeVisible()
      const firstPayload = await page.evaluate(() =>
        Reflect.get(window, '__pendingPayload'),
      )
      await button.click()
      await expect(button).toBeDisabled()
      await expect(scope.locator('.ant-alert-error')).toHaveCount(0)
      await expect(scope.locator('.ant-alert-success')).toHaveCount(0)
      await expect(
        scope.getByRole('status').filter({
          hasText:
            locale === 'zh'
              ? '正在保存，请稍候…'
              : locale === 'fr'
                ? 'Enregistrement en cours…'
                : 'Saving, please wait…',
        }),
      ).toBeVisible()
      for (const input of await scope.locator('input, textarea').all())
        await expect(input).toBeDisabled()
      for (const select of await scope.getByRole('combobox').all())
        await expect(select).toBeDisabled()
      await button.dispatchEvent('click')
      expect(
        await page.evaluate(() => Reflect.get(window, '__pendingCalls')),
      ).toBe(2)
      const payload = await page.evaluate(() =>
        Reflect.get(window, '__pendingPayload'),
      )
      if (action === 'close') expect(payload).toEqual(firstPayload)
      else {
        const { id: _firstId, ...firstRest } = firstPayload
        const { id: _secondId, ...secondRest } = payload
        expect(secondRest).toEqual(firstRest)
      }
      await page.evaluate(() => {
        const done = Reflect.get(window, '__finishPending')
        if (typeof done === 'function') done()
      })
      if (action === 'reverse') await expect(scope).not.toBeVisible()
      await expect(page.locator('.ant-alert-success')).toBeVisible()
      if (action === 'payment')
        await expect(page.getByLabel(payment.amount)).toHaveValue('')
      if (action === 'receipt')
        await expect(
          page.getByLabel(`Synthetic material ${r('实收数量')}`),
        ).toHaveValue('')
      if (!receipt && action === 'payment')
        await expect(page.getByLabel(payment.payee)).toHaveValue(
          'Synthetic payee',
        )
    })
  }
}
