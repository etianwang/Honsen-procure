import { Alert, Button, Card, Input, Space } from 'antd'
import { Check, MessageSquare, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  OrderAuditView,
  OrderCommentView,
  WorkflowApi,
} from '../lib/workflow-api'

type OrderWorkflowPanelProps = {
  api: WorkflowApi
  orderId: string
  canApprove: boolean
}

export function OrderWorkflowPanel({
  api,
  orderId,
  canApprove,
}: OrderWorkflowPanelProps) {
  const [status, setStatus] = useState('待确认')
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<OrderCommentView[]>([])
  const [audits, setAudits] = useState<OrderAuditView[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api
      .listOrderComments(orderId)
      .then(setComments)
      .catch(() => undefined)
    api
      .listOrderAudits(orderId)
      .then(setAudits)
      .catch(() => undefined)
  }, [api, orderId])

  async function confirm() {
    try {
      await api.confirmRequisition(orderId)
      setStatus('已确认')
      setMessage('订单已确认，审批记录已写入审计。')
    } catch {
      setMessage('确认失败：不能确认自己的订单或当前状态不允许确认。')
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setMessage('驳回原因必填。')
      return
    }
    try {
      await api.rejectRequisition(orderId, reason.trim())
      setStatus('已驳回')
      setMessage('订单已驳回，申请人可修改后重新提交。')
    } catch {
      setMessage('驳回失败，请稍后重试。')
    }
  }

  async function sendComment() {
    if (!comment.trim()) return
    try {
      const saved = await api.addOrderComment(orderId, comment.trim())
      setComments((current) => [...current, saved])
      setComment('')
      setMessage(
        `评论已发送，已通知 ${saved.notificationCount} 位被提及成员；发送后不可编辑或删除。`,
      )
    } catch {
      setMessage('评论发送失败。')
    }
  }

  return (
    <Card className="card" title="审批与内部留言">
      <p>
        当前状态： <strong aria-label="审批状态">{status}</strong>
      </p>
      {message ? <Alert title={message} type="info" showIcon /> : null}
      {canApprove && status === '待确认' ? (
        <Space className="workflow-actions" wrap>
          <Button
            type="primary"
            icon={<Check size={16} />}
            onClick={() => void confirm()}
          >
            确认订单
          </Button>
          <Input
            aria-label="驳回原因"
            placeholder="填写驳回原因（必填）"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button danger icon={<X size={16} />} onClick={() => void reject()}>
            驳回订单
          </Button>
        </Space>
      ) : null}
      <section className="workflow-audits" aria-label="修改留痕">
        <h3>修改留痕</h3>
        {audits
          .filter((item) => item.action === 'confirmed_revised')
          .map((item) => (
            <article className="workflow-audit" key={item.id}>
              <p>修改原因：{item.reason}</p>
              <ul aria-label="字段差异">
                {changedFields(item.previousJson, item.nextJson).map(
                  (field) => (
                    <li className="workflow-change" key={field.label}>
                      <strong>{field.label}</strong>：{field.before} →{' '}
                      {field.after}
                    </li>
                  ),
                )}
              </ul>
            </article>
          ))}
      </section>
      <section className="workflow-audits" aria-label="内部报价明细">
        <h3>内部报价明细</h3>
        {ownerPricingLines(audits).map((line) => (
          <article className="workflow-audit" key={line.id}>
            <p>
              {line.material} ·{' '}
              {line.source === 'manual_reference' ? '手工参考报价' : '目录报价'}
            </p>
            {line.source === 'manual_reference' ? (
              <p className="owner-manual-reference">手工例外：{line.reason}</p>
            ) : null}
            <p>
              供应商：{line.supplier} · 原始价格：{line.sourcePrice}{' '}
              {line.currency} · 汇率：{line.rate}
            </p>
            <p>
              换算参考价：{line.converted} · 加价：{line.markup} · 最终价格：
              {line.final}
            </p>
          </article>
        ))}
      </section>
      <section className="workflow-comments" aria-label="内部评论">
        <h3>内部评论</h3>
        {comments.map((item) => (
          <article className="workflow-comment" key={item.id}>
            <MessageSquare size={15} aria-hidden="true" />
            <span>{item.body}</span>
          </article>
        ))}
        <label>
          留言（支持 @某人）
          <Input.TextArea
            aria-label="留言（支持 @某人）"
            maxLength={4000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <Button onClick={() => void sendComment()}>发送评论</Button>
      </section>
    </Card>
  )
}

function ownerPricingLines(audits: OrderAuditView[]) {
  const audit = [...audits]
    .reverse()
    .find((item) => item.action === 'owner_pricing_saved')
  if (!audit?.nextJson) return [] as Array<Record<string, string>>
  try {
    const snapshot = JSON.parse(audit.nextJson) as {
      lines?: Array<Record<string, unknown>>
    }
    return (snapshot.lines ?? [])
      .filter((line) => line.ownerQuoteSource)
      .map((line) => {
        const material = line.material as { nameZh?: string } | undefined
        const supplier = line.supplier as { name?: string } | undefined
        return {
          id: String(line.id),
          material: material?.nameZh ?? '材料',
          supplier: supplier?.name ?? '手工参考价（无供应商）',
          source: String(line.ownerQuoteSource),
          reason: String(line.ownerManualReferenceReason ?? '—'),
          sourcePrice: String(line.ownerSourceUnitPriceMinor ?? '—'),
          currency: String(line.currency ?? '—'),
          rate: String(line.ownerLockedExchangeRateDecimal ?? '—'),
          converted: String(line.ownerConvertedReferenceUnitMinor ?? '—'),
          markup: String(line.ownerMarkupJson ?? '—'),
          final: String(line.ownerFinalUnitPriceMinor ?? '—'),
        }
      })
  } catch {
    return []
  }
}

const labels: Record<string, string> = {
  currency: '币种',
  deliveryAddress: '交付地址',
  expectedDeliveryDate: '期望到货日期',
  notes: '备注',
  taxRateBasisPoints: '税率',
  totalMinor: '订单总额',
  lines: '采购明细',
}

function changedFields(previousJson: string | null, nextJson: string | null) {
  try {
    const previous = JSON.parse(previousJson ?? '{}') as Record<string, unknown>
    const next = JSON.parse(nextJson ?? '{}') as Record<string, unknown>
    return Object.keys(labels)
      .filter(
        (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
      )
      .map((key) => ({
        label: labels[key],
        before: displayValue(previous[key]),
        after: displayValue(next[key]),
      }))
  } catch {
    return []
  }
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '（空）'
  return Array.isArray(value) ? `共 ${value.length} 条` : String(value)
}
