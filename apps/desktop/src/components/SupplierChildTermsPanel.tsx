import { Alert, Button, Card, Checkbox, Input, Space } from 'antd'
import { useState } from 'react'
import type {
  SupplierChildTermsInput,
  SupplierOrderApi,
} from '../lib/supplier-order-api'

type ChildLine = {
  id: string
  materialName: string
  currency: string
}

type SupplierChildTermsPanelProps = {
  api: SupplierOrderApi
  orderId: string
  lines: ChildLine[]
}

const zero = { kind: 'fixed_minor', minor: '0' } as const

export function SupplierChildTermsPanel({
  api,
  orderId,
  lines,
}: SupplierChildTermsPanelProps) {
  const [taxRateBasisPoints, setTaxRateBasisPoints] = useState('0')
  const [orderDiscount, setOrderDiscount] = useState('0')
  const [orderFreight, setOrderFreight] = useState('0')
  const [lineTerms, setLineTerms] = useState(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        { discount: '0', freight: '0', freightIncluded: false },
      ]),
    ),
  )
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function input(): SupplierChildTermsInput | null {
    const tax = Number(taxRateBasisPoints)
    if (
      !/^\d+$/.test(taxRateBasisPoints) ||
      tax > 100_000 ||
      !/^\d+$/.test(orderDiscount) ||
      !/^\d+$/.test(orderFreight)
    ) {
      setMessage('税率、折扣和运费必须为非负整数金额/基点。')
      return null
    }
    return {
      orderId,
      taxRateBasisPoints: tax,
      orderDiscount: { kind: 'fixed_minor', minor: orderDiscount },
      orderFreight: { kind: 'fixed_minor', minor: orderFreight },
      lines: lines.map((line) => {
        const terms = lineTerms[line.id]
        return {
          orderItemId: line.id,
          lineDiscount: { ...zero, minor: terms.discount },
          lineFreight: { ...zero, minor: terms.freight },
          freightIncluded: terms.freightIncluded,
        }
      }),
    }
  }

  async function save() {
    const payload = input()
    if (!payload) return
    try {
      const total = await api.saveSupplierChildTerms(payload)
      setSaved(true)
      setMessage(`子单条款已保存，含税总额 ${total.totalMinor}。`)
    } catch {
      setMessage('保存失败：请确认子单仍为草稿且所有金额有效。')
    }
  }

  async function send() {
    if (!saved) {
      setMessage('请先保存税、折扣和运费条款。')
      return
    }
    try {
      await api.sendSupplierOrder(orderId)
      setMessage('供应商子单已发送，可开始登记收货。')
    } catch {
      setMessage('发送失败：请确认子单条款已保存且订单尚未发送。')
    }
  }

  return (
    <Card className="card" title="供应商子单条款">
      <p className="muted">
        子单只使用一种币种；保存后的税、折扣、运费和金额会写入不可变审计。
      </p>
      {message ? <Alert title={message} type="info" showIcon /> : null}
      <div className="requisition-lines" aria-label="子单明细条款">
        {lines.map((line) => {
          const terms = lineTerms[line.id]
          return (
            <article className="requisition-line" key={line.id}>
              <strong>{line.materialName}</strong> · {line.currency}
              <div className="requisition-fields">
                <label>
                  行折扣（最小货币单位）
                  <Input
                    aria-label={`${line.materialName} 行折扣`}
                    inputMode="numeric"
                    value={terms.discount}
                    onChange={(event) =>
                      setLineTerms((current) => ({
                        ...current,
                        [line.id]: {
                          ...current[line.id],
                          discount: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  行运费（最小货币单位）
                  <Input
                    aria-label={`${line.materialName} 行运费`}
                    inputMode="numeric"
                    value={terms.freight}
                    onChange={(event) =>
                      setLineTerms((current) => ({
                        ...current,
                        [line.id]: {
                          ...current[line.id],
                          freight: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <Checkbox
                  checked={terms.freightIncluded}
                  onChange={(event) =>
                    setLineTerms((current) => ({
                      ...current,
                      [line.id]: {
                        ...current[line.id],
                        freightIncluded: event.target.checked,
                      },
                    }))
                  }
                >
                  单价已含运费
                </Checkbox>
              </div>
            </article>
          )
        })}
      </div>
      <div className="requisition-fields">
        <label>
          税率（基点；18% = 1800）
          <Input
            aria-label="子单税率"
            inputMode="numeric"
            value={taxRateBasisPoints}
            onChange={(event) => setTaxRateBasisPoints(event.target.value)}
          />
        </label>
        <label>
          单据折扣（最小货币单位）
          <Input
            aria-label="子单单据折扣"
            inputMode="numeric"
            value={orderDiscount}
            onChange={(event) => setOrderDiscount(event.target.value)}
          />
        </label>
        <label>
          单据运费（最小货币单位）
          <Input
            aria-label="子单单据运费"
            inputMode="numeric"
            value={orderFreight}
            onChange={(event) => setOrderFreight(event.target.value)}
          />
        </label>
      </div>
      <Space className="requisition-actions" wrap>
        <Button type="primary" onClick={() => void save()}>
          保存子单条款
        </Button>
        <Button onClick={() => void send()}>发送供应商</Button>
      </Space>
    </Card>
  )
}
