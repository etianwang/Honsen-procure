import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  approvedPrintLogo,
  defaultPrintLanguage,
  validatePrintLanguage,
  formatPrintMoney,
  type FormalPrintDocument,
} from '../lib/formal-print-api'
import { amountInWords } from '../lib/amount-words'
import {
  fitsSinglePage,
  pageNumber,
  paginateMeasured,
  printDesignTokens as tokens,
  type MeasuredLayout,
  type PrintPage,
} from '../lib/print-engine'

type Language = 'zh' | 'fr' | 'en'
type Caption = readonly [string, string, string]
const titles = {
  HPA: ['弘盛自采单', 'ACHAT HONSEN', 'HONSEN PURCHASE'],
  SPO: ['采购订单', 'BON DE COMMANDE', 'PURCHASE ORDER'],
  OPA: [
    '业主采购申请',
    'DEMANDE D’ACHAT DU MAÎTRE D’OUVRAGE',
    'OWNER PURCHASE APPLICATION',
  ],
} as const
const labels = {
  project: ['项目', 'PROJET', 'PROJECT'],
  date: ['签发日期', 'DATE D’ÉMISSION', 'ISSUE DATE'],
  delivery: ['交货地点', 'LIEU DE LIVRAISON', 'DELIVERY ADDRESS'],
  supplier: ['供应商', 'FOURNISSEUR', 'SUPPLIER'],
  expected: ['预计交期', 'DATE PRÉVUE', 'EXPECTED DELIVERY'],
  currency: ['币种', 'DEVISE', 'CURRENCY'],
  notes: ['备注及条款', 'OBSERVATIONS ET CONDITIONS', 'NOTES AND TERMS'],
  material: ['材料名称', 'DÉSIGNATION', 'DESCRIPTION'],
  quantity: ['数量', 'QTÉ', 'QTY'],
  unit: ['单位', 'UNITÉ', 'UNIT'],
  price: ['单价', 'P.U.', 'UNIT PRICE'],
  amount: ['金额', 'MONTANT', 'AMOUNT'],
  subtotal: ['小计', 'Sous-total', 'Subtotal'],
  lineDiscount: ['行折扣', 'Remise sur les lignes', 'Line discounts'],
  discount: ['订单折扣', 'Remise sur commande', 'Order discount'],
  freight: ['运费', 'Transport', 'Freight'],
  rate: ['税率', 'Taux de taxe', 'Tax rate'],
  tax: ['税额', 'Taxes', 'Tax'],
  stamp: ['印花税', 'Droit de timbre', 'Stamp duty'],
  total: ['最终合计', 'TOTAL TTC', 'TOTAL'],
  words: [
    '本采购订单金额大写：',
    'ARRÊTÉ LE PRÉSENT BON DE COMMANDE À LA SOMME DE :',
    'THIS PURCHASE ORDER IS FOR THE SUM OF:',
  ],
  applicant: ['申请人签字', 'PRÉPARÉ PAR', 'PREPARED BY'],
  approver: ['审批人签字', 'APPROUVÉ PAR', 'APPROVED BY'],
  self: ['自行审批', 'AUTO-APPROBATION', 'SELF-APPROVED'],
} satisfies Record<string, Caption>
function Pair({ text, language }: { text: Caption; language: Language }) {
  const primary = language === 'zh' ? 0 : language === 'fr' ? 1 : 2
  return (
    <span className="print-pair">
      <span className="print-primary" lang={language}>
        {text[primary]}
      </span>
      <span className="print-secondary" lang={language === 'zh' ? 'fr' : 'zh'}>
        {text[language === 'zh' ? 1 : 0]}
      </span>
    </span>
  )
}
function Header({
  doc,
  language,
  index,
  total,
}: {
  doc: FormalPrintDocument
  language: Language
  index: number
  total: number
}) {
  return (
    <header className="formal-document-heading">
      <div className="print-brand-block">
        {doc.printProfile && (
          <div className="formal-company-header">
            <img
              src={approvedPrintLogo.path}
              alt="HONSEN"
              className="formal-company-logo"
            />
            <p className="formal-company-name">
              {doc.printProfile.legalNameZh}
            </p>
          </div>
        )}
        <p className="formal-document-brand">HONSEN Procure</p>
      </div>
      <div className="print-document-id">
        <h1>
          <Pair text={titles[doc.documentType]} language={language} />
        </h1>
        <div>
          {doc.documentType} · {doc.formalDocumentNo}
        </div>
        <span className="print-page-number">{pageNumber(index, total)}</span>
      </div>
    </header>
  )
}
function Metadata({
  doc,
  language,
}: {
  doc: FormalPrintDocument
  language: Language
}) {
  const entries: [Caption, string][] = [
    [
      labels.project,
      `${/^(CI|CM)-/.test(doc.formalDocumentNo) ? doc.formalDocumentNo.slice(0, 2) + ' · ' : ''}${doc.site}`,
    ],
    [labels.date, doc.orderDate],
    [labels.delivery, doc.deliveryAddress],
    [labels.expected, doc.expectedDeliveryDate ?? '—'],
    [labels.currency, doc.currency],
  ]
  if (doc.documentType !== 'OPA' && doc.supplier?.name)
    entries.push([
      labels.supplier,
      [
        doc.supplier.name,
        doc.supplier.contactName,
        doc.supplier.address,
        doc.supplier.phone,
        doc.supplier.email,
      ]
        .filter(Boolean)
        .join(' · '),
    ])
  return (
    <div className="print-metadata">
      {entries.map(([caption, value], i) => (
        <div key={i}>
          <Pair text={caption} language={language} />
          <div>{value}</div>
        </div>
      ))}
      {doc.selfApproved && <Pair text={labels.self} language={language} />}
    </div>
  )
}
function MaterialTable({
  doc,
  language,
  rows,
}: {
  doc: FormalPrintDocument
  language: Language
  rows: number[]
}) {
  return (
    <table className="print-materials">
      <colgroup>
        <col style={{ width: '48%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '16%' }} />
        <col style={{ width: '16%' }} />
      </colgroup>
      <thead>
        <tr>
          {[
            labels.material,
            labels.quantity,
            labels.unit,
            labels.price,
            labels.amount,
          ].map((t, i) => (
            <th key={i}>
              <Pair text={t} language={language} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => {
          const line = doc.lines[i]!
          const foreign =
            doc.languagePair === 'zh_en' ? line.nameEn : line.nameFr
          return (
            <tr key={i} data-line-index={i}>
              <td>
                <Pair
                  text={[line.nameZh, foreign ?? '', foreign ?? '']}
                  language={language}
                />
                <small className="print-specification">
                  {[line.model, line.specification].filter(Boolean).join(' · ')}
                </small>
              </td>
              <td>{line.quantity}</td>
              <td>{line.unit}</td>
              <td>{formatPrintMoney(line.unitPriceMinor, doc.currency)}</td>
              <td>{formatPrintMoney(line.lineTotalMinor, doc.currency)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
function Settlement({
  doc,
  language,
}: {
  doc: FormalPrintDocument
  language: Language
}) {
  const money = (n: string) => formatPrintMoney(n, doc.currency)
  const rate = BigInt(doc.taxRateBasisPoints)
  const rateText = `${rate / 100n}.${String(rate % 100n).padStart(2, '0')} %`
  const rows: [Caption, string][] = [
    [labels.subtotal, money(doc.subtotalMinor)],
    [labels.lineDiscount, money(doc.lineDiscountMinor)],
    [labels.discount, money(doc.orderDiscountMinor)],
    [labels.freight, money(doc.freightMinor)],
    [labels.rate, rateText],
    [labels.tax, money(doc.taxMinor)],
    [labels.stamp, money(doc.manualStampDutyMinor ?? '0')],
    [labels.total, money(doc.totalMinor)],
  ]
  const auxiliary = language === 'zh' ? 'fr' : 'zh'
  return (
    <section className="print-settlement">
      <div className="print-settlement-columns">
        <div className="print-notes">
          <Pair text={labels.notes} language={language} />
          <p>{doc.notes ?? '—'}</p>
          <div className="print-amount-words">
            <Pair text={labels.words} language={language} />
            <p className="print-primary">
              {amountInWords(doc.totalMinor, doc.currency, language)}
            </p>
            <p className="print-secondary">
              {amountInWords(doc.totalMinor, doc.currency, auxiliary)}
            </p>
          </div>
        </div>
        <div className="print-summary">
          <table>
            <tbody>
              {rows.map(([caption, value], i) => (
                <tr key={i} className={i === 7 ? 'print-total' : ''}>
                  <td>
                    <Pair text={caption} language={language} />
                  </td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="print-signatures">
        <div>
          <Pair text={labels.applicant} language={language} />
          <p>________________________</p>
        </div>
        <div>
          <Pair text={labels.approver} language={language} />
          <p>________________________</p>
        </div>
      </div>
    </section>
  )
}
const variables = {
  '--print-width': `${tokens.widthMm - tokens.margins.left - tokens.margins.right}mm`,
  '--print-height': `${tokens.heightMm - tokens.margins.top - tokens.margins.bottom}mm`,
  '--print-header': `${tokens.headerHeight}mm`,
  '--print-footer': `${tokens.footerHeight}mm`,
  '--print-primary': `${tokens.primaryFontSize}pt`,
  '--print-secondary': `${tokens.secondaryFontSize}pt`,
  '--print-title': `${tokens.titleFontSize}pt`,
  '--print-total': `${tokens.totalFontSize}pt`,
  '--print-line-height': tokens.lineHeight,
  '--print-padding': `${tokens.tableCellPadding}mm`,
  '--print-gap': `${tokens.sectionGap}mm`,
  '--print-summary-padding': `${tokens.summaryCellPadding}mm`,
  '--print-summary-line-height': tokens.summaryLineHeight,
  '--print-summary': `${tokens.summaryWidthRatio * 100}%`,
} as CSSProperties
/** Shared production engine: font-loaded measurement, page composition and native print use identical DOM. */
export function FormalDocumentSheet({
  document: doc,
  primaryLanguage,
}: {
  document: FormalPrintDocument
  primaryLanguage?: Language
}) {
  const language = validatePrintLanguage(
    doc.languagePair,
    primaryLanguage ?? defaultPrintLanguage(doc),
  )
  const [layout, setLayout] = useState<{
    pages: PrintPage[]
    density: 'standard' | 'dense' | 'compact'
  } | null>(null)
  const [error, setError] = useState(false)
  const measure = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    setLayout(null)
    setError(false)
    void (async () => {
      await window.document.fonts.load(
        '500 9.5pt "Honsen Document"',
        '中文 éèêàçùœ 0123456789',
      )
      await window.document.fonts.ready
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      )
      const node = measure.current
      if (!node || cancelled) return
      await Promise.all(
        Array.from(node.querySelectorAll('img')).map((img) => img.decode()),
      )
      const read = (): MeasuredLayout => ({
        capacity:
          node
            .querySelector<HTMLElement>('.formal-page-content')!
            .getBoundingClientRect().height -
          parseFloat(
            getComputedStyle(node.querySelector('.formal-page-content')!)
              .paddingTop,
          ) -
          parseFloat(
            getComputedStyle(node.querySelector('.formal-page-content')!)
              .paddingBottom,
          ),
        metadata: node
          .querySelector<HTMLElement>('.print-metadata')!
          .getBoundingClientRect().height,
        tableHeader:
          node
            .querySelector<HTMLElement>('.print-materials thead')!
            .getBoundingClientRect().height + 2,
        rows: Array.from(
          node.querySelectorAll('.print-materials tbody tr'),
        ).map((r) => r.getBoundingClientRect().height + 0.2),
        summary:
          node
            .querySelector<HTMLElement>('.print-settlement')!
            .getBoundingClientRect().height + 3,
      })
      let metrics = read()
      let density: 'standard' | 'dense' | 'compact' = 'standard'
      if (!fitsSinglePage(metrics)) {
        node.classList.add('print-dense')
        metrics = read()
        density = 'dense'
        if (!fitsSinglePage(metrics)) {
          node.classList.add('print-compact')
          metrics = read()
          density = 'compact'
        }
      }
      const pages = paginateMeasured(metrics)
      if (!cancelled) setLayout({ pages, density })
    })().catch(() => {
      if (!cancelled) setError(true)
    })
    return () => {
      cancelled = true
    }
  }, [doc, language])
  const renderPage = (page: PrintPage, index: number, total: number) => (
    <article
      className={`formal-print-sheet ${layout?.density === 'compact' ? 'print-dense print-compact' : layout?.density === 'dense' ? 'print-dense' : ''}`}
      key={index}
    >
      <Header doc={doc} language={language} index={index + 1} total={total} />
      <div className="formal-page-content">
        {page.metadata && <Metadata doc={doc} language={language} />}
        {page.rows.length > 0 && (
          <MaterialTable doc={doc} language={language} rows={page.rows} />
        )}
        {page.summary && <Settlement doc={doc} language={language} />}
      </div>
      <footer className="formal-document-footer">
        HONSEN Procure · {doc.documentType} · {doc.formalDocumentNo}
        <span>{pageNumber(index + 1, total)}</span>
      </footer>
    </article>
  )
  if (error)
    return (
      <div data-layout-error role="alert">
        A4 layout exceeds readable limits / 排版超出可读范围
      </div>
    )
  return (
    <div
      data-layout-ready={layout ? 'true' : undefined}
      className="print-engine"
      style={variables}
    >
      <style>{`@page honsen-formal { size: ${tokens.paperSize} ${tokens.orientation}; margin: ${tokens.margins.top}mm ${tokens.margins.right}mm ${tokens.margins.bottom}mm ${tokens.margins.left}mm; @top-left { content: ''; } @top-center { content: ''; } @top-right { content: ''; } @bottom-left { content: ''; } @bottom-center { content: ''; } @bottom-right { content: ''; } } .print-dense { --print-summary-padding: ${tokens.compact.summaryCellPadding}mm; --print-header: ${tokens.compact.headerHeight}mm; --print-gap: ${tokens.compact.sectionGap}mm; --print-padding: ${tokens.compact.tableCellPadding}mm; } .print-compact { --print-primary: ${tokens.compact.primaryFontSize}pt; --print-line-height: ${tokens.compact.lineHeight}; }`}</style>
      {layout ? (
        layout.pages.map((p, i) => renderPage(p, i, layout.pages.length))
      ) : (
        <div ref={measure} className="print-measure">
          <article className="formal-print-sheet">
            <Header doc={doc} language={language} index={1} total={1} />
            <div className="formal-page-content">
              <Metadata doc={doc} language={language} />
              <MaterialTable
                doc={doc}
                language={language}
                rows={doc.lines.map((_, i) => i)}
              />
              <Settlement doc={doc} language={language} />
            </div>
            <footer className="formal-document-footer">Page 1 / 1</footer>
          </article>
        </div>
      )}
    </div>
  )
}
