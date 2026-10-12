import { Alert, Button, Card, Input, Select, Space } from 'antd'
import { useState } from 'react'
import type {
  SupplierChildAllocationInput,
  SupplierChildOrderView,
  SupplierOrderApi,
} from '../lib/supplier-order-api'

export type AllocationLine = {
  id: string
  materialName: string
  quantity: string
  unit: string
  currency: SupplierChildAllocationInput['currency']
}

export type AllocationSupplier = {
  id: string
  name: string
}

type SupplierAllocationPanelProps = {
  api: SupplierOrderApi
  parentOrderId: string
  lines: AllocationLine[]
  suppliers: AllocationSupplier[]
  onCreated?: () => void
}

type AllocationDraft = Omit<SupplierChildAllocationInput, 'parentItemId'>

function newAllocation(currency: AllocationLine['currency']): AllocationDraft {
  return {
    supplierId: '',
    currency,
    childDisplayNo: '',
    lockedExchangeRateDecimal: '1',
  }
}

export function SupplierAllocationPanel({
  api,
  parentOrderId,
  lines,
  suppliers,
  onCreated,
}: SupplierAllocationPanelProps) {
  const [allocations, setAllocations] = useState<
    Record<string, AllocationDraft>
  >(() =>
    Object.fromEntries(
      lines.map((line) => [line.id, newAllocation(line.currency)]),
    ),
  )
  const [children, setChildren] = useState<SupplierChildOrderView[]>([])
  const [message, setMessage] = useState<string | null>(null)

  function updateLine(id: string, update: Partial<AllocationDraft>) {
    setAllocations((current) => ({
      ...current,
      [id]: { ...current[id], ...update },
    }))
  }

  async function allocate() {
    const payload = lines.map((line) => ({
      parentItemId: line.id,
      ...allocations[line.id],
    }))
    if (
      payload.some(
        (item) =>
          !item.supplierId ||
          !item.childDisplayNo.trim() ||
          !item.lockedExchangeRateDecimal.trim(),
      )
    ) {
      setMessage('每条材料必须选择供应商，并填写子单编号和锁定汇率。')
      return
    }
    try {
      const saved = await api.allocateSupplierChildOrders(
        parentOrderId,
        payload,
      )
      setChildren(saved)
      onCreated?.()
      setMessage(`已创建 ${saved.length} 张供应商子单，父单明细分配已锁定。`)
    } catch {
      setMessage('拆单失败：请确认父单已确认、每行仅分配一次且供应商仍可用。')
    }
  }

  return (
    <Card className="card" title="供应商拆单">
      <p className="muted">
        已确认的内部请购单必须一次性分配全部材料。子单固定为一个供应商和一种币种；税、折扣与运费在子单内补充。
      </p>
      {message ? <Alert title={message} type="info" showIcon /> : null}
      <div className="requisition-lines" aria-label="待分配材料">
        {lines.map((line, index) => {
          const allocation = allocations[line.id]
          return (
            <article className="requisition-line" key={line.id}>
              <div className="requisition-line-heading">
                <strong>
                  第 {index + 1} 行 · {line.materialName}
                </strong>
                <span>
                  {line.quantity} {line.unit} · {line.currency}
                </span>
              </div>
              <div className="requisition-fields">
                <label>
                  供应商
                  <Select
                    aria-label={`${line.materialName} 供应商`}
                    value={allocation.supplierId || undefined}
                    placeholder="选择供应商"
                    options={suppliers.map((supplier) => ({
                      value: supplier.id,
                      label: supplier.name,
                    }))}
                    onChange={(supplierId) =>
                      updateLine(line.id, { supplierId })
                    }
                  />
                </label>
                <label>
                  子单币种
                  <Select
                    aria-label={`${line.materialName} 子单币种`}
                    value={allocation.currency}
                    options={['XOF', 'CNY', 'USD', 'EUR'].map((currency) => ({
                      value: currency,
                    }))}
                    onChange={(currency) =>
                      updateLine(line.id, {
                        currency: currency as AllocationLine['currency'],
                      })
                    }
                  />
                </label>
                <label>
                  子单编号
                  <Input
                    aria-label={`${line.materialName} 子单编号`}
                    value={allocation.childDisplayNo}
                    onChange={(event) =>
                      updateLine(line.id, {
                        childDisplayNo: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  锁定汇率
                  <Input
                    aria-label={`${line.materialName} 锁定汇率`}
                    inputMode="decimal"
                    value={allocation.lockedExchangeRateDecimal}
                    onChange={(event) =>
                      updateLine(line.id, {
                        lockedExchangeRateDecimal: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </article>
          )
        })}
      </div>
      <Space className="requisition-actions" wrap>
        <Button type="primary" onClick={() => void allocate()}>
          创建供应商子单
        </Button>
      </Space>
      {children.length ? (
        <section aria-label="已创建子单">
          <h3>已创建子单</h3>
          <ul>
            {children.map((child) => (
              <li key={child.childOrderId}>
                {child.currency} · {child.sourceTotalMinor} · 锁定汇率{' '}
                {child.lockedExchangeRateDecimal} · 主币种合计{' '}
                {child.primaryTotalMinor}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  )
}
