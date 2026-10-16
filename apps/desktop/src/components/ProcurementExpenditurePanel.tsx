import { Alert, Button, Card, Input, Select } from 'antd'
import { useState } from 'react'
import type { ProcurementExpenditureApi } from '../lib/procurement-expenditure-api'

type Props = {
  api: ProcurementExpenditureApi
  orderId: string
  paymentHandlerId: string
  currency: string
}

export function ProcurementExpenditurePanel({
  api,
  orderId,
  paymentHandlerId,
  currency,
}: Props) {
  const [payeeName, setPayeeName] = useState('')
  const [amountMinor, setAmountMinor] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'bank_transfer' | 'mobile_payment' | 'other'
  >('cash')
  const [message, setMessage] = useState<string | null>(null)

  async function record() {
    if (!payeeName.trim() || !amountMinor.trim()) {
      setMessage('收款人和实际付款金额必填。')
      return
    }
    try {
      const payment = await api.recordProcurementExpenditure({
        id: crypto.randomUUID(),
        orderId,
        receiptId: null,
        counterpartyType: 'market_casual',
        supplierId: null,
        payeeName: payeeName.trim(),
        currency,
        amountMinor: amountMinor.trim(),
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod,
        paymentHandlerId,
        notes: null,
        voucherAttachmentIds: [],
      })
      setMessage(
        payment.voucherWarning
          ? '付款已登记；尚未附凭证，请后续补充。'
          : '付款已登记。',
      )
      setAmountMinor('')
    } catch {
      setMessage('付款失败：仅可在 Honsen 市场直采执行/收货期间登记有效金额。')
    }
  }

  return (
    <Card className="card" title="实际付款">
      {message ? <Alert title={message} type="info" showIcon /> : null}
      <label>
        收款人
        <Input
          aria-label="付款收款人"
          value={payeeName}
          onChange={(event) => setPayeeName(event.target.value)}
        />
      </label>
      <label>
        实际付款金额（最小货币单位）
        <Input
          aria-label="实际付款金额"
          inputMode="numeric"
          value={amountMinor}
          onChange={(event) => setAmountMinor(event.target.value)}
        />
      </label>
      <label>
        付款方式
        <Select
          aria-label="付款方式"
          value={paymentMethod}
          onChange={setPaymentMethod}
          options={[
            { value: 'cash', label: '现金' },
            { value: 'bank_transfer', label: '银行转账' },
            { value: 'mobile_payment', label: '移动支付' },
            { value: 'other', label: '其他' },
          ]}
        />
      </label>
      <Button type="primary" onClick={() => void record()}>
        登记付款
      </Button>
    </Card>
  )
}
