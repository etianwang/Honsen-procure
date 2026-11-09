import { Alert, Button, Card, Input } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useUiLocale } from '../lib/ui-locale'
import { receiptText, type ReceiptMessage } from '../lib/receipt-messages'
import type { ReceiptApi } from '../lib/receipt-api'

type ReceiptLine = {
  id: string
  materialName: string
  unit: string
  orderedQuantity: string
  receivedQuantity: string
  remainingQuantity: string
}

type ReceiptPanelProps = {
  api: ReceiptApi
  orderId: string
  receiverId: string
  lines: ReceiptLine[]
  initialStatus?: string
  receiptScope?: 'supplier-child' | 'market-parent'
  onChanged?: () => void
}

function statusText(status: string): ReceiptMessage {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'completed_with_conditions':
      return '已完成（有条件）'
    case 'executing':
      return '采购执行中'
    case 'receiving':
      return '收货中'
    case 'sent':
      return '已发送供应商'
    case 'draft':
      return '草稿'
    default:
      return '未知收货状态'
  }
}

export function ReceiptPanel({
  api,
  orderId,
  receiverId,
  lines,
  initialStatus = 'sent',
  receiptScope = initialStatus === 'executing' || initialStatus === 'receiving'
    ? 'market-parent'
    : 'supplier-child',
  onChanged,
}: ReceiptPanelProps) {
  const { locale } = useUiLocale()
  const t = (key: ReceiptMessage) => receiptText(locale, key)
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(lines.map((line) => [line.id, ''])),
  )
  const [overReason, setOverReason] = useState('')
  const [closeReason, setCloseReason] = useState('')
  const [status, setStatus] = useState(initialStatus)
  useEffect(() => setStatus(initialStatus), [initialStatus])
  const allowed =
    receiptScope === 'supplier-child'
      ? status === 'sent'
      : status === 'executing' || status === 'receiving'
  const [message, setMessage] = useState<ReceiptMessage | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('error')
  const [receivedCount, setReceivedCount] = useState(0)
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)

  async function record() {
    if (submitting.current || !allowed) return
    setMessage(null)
    const items = lines
      .filter((line) => quantities[line.id].trim())
      .map((line) => ({
        orderItemId: line.id,
        quantity: quantities[line.id],
        unit: line.unit,
      }))
    if (!items.length) {
      setMessageType('error')
      setMessage('至少填写一条实收数量。')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      const receipt = await api.recordReceipt({
        id: crypto.randomUUID(),
        orderId,
        receiverId,
        receivedAt: new Date().toISOString().slice(0, 10),
        overReceiptReason: overReason.trim() || null,
        attachmentIds: [],
        items,
      })
      setStatus(receipt.workflowStatus)
      setReceivedCount(receipt.receivedItemCount)
      setQuantities(Object.fromEntries(lines.map((line) => [line.id, ''])))
      setMessageType('success')
      setMessage('收货已登记，共 {count} 条明细。')
      onChanged?.()
    } catch {
      setMessageType('error')
      setMessage('收货失败：超收必须填写原因，且订单必须处于可收货状态。')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  async function closeWithConditions() {
    if (submitting.current || !allowed) return
    setMessage(null)
    if (!closeReason.trim()) {
      setMessageType('error')
      setMessage('有条件完成原因必填。')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      await api.closeSupplierOrderWithConditions(orderId, closeReason.trim())
      setStatus('completed_with_conditions')
      setMessageType('success')
      setMessage('订单已按有条件完成关闭，原因已写入审计。')
      onChanged?.()
    } catch {
      setMessageType('error')
      setMessage('关闭失败：订单必须处于可有条件关闭的状态。')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <Card className="card" title={t('收货登记')}>
      <p>
        {t('当前状态')}：
        <strong aria-label={t('收货状态')}>{t(statusText(status))}</strong>
      </p>
      {!allowed && <p>{t('当前订单状态不允许登记收货或有条件完成。')}</p>}
      {busy && (
        <Alert
          role="status"
          type="info"
          title={
            locale === 'zh'
              ? '正在保存，请稍候…'
              : locale === 'fr'
                ? 'Enregistrement en cours…'
                : 'Saving, please wait…'
          }
          showIcon
        />
      )}
      {message ? (
        <Alert
          title={t(message).replace('{count}', String(receivedCount))}
          type={messageType}
          role={messageType === 'error' ? 'alert' : 'status'}
          showIcon
        />
      ) : null}
      <div className="requisition-lines" aria-label={t('收货明细')}>
        {lines.map((line) => (
          <label className="requisition-line" key={line.id}>
            {line.materialName} · {t('订购')} {line.orderedQuantity} {line.unit}{' '}
            ·{t('累计实收')} {line.receivedQuantity} {line.unit} · {t('待收')}{' '}
            {line.remainingQuantity} {line.unit}
            <Input
              aria-label={`${line.materialName} ${t('实收数量')}`}
              inputMode="decimal"
              disabled={busy || !allowed}
              value={quantities[line.id]}
              onChange={(event) =>
                setQuantities((current) => ({
                  ...current,
                  [line.id]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <label>
        {t('超收原因')}
        <Input
          aria-label={t('超收原因')}
          disabled={busy || !allowed}
          value={overReason}
          onChange={(event) => setOverReason(event.target.value)}
        />
      </label>
      <Button
        type="primary"
        aria-label={t('登记收货')}
        aria-busy={busy}
        disabled={busy || !allowed}
        loading={busy}
        onClick={() => void record()}
      >
        {t('登记收货')}
      </Button>
      <hr />
      <label>
        {t('有条件完成原因')}
        <Input
          aria-label={t('有条件完成原因')}
          disabled={busy || !allowed}
          value={closeReason}
          onChange={(event) => setCloseReason(event.target.value)}
        />
      </label>
      <Button
        aria-label={t('按有条件完成关闭')}
        aria-busy={busy}
        disabled={busy || !allowed}
        loading={busy}
        onClick={() => void closeWithConditions()}
      >
        {t('按有条件完成关闭')}
      </Button>
    </Card>
  )
}
