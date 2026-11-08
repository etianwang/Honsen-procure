import { describe, expect, it } from 'vitest'
import { Workbook } from 'exceljs'
import { buildHistoryWorkbook, exportTimestamp } from './history-excel'
import type { RequisitionDetail } from './requisition-api'

const detail: RequisitionDetail = {
  id: 'synthetic-order',
  displayNo: '=CMD()',
  formalDocumentNo: null,
  applicantId: 'synthetic',
  projectName: 'Électricité 中文',
  projectId: 'synthetic-project',
  site: '+site',
  workflowStatus: 'draft',
  procurementMode: 'honsen_self_purchase',
  orderDate: '2026-11-04',
  deliveryAddress: '@address',
  expectedDeliveryDate: null,
  notes: '=1+1',
  primaryCurrency: 'CNY',
  totalMinor: '9223372036854775807',
  lines: [
    {
      materialName: '@材料 Étage',
      model: '-model',
      specification: '+spec',
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
const record = {
  id: detail.id,
  displayNo: detail.displayNo,
  projectName: detail.projectName,
  site: detail.site,
  workflowStatus: detail.workflowStatus,
  procurementMode: detail.procurementMode,
  primaryCurrency: detail.primaryCurrency,
  totalMinor: detail.totalMinor,
  updatedAt: 1,
}

describe('authorized XLSX history export', () => {
  it('formats Rust Unix seconds as an actual 2026 date and rejects invalid timestamps', () => {
    expect(exportTimestamp(1793750400)).toBe('2026-11-04T00:00:00.000Z')
    expect(() => exportTimestamp(-1)).toThrow('Invalid timestamp')
    expect(() => exportTimestamp(Number.NaN)).toThrow('Invalid timestamp')
  })
  it('uses trusted frozen formal values instead of mutable detail, in one selected locale', async () => {
    const formal = {
      formalDocumentNo: 'TEST-HPA-1',
      documentType: 'HPA',
      languagePair: 'zh_fr',
      projectId: '10000000-0000-4000-8000-000000000002',
      site: 'Frozen site',
      orderDate: '2026-11-04',
      deliveryAddress: 'Frozen address',
      expectedDeliveryDate: null,
      notes: null,
      currency: 'CNY',
      subtotalMinor: '250',
      lineDiscountMinor: '0',
      orderDiscountMinor: '0',
      freightMinor: '0',
      taxMinor: '0',
      totalMinor: '250',
      manualStampDutyMinor: '37',
      taxRateBasisPoints: 0,
      selfApproved: false,
      supplier: null,
      lines: [
        {
          nameZh: '冻结材料',
          nameFr: 'Étage figé',
          model: '',
          specification: '',
          quantity: '2.5',
          unit: '米',
          currency: 'CNY',
          unitPriceMinor: '100',
          lineTotalMinor: '250',
        },
      ],
    }
    const bytes = await buildHistoryWorkbook(
      {
        listOrderComments: async () => [],
        listRequisitionHistory: async () => ({
          records: [record],
          nextCursor: null,
        }),
        getRequisitionDetail: async () => ({
          ...detail,
          formalDocumentNo: formal.formalDocumentNo,
        }),
        getInternalExportDocument: async () => formal,
      },
      {},
      'fr-FR',
    )
    const book = new Workbook()
    await book.xlsx.load(bytes)
    expect(book.getWorksheet('Commandes')?.getCell('B2').value).toBe(
      'TEST-HPA-1',
    )
    expect(book.getWorksheet('Commandes')?.getCell('G2').value).toBe('2.50 CNY')
    expect(book.getWorksheet('Commandes')?.getCell('I2').value).toBe('')
    expect(book.getWorksheet('Conditions')?.getCell('M2').value).toBe('37')
    expect(book.getWorksheet('Lignes')?.getCell('C2').value).toBe('冻结材料')
    expect(book.getWorksheet('Commandes')?.getCell('B1').value).toBe(
      'Numéro officiel',
    )
  })
  it.each(['zh_fr', 'zh_en'] as const)(
    'marks missing %s frozen translations without weakening financial validation',
    async (languagePair) => {
      const formal = {
        formalDocumentNo: 'TEST-HPA-MISSING',
        documentType: 'HPA',
        languagePair,
        projectId: '10000000-0000-4000-8000-000000000002',
        site: 'Frozen',
        orderDate: '2026-11-08',
        deliveryAddress: 'Frozen',
        expectedDeliveryDate: null,
        notes: null,
        currency: 'XOF',
        subtotalMinor: '3300',
        lineDiscountMinor: '0',
        orderDiscountMinor: '0',
        freightMinor: '0',
        taxMinor: '0',
        totalMinor: '3300',
        taxRateBasisPoints: 0,
        selfApproved: false,
        supplier: null,
        lines: [
          {
            nameZh: 'TEST frozen',
            nameFr: null,
            nameEn: null,
            model: null,
            specification: null,
            quantity: '3',
            unit: 'PCS',
            currency: 'XOF',
            unitPriceMinor: '1100',
            lineTotalMinor: '3300',
          },
        ],
      }
      const api = {
        listOrderComments: async () => [],
        listRequisitionHistory: async () => ({
          records: [record],
          nextCursor: null,
        }),
        getRequisitionDetail: async () => ({
          ...detail,
          formalDocumentNo: formal.formalDocumentNo,
        }),
        getInternalExportDocument: async () => formal,
      }
      const bytes = await buildHistoryWorkbook(api, {}, 'en-US')
      const book = new Workbook()
      await book.xlsx.load(bytes)
      expect(book.getWorksheet('Lines')?.getCell('D2').value).toBe(
        '[Missing frozen translation]',
      )
      expect(book.getWorksheet('Orders')?.getCell('H2').value).toBe('3300')
      expect(formal.lines[0].nameFr).toBeNull()
      expect(formal.lines[0].nameEn).toBeNull()
      await expect(
        buildHistoryWorkbook(
          {
            ...api,
            getInternalExportDocument: async () => ({
              ...formal,
              totalMinor: '3.3',
            }),
          },
          {},
        ),
      ).rejects.toThrow()
      await expect(
        buildHistoryWorkbook(
          {
            ...api,
            getInternalExportDocument: async () => ({
              ...formal,
              unexpected: 'private',
            }),
          },
          {},
        ),
      ).rejects.toThrow()
    },
  )
  it('retains frozen English material names when UI export locale is French', async () => {
    const formal = {
      formalDocumentNo: 'TEST-HPA-1',
      documentType: 'HPA',
      languagePair: 'zh_en',
      projectId: '10000000-0000-4000-8000-000000000002',
      site: 'Frozen site',
      orderDate: '2026-11-04',
      deliveryAddress: 'Frozen address',
      expectedDeliveryDate: null,
      notes: null,
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
          nameZh: '冻结材料',
          nameFr: null,
          nameEn: 'Frozen English material',
          model: '',
          specification: '',
          quantity: '2.5',
          unit: '米',
          currency: 'CNY',
          unitPriceMinor: '100',
          lineTotalMinor: '250',
        },
      ],
    }
    const bytes = await buildHistoryWorkbook(
      {
        listOrderComments: async () => [],
        listRequisitionHistory: async () => ({
          records: [record],
          nextCursor: null,
        }),
        getRequisitionDetail: async () => ({
          ...detail,
          formalDocumentNo: formal.formalDocumentNo,
        }),
        getInternalExportDocument: async () => formal,
      },
      {},
      'fr-FR',
    )
    const book = new Workbook()
    await book.xlsx.load(bytes)
    expect(book.getWorksheet('Commandes')?.getCell('B2').value).toBe(
      'TEST-HPA-1',
    )
    expect(book.getWorksheet('Commandes')?.getCell('G2').value).toBe('2.50 CNY')
    expect(book.getWorksheet('Commandes')?.getCell('I2').value).toBe('')
    expect(book.getWorksheet('Lignes')?.getCell('D2').value).toBe(
      'Frozen English material',
    )
    expect(book.getWorksheet('Lignes')?.getCell('C2').value).toBe('冻结材料')
    expect(book.getWorksheet('Commandes')?.getCell('B1').value).toBe(
      'Numéro officiel',
    )
  })
  it('round-trips Unicode and exact large money as text, never formulas', async () => {
    const bytes = await buildHistoryWorkbook(
      {
        listOrderComments: async () => [],
        listRequisitionHistory: async () => ({
          records: [record],
          nextCursor: null,
        }),
        getRequisitionDetail: async () => detail,
        getInternalExportDocument: async () => {
          throw Error('draft must not issue')
        },
      },
      {},
    )
    const book = new Workbook()
    await book.xlsx.load(bytes)
    expect(book.getWorksheet('订单')?.getCell('H2').value).toBe(
      '9223372036854775807',
    )
    expect(book.getWorksheet('订单')?.getCell('G2').value).toBe(
      '92233720368547758.07 CNY',
    )
    expect(book.getWorksheet('订单')?.getCell('I2').value).toBe('=1+1')
    expect(book.getWorksheet('明细')?.getCell('C2').value).toBe('@材料 Étage')
    expect(book.getWorksheet('明细')?.getCell('E2').value).toBe('-model')
    expect(book.getWorksheet('明细')?.getCell('F2').value).toBe('+spec')
    for (const sheet of book.worksheets)
      sheet.eachRow((row) =>
        row.eachCell((cell) => expect(cell.type).not.toBe(6)),
      )
  })
  it('aborts rather than exporting partial data on revoked detail access', async () => {
    await expect(
      buildHistoryWorkbook(
        {
          listOrderComments: async () => [],
          listRequisitionHistory: async () => ({
            records: [record],
            nextCursor: null,
          }),
          getRequisitionDetail: async () => {
            throw Error('forbidden')
          },
          getInternalExportDocument: async () => null,
        },
        {},
      ),
    ).rejects.toThrow('forbidden')
  })
  it('rejects repeated pages and concurrent list/detail changes', async () => {
    await expect(
      buildHistoryWorkbook(
        {
          listOrderComments: async () => [],
          listRequisitionHistory: async () => ({
            records: [record],
            nextCursor: { id: 'cursor', updatedAt: 1 },
          }),
          getRequisitionDetail: async () => detail,
          getInternalExportDocument: async () => null,
        },
        {},
      ),
    ).rejects.toThrow('pagination')
    await expect(
      buildHistoryWorkbook(
        {
          listOrderComments: async () => [],
          listRequisitionHistory: async () => ({
            records: [record],
            nextCursor: null,
          }),
          getRequisitionDetail: async () => ({ ...detail, totalMinor: '1' }),
          getInternalExportDocument: async () => null,
        },
        {},
      ),
    ).rejects.toThrow('changed while reading')
  })
})
