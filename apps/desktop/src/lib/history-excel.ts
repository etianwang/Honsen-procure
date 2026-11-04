import { documentSchema, formatPrintMoney } from './formal-print-api'
import type { OrderCommentView } from './workflow-api'
import type {
  RequisitionApi,
  RequisitionHistoryFilter,
} from './requisition-api'

type ExportApi = Pick<
  RequisitionApi,
  'listRequisitionHistory' | 'getRequisitionDetail'
> & {
  getFormalPrintDocument(orderId: string): Promise<unknown>
  listOrderComments(orderId: string): Promise<OrderCommentView[]>
}

/** Assemble all authorized filtered pages before producing any downloadable bytes. */
export function exportTimestamp(seconds: number): string {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    !Number.isFinite(seconds * 1000)
  )
    throw Error('Invalid timestamp')
  return new Date(seconds * 1000).toISOString()
}
export async function buildHistoryWorkbook(
  api: ExportApi,
  filter: RequisitionHistoryFilter,
  locale: 'zh-CN' | 'fr-FR' | 'en-US' = 'zh-CN',
) {
  const words = {
    'zh-CN': {
      Orders: '订单',
      Lines: '明细',
      Audit: '审计',
      Comments: '评论',
      ID: 'ID',
      number: '正式号',
      status: '状态',
      project: '项目',
      site: '现场',
      currency: '币种',
      total: '合计',
      minor: '最小单位',
      notes: '备注',
      self: '自批',
      material: '材料',
      french: '冻结外文材料名',
      model: '型号',
      spec: '规格',
      quantity: '数量',
      unit: '单位',
      price: '单价',
      audit: '审计ID',
      action: '操作',
      actor: '操作者',
      reason: '原因',
      date: '时间',
      comment: '评论',
      draft: '草稿（未正式签发）',
    },
    'fr-FR': {
      Orders: 'Commandes',
      Lines: 'Lignes',
      Audit: 'Audit',
      Comments: 'Commentaires',
      ID: 'ID',
      number: 'Numéro officiel',
      status: 'Statut',
      project: 'Projet',
      site: 'Site',
      currency: 'Devise',
      total: 'Total',
      minor: 'Unités mineures',
      notes: 'Notes',
      self: 'Auto-approbation',
      material: 'Matériau chinois',
      french: 'Matériau traduit figé',
      model: 'Modèle',
      spec: 'Spécification',
      quantity: 'Quantité',
      unit: 'Unité',
      price: 'Prix unitaire',
      audit: 'ID audit',
      action: 'Action',
      actor: 'Acteur',
      reason: 'Motif',
      date: 'Date',
      comment: 'Commentaire',
      draft: 'Brouillon non émis',
    },
    'en-US': {
      Orders: 'Orders',
      Lines: 'Lines',
      Audit: 'Audit',
      Comments: 'Comments',
      ID: 'ID',
      number: 'Formal number',
      status: 'Status',
      project: 'Project',
      site: 'Site',
      currency: 'Currency',
      total: 'Total',
      minor: 'Minor units',
      notes: 'Notes',
      self: 'Self approval',
      material: 'Chinese material',
      french: 'Frozen translated material',
      model: 'Model',
      spec: 'Specification',
      quantity: 'Quantity',
      unit: 'Unit',
      price: 'Unit price',
      audit: 'Audit ID',
      action: 'Action',
      actor: 'Actor',
      reason: 'Reason',
      date: 'Date',
      comment: 'Comment',
      draft: 'Draft, not formally issued',
    },
  }[locale]
  const statuses: Record<string, string[]> = {
    draft: ['草稿', 'Brouillon', 'Draft'],
    pending_confirmation: ['待审批', 'En attente', 'Pending approval'],
    confirmed: ['已批准', 'Approuvé', 'Approved'],
    approved: ['已批准', 'Approuvé', 'Approved'],
    rejected: ['已拒绝', 'Rejeté', 'Rejected'],
    formally_issued: ['已签发', 'Émis', 'Issued'],
    executing: ['执行中', 'En cours', 'Executing'],
    receiving: ['收货中', 'Réception', 'Receiving'],
    completed: ['已完成', 'Terminé', 'Completed'],
    completed_with_conditions: [
      '有条件完成',
      'Terminé sous conditions',
      'Completed with conditions',
    ],
    cancelled: ['已取消', 'Annulé', 'Cancelled'],
    sent: ['已发送', 'Envoyé', 'Sent'],
  }
  const statusName = (value: string) => {
    const names = statuses[value]
    if (!names) throw Error('Unsupported export status')
    return names[locale === 'zh-CN' ? 0 : locale === 'fr-FR' ? 1 : 2]
  }
  const fixedFilter = { ...filter }
  const { Workbook } = await import('exceljs')
  const book = new Workbook()
  book.creator = 'Honsen Procure'
  const orders = book.addWorksheet(words.Orders)
  const lines = book.addWorksheet(words.Lines)
  const audits = book.addWorksheet(words.Audit)
  const comments = book.addWorksheet(words.Comments)
  const terms = book.addWorksheet(
    locale === 'zh-CN'
      ? '正式条款'
      : locale === 'fr-FR'
        ? 'Conditions'
        : 'Formal terms',
  )
  const termNames = {
    'zh-CN': [
      '供应商',
      '订单日期',
      '交货地址',
      '预计交货日期',
      '小计',
      '行折扣',
      '订单折扣',
      '运费',
      '税额',
      '税率基点',
    ],
    'fr-FR': [
      'Fournisseur',
      'Date commande',
      'Adresse livraison',
      'Date prévue',
      'Sous-total',
      'Remise lignes',
      'Remise commande',
      'Frais',
      'Taxe',
      'Taux en points de base',
    ],
    'en-US': [
      'Supplier',
      'Order date',
      'Delivery address',
      'Expected delivery',
      'Subtotal',
      'Line discount',
      'Order discount',
      'Freight',
      'Tax',
      'Tax basis points',
    ],
  }[locale]
  textCommentHeader()
  function textCommentHeader() {
    const row = comments.addRow([
      'ID',
      'Comment ID',
      'Author',
      'Comment',
      'Date',
    ])
    row.eachCell((cell) => {
      cell.numFmt = '@'
    })
  }
  const textRow = (sheet: typeof orders, values: (string | null)[]) => {
    const row = sheet.addRow(values.map((value) => value ?? ''))
    row.eachCell((cell) => {
      cell.numFmt = '@'
    })
  }
  textRow(orders, [
    words.ID,
    words.number,
    words.status,
    words.project,
    words.site,
    words.currency,
    words.total,
    words.total + ' ' + words.minor,
    words.notes,
    words.self,
  ])
  textRow(lines, [
    words.ID,
    words.number,
    words.material,
    words.french,
    words.model,
    words.spec,
    words.quantity,
    words.unit,
    words.currency,
    words.price,
    words.price + ' ' + words.minor,
    words.total,
    words.total + ' ' + words.minor,
  ])
  textRow(audits, [
    words.ID,
    words.audit,
    words.action,
    words.actor,
    words.reason,
    words.date,
  ])
  textRow(terms, [words.ID, words.number, ...termNames])
  const seen = new Set<string>()
  const cursors = new Set<string>()
  let cursor: Parameters<ExportApi['listRequisitionHistory']>[0]
  do {
    const page = await api.listRequisitionHistory(cursor, fixedFilter)
    for (const record of page.records) {
      if (seen.has(record.id))
        throw new Error('Export changed during pagination; retry')
      seen.add(record.id)
      const detail = await api.getRequisitionDetail(record.id)
      if (
        detail.id !== record.id ||
        detail.totalMinor !== record.totalMinor ||
        detail.workflowStatus !== record.workflowStatus
      )
        throw new Error('Export changed while reading; retry')
      const formal = detail.formalDocumentNo
        ? documentSchema.parse(await api.getFormalPrintDocument(record.id))
        : null
      if (formal && formal.formalDocumentNo !== detail.formalDocumentNo)
        throw new Error('Formal number changed')
      const currency = formal?.currency ?? detail.primaryCurrency
      const amount = formal?.totalMinor ?? detail.totalMinor
      const number = formal?.formalDocumentNo ?? words.draft
      textRow(orders, [
        detail.id,
        number,
        statusName(detail.workflowStatus),
        formal?.projectId ?? detail.projectId,
        formal?.site ?? detail.site,
        currency,
        formatPrintMoney(amount, currency),
        amount,
        formal ? formal.notes : detail.notes,
        formal ? String(formal.selfApproved) : '',
      ])
      if (formal)
        textRow(terms, [
          detail.id,
          number,
          formal.supplier?.name ?? '',
          formal.orderDate,
          formal.deliveryAddress,
          formal.expectedDeliveryDate,
          formal.subtotalMinor,
          formal.lineDiscountMinor,
          formal.orderDiscountMinor,
          formal.freightMinor,
          formal.taxMinor,
          String(formal.taxRateBasisPoints),
        ])
      for (const line of formal?.lines ?? detail.lines) {
        textRow(lines, [
          detail.id,
          number,
          'nameZh' in line ? line.nameZh : line.materialName,
          'nameFr' in line
            ? formal?.languagePair === 'zh_en'
              ? (line.nameEn ?? '')
              : line.nameFr
            : '',
          line.model,
          line.specification,
          line.quantity,
          line.unit,
          line.currency,
          formatPrintMoney(line.unitPriceMinor, line.currency),
          line.unitPriceMinor,
          formatPrintMoney(line.lineTotalMinor, line.currency),
          line.lineTotalMinor,
        ])
      }
      for (const comment of await api.listOrderComments(record.id))
        textRow(comments, [
          detail.id,
          comment.id,
          comment.authorId,
          comment.body,
          exportTimestamp(comment.createdAt),
        ])
      for (const audit of detail.audits)
        textRow(audits, [
          detail.id,
          audit.id,
          audit.action,
          audit.actorId,
          audit.reason,
          exportTimestamp(audit.createdAt),
        ])
    }
    cursor = page.nextCursor ?? undefined
    if (cursor) {
      const key = JSON.stringify(cursor)
      if (cursors.has(key)) throw new Error('Repeated export cursor')
      cursors.add(key)
    }
  } while (cursor)
  for (const sheet of [orders, lines, audits, comments, terms]) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getRow(1).font = { bold: true }
    sheet.columns.forEach((column) => {
      column.width = 26
    })
    sheet.eachRow((row) => {
      row.alignment = { wrapText: true, vertical: 'top' }
    })
    sheet.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
    }
  }
  return book.xlsx.writeBuffer()
}
