import { Alert, Button, Card, Input, Select } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import type { RfqApi, RfqView } from '../lib/rfq-api'
import type { AllocationSupplier } from './SupplierAllocationPanel'

type RfqPanelProps = {
  api: RfqApi
  sourceOrderId: string
  suppliers: AllocationSupplier[]
  canCreate?: boolean
}

export function RfqPanel({
  api,
  sourceOrderId,
  suppliers,
  canCreate = true,
}: RfqPanelProps) {
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState<'XOF' | 'CNY' | 'USD' | 'EUR'>('XOF')
  const [displayNo, setDisplayNo] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [rfqs, setRfqs] = useState<RfqView[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const refresh = useCallback(
    () => api.listRfqs(sourceOrderId).then(setRfqs),
    [api, sourceOrderId],
  )

  useEffect(() => {
    void refresh().catch(() => setMessage('无法读取询价单，请重试。'))
  }, [refresh])

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
      void refresh().catch(() =>
        setMessage('询价单已创建，但列表刷新失败，请重试。'),
      )
    } catch {
      setMessage('创建失败：请确认内部请购单已确认且该币种有材料。')
    }
  }

  async function transition(rfq: RfqView) {
    setBusyId(rfq.id)
    try {
      if (rfq.status === 'draft') await api.sendRfq(rfq.id)
      else if (rfq.status === 'sent') await api.closeRfq(rfq.id)
    } catch {
      setMessage('询价单状态更新失败；原状态已保留，请重试。')
      setBusyId(null)
      return
    }
    try {
      await refresh()
      setMessage(rfq.status === 'draft' ? '询价单已发送。' : '询价单已关闭。')
    } catch {
      setMessage('询价单状态已保存，但列表刷新失败，请重试。')
    } finally {
      setBusyId(null)
    }
  }

  if (!canCreate && rfqs.length === 0 && message === null) return null

  return (
    <Card className="card" title="询价单（RFQ）">
      <p className="muted">
        询价单只复制材料、规格、数量和单位，不包含采购价格。
      </p>
      {message ? <Alert title={message} type="info" showIcon /> : null}
      {canCreate ? (
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
      ) : null}
      {canCreate ? (
        <Button type="primary" onClick={() => void create()}>
          创建询价单
        </Button>
      ) : null}
      {rfqs.length ? (
        <ul aria-label="已有询价单">
          {rfqs.map((rfq) => (
            <li key={rfq.id}>
              {rfq.displayNo} · {rfq.currency} · {rfq.itemCount} 条材料 ·{' '}
              <span>
                状态：
                {rfq.status === 'draft'
                  ? '草稿'
                  : rfq.status === 'sent'
                    ? '已发送'
                    : '已关闭'}
              </span>{' '}
              {rfq.status !== 'closed' ? (
                <Button
                  disabled={busyId !== null}
                  onClick={() => void transition(rfq)}
                >
                  {rfq.status === 'draft' ? '发送询价单' : '关闭询价单'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
