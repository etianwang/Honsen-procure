import { useUiLocale } from '../lib/ui-locale'
import { historyText } from '../lib/history-locale'
import {
  documentSchema,
  formatPrintMoney,
  type FormalPrintDocument,
} from '../lib/formal-print-api'
import { useState } from 'react'
import { Alert, Button } from 'antd'

export function FormalPrintPreview({ orderId }: { orderId: string }) {
  const { locale } = useUiLocale()
  const t = (message: Parameters<typeof historyText>[1]) =>
    historyText(locale, message)
  const [document, setDocument] = useState<FormalPrintDocument | null>(null)
  const [failed, setFailed] = useState(false)
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
        <article className="formal-print-sheet">
          <style>{`@media print { body * { visibility: hidden; } .formal-print-sheet, .formal-print-sheet * { visibility: visible; } .formal-print-sheet { position: absolute; left: 0; top: 0; width: 100%; } .formal-print-action { display: none; } thead { display: table-header-group; } tr { break-inside: avoid; } } @page { size: A4; margin: 15mm; } .formal-print-sheet table { width: 100%; border-collapse: collapse; } .formal-print-sheet th, .formal-print-sheet td { border: 1px solid #888; padding: 6px; overflow-wrap: anywhere; }`}</style>
          <Button
            className="formal-print-action"
            onClick={() => window.print()}
          >
            {t('打印 / Imprimer · PDF')}
          </Button>
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
            税费 / Taxes:{' '}
            {formatPrintMoney(document.taxMinor, document.currency)}
          </p>
          <p>
            合计 / Total:{' '}
            {formatPrintMoney(document.totalMinor, document.currency)}
          </p>
          <p>申请人签字 / Signature demandeur: ____________________</p>
          <p>审批人签字 / Signature approbateur: ____________________</p>
        </article>
      )}
    </section>
  )
}
