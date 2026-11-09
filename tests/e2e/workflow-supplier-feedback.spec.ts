import { expect, test, type Page } from '@playwright/test'
import {
  workflowText,
  type WorkflowMessage,
} from '../../apps/desktop/src/lib/workflow-messages'
import {
  supplierText,
  type SupplierMessage,
} from '../../apps/desktop/src/lib/supplier-workflow-messages'

async function install(page: Page, locale: string, target: string) {
  await page.addInitScript(
    ({ locale, target }) => {
      localStorage.setItem('honsen.procure.ui-locale', locale)
      let calls = 0
      Object.assign(window, {
        __TAURI__: {
          core: {
            invoke: async (command: string, args?: Record<string, unknown>) => {
              if (
                command === 'list_order_comments' ||
                command === 'list_order_audits'
              )
                return []
              if (command === 'get_approval_policy')
                return { allowSelfApproval: false }
              if (command === target) {
                calls++
                Object.assign(window, {
                  __workflowCalls: calls,
                  __workflowPayload: args,
                })
                if (calls === 1) throw Error('synthetic rejection')
                await new Promise<void>((resolve) =>
                  Object.assign(window, { __finishWorkflow: resolve }),
                )
              }
              if (command === 'add_order_comment')
                return {
                  id: 'comment',
                  orderId: args?.orderId,
                  authorId: 'synthetic',
                  body: args?.body,
                  createdAt: 1,
                  notificationCount: 0,
                }
              if (command === 'save_supplier_child_terms')
                return {
                  subtotalMinor: '100',
                  lineDiscountMinor: '0',
                  orderDiscountMinor: '0',
                  freightMinor: '0',
                  taxMinor: '0',
                  totalMinor: '100',
                }
              if (command === 'allocate_supplier_child_orders')
                return [
                  {
                    childOrderId: 'synthetic-child',
                    supplierId: 'synthetic-supplier',
                    currency: 'XOF',
                    sourceTotalMinor: '100',
                    primaryTotalMinor: '100',
                    lockedExchangeRateDecimal: '1',
                  },
                ]
              if (command === 'send_supplier_order')
                return { documentType: 'SPO', formalDocumentNo: 'TEST-SPO' }
              return undefined
            },
          },
        },
      })
    },
    { locale, target },
  )
}
async function finish(page: Page) {
  await page.evaluate(() => {
    const done = Reflect.get(window, '__finishWorkflow')
    if (typeof done === 'function') done()
  })
}

