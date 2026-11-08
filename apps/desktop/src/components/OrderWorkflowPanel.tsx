import { useUiLocale, type UiLocale } from '../lib/ui-locale'
import {
  workflowText,
  commentSentText,
  type WorkflowMessage,
} from '../lib/workflow-messages'
import { Alert, Button, Card, Input, Space } from 'antd'
import { Check, MessageSquare, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  OrderAuditView,
  OrderCommentView,
  WorkflowApi,
} from '../lib/workflow-api'

type OrderWorkflowPanelProps = {
  api: WorkflowApi
  orderId: string
  canApprove: boolean
  workflowStatus?: string
  onChanged?: () => void
  onRejected?: () => void
}

export function OrderWorkflowPanel({
  api,
  orderId,
  canApprove,
  workflowStatus = 'pending_confirmation',
  onChanged,
  onRejected,
}: OrderWorkflowPanelProps) {
  const { locale } = useUiLocale()
  const t = (key: WorkflowMessage) => workflowText(locale, key)
  const [status, setStatus] = useState(workflowStatus)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<OrderCommentView[]>([])
  const [audits, setAudits] = useState<OrderAuditView[]>([])
  const requestPending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [messageType, setMessageType] = useState<'success' | 'error'>('error')
  const [message, setMessage] = useState<WorkflowMessage | number | null>(null)

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
    if (requestPending.current) return
    setMessageType('error')
    setMessage(null)
    requestPending.current = true
    setBusy(true)
    setMessage(null)
    try {
      await api.confirmRequisition(orderId)
      setMessageType('success')
      setStatus('confirmed')
      setMessage('订单已确认，审批记录已写入审计。')
      onChanged?.()
    } catch {
      setMessageType('error')
      setMessage('确认失败：不能确认自己的订单或当前状态不允许确认。')
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }

  async function reject() {
    if (requestPending.current) return
    setMessageType('error')
    setMessage(null)
    if (!reason.trim()) {
      setMessage('驳回原因必填。')
      return
    }
    requestPending.current = true
    setBusy(true)
    setMessage(null)
    try {
      await api.rejectRequisition(orderId, reason.trim())
      setMessageType('success')
      setStatus('rejected')
      setMessage('订单已驳回，申请人可修改后重新提交。')
      onRejected?.()
      onChanged?.()
    } catch {
      setMessageType('error')
      setMessage('驳回失败，请稍后重试。')
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }

  async function sendComment() {
    if (requestPending.current) return
    setMessageType('error')
    setMessage(null)
    if (!comment.trim()) return
    requestPending.current = true
    setBusy(true)
    setMessage(null)
    try {
      const saved = await api.addOrderComment(orderId, comment.trim())
      setMessageType('success')
      setComments((current) => [...current, saved])
      setComment('')
      setMessage(saved.notificationCount)
    } catch {
      setMessageType('error')
      setMessage('评论发送失败。')
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }

  return (
    <Card className="card" title={t('审批与内部留言')}>
      <p>
        {t('当前状态：')}{' '}
        <strong aria-label={t('审批状态')}>
          {status === 'pending_confirmation'
            ? t('待确认')
            : status === 'confirmed'
              ? t('已确认')
              : status === 'rejected'
                ? t('已驳回')
                : t(
                    (
                      {
                        draft: '草稿',
                        approved: '已批准',
                        formally_issued: '已正式签发',
                        executing: '执行中',
                        receiving: '收货中',
                        completed: '已完成',
                        completed_with_conditions: '有条件完成',
                        cancelled: '已取消',
                      } as Record<string, WorkflowMessage>
                    )[status] ?? '未知状态',
                  )}
        </strong>
      </p>
      {message !== null ? (
        <Alert
          title={
            typeof message === 'number'
              ? commentSentText(locale, message)
              : t(message)
          }
          type={messageType}
          role={messageType === 'error' ? 'alert' : 'status'}
          showIcon
        />
      ) : null}
      {canApprove && status === 'pending_confirmation' ? (
        <Space className="workflow-actions" wrap>
          <Button
            disabled={busy}
            loading={busy}
            type="primary"
            icon={<Check size={16} />}
            onClick={() => void confirm()}
          >
            {t('确认订单')}
          </Button>
          <label>
            {t('驳回原因')}
            <Input
              disabled={busy}
              aria-label={t('驳回原因')}
              placeholder={t('填写驳回原因（必填）')}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            disabled={busy}
            loading={busy}
            danger
            icon={<X size={16} />}
            onClick={() => void reject()}
          >
            {t('驳回订单')}
          </Button>
        </Space>
      ) : null}
      <section className="workflow-audits" aria-label={t('修改留痕')}>
        <h3>{t('修改留痕')}</h3>
        {audits
          .filter((item) => item.action === 'confirmed_revised')
          .map((item) => (
            <article className="workflow-audit" key={item.id}>
              <p>
                {t('修改原因：')}
                {item.reason}
              </p>
              <ul aria-label={t('字段差异')}>
                {changedFields(item.previousJson, item.nextJson, locale).map(
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
      <section className="workflow-audits" aria-label={t('内部报价明细')}>
        <h3>{t('内部报价明细')}</h3>
        {ownerPricingLines(audits, locale).map((line) => (
          <article className="workflow-audit" key={line.id}>
            <p>
              {line.material} ·{' '}
              {line.source === 'manual_reference'
                ? t('手工参考报价')
                : t('目录报价')}
            </p>
            {line.source === 'manual_reference' ? (
              <p className="owner-manual-reference">
                {t('手工例外：')}
                {line.reason}
              </p>
            ) : null}
            {line.revisionReason !== '—' ? (
              <p>
                {t('报价修订原因：')}
                {line.revisionReason}
              </p>
            ) : null}
            <p>
              {t('供应商：')}
              {line.supplier} · {t('原始价格：')}
              {line.sourcePrice} {line.currency} · {t('汇率：')}
              {line.rate}
            </p>
            <p>
              {t('换算参考价：')}
              {line.converted} · {t('加价：')}
              {line.markup} · {t('最终价格：')}
              {line.final}
            </p>
          </article>
        ))}
      </section>
      <section className="workflow-comments" aria-label={t('内部评论')}>
        <h3>{t('内部评论')}</h3>
        {comments.map((item) => (
          <article className="workflow-comment" key={item.id}>
            <MessageSquare size={15} aria-hidden="true" />
            <span>{item.body}</span>
          </article>
        ))}
        <label>
          {t('留言（支持 @某人）')}
          <Input.TextArea
            disabled={busy}
            aria-label={t('留言（支持 @某人）')}
            maxLength={4000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <Button
          disabled={busy}
          loading={busy}
          onClick={() => void sendComment()}
        >
          {t('发送评论')}
        </Button>
      </section>
    </Card>
  )
}

function ownerPricingLines(audits: OrderAuditView[], locale: UiLocale) {
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
          material: material?.nameZh ?? workflowText(locale, '材料'),
          supplier:
            supplier?.name ?? workflowText(locale, '手工参考价（无供应商）'),
          source: String(line.ownerQuoteSource),
          reason: String(line.ownerManualReferenceReason ?? '—'),
          revisionReason: String(audit.reason ?? '—'),
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

const labels: Record<string, WorkflowMessage> = {
  currency: '币种',
  deliveryAddress: '交付地址',
  expectedDeliveryDate: '期望到货日期',
  notes: '备注',
  taxRateBasisPoints: '税率',
  manualStampDutyMinor: '印花税（手填）',
  totalMinor: '订单总额',
  lines: '采购明细',
}

function changedFields(
  previousJson: string | null,
  nextJson: string | null,
  locale: UiLocale,
) {
  try {
    const previous = JSON.parse(previousJson ?? '{}') as Record<string, unknown>
    const next = JSON.parse(nextJson ?? '{}') as Record<string, unknown>
    return Object.keys(labels)
      .filter(
        (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
      )
      .map((key) => ({
        label: workflowText(locale, labels[key]!),
        before: displayValue(previous[key], locale),
        after: displayValue(next[key], locale),
      }))
  } catch {
    return []
  }
}

function displayValue(value: unknown, locale: UiLocale) {
  if (value === null || value === undefined || value === '')
    return workflowText(locale, '（空）')
  return Array.isArray(value)
    ? locale === 'zh'
      ? '共 ' + value.length + ' 条'
      : locale === 'en'
        ? value.length + ' items'
        : value.length + ' éléments'
    : String(value)
}
