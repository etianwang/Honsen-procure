import { Alert, Button, Card, Input, Select, Space, Table } from 'antd'
import { useState } from 'react'
import type { ExchangeRateView, MasterDataApi } from '../lib/master-data-api'

const currencies = ['XOF', 'CNY', 'USD', 'EUR'] as const
type Currency = (typeof currencies)[number]

export function ExchangeRateEditor({
  api,
  rates,
  canEdit,
}: {
  api: MasterDataApi
  rates: ExchangeRateView[]
  canEdit: boolean
}) {
  const [items, setItems] = useState(rates)
  const [fromCurrency, setFromCurrency] = useState<Currency | null>(null)
  const [toCurrency, setToCurrency] = useState<Currency | null>(null)
  const [rateDecimal, setRateDecimal] = useState('')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const canCreate =
    canEdit &&
    fromCurrency !== null &&
    toCurrency !== null &&
    /^\d+(?:\.\d{1,8})?$/.test(rateDecimal) &&
    effectiveAt !== '' &&
    reason.trim() !== '' &&
    reason.length <= 1000

  async function save() {
    if (!fromCurrency || !toCurrency || !canCreate) return
    const rate: ExchangeRateView = {
      id: crypto.randomUUID(),
      fromCurrency,
      toCurrency,
      rateDecimal,
      effectiveAt,
      source: 'manual',
      reason: reason.trim(),
      version: 1,
    }
    try {
      await api.saveExchangeRate(rate)
      setItems((current) => [rate, ...current])
      setMessage('手工汇率已归档；等待同步确认')
    } catch {
      setMessage('汇率保存失败，请检查权限、日期或汇率格式')
    }
  }

  return (
    <Card title="汇率历史" aria-label="汇率历史">
      <Space orientation="vertical" style={{ width: '100%' }}>
        {message && <Alert type="info" title={message} showIcon />}
        <Space wrap>
          <Select
            aria-label="源币种"
            placeholder="源币种"
            value={fromCurrency}
            onChange={setFromCurrency}
            disabled={!canEdit}
            options={currencies.map((value) => ({ value, label: value }))}
            style={{ minWidth: 110 }}
          />
          <Select
            aria-label="目标币种"
            placeholder="目标币种"
            value={toCurrency}
            onChange={setToCurrency}
            disabled={!canEdit}
            options={currencies.map((value) => ({ value, label: value }))}
            style={{ minWidth: 110 }}
          />
          <Input
            aria-label="汇率小数字符串"
            value={rateDecimal}
            onChange={(event) => setRateDecimal(event.target.value)}
            disabled={!canEdit}
          />
          <Input
            aria-label="汇率生效日期"
            type="date"
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
            disabled={!canEdit}
          />
          <Input
            aria-label="手工汇率原因"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={!canEdit}
          />
          <Button disabled={!canCreate} onClick={() => void save()}>
            新增手工汇率
          </Button>
        </Space>
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: '源币种', dataIndex: 'fromCurrency' },
            { title: '目标币种', dataIndex: 'toCurrency' },
            { title: '汇率', dataIndex: 'rateDecimal' },
            { title: '生效日期', dataIndex: 'effectiveAt' },
            { title: '来源', dataIndex: 'source' },
            { title: '原因', dataIndex: 'reason' },
          ]}
        />
      </Space>
    </Card>
  )
}
