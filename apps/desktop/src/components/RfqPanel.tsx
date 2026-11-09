import type { ReactNode } from 'react'
import type { SupplierControlProps } from './SupplierPicker'
import { documentNumber } from '../lib/document-number'
import { rfqMessages } from '../lib/rfq-messages'
import { currencySchema, type Currency } from '@honsen/shared'
import { useUiLocale } from '../lib/ui-locale'
import {
  supplierText,
  type SupplierMessage,
  type SupplierNotice,
} from '../lib/supplier-workflow-messages'
import { Alert, Button, Card, Empty, Input, Select } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RfqApi, RfqView } from '../lib/rfq-api'
import type { AllocationSupplier } from './SupplierAllocationPanel'

type RfqPanelProps = {
  api: RfqApi
  sourceOrderId: string
  suppliers?: AllocationSupplier[]
  renderSupplierControl?: (props: SupplierControlProps) => ReactNode
  supplierScopeUnavailable?: boolean
  canCreate?: boolean
}

export function RfqPanel({
  api,
  sourceOrderId,
  suppliers = [],
  renderSupplierControl,
  supplierScopeUnavailable = false,
  canCreate = true,
}: RfqPanelProps) {
  const { locale } = useUiLocale()
  const labels = rfqMessages[locale]
  const t = (key: SupplierMessage) => supplierText(locale, key)
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState<Currency>('XOF')
  const [displayNo, setDisplayNo] = useState('')
  const [message, setMessage] = useState<SupplierNotice | null>(null)
  const [rfqs, setRfqs] = useState<RfqView[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const creating = useRef(false)
  const transitioning = useRef(false)
  const active = useRef(false)
  const lastSource = useRef(sourceOrderId)
  const listGeneration = useRef(0)
  const operationGeneration = useRef(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const noticeType =
    message &&
    ['created', '询价单已发送。', '询价单已关闭。'].includes(message.key)
      ? 'success'
      : message &&
          [
            '询价单已创建，但列表刷新失败，请重试。',
            '询价单状态已保存，但列表刷新失败，请重试。',
          ].includes(message.key)
        ? 'warning'
        : 'error'
  const refresh = useCallback(async () => {
    const generation = ++listGeneration.current
    setLoading(true)
    try {
      const rows = await api.listRfqs(sourceOrderId)
      if (!active.current || generation !== listGeneration.current) return false
      setRfqs(rows)
      setListError(false)
      return true
    } catch (error) {
      if (!active.current || generation !== listGeneration.current) return false
      setListError(true)
      throw error
    } finally {
      if (active.current && generation === listGeneration.current)
        setLoading(false)
    }
  }, [api, sourceOrderId])

  useEffect(() => {
    active.current = true
    if (lastSource.current !== sourceOrderId) {
      setRfqs([])
      setListError(false)
      lastSource.current = sourceOrderId
    }
    creating.current = false
    transitioning.current = false
    setCreateBusy(false)
    setBusyId(null)
    setMessage(null)
    void refresh().catch(() => undefined)
    return () => {
      active.current = false
      listGeneration.current++
      operationGeneration.current++
    }
  }, [refresh, sourceOrderId])

  async function create() {
    if (supplierScopeUnavailable || creating.current || transitioning.current)
      return
    if (!supplierId || !displayNo.trim()) {
      setMessage({ key: '请选择供应商并填写询价单编号。' })
      return
    }
    const operation = ++operationGeneration.current
    creating.current = true
    setCreateBusy(true)
    setMessage(null)
    try {
      const rfq = await api.createRfq({
        id: crypto.randomUUID(),
        sourceOrderId,
        supplierId,
        displayNo: displayNo.trim(),
        currency,
      })
      if (!active.current || operation !== operationGeneration.current) return
      setMessage({
        key: 'created',
        values: {
          number: documentNumber(rfq.displayNo, labels.unnumbered),
          count: rfq.itemCount,
        },
      })
      void refresh().catch(() => {
        if (active.current && operation === operationGeneration.current)
          setMessage({ key: '询价单已创建，但列表刷新失败，请重试。' })
      })
    } catch {
      if (active.current && operation === operationGeneration.current)
        setMessage({ key: '创建失败：请确认内部请购单已确认且该币种有材料。' })
    } finally {
      if (active.current && operation === operationGeneration.current) {
        creating.current = false
        setCreateBusy(false)
      }
    }
  }

  async function transition(rfq: RfqView) {
    if (transitioning.current || creating.current || rfq.status === 'closed')
      return
    transitioning.current = true
    const operation = ++operationGeneration.current
    setBusyId(rfq.id)
    setMessage(null)
    let saved = false
    try {
      if (rfq.status === 'draft') await api.sendRfq(rfq.id)
      else if (rfq.status === 'sent') await api.closeRfq(rfq.id)
      saved = true
      if (!active.current || operation !== operationGeneration.current) return
      const current = await refresh()
      if (
        current &&
        active.current &&
        operation === operationGeneration.current
      )
        setMessage({
          key: rfq.status === 'draft' ? '询价单已发送。' : '询价单已关闭。',
        })
    } catch {
      if (active.current && operation === operationGeneration.current)
        setMessage({
          key: saved
            ? '询价单状态已保存，但列表刷新失败，请重试。'
            : '询价单状态更新失败；原状态已保留，请重试。',
        })
    } finally {
      if (active.current && operation === operationGeneration.current) {
        transitioning.current = false
        setBusyId(null)
      }
    }
  }

  return (
    <Card className="card" title={t('询价单（RFQ）')}>
      <p className="muted">
        {t('询价单只复制材料、规格、数量和单位，不包含采购价格。')}
      </p>
      {message ? (
        <Alert
          title={supplierText(locale, message.key, message.values)}
          type={noticeType}
          role={noticeType === 'error' ? 'alert' : 'status'}
          showIcon
        />
      ) : null}
      {canCreate ? (
        <div className="requisition-fields">
          <label>
            {t('供应商')}
            {renderSupplierControl ? (
              renderSupplierControl({
                value: supplierId || undefined,
                onChange: setSupplierId,
                disabled: createBusy || busyId !== null,
                ariaLabel: t('RFQ 供应商'),
              })
            ) : (
              <Select
                aria-label={t('RFQ 供应商')}
                disabled={createBusy || busyId !== null}
                value={supplierId || undefined}
                placeholder={t('选择供应商')}
                options={suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                }))}
                onChange={setSupplierId}
              />
            )}
          </label>
          <label>
            {t('询价币种')}
            <Select
              aria-label={t('RFQ 币种')}
              disabled={createBusy}
              value={currency}
              options={currencySchema.options.map((value) => ({ value }))}
              onChange={(value) => setCurrency(value)}
            />
          </label>
          <label>
            {t('询价单编号')}
            <Input
              aria-label={t('询价单编号')}
              disabled={createBusy}
              value={displayNo}
              onChange={(event) => setDisplayNo(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {canCreate ? (
        <Button
          type="primary"
          aria-label={t('创建询价单')}
          aria-busy={createBusy}
          loading={createBusy}
          disabled={createBusy || supplierScopeUnavailable}
          onClick={() => void create()}
        >
          {t('创建询价单')}
        </Button>
      ) : null}
      {loading && (
        <Alert role="status" type="info" title={labels.loading} showIcon />
      )}
      {busyId !== null && (
        <Alert role="status" type="info" title={labels.saving} showIcon />
      )}
      {listError && (
        <Alert
          role="alert"
          type="error"
          title={labels.loadFailed}
          showIcon
          action={
            <Button
              disabled={loading || createBusy || busyId !== null}
              onClick={() => void refresh().catch(() => undefined)}
            >
              {labels.retry}
            </Button>
          }
        />
      )}
      {rfqs.length ? (
        <ul aria-label={t('已有询价单')}>
          {rfqs.map((rfq) => (
            <li key={rfq.id}>
              {documentNumber(rfq.displayNo, labels.unnumbered)} ·{' '}
              {rfq.currency} · {rfq.itemCount} {t('条材料')} ·{' '}
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
                  disabled={
                    busyId !== null || createBusy || loading || listError
                  }
                  aria-label={
                    rfq.status === 'draft' ? t('发送询价单') : t('关闭询价单')
                  }
                  aria-busy={busyId === rfq.id}
                  loading={busyId === rfq.id}
                  onClick={() => void transition(rfq)}
                >
                  {rfq.status === 'draft' ? t('发送询价单') : t('关闭询价单')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !loading && !listError ? (
        <Empty description={labels.empty} />
      ) : null}
    </Card>
  )
}
