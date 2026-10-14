import { Alert, Button, Card, Input } from 'antd'
import { useState } from 'react'
import type { ReceiptApi, ReceiptAttachmentView } from '../lib/receipt-api'

type ReceiptLine = {
  id: string
  materialName: string
  unit: string
  orderedQuantity: string
}

type ReceiptPanelProps = {
  api: ReceiptApi
  orderId: string
  receiverId: string
  lines: ReceiptLine[]
  initialStatus?: string
  onChanged?: () => void
}

export function ReceiptPanel({
  api,
  orderId,
  receiverId,
  lines,
  initialStatus,
  onChanged,
}: ReceiptPanelProps) {
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(lines.map((line) => [line.id, ''])),
  )
  const [overReason, setOverReason] = useState('')
  const [closeReason, setCloseReason] = useState('')
  const [status, setStatus] = useState(
    initialStatus === 'executing'
      ? '采购执行中'
      : initialStatus === 'receiving'
        ? '收货中'
        : '已发送供应商',
  )
  const [message, setMessage] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ReceiptAttachmentView[]>([])

  async function record() {
    const items = lines
      .filter((line) => quantities[line.id].trim())
      .map((line) => ({
        orderItemId: line.id,
        quantity: quantities[line.id],
        unit: line.unit,
      }))
    if (!items.length) {
      setMessage('至少填写一条实收数量。')
      return
    }
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
      setStatus(
        receipt.workflowStatus === 'completed'
          ? '已完成'
          : receipt.workflowStatus === 'receiving'
            ? '收货中'
            : '已发送供应商',
      )
      setReceiptId(receipt.id)
      setAttachments([])
      setMessage(`收货已登记，共 ${receipt.receivedItemCount} 条明细。`)
      onChanged?.()
    } catch {
      setMessage('收货失败：超收必须填写原因，且订单必须处于可收货状态。')
    }
  }

  async function addAttachment() {
    if (!receiptId) return
    try {
      const attachment = await api.chooseReceiptAttachment(receiptId)
      if (!attachment) return
      setAttachments(await api.listReceiptAttachments(receiptId))
      setMessage(`已将 ${attachment.originalName} 归档到本机，联网后自动同步。`)
      onChanged?.()
    } catch {
      setMessage('附件归档失败：请检查文件类型、容量、收货权限和项目授权。')
    }
  }

  async function closeWithConditions() {
    if (!closeReason.trim()) {
      setMessage('有条件完成原因必填。')
      return
    }
    try {
      await api.closeSupplierOrderWithConditions(orderId, closeReason.trim())
      setStatus('已完成（有条件）')
      setMessage('订单已按有条件完成关闭，原因已写入审计。')
      onChanged?.()
    } catch {
      setMessage('关闭失败：订单必须处于可有条件关闭的状态。')
    }
  }

  return (
    <Card className="card" title="收货登记">
      <p>
        当前状态：<strong aria-label="收货状态">{status}</strong>
      </p>
      {message ? <Alert title={message} type="info" showIcon /> : null}
      <div className="requisition-lines" aria-label="收货明细">
        {lines.map((line) => (
          <label className="requisition-line" key={line.id}>
            {line.materialName} · 订购 {line.orderedQuantity} {line.unit}
            <Input
              aria-label={`${line.materialName} 实收数量`}
              inputMode="decimal"
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
        超收原因
        <Input
          aria-label="超收原因"
          value={overReason}
          onChange={(event) => setOverReason(event.target.value)}
        />
      </label>
      <Button type="primary" onClick={() => void record()}>
        登记收货
      </Button>
      {receiptId ? (
        <section aria-label="收货附件">
          <Button onClick={() => void addAttachment()}>补充收货附件</Button>
          <ul>
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                {attachment.originalName} ·{' '}
                {attachment.uploadState === 'uploaded' ? '已同步' : '待同步'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <hr />
      <label>
        有条件完成原因
        <Input
          aria-label="有条件完成原因"
          value={closeReason}
          onChange={(event) => setCloseReason(event.target.value)}
        />
      </label>
      <Button onClick={() => void closeWithConditions()}>
        按有条件完成关闭
      </Button>
    </Card>
  )
}
