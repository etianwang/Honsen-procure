import { expect, test, type Page } from '@playwright/test'
import { supplierText } from '../../apps/desktop/src/lib/supplier-workflow-messages'
import { rfqMessages } from '../../apps/desktop/src/lib/rfq-messages'

async function mount(
  page: Page,
  locale: string,
  initial: 'draft' | 'sent' | 'load-fail',
) {
  await page.goto('/')
  await page.evaluate(
    async ({ locale, initial }) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { RfqPanel } = await load('/src/components/RfqPanel.tsx')
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
      let status = initial === 'sent' ? 'sent' : 'draft'
      let mutations = 0
      Object.assign(window, {
        __rfqMode: initial === 'load-fail' ? 'initial-deferred' : 'normal',
        __rfqMutations: 0,
      })
      const row = (number = 'TEST-RFQ') => ({
        id: 'synthetic-rfq',
        sourceOrderId: 'source',
        supplierId: 'supplier',
        displayNo: number,
        currency: 'XOF',
        status,
        itemCount: 1,
      })
      const api = {
        listRfqs: async (source: string) => {
          const mode = Reflect.get(window, '__rfqMode')
          if (mode === 'initial-deferred')
            return new Promise((_resolve, reject) =>
              Object.assign(window, {
                __rejectRfqLoad: () => reject(Error('synthetic failure')),
              }),
            )
          if (mode === 'fail') throw Error('synthetic list failure')
          if (mode === 'old')
            return new Promise((resolve) =>
              Object.assign(window, {
                __releaseOldRfq: () => resolve([row('OLD')]),
              }),
            )
          if (mode === 'empty') return []
          return [row(source === 'new-source' ? 'NEW' : 'TEST-RFQ')]
        },
        sendRfq: async (id: string) => {
          mutations++
          Object.assign(window, {
            __rfqMutations: mutations,
            __rfqMutationId: id,
          })
          if (mutations === 1) throw Error('synthetic mutation denial')
          await new Promise<void>((resolve) =>
            Object.assign(window, { __finishRfqMutation: resolve }),
          )
          status = 'sent'
        },
        closeRfq: async (id: string) => {
          mutations++
          Object.assign(window, {
            __rfqMutations: mutations,
            __rfqMutationId: id,
          })
          if (mutations === 1) throw Error('synthetic mutation denial')
          await new Promise<void>((resolve) =>
            Object.assign(window, { __finishRfqMutation: resolve }),
          )
          status = 'closed'
        },
        createRfq: async () => row(),
      }
      const host = document.createElement('div')
      document.body.replaceChildren(host)
      const root = (DOM.createRoot ?? DOM.default.createRoot)(host)
      const render = (sourceOrderId = 'source') =>
        root.render(
          (React.createElement ?? React.default.createElement)(RfqPanel, {
            api,
            sourceOrderId,
            suppliers: [],
            canCreate: false,
          }),
        )
      Object.assign(window, {
        __renderRfq: render,
        __unmountRfq: () => root.unmount(),
      })
      render()
    },
    { locale, initial },
  )
}
async function call(page: Page, key: string, arg?: string) {
  await page.evaluate(
    ({ key, arg }) => {
      const fn = Reflect.get(window, key)
      if (typeof fn === 'function') fn(arg)
    },
    { key, arg },
  )
}
for (const locale of ['zh', 'en', 'fr'] as const) {
  test(`RFQ distinguishes loading, failure and empty and excludes old scope in ${locale}`, async ({
    page,
  }) => {
    const labels = rfqMessages[locale]
    await mount(page, locale, 'load-fail')
    await expect(page.getByText(labels.loading, { exact: true })).toBeVisible()
    await expect(
      page.getByText(labels.empty, { exact: true }),
    ).not.toBeVisible()
    await call(page, '__rejectRfqLoad')
    await expect(
      page.getByText(labels.loadFailed, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(labels.empty, { exact: true }),
    ).not.toBeVisible()
    await page.evaluate(() => Object.assign(window, { __rfqMode: 'normal' }))
    await page.getByRole('button', { name: labels.retry, exact: true }).click()
    await expect(page.getByText(/TEST-RFQ/)).toBeVisible()
    await page.evaluate(() => Object.assign(window, { __rfqMode: 'fail' }))
    await call(page, '__renderRfq', 'failure-source')
    await expect(
      page.getByText(labels.loadFailed, { exact: true }),
    ).toBeVisible()
    await page.evaluate(() => Object.assign(window, { __rfqMode: 'old' }))
    await page.getByRole('button', { name: labels.retry, exact: true }).click()
    await expect(page.getByText(labels.loading, { exact: true })).toBeVisible()
    await page.evaluate(() => Object.assign(window, { __rfqMode: 'normal' }))
    await call(page, '__renderRfq', 'new-source')
    await expect(page.getByText(/NEW ·/)).toBeVisible()
    await call(page, '__releaseOldRfq')
    await expect(page.getByText(/OLD ·/)).not.toBeVisible()
    await page.evaluate(() => Object.assign(window, { __rfqMode: 'empty' }))
    await call(page, '__renderRfq', 'empty-source')
    await expect(page.getByText(labels.empty, { exact: true })).toBeVisible()
  })
  for (const initial of ['draft', 'sent'] as const) {
    test(`RFQ ${initial} transition denial/deferred retry keeps payload and local feedback in ${locale}`, async ({
      page,
    }) => {
      const t = (key: Parameters<typeof supplierText>[1]) =>
        supplierText(locale, key)
      await mount(page, locale, initial)
      const action = page.locator('button').filter({
        hasText: t(initial === 'draft' ? '发送询价单' : '关闭询价单'),
      })
      await action.click()
      await expect(page.getByRole('alert')).toHaveText(
        t('询价单状态更新失败；原状态已保留，请重试。'),
      )
      await expect(page.getByText(/TEST-RFQ/)).toBeVisible()
      await action.click()
      await expect(action).toBeDisabled()
      await expect(
        page.getByText(rfqMessages[locale].saving, { exact: true }),
      ).toBeVisible()
      await action.dispatchEvent('click')
      expect(
        await page.evaluate(() => Reflect.get(window, '__rfqMutations')),
      ).toBe(2)
      expect(
        await page.evaluate(() => Reflect.get(window, '__rfqMutationId')),
      ).toBe('synthetic-rfq')
      await page.evaluate(() => Object.assign(window, { __rfqMode: 'fail' }))
      await call(page, '__finishRfqMutation')
      await expect(page.locator('.ant-alert-warning')).toHaveText(
        t('询价单状态已保存，但列表刷新失败，请重试。'),
      )
      await expect(page.getByText(/TEST-RFQ/)).toBeVisible()
      await page.evaluate(() => Object.assign(window, { __rfqMode: 'normal' }))
      await page
        .getByRole('button', { name: rfqMessages[locale].retry, exact: true })
        .click()
      await expect(
        page.getByText(rfqMessages[locale].loadFailed, { exact: true }),
      ).not.toBeVisible()
      await expect(
        page.getByText(t(initial === 'draft' ? '已发送' : '已关闭'), {
          exact: false,
        }),
      ).toBeVisible()
      expect(
        await page.evaluate(() => Reflect.get(window, '__rfqMutations')),
      ).toBe(2)
    })
  }
}
