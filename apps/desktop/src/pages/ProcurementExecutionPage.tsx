import { useUiLocale } from '../lib/ui-locale'
import { documentNumber } from '../lib/document-number'
import {
  executionText,
  executionStatus,
  type ExecutionMessage,
} from '../lib/execution-messages'
import { Alert, Button, Card, Empty, Space } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AttachmentPanel } from '../components/AttachmentPanel'
import { RfqPanel } from '../components/RfqPanel'
import { SupplierAllocationPanel } from '../components/SupplierAllocationPanel'
import { SupplierChildTermsPanel } from '../components/SupplierChildTermsPanel'
import { ReceiptPanel } from '../components/ReceiptPanel'
import { ProcurementExpenditurePanel } from '../components/ProcurementExpenditurePanel'
import type { SupplierView } from '../lib/catalog-api'
import type {
  ProcurementExecutionApi,
  ProcurementExecutionOrder,
} from '../lib/procurement-execution-api'
import type { RfqApi } from '../lib/rfq-api'
import type { SupplierOrderApi } from '../lib/supplier-order-api'
import { tauriReceiptApi } from '../lib/receipt-api'
import { tauriProcurementExpenditureApi } from '../lib/procurement-expenditure-api'

type Props = {
  api: ProcurementExecutionApi
  supplierApi: { listSuppliers(): Promise<SupplierView[]> }
  supplierOrderApi: SupplierOrderApi
  rfqApi: RfqApi
  receiverId: string
}

