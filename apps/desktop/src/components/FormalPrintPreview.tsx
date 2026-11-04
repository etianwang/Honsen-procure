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
  return (
    <article className="formal-print-sheet">
      <h2>
        {document.documentType} · {document.formalDocumentNo}
      </h2>
      <p>
        项目 / Projet: {document.projectId} · {document.site}
      </p>
      <p>日期 / Date: {document.orderDate}</p>
      <p>交货地址 / Livraison: {document.deliveryAddress}</p>
      {document.supplier?.name && (
        <p>
          供应商 / Fournisseur: {document.supplier.name} ·{' '}
          {document.supplier.contactName} · {document.supplier.address} ·{' '}
          {document.supplier.phone} · {document.supplier.email}
        </p>
      )}
      <p>预计交期 / Date prévue: {document.expectedDeliveryDate ?? '—'}</p>
      <p>条款及备注 / Conditions et notes: {document.notes ?? '—'}</p>
      {document.selfApproved && <p>自行审批 / Auto-approbation</p>}
      <table>
        <thead>
          <tr>
            <th>材料 / Désignation</th>
            <th>数量 / Quantité</th>
            <th>单位 / Unité</th>
            <th>单价 / Prix unitaire</th>
            <th>金额 / Montant</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line, index) => (
            <tr key={index}>
              <td>
                {line.nameZh}
                <br />
                {line.nameFr}
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
        小计 / Sous-total:{' '}
        {formatPrintMoney(document.subtotalMinor, document.currency)}
      </p>
      <p>
        行折扣 / Remise des lignes:{' '}
        {formatPrintMoney(document.lineDiscountMinor, document.currency)}
      </p>
      <p>
        订单折扣 / Remise commande:{' '}
        {formatPrintMoney(document.orderDiscountMinor, document.currency)}
      </p>
      <p>
        运费 / Transport:{' '}
        {formatPrintMoney(document.freightMinor, document.currency)}
      </p>
      <p>税率 / Taxe (bps): {document.taxRateBasisPoints}</p>{' '}
      <p>
        税费 / Taxes: {formatPrintMoney(document.taxMinor, document.currency)}
      </p>
      <p>
        合计 / Total: {formatPrintMoney(document.totalMinor, document.currency)}
      </p>
      <p>申请人签字 / Signature demandeur: ____________________</p>
      <p>审批人签字 / Signature approbateur: ____________________</p>
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
            title={t('无法预览：请检查授权、正式签发状态及冻结中法翻译。')}
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
