import { test, expect } from '@playwright/test'

test('production attachment UI imports a voucher offline and retains pending state after reload', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.addInitScript(() => {
    const orderId = '00000000-0000-4000-8000-000000000921',
      paymentId = '00000000-0000-4000-8000-000000000922',
      receiptId = '00000000-0000-4000-8000-000000000923'
    const load = () =>
      JSON.parse(localStorage.getItem('synthetic-attachments') ?? '[]')
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              orderId?: string
              id?: string
              input?: {
                id: string
                ownerType: string
                ownerId: string
                originalName: string
                contentType: string
                dataBase64: string
              }
            },
          ) {
            if (command === 'list_suppliers') return Promise.resolve([])
            if (command === 'list_confirmed_procurement_orders')
              return Promise.resolve([
                {
                  id: orderId,
                  displayNo: 'SYNTHETIC-ATTACHMENT',
                  primaryCurrency: 'XOF',
                  procurementMode: 'honsen_self_purchase',
                  workflowStatus: 'executing',
                  lines: [],
                  children: [],
                  paymentSummary: {
                    currency: 'XOF',
                    payableMinor: '1000',
                    paidMinor: '100',
                    remainingMinor: '900',
                    overpaidMinor: '0',
                    status: 'partial',
                    records: [],
                  },
                },
              ])
            if (command === 'list_attachments') return Promise.resolve(load())
            if (command === 'list_attachment_targets')
              return Promise.resolve([
                {
                  ownerType: 'purchase_order',
                  ownerId: orderId,
                  description: '',
                },
                {
                  ownerType: 'procurement_expenditure',
                  ownerId: paymentId,
                  description: 'Synthetic payee',
                },
                {
                  ownerType: 'receipt',
                  ownerId: receiptId,
                  description: '2026-10-24',
                },
              ])
            if (command === 'import_attachment' && args?.input) {
              const input = args.input
              const files = load()
              files.push({
                id: input.id,
                ownerType: input.ownerType,
                ownerId: input.ownerId,
                originalName: input.originalName,
                contentType: input.contentType,
                byteLength: atob(input.dataBase64).length,
                uploadState: 'pending_upload',
                availableLocally: true,
                retryCount: 0,
                lastError: null,
              })
              localStorage.setItem(
                'synthetic-attachments',
                JSON.stringify(files),
              )
              return Promise.resolve(input.id)
            }
            if (command === 'read_attachment')
              return Promise.resolve(
                'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK',
              )
            return Promise.reject(new Error('Unexpected command ' + command))
          },
        },
      },
    })
  })
  async function open() {
    await page.goto('/')
    await page.getByRole('button', { name: '打开界面预览' }).click()
    await page.getByRole('button', { name: '采购执行', exact: true }).click()
  }
  await open()
  await page.getByLabel('附件业务关联', { exact: true }).click()
  await page
    .getByRole('combobox', { name: '附件业务关联', exact: true })
    .press('ArrowDown')
  await page
    .getByRole('combobox', { name: '附件业务关联', exact: true })
    .press('Enter')
  await page.getByLabel('导入附件', { exact: true }).setInputFiles({
    name: 'synthetic-voucher.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  })
  await expect(page.getByText(/synthetic-voucher.pdf · 付款凭证/)).toBeVisible()
  await expect(
    page.getByText(/synthetic-voucher.pdf.*待上传.*本地可用/),
  ).toBeVisible()
  await open()
  await expect(page.getByText(/synthetic-voucher.pdf.*待上传/)).toBeVisible()
  await page.getByRole('button', { name: '查看或下载', exact: true }).click()
  await expect(
    page.getByRole('link', { name: '下载文件', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
