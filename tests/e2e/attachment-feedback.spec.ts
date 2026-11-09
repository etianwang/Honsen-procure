import { expect, test, type Page } from '@playwright/test'
import { attachmentMessages } from '../../apps/desktop/src/lib/attachment-messages'

async function mount(page: Page, locale: string, initialFailure = false) {
  await page.goto('/')
  await page.evaluate(
    async ({ locale, initialFailure }) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { AttachmentPanel } = await load(
        '/src/components/AttachmentPanel.tsx',
      )
      const orderId = '00000000-0000-4000-8000-000000000901'
      const oldId = '00000000-0000-4000-8000-000000000902'
      const newId = '00000000-0000-4000-8000-000000000903'
      const file = (name: string, id = oldId, uploaded = true) => ({
        id,
        ownerType: 'purchase_order',
        ownerId: orderId,
        originalName: name,
        contentType: 'text/plain',
        byteLength: 4,
        uploadState: uploaded ? 'uploaded' : 'pending_upload',
        availableLocally: true,
        retryCount: 0,
        lastError: null,
      })
      Object.assign(window, {
        __attachmentMode: initialFailure ? 'fail' : 'initial',
        __imports: 0,
        __reads: 0,
      })
      Object.assign(window, {
        __TAURI__: {
          core: {
            invoke: async (command: string, args?: unknown) => {
              const mode = Reflect.get(window, '__attachmentMode')
              if (command === 'list_attachment_targets')
                return [
                  {
                    ownerType: 'purchase_order',
                    ownerId: orderId,
                    description: 'Synthetic order',
                  },
                ]
              if (command === 'list_attachments') {
                if (mode === 'fail') throw Error('synthetic list failure')
                if (mode === 'old')
                  return new Promise((resolve) =>
                    Object.assign(window, {
                      __releaseOldAttachments: () => resolve([file('STALE')]),
                    }),
                  )
                if (mode === 'new') return [file('LATEST')]
                if (mode === 'initial-pending')
                  return [file('ORIGINAL', oldId, false)]
                if (mode === 'older-pending')
                  return [
                    file('ORIGINAL', oldId, false),
                    file('import.txt', newId, true),
                  ]
                if (mode === 'pending' || mode === 'uploaded')
                  return [
                    file('ORIGINAL'),
                    file('import.txt', newId, mode === 'uploaded'),
                  ]
                return [file('ORIGINAL')]
              }
              if (command === 'import_attachment') {
                Object.assign(window, {
                  __imports: Reflect.get(window, '__imports') + 1,
                  __importPayload: args,
                })
                await new Promise<void>((resolve) =>
                  Object.assign(window, { __finishImport: resolve }),
                )
                Object.assign(window, { __attachmentMode: 'fail' })
                return newId
              }
              if (command === 'read_attachment') {
                Object.assign(window, {
                  __reads: Reflect.get(window, '__reads') + 1,
                })
                await new Promise<void>((resolve) =>
                  Object.assign(window, { __finishRead: resolve }),
                )
                return 'data:text/plain;base64,dGVzdA=='
              }
              throw Error('unexpected command')
            },
          },
        },
      })
      const host = document.createElement('div')
      document.body.replaceChildren(host)
      const root = (DOM.createRoot ?? DOM.default.createRoot)(host)
      root.render(
        (React.createElement ?? React.default.createElement)(AttachmentPanel, {
          orderId,
          locale,
        }),
      )
      Object.assign(window, { __unmountAttachment: () => root.unmount() })
    },
    { locale, initialFailure },
  )
}
async function change(page: Page, mode: string) {
  await page.evaluate((mode) => {
    Object.assign(window, { __attachmentMode: mode })
    window.dispatchEvent(new Event('honsen-procurement-synced'))
  }, mode)
}
async function release(page: Page, key: string) {
  await page.evaluate((key) => {
    const done = Reflect.get(window, key)
    if (typeof done === 'function') done()
  }, key)
}
for (const locale of ['zh-CN', 'en-US', 'fr-FR'] as const) {
  test(`attachment import partial success remains truthful and view is exclusive in ${locale}`, async ({
    page,
  }) => {
    const t = attachmentMessages[locale]
    await mount(page, locale)
    await expect(page.getByText(/ORIGINAL/)).toBeVisible()
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('honsen-procurement-status', {
          detail: { state: 'synced' },
        }),
      ),
    )
    await expect(page.getByText(t.lastSynced, { exact: true })).toBeVisible()
    const input = page.getByLabel(t.file, { exact: true })
    await input.setInputFiles({
      name: 'import.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    })
    // The actual adapter rejects unsupported .txt; use supported PDF without bypassing import validation.
    await expect(page.getByText(t.error, { exact: true })).toBeVisible()
    await input.setInputFiles({
      name: 'import.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF synthetic'),
    })
    await expect(input).toBeDisabled()
    await expect(page.getByLabel(t.target)).toBeDisabled()
    await expect(page.getByText(t.working, { exact: true })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__imports')))
      .toBe(1)
    await expect(
      page.getByText(t.lastSynced, { exact: true }),
    ).not.toBeVisible()
    await release(page, '__finishImport')
    await expect(
      page.getByText(t.savedRefreshFailed, { exact: true }),
    ).toBeVisible()
    await expect(page.locator('.ant-alert-warning')).toBeVisible()
    await expect(page.getByText(/ORIGINAL/)).toBeVisible()
    await change(page, 'pending')
    await expect(page.getByText(/import.txt/)).toBeVisible()
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('honsen-procurement-status', {
          detail: { state: 'synced' },
        }),
      ),
    )
    await expect(
      page.getByText(t.lastSynced, { exact: true }),
    ).not.toBeVisible()
    const view = page
      .locator('li')
      .filter({ hasText: 'ORIGINAL' })
      .getByRole('button', { name: t.view, exact: true })
    await view.click()
    await expect(view).toBeDisabled()
    await view.dispatchEvent('click')
    expect(await page.evaluate(() => Reflect.get(window, '__reads'))).toBe(1)
    await release(page, '__finishRead')
    await expect(page.getByRole('dialog', { name: 'ORIGINAL' })).toBeVisible()
    await change(page, 'older-pending')
    await expect(
      page.getByText(t.lastSynced, { exact: true }),
    ).not.toBeVisible()
    await change(page, 'uploaded')
    await expect(page.getByText(t.lastSynced, { exact: true })).toBeVisible()
    expect(await page.evaluate(() => Reflect.get(window, '__imports'))).toBe(1)
  })
  test(`attachment list errors are not empty and stale refresh never replaces newer files in ${locale}`, async ({
    page,
  }) => {
    const t = attachmentMessages[locale]
    await mount(page, locale, true)
    await expect(page.getByText(t.loadFailed, { exact: true })).toBeVisible()
    await expect(page.getByText(t.empty, { exact: true })).not.toBeVisible()
    await change(page, 'initial')
    await expect(page.getByText(/ORIGINAL/)).toBeVisible()
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('honsen-procurement-status', {
          detail: { state: 'synced' },
        }),
      ),
    )
    await change(page, 'initial-pending')
    await expect(
      page.getByText(t.lastSynced, { exact: true }),
    ).not.toBeVisible()
    await change(page, 'old')
    await expect(page.getByText(t.loading, { exact: true })).toBeVisible()
    await change(page, 'new')
    await expect(page.getByText(/LATEST/)).toBeVisible()
    await release(page, '__releaseOldAttachments')
    await expect(page.getByText(/STALE/)).not.toBeVisible()
    await expect(page.getByText(/LATEST/)).toBeVisible()
    await change(page, 'old')
    await page.evaluate(() => {
      const unmount = Reflect.get(window, '__unmountAttachment')
      if (typeof unmount === 'function') unmount()
    })
    await release(page, '__releaseOldAttachments')
    await expect(page.getByText(/STALE/)).not.toBeVisible()
  })
}
