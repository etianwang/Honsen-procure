import { Alert, Button, Card, Input, Modal, Select, Space } from 'antd'
import { useState } from 'react'
import type { UiLocale } from '@honsen/shared'
import type {
  ProcurementExpenditureApi,
  RecordProcurementExpenditureInput,
} from '../lib/procurement-expenditure-api'
import type { ProcurementPaymentSummary } from '../lib/procurement-execution-api'
import { paymentMessages } from '../lib/payment-messages'

type Props = {
  api: ProcurementExpenditureApi
  orderId: string
  currency: string
  summary: ProcurementPaymentSummary
  onChanged?: () => void
  locale?: UiLocale
}
export function ProcurementExpenditurePanel({
  api,
  orderId,
  currency,
  summary,
  onChanged,
  locale = 'zh-CN',
}: Props) {
  const t = paymentMessages[locale]
  const [amountMinor, setAmountMinor] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [paymentType, setPaymentType] =
    useState<RecordProcurementExpenditureInput['paymentType']>('progress')
  const [paymentMethod, setPaymentMethod] =
    useState<RecordProcurementExpenditureInput['paymentMethod']>('other')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reversalId, setReversalId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  async function record() {
    setBusy(true)
    try {
      await api.record({
        id: crypto.randomUUID(),
        orderId,
        payeeName,
        currency,
        amountMinor,
        paymentDate,
        paymentType,
        paymentMethod,
        voucherReference: null,
        notes: null,
      })
      setMessage(t.saved)
      setAmountMinor('')
      onChanged?.()
    } catch {
      setMessage(t.error)
    } finally {
      setBusy(false)
    }
  }
  async function reverse() {
    if (!reversalId || !reason.trim()) return
    setBusy(true)
    try {
      await api.reverse({
        id: crypto.randomUUID(),
        expenditureId: reversalId,
        reason,
      })
      setReversalId(null)
      setReason('')
      setMessage(t.reversed)
      onChanged?.()
    } catch {
      setMessage(t.error)
    } finally {
      setBusy(false)
    }
  }
  const corrected = new Set(
    summary.records.map((r) => r.correctsExpenditureId).filter(Boolean),
  )
  return (
    <Card className="card" title={t.title}>
      <p aria-live="polite">
        {t.payable} {summary.payableMinor} · {t.paid} {summary.paidMinor} ·{' '}
        {t.remaining} {summary.remainingMinor} {currency}
      </p>
      {summary.overpaidMinor !== '0' ? (
        <Alert
          type="warning"
          title={`${t.overpaid} ${summary.overpaidMinor} ${currency}`}
        />
      ) : null}
      <ul>
        {summary.records.map((record) => (
          <li key={record.id}>
            <Space wrap>
              <span>
                {record.paymentDate} · {record.payeeName} ·{' '}
                {record.status === 'reversed' ? '-' : ''}
                {record.amountMinor} {currency}
              </span>
              {record.status === 'recorded' && !corrected.has(record.id) ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setReversalId(record.id)
                    setReason('')
                  }}
                >
                  {t.reverse}
                </Button>
              ) : null}
              {record.status === 'recorded' && !record.voucherReference ? (
                <span>{t.warning}</span>
              ) : null}
            </Space>
          </li>
        ))}
      </ul>
      <p className="muted">{t.hint}</p>
      <Space wrap>
        <label>
          {t.payee}
          <Input
            aria-label={t.payee}
            value={payeeName}
            maxLength={255}
            onChange={(e) => setPayeeName(e.target.value)}
          />
        </label>
        <label>
          {t.amount}
          <Input
            aria-label={t.amount}
            value={amountMinor}
            inputMode="numeric"
            maxLength={19}
            onChange={(e) => setAmountMinor(e.target.value)}
          />
        </label>
        <label>
          {t.date}
          <Input
            aria-label={t.date}
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </label>
        <Select
          aria-label={t.type}
          value={paymentType}
          onChange={setPaymentType}
          options={(['advance', 'progress', 'final', 'other'] as const).map(
            (value) => ({ value, label: t[value] }),
          )}
        />
        <Select
          aria-label={t.method}
          value={paymentMethod}
          onChange={setPaymentMethod}
          options={(
            ['cash', 'bank_transfer', 'mobile_payment', 'other'] as const
          ).map((value) => ({ value, label: t[value] }))}
        />
        <Button
          type="primary"
          loading={busy}
          disabled={!/^[1-9]\d*$/.test(amountMinor) || !payeeName.trim()}
          onClick={() => void record()}
        >
          {t.record}
        </Button>
      </Space>
      {message ? (
        <Alert role="status" showIcon type="info" title={message} />
      ) : null}
      <Modal
        title={t.reverse}
        open={reversalId !== null}
        onCancel={() => {
          if (!busy) setReversalId(null)
        }}
        onOk={() => void reverse()}
        okText={t.confirm}
        cancelText={t.cancel}
        confirmLoading={busy}
        okButtonProps={{ disabled: !reason.trim() }}
      >
        <label>
          {t.reason}
          <Input.TextArea
            aria-label={t.reason}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </Modal>
    </Card>
  )
}
