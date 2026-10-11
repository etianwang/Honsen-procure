import { Alert, Button, Card, Input, Select } from 'antd'
import { useState } from 'react'
import type { RfqApi } from '../lib/rfq-api'
import type { AllocationSupplier } from './SupplierAllocationPanel'

type RfqPanelProps = {
  api: RfqApi
  sourceOrderId: string
  suppliers: AllocationSupplier[]
}

export function RfqPanel({ api, sourceOrderId, suppliers }: RfqPanelProps) {
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState<'XOF' | 'CNY' | 'USD' | 'EUR'>('XOF')
  const [displayNo, setDisplayNo] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function create() {
    if (!supplierId || !displayNo.trim()) {
      setMessage('请选择供应商并填写询价单编号。')
      return
    }
    try {
      const rfq = await api.createRfq({
        id: crypto.randomUUID(),
        sourceOrderId,
        supplierId,
        displayNo: displayNo.trim(),
        currency,
      })
      setMessage(
        `询价单 ${rfq.displayNo} 已创建，包含 ${rfq.itemCount} 条无价格明细。`,
      )
    } catch {
      setMessage('创建失败：请确认内部请购单已确认且该币种有材料。')
    }
  }

  return (
    <Card className="card" title="询价单（RFQ）">
      <p className="muted">
        询价单只复制材料、规格、数量和单位，不包含采购价格。
      </p>
      {message ? <Alert title={message} type="info" showIcon /> : null}
      <div className="requisition-fields">
        <label>
          供应商
          <Select
            aria-label="RFQ 供应商"
            value={supplierId || undefined}
            placeholder="选择供应商"
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
            }))}
            onChange={setSupplierId}
          />
        </label>
        <label>
          询价币种
          <Select
            aria-label="RFQ 币种"
            value={currency}
            options={['XOF', 'CNY', 'USD', 'EUR'].map((value) => ({ value }))}
            onChange={(value) => setCurrency(value)}
          />
        </label>
        <label>
          询价单编号
          <Input
            aria-label="询价单编号"
            value={displayNo}
            onChange={(event) => setDisplayNo(event.target.value)}
          />
        </label>
      </div>
      <Button type="primary" onClick={() => void create()}>
        创建询价单
      </Button>
    </Card>
  )
}
