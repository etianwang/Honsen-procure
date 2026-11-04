import { useUiLocale } from '../lib/ui-locale'
import { historyText } from '../lib/history-locale'
import {
  documentSchema,
  formatPrintMoney,
  type FormalPrintDocument,
} from '../lib/formal-print-api'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './FormalPrintPreview.css'

let activePrintOwner: symbol | null = null

function FormalDocumentSheet({ document }: { document: FormalPrintDocument }) {
  const english = document.languagePair === 'zh_en'
  const label = (fr: string, en: string) => (english ? en : fr)
  return (
    <article className="formal-print-sheet">
      <h2>
        {document.documentType} · {document.formalDocumentNo}
      </h2>
      <p>
        项目 / {label('Projet', 'Project')}: {document.projectId} ·{' '}
        {document.site}
      </p>
      <p>日期 / Date: {document.orderDate}</p>
      <p>
        交货地址 / {label('Livraison', 'Delivery')}: {document.deliveryAddress}
      </p>
      {document.supplier?.name && (
        <p>
          供应商 / {label('Fournisseur', 'Supplier')}: {document.supplier.name}{' '}
          · {document.supplier.contactName} · {document.supplier.address} ·{' '}
          {document.supplier.phone} · {document.supplier.email}
        </p>
      )}
      <p>
        预计交期 / {label('Date prévue', 'Expected delivery')}:{' '}
        {document.expectedDeliveryDate ?? '—'}
      </p>
      <p>
        条款及备注 / {label('Conditions et notes', 'Terms and notes')}:{' '}
        {document.notes ?? '—'}
      </p>
      {document.selfApproved && (
        <p>自行审批 / {label('Auto-approbation', 'Self-approved')}</p>
      )}
      <table>
        <thead>
          <tr>
            <th>材料 / {label('Désignation', 'Description')}</th>
            <th>数量 / {label('Quantité', 'Quantity')}</th>
            <th>单位 / {label('Unité', 'Unit')}</th>
            <th>单价 / {label('Prix unitaire', 'Unit price')}</th>
            <th>金额 / {label('Montant', 'Amount')}</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line, index) => (
            <tr key={index}>
              <td>
                {line.nameZh}
                <br />
                {english ? line.nameEn : line.nameFr}
                <br />
                {line.model} · {line.specification}
              </td>
              <td>{line.quantity}</td>
              <td>{line.unit}</td>
              <td>
                {formatPrintMoney(line.unitPriceMinor, document.currency)}
              </td>
              <td>
                {formatPrintMoney(line.lineTotalMinor, document.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        小计 / {label('Sous-total', 'Subtotal')}:{' '}
        {formatPrintMoney(document.subtotalMinor, document.currency)}
      </p>
      <p>
        行折扣 / {label('Remise des lignes', 'Line discounts')}:{' '}
        {formatPrintMoney(document.lineDiscountMinor, document.currency)}
      </p>
      <p>
        订单折扣 / {label('Remise commande', 'Order discount')}:{' '}
        {formatPrintMoney(document.orderDiscountMinor, document.currency)}
      </p>
      <p>
        运费 / {label('Transport', 'Freight')}:{' '}
        {formatPrintMoney(document.freightMinor, document.currency)}
      </p>
      <p>
        税率 / {label('Taxe (bps)', 'Tax (bps)')}: {document.taxRateBasisPoints}
      </p>{' '}
      <p>
        税费 / {label('Taxes', 'Tax')}:{' '}
        {formatPrintMoney(document.taxMinor, document.currency)}
      </p>
      <p>
        合计 / Total: {formatPrintMoney(document.totalMinor, document.currency)}
      </p>
      <p>
        申请人签字 / {label('Signature demandeur', 'Applicant signature')}:
        ____________________
      </p>
      <p>
        审批人签字 / {label('Signature approbateur', 'Approver signature')}:
        ____________________
      </p>
    </article>
  )
}
import { Alert, Button } from 'antd'

export function FormalPrintPreview({ orderId }: { orderId: string }) {
  const { locale } = useUiLocale()
  const t = (message: Parameters<typeof historyText>[1]) =>
    historyText(locale, message)
  const [document, setDocument] = useState<FormalPrintDocument | null>(null)
  const [failed, setFailed] = useState(false)
  const [printSnapshot, setPrintSnapshot] =
    useState<FormalPrintDocument | null>(null)
  const printOwner = useRef(Symbol('formal-print'))
  useEffect(() => {
    const owner = printOwner.current
    return () => {
      if (activePrintOwner === owner) {
        activePrintOwner = null
        window.document.body.classList.remove('honsen-printing-formal')
      }
    }
  }, [])
  function requestPrint() {
    if (!document || activePrintOwner !== null) return
    activePrintOwner = printOwner.current
    setPrintSnapshot(document)
  }
  useEffect(() => {
    if (!printSnapshot) return
    const owner = printOwner.current
    let cancelled = false
    let frame = 0
    const finish = () => setPrintSnapshot(null)
    window.addEventListener('afterprint', finish)
    window.document.body.classList.add('honsen-printing-formal')
    void window.document.fonts.ready.then(() => {
      if (cancelled) return
      frame = window.requestAnimationFrame(() => {
        try {
          window.print()
        } catch {
          setFailed(true)
          finish()
        }
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', finish)
      if (activePrintOwner === owner) {
        window.document.body.classList.remove('honsen-printing-formal')
        activePrintOwner = null
      }
    }
  }, [printSnapshot])
  async function preview() {
    setDocument(null)
    setFailed(false)
    try {
      const invoke = (
        window as Window & {
          __TAURI__?: {
            core?: { invoke?: <T>(command: string, args: object) => Promise<T> }
          }
        }
      ).__TAURI__?.core?.invoke
      if (!invoke) throw new Error('Desktop unavailable')
      setDocument(
        documentSchema.parse(
          await invoke<unknown>('get_formal_print_document', { orderId }),
        ),
      )
    } catch {
      setFailed(true)
    }
  }
  return (
    <>
      <section aria-label={t('正式单据打印预览')}>
        <Button onClick={() => void preview()}>
          {t('正式单据预览 / Aperçu')}
        </Button>
        {failed && (
          <Alert
            type="error"
            title={t('无法预览：请检查授权、正式签发状态及冻结文档翻译。')}
          />
        )}
        {document && (
          <div>
            <Button className="formal-print-action" onClick={requestPrint}>
              {t('打印 / Imprimer · PDF')}
            </Button>
            <FormalDocumentSheet document={document} />
          </div>
        )}
      </section>
      {printSnapshot &&
        createPortal(
          <div className="honsen-print-root">
            <FormalDocumentSheet document={printSnapshot} />
          </div>,
          window.document.body,
        )}
    </>
  )
}
