import { test, expect } from '@playwright/test'
import { Workbook } from 'exceljs'

for (const formalMissing of [false, true])
  test(
    'history Excel complete authorized workbook, missing frozen translation=' +
      formalMissing,
    async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/')
      await page.evaluate(
        async ({ formalMissing }) => {
          const load = (path: string) => import(/* @vite-ignore */ path)
          const React = await load('/node_modules/.vite/deps/react.js')
          const ReactDOM = await load(
            '/node_modules/.vite/deps/react-dom_client.js',
          )
          const { RequisitionHistoryPanel } = await load(
            '/src/components/RequisitionHistoryPanel.tsx',
          )
          const record = {
            id: 'synthetic',
            displayNo: 'SYNTHETIC',
            projectName: '合成项目',
            site: '测试',
            workflowStatus: 'draft',
            procurementMode: 'honsen_self_purchase',
            primaryCurrency: 'CNY',
            totalMinor: '250',
            updatedAt: 1,
          }
          let deny = false
          const api = {
            listRequisitionHistory: async () => ({
              records: [record],
              nextCursor: null,
            }),
            getRequisitionDetail: async () => {
              if (deny) throw Error('forbidden')
              return {
                ...record,
                formalDocumentNo: formalMissing ? 'TEST-HPA-MISSING' : null,
                applicantId: 'synthetic',
                projectId: 'synthetic',
                orderDate: '2026-11-04',
                deliveryAddress: 'Test',
                expectedDeliveryDate: null,
                notes: '=1+1',
                lines: [
                  {
                    materialName: '中文 Électricité',
                    model: 'M',
                    specification: 'S',
                    quantity: '2.5',
                    unit: '米',
                    currency: 'CNY',
                    unitPriceMinor: '100',
                    lineTotalMinor: '250',
                  },
                ],
                attachments: [],
                audits: [],
              }
            },
          }
          Object.assign(window, {
            __TAURI__: {
              core: {
                invoke: async (command: string) => {
                  if (command !== 'get_internal_export_document')
                    throw Error('Unexpected command: ' + command)
                  return {
                    formalDocumentNo: 'TEST-HPA-MISSING',
                    documentType: 'HPA',
                    languagePair: 'zh_fr',
                    projectId: '10000000-0000-4000-8000-000000000002',
                    site: 'Frozen',
                    orderDate: '2026-11-04',
                    deliveryAddress: 'Frozen',
                    expectedDeliveryDate: null,
                    notes: '=1+1',
                    currency: 'CNY',
                    subtotalMinor: '250',
                    lineDiscountMinor: '0',
                    orderDiscountMinor: '0',
                    freightMinor: '0',
                    taxMinor: '0',
                    totalMinor: '250',
                    taxRateBasisPoints: 0,
                    selfApproved: false,
                    supplier: null,
                    lines: [
                      {
                        nameZh: '中文 Électricité',
                        nameFr: null,
                        nameEn: null,
                        model: 'M',
                        specification: 'S',
                        quantity: '2.5',
                        unit: '米',
                        currency: 'CNY',
                        unitPriceMinor: '100',
                        lineTotalMinor: '250',
                      },
                    ],
                  }
                },
              },
            },
            __denyExcel: () => {
              deny = true
            },
          })
          const root = document.createElement('div')
          document.body.replaceChildren(root)
          ;(ReactDOM.createRoot ?? ReactDOM.default.createRoot)(root).render(
            (React.createElement ?? React.default.createElement)(
              RequisitionHistoryPanel,
              {
                api,
                refreshKey: 'test',
                projectId: 'synthetic',
                applicantId: 'synthetic',
                onCopy: () => {},
                workflowApi: { listOrderComments: async () => [] },
                canApprove: false,
              },
            ),
          )
        },
        { formalMissing },
      )
      const downloadEvent = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出Excel', exact: true }).click()
      const download = await downloadEvent
      await download.saveAs(
        test.info().outputPath('Honsen-Procure-synthetic-history.xlsx'),
      )
      expect(download.suggestedFilename()).toBe('Honsen-Procure-history.xlsx')
      const path = await download.path()
      const book = new Workbook()
      await book.xlsx.readFile(path!)
      expect(book.getWorksheet('订单')?.getCell('G2').value).toBe('2.50 CNY')
      expect(book.getWorksheet('订单')?.getCell('I2').value).toBe('=1+1')
      expect(book.getWorksheet('明细')?.getCell('C2').value).toBe(
        '中文 Électricité',
      )
      if (formalMissing)
        expect(book.getWorksheet('明细')?.getCell('D2').value).toBe(
          '[缺少冻结译名]',
        )
      await page.evaluate(() =>
        (window as unknown as { __denyExcel: () => void }).__denyExcel(),
      )
      let downloads = 0
      page.on('download', () => {
        downloads++
      })
      await page.getByRole('button', { name: '导出Excel', exact: true }).click()
      await expect(
        page.getByText('导出失败，未下载部分结果；请刷新列表后重试。'),
      ).toBeVisible()
      expect(downloads).toBe(0)
      expect(errors).toEqual([])
    },
  )
