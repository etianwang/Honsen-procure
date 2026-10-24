import { Alert, Button, Card, Empty, Space } from 'antd'
import { useCallback, useEffect, useState } from 'react'
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
  const [orders, setOrders] = useState<ProcurementExecutionOrder[]>([])
  const [suppliers, setSuppliers] = useState<SupplierView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const selected = orders.find((order) => order.id === selectedId)
  const refresh = useCallback(
    () =>
      api
        .listConfirmedProcurementOrders()
        .then((value) => {
          setOrders(value)
          setSelectedId((current) =>
            value.some((order) => order.id === current)
              ? current
              : (value[0]?.id ?? null),
          )
        })
        .catch(() => setMessage('无法读取已确认采购申请，请重新登录后重试。')),
    [api],
  )

  useEffect(() => {
    const update = () => void refresh()
    window.addEventListener('honsen-procurement-synced', update)
    return () => window.removeEventListener('honsen-procurement-synced', update)
  }, [refresh])

  useEffect(() => {
    void refresh()
    supplierApi
      .listSuppliers()
      .then((value) =>
        setSuppliers(
          value.filter(
            (supplier) => supplier.isActive && !supplier.isBlacklisted,
          ),
        ),
      )
      .catch(() => setMessage('无法读取可用供应商。'))
  }, [refresh, supplierApi])

  return (
    <>
      <section className="page-heading">
        <div>
          <h2>采购执行</h2>
          <p>选择已批准的 Honsen 采购申请；市场直采无需 RFQ 或供应商子订单。</p>
        </div>
      </section>
      {message ? <Alert type="error" title={message} showIcon /> : null}
      <Card className="card" title="已确认采购申请">
        {orders.length ? (
          <Space wrap>
            {orders.map((order) => (
              <Button
                key={order.id}
                type={order.id === selectedId ? 'primary' : 'default'}
                onClick={() => setSelectedId(order.id)}
              >
                {order.displayNo}
              </Button>
            ))}
          </Space>
        ) : (
          <Empty description="没有可执行的已确认采购申请" />
        )}
      </Card>
      {selected ? (
        <section aria-label="采购执行详情">
          <Card className="card" title={`父单详情 · ${selected.displayNo}`}>
            <p className="muted">
              状态：{selected.workflowStatus} · 主币种：
              {selected.primaryCurrency} · {selected.lines.length} 条材料
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
          {selected.procurementMode === 'honsen_self_purchase' &&
          ['confirmed', 'approved'].includes(selected.workflowStatus) &&
          selected.children.length === 0 ? (
            <Button
              type="primary"
              onClick={() =>
                void api
                  .startHonsenMarketExecution(selected.id)
                  .then(() => {
                    setMessage(
                      '市场直采已开始；可直接登记收货，无需 RFQ 或供应商子订单。',
                    )
                    void refresh()
                  })
                  .catch(() =>
                    setMessage('无法开始市场直采，请检查模式、状态及授权。'),
                  )
              }
            >
              开始市场直采
            </Button>
          ) : null}
          {selected.procurementMode === 'honsen_self_purchase' &&
          ['executing', 'receiving'].includes(selected.workflowStatus) ? (
            <ReceiptPanel
              key={selected.id}
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
                aria-label={`供应商子订单 ${child.displayNo}`}
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
                    api={tauriProcurementExpenditureApi}
                    orderId={child.id}
                    currency={child.currency}
                    summary={child.paymentSummary}
                    onChanged={refresh}
                  />
                ) : null}
                <AttachmentPanel
                  key={`attachments-${child.id}`}
                  orderId={child.id}
                />
              </section>
            ))
          ) : ['confirmed', 'approved'].includes(selected.workflowStatus) ? (
            <>
              <SupplierAllocationPanel
                api={supplierOrderApi}
                parentOrderId={selected.id}
                lines={selected.lines.map((line) => ({ ...line }))}
                suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
                onCreated={refresh}
              />
              <RfqPanel
                api={rfqApi}
                sourceOrderId={selected.id}
                suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
              />
            </>
          ) : null}
          <AttachmentPanel
            key={`attachments-${selected.id}`}
            orderId={selected.id}
          />
        </section>
      ) : null}
    </>
  )
}
