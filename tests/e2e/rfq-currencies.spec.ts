import { expect, test } from '@playwright/test'

for (const currency of ['XAF', 'ETB']) {
  test(`optional RFQ supports ${currency} without losing supplier or number`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.evaluate(async () => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { RfqPanel } = await load('/src/components/RfqPanel.tsx')
      const { tauriRfqApi } = await load('/src/lib/rfq-api.ts')
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale('zh')
      Object.assign(window, {
        __rfqInputs: [],
        __TAURI__: {
          core: {
            invoke: async (command: string, args: { input?: object }) => {
              if (command === 'list_rfqs') return []
              if (command === 'create_rfq') {
                ;(
                  window as unknown as { __rfqInputs: object[] }
                ).__rfqInputs.push(args.input!)
                return { ...args.input, status: 'draft', itemCount: 1 }
              }
              throw Error(command)
            },
          },
        },
      })
      const root = document.createElement('div')
      document.body.replaceChildren(root)
      ;(DOM.createRoot ?? DOM.default.createRoot)(root).render(
        (React.createElement ?? React.default.createElement)(RfqPanel, {
          api: tauriRfqApi,
          sourceOrderId: '00000000-0000-4000-8000-000000000001',
          suppliers: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Synthetic supplier',
            },
          ],
        }),
      )
    })
    await page.getByRole('combobox', { name: 'RFQ 供应商' }).click()
    await page.getByText('Synthetic supplier', { exact: true }).last().click()
    await page
      .getByRole('textbox', { name: '询价单编号', exact: true })
      .fill('SYNTH-RFQ')
    await page.getByRole('combobox', { name: 'RFQ 币种' }).click()
    await page.getByTitle(currency, { exact: true }).click()
    await expect(
      page.getByRole('textbox', { name: '询价单编号', exact: true }),
    ).toHaveValue('SYNTH-RFQ')
    await page.getByRole('button', { name: '创建询价单', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __rfqInputs: object[] }).__rfqInputs.length,
        ),
      )
      .toBe(1)
    expect(
      await page.evaluate(
        () => (window as unknown as { __rfqInputs: object[] }).__rfqInputs[0],
      ),
    ).toMatchObject({
      sourceOrderId: '00000000-0000-4000-8000-000000000001',
      supplierId: '00000000-0000-4000-8000-000000000002',
      displayNo: 'SYNTH-RFQ',
      currency,
    })
    expect(errors).toEqual([])
  })
}