export function ProcurementExecutionPage({
  api,
  supplierApi,
  supplierOrderApi,
  rfqApi,
  receiverId,
}: Props) {
  const { locale } = useUiLocale()
  const componentLocale =
    locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'fr-FR'
  const t = (key: ExecutionMessage) => executionText(locale, key)
  const [orders, setOrders] = useState<ProcurementExecutionOrder[]>([])
  const [suppliers, setSuppliers] = useState<SupplierView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState(false)
  const [suppliersLoading, setSuppliersLoading] = useState(true)
  const [suppliersError, setSuppliersError] = useState(false)
  const ordersRead = useRef(0)
  const suppliersRead = useRef(0)
  const [startNotice, setStartNotice] = useState<{
    orderId: string
    message: ExecutionMessage
    type: 'success' | 'error'
  } | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const startPending = useRef(false)
  async function startMarket(orderId: string) {
    if (startPending.current) return
    startPending.current = true
    setStartingId(orderId)
    setStartNotice(null)
    try {
      await api.startHonsenMarketExecution(orderId)
      setStartNotice({
        orderId,
        type: 'success',
        message: '市场直采已开始；可直接登记收货，无需 RFQ 或供应商子订单。',
      })
      await refresh()
    } catch {
      setStartNotice({
        orderId,
        type: 'error',
        message: '无法开始市场直采，请检查模式、状态及授权。',
      })
    } finally {
      startPending.current = false
      setStartingId(null)
    }
  }
  const selected = orders.find((order) => order.id === selectedId)
  const refresh = useCallback(async () => {
    const request = ++ordersRead.current
    setOrdersLoading(true)
    setOrdersError(false)
    try {
      const value = await api.listConfirmedProcurementOrders()
      if (request !== ordersRead.current) return
      setOrders(value)
      setSelectedId((current) =>
        value.some((order) => order.id === current)
          ? current
          : (value[0]?.id ?? null),
      )
    } catch {
      if (request === ordersRead.current) setOrdersError(true)
    } finally {
      if (request === ordersRead.current) setOrdersLoading(false)
    }
  }, [api])
  const refreshSuppliers = useCallback(async () => {
    const request = ++suppliersRead.current
    setSuppliersLoading(true)
    setSuppliersError(false)
    try {
      const value = await supplierApi.listSuppliers()
      if (request !== suppliersRead.current) return
      setSuppliers(
        value.filter(
          (supplier) => supplier.isActive && !supplier.isBlacklisted,
        ),
      )
    } catch {
      if (request === suppliersRead.current) setSuppliersError(true)
    } finally {
      if (request === suppliersRead.current) setSuppliersLoading(false)
    }
  }, [supplierApi])

  useEffect(() => {
    const update = () => void refresh()
    window.addEventListener('honsen-procurement-synced', update)
    return () => window.removeEventListener('honsen-procurement-synced', update)
  }, [refresh])

  useEffect(() => {
    void refresh()
    void refreshSuppliers()
    return () => {
      ordersRead.current += 1
      suppliersRead.current += 1
    }
  }, [refresh, refreshSuppliers])

  return (
    <>
      <section className="page-heading">
        <div>
          <h2>{t('采购执行')}</h2>
          <p>
            {t(
              '选择已批准的 Honsen 采购申请；市场直采无需 RFQ 或供应商子订单。',
            )}
          </p>
        </div>
      </section>
      {suppliersLoading && <p role="status">{t('正在读取可用供应商…')}</p>}
      {suppliersError && (
        <Alert
          role="alert"
          type="error"
          title={t('无法读取可用供应商。')}
          showIcon
          action={
            <Button
              disabled={suppliersLoading}
              onClick={() => void refreshSuppliers()}
            >
              {t('重新读取供应商')}
            </Button>
          }
        />
      )}
      <Card className="card" title={t('已确认采购申请')}>
        {ordersLoading && <p role="status">{t('正在读取已确认采购申请…')}</p>}
        {ordersError && (
          <Alert
            role="alert"
            type="error"
            title={t('无法读取已确认采购申请，请重新登录后重试。')}
            showIcon
            action={
              <Button disabled={ordersLoading} onClick={() => void refresh()}>
                {t('重新读取采购申请')}
              </Button>
            }
          />
        )}
        {orders.length ? (
          <Space wrap>
            {orders.map((order) => (
              <Button
                key={order.id}
                type={order.id === selectedId ? 'primary' : 'default'}
                onClick={() => setSelectedId(order.id)}
              >
                {documentNumber(order.displayNo, t('未正式编号'))}
              </Button>
            ))}
          </Space>
        ) : !ordersLoading && !ordersError ? (
          <Empty description={t('没有可执行的已确认采购申请')} />
        ) : null}
      </Card>
      {selected ? (
        <section aria-label={t('采购执行详情')}>
          <Card
            className="card"
            title={`${t('父单详情')} · ${documentNumber(selected.displayNo, t('未正式编号'))}`}
          >
            <p className="muted">
              {t('状态')}：{executionStatus(locale, selected.workflowStatus)} ·{' '}
              {t('主币种')}：{selected.primaryCurrency} ·{' '}
              {selected.lines.length} {t('条材料')}
            </p>
            <ul>
              {selected.lines.map((line) => (
                <li key={line.id}>
                  {line.materialName} · {line.quantity} {line.unit} ·{' '}
                  {line.currency}
                </li>
              ))}
            </ul>
          </Card>
          {startNotice?.orderId === selected.id && (
            <Alert
              role={startNotice.type === 'error' ? 'alert' : 'status'}
              type={startNotice.type}
              title={t(startNotice.message)}
              showIcon
            />
          )}
          {selected.procurementMode === 'honsen_self_purchase' &&
          ['confirmed', 'approved'].includes(selected.workflowStatus) &&
          selected.children.length === 0 ? (
            <Button
              type="primary"
              loading={startingId === selected.id}
              disabled={startingId !== null}
              onClick={() => void startMarket(selected.id)}
            >
              {t('开始市场直采')}
            </Button>
          ) : null}
          {selected.procurementMode === 'honsen_self_purchase' &&
          selected.children.length === 0 &&
          ['executing', 'receiving'].includes(selected.workflowStatus) ? (
            <ReceiptPanel
              key={`receipt-${selected.id}`}
              api={tauriReceiptApi}
              orderId={selected.id}
              receiverId={receiverId}
              initialStatus={selected.workflowStatus}
              onChanged={refresh}
              lines={selected.lines.map((line) => ({
                id: line.id,
                materialName: line.materialName,
                unit: line.unit,
                orderedQuantity: line.quantity,
                receivedQuantity: line.receivedQuantity,
                remainingQuantity: line.remainingQuantity,
              }))}
            />
          ) : null}
          {selected.children.length === 0 && selected.paymentSummary ? (
            <ProcurementExpenditurePanel
              locale={componentLocale}
              key={`payment-${selected.id}`}
              api={tauriProcurementExpenditureApi}
              orderId={selected.id}
              currency={selected.primaryCurrency}
              summary={selected.paymentSummary}
              onChanged={refresh}
            />
          ) : null}
          {selected.children.length ? (
            selected.children.map((child) => (
              <section
                key={child.id}
                aria-label={`${t('供应商子订单')} ${documentNumber(child.displayNo, t('未正式编号'))}`}
              >
                <SupplierChildTermsPanel
                  api={supplierOrderApi}
                  orderId={child.id}
                  lines={child.lines.map((line) => ({
                    id: line.id,
                    materialName: line.materialName,
                    currency: line.currency,
                  }))}
                />
                <ReceiptPanel
                  api={tauriReceiptApi}
                  orderId={child.id}
                  receiverId={receiverId}
                  initialStatus={child.workflowStatus ?? 'sent'}
                  lines={child.lines.map((line) => ({
                    id: line.id,
                    materialName: line.materialName,
                    unit: line.unit,
                    orderedQuantity: line.quantity,
                    receivedQuantity: line.receivedQuantity,
                    remainingQuantity: line.remainingQuantity,
                  }))}
                />
                {child.paymentSummary ? (
                  <ProcurementExpenditurePanel
                    locale={componentLocale}
                    api={tauriProcurementExpenditureApi}
                    orderId={child.id}
                    currency={child.currency}
                    summary={child.paymentSummary}
                    onChanged={refresh}
                  />
                ) : null}
                <AttachmentPanel
                  locale={componentLocale}
                  key={`attachments-${child.id}`}
                  orderId={child.id}
                />
              </section>
            ))
          ) : ['confirmed', 'approved'].includes(selected.workflowStatus) ? (
            <>
              <SupplierAllocationPanel
                key={`allocation-${selected.id}`}
                api={supplierOrderApi}
                parentOrderId={selected.id}
                lines={selected.lines.map((line) => ({ ...line }))}
                suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
                onCreated={refresh}
              />
            </>
          ) : null}
          <AttachmentPanel
            locale={componentLocale}
            key={`attachments-${selected.id}`}
            orderId={selected.id}
          />
          {selected.procurementMode !== 'owner_self_purchase' ? (
            <RfqPanel
              key={selected.id}
              api={rfqApi}
              sourceOrderId={selected.id}
              suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
              canCreate={
                selected.children.length === 0 &&
                ['confirmed', 'approved'].includes(selected.workflowStatus)
              }
            />
          ) : null}
        </section>
      ) : null}
    </>
  )
}
