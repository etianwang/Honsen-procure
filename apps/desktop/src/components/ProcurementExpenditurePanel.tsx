import { Alert, Button, Card, Input, Select } from 'antd'
import { useState } from 'react'
import type { ProcurementExpenditureApi } from '../lib/procurement-expenditure-api'

export function ProcurementExpenditurePanel({ api, orderId, currency, summary, onChanged }: { api: ProcurementExpenditureApi; orderId: string; currency: string; summary: { payableMinor: string; paidMinor: string; remainingMinor: string; overpaidMinor: string; status: string; records: { id: string; payeeName: string; amountMinor: string; paymentDate: string; paymentType: string; status: string }[] }; onChanged?: () => void }) {
  const [amountMinor, setAmountMinor] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [paymentType, setPaymentType] = useState<'advance' | 'progress' | 'final' | 'other'>('progress')
  const [message, setMessage] = useState<string | null>(null)
  async function record() {
    try { await api.record({ id: crypto.randomUUID(), orderId, payeeName, currency, amountMinor, paymentDate: new Date().toISOString().slice(0, 10), paymentType, paymentMethod: 'other', voucherReference: null, notes: null }); setMessage('实际付款已登记，等待同步确认。'); setAmountMinor(''); onChanged?.() } catch { setMessage('付款登记失败：请填写收款方和正整数金额，并确认订单、币种和授权。') }
  }
  return <Card className="card" title="实际付款"><p className="muted">应付 {summary.payableMinor} · 累计实付 {summary.paidMinor} · 尚未支付 {summary.remainingMinor} {currency} · {summary.status}</p>{summary.overpaidMinor !== '0' ? <Alert type="warning" title={`超额付款 ${summary.overpaidMinor} ${currency}`} /> : null}<ul>{summary.records.map((record) => <li key={record.id}>{record.paymentDate} · {record.paymentType} · {record.payeeName} · {record.status === 'reversed' ? '-' : ''}{record.amountMinor} {currency}</li>)}</ul><p className="muted">仅登记已发生付款；金额单位为 {currency} 的最小单位。未接入附件存储时，请在后续 T11 补充付款凭证。</p><Input aria-label="收款方" value={payeeName} onChange={(event) => setPayeeName(event.target.value)} placeholder="收款供应商/收款方" /><Input aria-label="实际付款金额（最小单位）" value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} placeholder="实际付款金额（整数最小单位）" inputMode="numeric" /><Select aria-label="付款类型" value={paymentType} onChange={setPaymentType} options={[{ value: 'advance', label: '预付款' }, { value: 'progress', label: '进度款' }, { value: 'final', label: '尾款' }, { value: 'other', label: '其他实际付款' }]} /><Button type="primary" onClick={() => void record()}>登记实际付款</Button>{message ? <Alert showIcon type="info" title={message} /> : null}</Card>
}
