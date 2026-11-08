import { useUiLocale } from '../lib/ui-locale'
import { FormField } from './FormField'
import { useMasterText } from '../lib/master-data-messages'
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
  const t = useMasterText()
  const { locale } = useUiLocale()
  const [items, setItems] = useState(rates)
  const [fromCurrency, setFromCurrency] = useState<Currency | null>(null)
  const [toCurrency, setToCurrency] = useState<Currency | null>(null)
  const [rateDecimal, setRateDecimal] = useState('')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
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
    if (pending) return
    setPending(true)
    setMessage(null)
    setFailed(false)
    try {
      await api.saveExchangeRate(rate)
      setItems((current) => [rate, ...current])
      setMessage('手工汇率已归档；等待同步确认')
    } catch {
      setFailed(true)
      setMessage('汇率保存失败，请检查权限、日期或汇率格式')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card title={t('汇率历史')} aria-label={t('汇率历史')}>
      <Space orientation="vertical" style={{ width: '100%' }}>
        {pending && (
          <Alert
            role="status"
            type="info"
            showIcon
            title={
              locale === 'zh'
                ? '正在保存，请稍候…'
                : locale === 'fr'
                  ? 'Enregistrement en cours…'
                  : 'Saving, please wait…'
            }
          />
        )}
        {message && (
          <Alert
            type={failed ? 'error' : 'success'}
            title={t(message)}
            showIcon
          />
        )}
        <Space wrap>
          <FormField
            id="ExchangeRateEditor-field-1"
            label={t('源币种')}
            required
          >
            <Select
              aria-label={t('源币种')}
              placeholder={t('源币种')}
              value={fromCurrency}
              onChange={setFromCurrency}
              disabled={!canEdit || pending}
              options={currencies.map((value) => ({ value, label: value }))}
              style={{ minWidth: 110 }}
            />
          </FormField>
          <FormField
            id="ExchangeRateEditor-field-2"
            label={t('目标币种')}
            required
          >
            <Select
              aria-label={t('目标币种')}
              placeholder={t('目标币种')}
              value={toCurrency}
              onChange={setToCurrency}
              disabled={!canEdit || pending}
              options={currencies.map((value) => ({ value, label: value }))}
              style={{ minWidth: 110 }}
            />
          </FormField>
          <FormField
            id="ExchangeRateEditor-field-3"
            label={t('汇率小数字符串')}
            required
            error={
              rateDecimal !== '' && !/^\d+(?:\.\d{1,8})?$/.test(rateDecimal)
                ? t('请输入最多8位小数的非负汇率')
                : undefined
            }
          >
            <Input
              aria-label={t('汇率小数字符串')}
              value={rateDecimal}
              onChange={(event) => setRateDecimal(event.target.value)}
              disabled={!canEdit || pending}
            />
          </FormField>
          <FormField
            id="ExchangeRateEditor-field-4"
            label={t('汇率生效日期')}
            required
          >
            <Input
              aria-label={t('汇率生效日期')}
              type="date"
              value={effectiveAt}
              onChange={(event) => setEffectiveAt(event.target.value)}
              disabled={!canEdit || pending}
            />
          </FormField>
          <FormField
            id="ExchangeRateEditor-field-5"
            label={t('手工汇率原因')}
            required
          >
            <Input
              aria-label={t('手工汇率原因')}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={!canEdit || pending}
            />
          </FormField>
          <Button
            type="primary"
            loading={pending}
            disabled={!canCreate || pending}
            onClick={() => void save()}
          >
            {t('新增手工汇率')}
          </Button>
        </Space>
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: t('源币种'), dataIndex: 'fromCurrency' },
            { title: t('目标币种'), dataIndex: 'toCurrency' },
            { title: t('汇率'), dataIndex: 'rateDecimal' },
            { title: t('生效日期'), dataIndex: 'effectiveAt' },
            {
              title: t('来源'),
              render: (_: unknown, item: ExchangeRateView) =>
                t(item.source === 'manual' ? '手工录入' : '每日公开汇率'),
            },
            { title: t('原因'), dataIndex: 'reason' },
          ]}
        />
      </Space>
    </Card>
  )
}
