import { Alert, Button, Card, Input, Select, Space, Table } from 'antd'
import { useState } from 'react'
import type {
  MasterDataApi,
  ReferenceMasterDataView,
  TaxTemplateView,
} from '../lib/master-data-api'

type Country = Extract<ReferenceMasterDataView, { kind: 'country' }>

export function TaxTemplateEditor({
  api,
  templates,
  countries,
  canEdit,
}: {
  api: MasterDataApi
  templates: TaxTemplateView[]
  countries: Country[]
  canEdit: boolean
}) {
  const [items, setItems] = useState(templates)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [countryId, setCountryId] = useState<string | null>(null)
  const [basisPoints, setBasisPoints] = useState('')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [rates, setRates] = useState<Record<string, string>>({})
  const [dates, setDates] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  async function save(template: TaxTemplateView) {
    try {
      await api.saveTaxTemplate(template)
      setItems((current) =>
        current.some((item) => item.id === template.id)
          ? current.map((item) => (item.id === template.id ? template : item))
          : [...current, template],
      )
      setNames((current) => {
        const next = { ...current }
        delete next[template.id]
        return next
      })
      setRates((current) => {
        const next = { ...current }
        delete next[template.id]
        return next
      })
      setDates((current) => {
        const next = { ...current }
        delete next[template.id]
        return next
      })
      setMessage('税模板已保存；等待同步确认')
    } catch {
      setMessage('税模板保存失败，请检查权限、日期、税率或关联国家')
    }
  }

  const rate = Number(basisPoints)
  const canCreate =
    canEdit &&
    code.trim() !== '' &&
    name.trim() !== '' &&
    effectiveAt !== '' &&
    basisPoints.trim() !== '' &&
    Number.isInteger(rate) &&
    rate >= 0 &&
    rate <= 100_000

  return (
    <Card title="税模板维护" aria-label="税模板维护">
      <Space orientation="vertical" style={{ width: '100%' }}>
        {message && <Alert type="info" title={message} showIcon />}
        <Space wrap>
          <Input
            aria-label="税模板代码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={!canEdit}
          />
          <Input
            aria-label="税模板名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canEdit}
          />
          <Select
            aria-label="税模板国家"
            value={countryId ?? ''}
            onChange={(value: string) => setCountryId(value || null)}
            disabled={!canEdit}
            options={[
              { value: '', label: '所有国家' },
              ...countries
                .filter((item) => item.is_active)
                .map((item) => ({ value: item.id, label: item.name })),
            ]}
            style={{ minWidth: 160 }}
          />
          <Input
            aria-label="税率（基点）"
            type="number"
            min={0}
            max={100000}
            step={1}
            value={basisPoints}
            onChange={(event) => setBasisPoints(event.target.value)}
            disabled={!canEdit}
          />
          <Input
            aria-label="税模板生效日期"
            type="date"
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
            disabled={!canEdit}
          />
          <Button
            disabled={!canCreate}
            onClick={() =>
              void save({
                id: crypto.randomUUID(),
                businessCode: code.trim(),
                name: name.trim(),
                countryId,
                rateBasisPoints: rate,
                effectiveAt,
                isActive: true,
                version: 1,
              })
            }
          >
            新增税模板
          </Button>
        </Space>
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: '代码', dataIndex: 'businessCode' },
            {
              title: '名称',
              render: (_: unknown, item: TaxTemplateView) => (
                <Input
                  aria-label={`编辑税模板名称-${item.businessCode}`}
                  value={names[item.id] ?? item.name}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setNames((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              ),
            },
            {
              title: '国家',
              render: (_: unknown, item: TaxTemplateView) =>
                countries.find((country) => country.id === item.countryId)
                  ?.name ?? '所有国家',
            },
            {
              title: '税率（基点）',
              render: (_: unknown, item: TaxTemplateView) => (
                <Input
                  aria-label={`编辑税率（基点）-${item.businessCode}`}
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  value={rates[item.id] ?? String(item.rateBasisPoints)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setRates((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              ),
            },
            {
              title: '生效日期',
              render: (_: unknown, item: TaxTemplateView) => (
                <Input
                  aria-label={`编辑税模板生效日期-${item.businessCode}`}
                  type="date"
                  value={dates[item.id] ?? item.effectiveAt}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDates((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              ),
            },
            {
              title: '操作',
              render: (_: unknown, item: TaxTemplateView) => (
                <Space>
                  <Button
                    size="small"
                    disabled={
                      !canEdit ||
                      !(names[item.id] ?? item.name).trim() ||
                      !(dates[item.id] ?? item.effectiveAt) ||
                      !(
                        rates[item.id] ?? String(item.rateBasisPoints)
                      ).trim() ||
                      !Number.isInteger(
                        Number(rates[item.id] ?? item.rateBasisPoints),
                      ) ||
                      Number(rates[item.id] ?? item.rateBasisPoints) < 0 ||
                      Number(rates[item.id] ?? item.rateBasisPoints) >
                        100_000 ||
                      ((names[item.id] ?? item.name) === item.name &&
                        (rates[item.id] ?? String(item.rateBasisPoints)) ===
                          String(item.rateBasisPoints) &&
                        (dates[item.id] ?? item.effectiveAt) ===
                          item.effectiveAt)
                    }
                    onClick={() =>
                      void save({
                        ...item,
                        name: (names[item.id] ?? item.name).trim(),
                        rateBasisPoints: Number(
                          rates[item.id] ?? item.rateBasisPoints,
                        ),
                        effectiveAt: dates[item.id] ?? item.effectiveAt,
                        version: item.version + 1,
                      })
                    }
                  >
                    保存修改
                  </Button>
                  <Button
                    size="small"
                    disabled={!canEdit}
                    onClick={() =>
                      void save({
                        ...item,
                        isActive: !item.isActive,
                        version: item.version + 1,
                      })
                    }
                  >
                    {item.isActive ? '停用' : '启用'}
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Space>
    </Card>
  )
}
