import { Alert, Button, Card, Input } from 'antd'
import { useEffect, useState } from 'react'
import type { SupplierView } from '../lib/catalog-api'
import type {
  ProcurementExpenditure,
  ProcurementExpenditureApi,
} from '../lib/procurement-expenditure-api'

type Props = {
  api: ProcurementExpenditureApi
  orderId: string
  handlerId: string
  primaryCurrency: string
  suppliers: SupplierView[]
}

export function ProcurementExpenditurePanel({
  api,
  orderId,
  handlerId,
  primaryCurrency,
  suppliers,
}: Props) {
  const [rows, setRows] = useState<ProcurementExpenditure[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [amountMinor, setAmountMinor] = useState('')
  const [currency, setCurrency] = useState(primaryCurrency)
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'bank_transfer' | 'mobile_payment' | 'other'
  >('cash')
  const [notes, setNotes] = useState('')
  const [correctionId, setCorrectionId] = useState<string | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [reversalReasons, setReversalReasons] = useState<
    Record<string, string>
  >({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    api
      .list(orderId)
      .then((value) => {
        if (mounted) setRows(value)
      })
      .catch(() => {
        if (mounted) setMessage('无法读取采购支出记录。')
      })
    return () => {
      mounted = false
    }
  }, [api, orderId])

  async function record() {
    if (busy) return
    if (
      !payeeName.trim() ||
      !/^[1-9][0-9]*$/.test(amountMinor) ||
      (correctionId !== null && !correctionReason.trim())
    ) {
      setMessage('请填写收款方、正整数金额；替换冲销记录还须填写原因。')
      return
    }
    setBusy(true)
    try {
      const value = await api.record({
        id: crypto.randomUUID(),
        orderId,
        receiptId: null,
        counterpartyType: supplierId ? 'registered_supplier' : 'market_casual',
        supplierId: supplierId || null,
        payeeName: payeeName.trim(),
        currency,
        amountMinor,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod,
        paymentHandlerId: handlerId,
        notes: notes.trim() || null,
        correctsExpenditureId: correctionId,
        correctionReason: correctionId ? correctionReason.trim() : null,
      })
      setRows((current) => [...current, value])
      setAmountMinor('')
      setCorrectionId(null)
      setCorrectionReason('')
      setMessage(
        '实际采购支出已登记；收货数量不受影响。凭证未上传，请随后补充。',
      )
    } catch {
      setMessage('支出登记失败，请检查订单状态、授权、收款方和金额。')
    } finally {
      setBusy(false)
    }
  }

  async function reverse(row: ProcurementExpenditure) {
    if (busy) return
    const reason = reversalReasons[row.id]?.trim()
    if (!reason) {
      setMessage('冲销原因必填。')
      return
    }
    setBusy(true)
    try {
      const value = await api.reverse(row.id, crypto.randomUUID(), reason)
      setRows((current) => [...current, value])
      setReversalReasons((current) => ({ ...current, [row.id]: '' }))
      setMessage('冲销记录已追加；原支出未被改写。')
    } catch {
      setMessage('冲销失败：请检查授权，或该记录可能已冲销。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="card" title="Honsen 实际采购支出">
      <p>
        支出与收货分别登记；此处不是财务账本。凭证可后补，未上传会持续提示。
      </p>
      {message ? (
        <Alert title={message} type="info" role="status" showIcon />
      ) : null}
      <div className="requisition-lines">
        <label>
          收款方类型与供应商
          <select
            aria-label="支出供应商"
            value={supplierId}
            onChange={(event) => {
              const id = event.target.value
              setSupplierId(id)
              if (id)
                setPayeeName(
                  suppliers.find((item) => item.id === id)?.name ?? '',
                )
            }}
          >
            <option value="">市场临时收款方</option>
            {suppliers.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          收款方名称
          <Input
            aria-label="支出收款方"
            value={payeeName}
            readOnly={Boolean(supplierId)}
            onChange={(event) => setPayeeName(event.target.value)}
          />
        </label>
        <label>
          实际金额（最小货币单位）
          <Input
            aria-label="支出金额（最小货币单位）"
            inputMode="numeric"
            value={amountMinor}
            onChange={(event) => setAmountMinor(event.target.value)}
          />
        </label>
        <label>
          币种
          <select
            aria-label="支出币种"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {['XOF', 'XAF', 'CNY', 'USD', 'EUR', 'ETB'].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label>
          支付方式
          <select
            aria-label="支出支付方式"
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(event.target.value as typeof paymentMethod)
            }
          >
            <option value="cash">现金</option>
            <option value="bank_transfer">银行转账</option>
            <option value="mobile_payment">移动支付</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label>
          备注
          <Input
            aria-label="支出备注"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {correctionId ? (
          <label>
            替换原因
            <Input
              aria-label="支出替换原因"
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
            />
          </label>
        ) : null}
        <Button type="primary" disabled={busy} onClick={() => void record()}>
          {correctionId ? '登记替换支出' : '登记实际支出'}
        </Button>
      </div>
      <h3>支出记录</h3>
      {rows.length ? (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {row.status === 'reversed' ? '冲销' : '已登记'} · {row.payeeName}{' '}
              · {row.amountMinor} {row.currency} · {row.paymentDate} ·
              凭证未上传
              {row.correctionReason ? ` · 原因：${row.correctionReason}` : null}
              {row.status === 'recorded' &&
              !rows.some(
                (item) =>
                  item.status === 'reversed' &&
                  item.correctsExpenditureId === row.id,
              ) ? (
                <div>
                  <label>
                    冲销原因
                    <Input
                      aria-label={`冲销原因 ${row.payeeName}`}
                      value={reversalReasons[row.id] ?? ''}
                      onChange={(event) =>
                        setReversalReasons((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <Button disabled={busy} onClick={() => void reverse(row)}>
                    冲销该支出
                  </Button>
                </div>
              ) : null}
              {row.status === 'reversed' &&
              !rows.some(
                (item) =>
                  item.status === 'recorded' &&
                  item.correctsExpenditureId === row.id,
              ) ? (
                <Button
                  onClick={() => {
                    setCorrectionId(row.id)
                    setCorrectionReason('')
                  }}
                >
                  以新记录替换
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无实际支出记录。</p>
      )}
    </Card>
  )
}