for (const locale of ['zh', 'en', 'fr'] as const) {
  for (const [command, buttonKey, inputKey] of [
    ['confirm_requisition', '确认订单', ''],
    ['reject_requisition', '驳回订单', '驳回原因'],
    ['add_order_comment', '发送评论', '留言（支持 @某人）'],
  ]) {
    test(`workflow ${command} rejects then retries with guarded payload in ${locale}`, async ({
      page,
    }) => {
      const t = (key: string) => workflowText(locale, key as WorkflowMessage)
      await install(page, locale, command)
      await page.goto('/?test=workflow')
      if (inputKey)
        await page
          .getByLabel(t(inputKey), { exact: true })
          .fill('Synthetic reason or comment')
      if (command === 'reject_requisition')
        await expect(
          page.locator('label').filter({ hasText: t('驳回原因') }),
        ).toBeVisible()
      const action = page.locator('button').filter({ hasText: t(buttonKey) })
      await action.click()
      await expect(page.locator('.ant-alert-error')).toBeVisible()
      if (inputKey)
        await expect(page.getByLabel(t(inputKey), { exact: true })).toHaveValue(
          'Synthetic reason or comment',
        )
      const firstPayload = await page.evaluate(() =>
        Reflect.get(window, '__workflowPayload'),
      )
      await action.click()
      await expect(action).toBeDisabled()
      await page
        .locator('button')
        .filter({ hasText: t('发送评论') })
        .dispatchEvent('click')
      expect(
        await page.evaluate(() => Reflect.get(window, '__workflowCalls')),
      ).toBe(2)
      expect(
        await page.evaluate(() => Reflect.get(window, '__workflowPayload')),
      ).toEqual(firstPayload)
      await expect(page.locator('.ant-alert-error')).toHaveCount(0)
      await expect(page.locator('.ant-alert-success')).toHaveCount(0)
      await finish(page)
      await expect(page.locator('.ant-alert-success')).toBeVisible()
      if (command === 'add_order_comment')
        await expect(page.getByLabel(t(inputKey), { exact: true })).toHaveValue(
          '',
        )
    })
  }
  test(`supplier allocation locks all inputs and preserves rejection in ${locale}`, async ({
    page,
  }) => {
    const t = (key: string) => supplierText(locale, key as SupplierMessage)
    await install(page, locale, 'allocate_supplier_child_orders')
    await page.goto('/?test=allocation')
    for (const material of ['fixture cable', 'fixture pipe']) {
      await page
        .getByLabel(`${material} ${t('供应商')}`, { exact: true })
        .click()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await page
        .getByLabel(`${material} ${t('子单编号')}`, { exact: true })
        .fill('TEST-SUPPLIER')
    }
    const action = page
      .locator('button')
      .filter({ hasText: t('创建供应商子单') })
    await action.click()
    await expect(page.locator('.ant-alert-error')).toBeVisible()
    const firstPayload = await page.evaluate(() =>
      Reflect.get(window, '__workflowPayload'),
    )
    await action.click()
    await expect(action).toBeDisabled()
    await expect(
      page.getByLabel(`fixture cable ${t('子单编号')}`, { exact: true }),
    ).toBeDisabled()
    await action.dispatchEvent('click')
    expect(
      await page.evaluate(() => Reflect.get(window, '__workflowCalls')),
    ).toBe(2)
    expect(
      await page.evaluate(() => Reflect.get(window, '__workflowPayload')),
    ).toEqual(firstPayload)
    await finish(page)
    await expect(page.locator('.ant-alert-success')).toBeVisible()
  })
  for (const command of ['save_supplier_child_terms', 'send_supplier_order']) {
    test(`supplier terms ${command} retains valid fields and unlocks after retry in ${locale}`, async ({
      page,
    }) => {
      const t = (key: string) => supplierText(locale, key as SupplierMessage)
      await install(page, locale, command)
      await page.goto('/?test=supplier-terms')
      await page.getByLabel(t('子单税率'), { exact: true }).fill('0')
      if (command === 'send_supplier_order') {
        await page
          .locator('button')
          .filter({ hasText: t('保存子单条款') })
          .click()
        await expect(page.locator('.ant-alert-success')).toBeVisible()
      }
      const action = page.locator('button').filter({
        hasText: t(
          command === 'send_supplier_order' ? '发送供应商' : '保存子单条款',
        ),
      })
      await action.click()
      await expect(page.locator('.ant-alert-error')).toBeVisible()
      await expect(page.getByLabel(t('子单税率'), { exact: true })).toHaveValue(
        '0',
      )
      const firstPayload = await page.evaluate(() =>
        Reflect.get(window, '__workflowPayload'),
      )
      await action.click()
      await expect(action).toBeDisabled()
      await expect(
        page.getByLabel(t('子单税率'), { exact: true }),
      ).toBeDisabled()
      await action.dispatchEvent('click')
      expect(
        await page.evaluate(() => Reflect.get(window, '__workflowCalls')),
      ).toBe(2)
      expect(
        await page.evaluate(() => Reflect.get(window, '__workflowPayload')),
      ).toEqual(firstPayload)
      await finish(page)
      await expect(page.locator('.ant-alert-success')).toBeVisible()
      if (command === 'send_supplier_order') await expect(action).toBeDisabled()
      else await expect(action).toBeEnabled()
    })
  }
}
