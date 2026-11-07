import { currencySchema, type Currency } from '@honsen/shared'
import { useUiLocale } from '../lib/ui-locale'
import {
  supplierText,
  type SupplierMessage,
  type SupplierNotice,
} from '../lib/supplier-workflow-messages'
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
  const { locale } = useUiLocale()
  const t = (key: SupplierMessage) => supplierText(locale, key)
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState<Currency>('XOF')
  const [displayNo, setDisplayNo] = useState('')
  const [message, setMessage] = useState<SupplierNotice | null>(null)
  const [rfqs, setRfqs] = useState<RfqView[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const refresh = useCallback(
    () => api.listRfqs(sourceOrderId).then(setRfqs),
    [api, sourceOrderId],
  )

  useEffect(() => {
    void refresh().catch(() => setMessage({ key: '无法读取询价单，请重试。' }))
  }, [refresh])

  async function create() {
    if (!supplierId || !displayNo.trim()) {
      setMessage({ key: '请选择供应商并填写询价单编号。' })
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
      setMessage({
        key: 'created',
        values: { number: rfq.displayNo, count: rfq.itemCount },
      })
      void refresh().catch(() =>
        setMessage({ key: '询价单已创建，但列表刷新失败，请重试。' }),
      )
    } catch {
      setMessage({ key: '创建失败：请确认内部请购单已确认且该币种有材料。' })
    }
  }

  async function transition(rfq: RfqView) {
    setBusyId(rfq.id)
    try {
      if (rfq.status === 'draft') await api.sendRfq(rfq.id)
      else if (rfq.status === 'sent') await api.closeRfq(rfq.id)
    } catch {
      setMessage({ key: '询价单状态更新失败；原状态已保留，请重试。' })
      setBusyId(null)
      return
    }
    try {
      await refresh()
      setMessage({
        key: rfq.status === 'draft' ? '询价单已发送。' : '询价单已关闭。',
      })
    } catch {
      setMessage({ key: '询价单状态已保存，但列表刷新失败，请重试。' })
    } finally {
      setBusyId(null)
    }
  }

  if (!canCreate && rfqs.length === 0 && message === null) return null

  return (
    <Card className="card" title={t('询价单（RFQ）')}>
      <p className="muted">
        {t('询价单只复制材料、规格、数量和单位，不包含采购价格。')}
      </p>
      {message ? (
        <Alert
          title={supplierText(locale, message.key, message.values)}
          type="info"
          showIcon
        />
      ) : null}
      {canCreate ? (
        <div className="requisition-fields">
          <label>
            {t('供应商')}
            <Select
              aria-label={t('RFQ 供应商')}
              value={supplierId || undefined}
              placeholder={t('选择供应商')}
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
              }))}
              onChange={setSupplierId}
            />
          </label>
          <label>
            {t('询价币种')}
            <Select
              aria-label={t('RFQ 币种')}
              value={currency}
              options={currencySchema.options.map((value) => ({ value }))}
              onChange={(value) => setCurrency(value)}
            />
          </label>
          <label>
            {t('询价单编号')}
            <Input
              aria-label={t('询价单编号')}
              value={displayNo}
              onChange={(event) => setDisplayNo(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {canCreate ? (
        <Button type="primary" onClick={() => void create()}>
          {t('创建询价单')}
        </Button>
      ) : null}
      {rfqs.length ? (
        <ul aria-label={t('已有询价单')}>
          {rfqs.map((rfq) => (
            <li key={rfq.id}>
              {rfq.displayNo} · {rfq.currency} · {rfq.itemCount} {t('条材料')} ·{' '}
              <span>
                {t('状态：')}
                {rfq.status === 'draft'
                  ? t('草稿')
                  : rfq.status === 'sent'
                    ? t('已发送')
                    : t('已关闭')}
              </span>{' '}
              {rfq.status !== 'closed' ? (
                <Button
                  disabled={busyId !== null}
                  onClick={() => void transition(rfq)}
                >
                  {rfq.status === 'draft' ? t('发送询价单') : t('关闭询价单')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
