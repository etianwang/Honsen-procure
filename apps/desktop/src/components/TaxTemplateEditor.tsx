import { useUiLocale } from '../lib/ui-locale'
import { FormField } from './FormField'
import { useMasterText } from '../lib/master-data-messages'
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
  onSaved,
}: {
  api: MasterDataApi
  templates: TaxTemplateView[]
  countries: Country[]
  canEdit: boolean
  onSaved?: (template: TaxTemplateView) => void
}) {
  const t = useMasterText()
  const { locale } = useUiLocale()
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
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function save(template: TaxTemplateView) {
    if (pending) return
    setPending(true)
    setMessage(null)
    setFailed(false)
    try {
      await api.saveTaxTemplate(template)
      setItems((current) =>
        current.some((item) => item.id === template.id)
          ? current.map((item) => (item.id === template.id ? template : item))
          : [...current, template],
      )
      onSaved?.(template)
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
      setFailed(true)
      setMessage('税模板保存失败，请检查权限、日期、税率或关联国家')
    } finally {
      setPending(false)
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
    <Card title={t('税模板维护')} aria-label={t('税模板维护')}>
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
            id="TaxTemplateEditor-field-1"
            label={t('税模板代码')}
            required
          >
            <Input
              aria-label={t('税模板代码')}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={!canEdit || pending}
            />
          </FormField>
          <FormField
            id="TaxTemplateEditor-field-2"
            label={t('税模板名称')}
            required
          >
            <Input
              aria-label={t('税模板名称')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canEdit || pending}
            />
          </FormField>
          <FormField id="TaxTemplateEditor-field-3" label={t('税模板国家')}>
            <Select
              aria-label={t('税模板国家')}
              value={countryId ?? ''}
              onChange={(value: string) => setCountryId(value || null)}
              disabled={!canEdit || pending}
              options={[
                { value: '', label: t('所有国家') },
                ...countries
                  .filter((item) => item.is_active)
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
              style={{ minWidth: 160 }}
            />
          </FormField>
          <FormField
            id="TaxTemplateEditor-field-4"
            label={t('税率（基点）')}
            required
            error={
              basisPoints !== '' &&
              (!Number.isInteger(rate) || rate < 0 || rate > 100000)
                ? t('请输入0至100000之间的整数基点')
                : undefined
            }
          >
            <Input
              aria-label={t('税率（基点）')}
              type="number"
              min={0}
              max={100000}
              step={1}
              value={basisPoints}
              onChange={(event) => setBasisPoints(event.target.value)}
              disabled={!canEdit || pending}
            />
          </FormField>
          <FormField
            id="TaxTemplateEditor-field-5"
            label={t('税模板生效日期')}
            required
          >
            <Input
              aria-label={t('税模板生效日期')}
              type="date"
              value={effectiveAt}
              onChange={(event) => setEffectiveAt(event.target.value)}
              disabled={!canEdit || pending}
            />
          </FormField>
          <Button
            type="primary"
            loading={pending}
            disabled={!canCreate || pending}
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
            {t('新增税模板')}
          </Button>
        </Space>
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: t('代码'), dataIndex: 'businessCode' },
            {
              title: t('名称'),
              render: (_: unknown, item: TaxTemplateView) => (
                <FormField
                  id={`TaxTemplateEditor-6-${item.id}`}
                  label={`${t('税模板名称')} · ${item.businessCode}`}
                >
                  <Input
                    aria-label={`${t('税模板名称')}-${item.businessCode}`}
                    value={names[item.id] ?? item.name}
                    disabled={!canEdit || pending}
                    onChange={(event) =>
                      setNames((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </FormField>
              ),
            },
            {
              title: t('国家'),
              render: (_: unknown, item: TaxTemplateView) =>
                countries.find((country) => country.id === item.countryId)
                  ?.name ?? t('所有国家'),
            },
            {
              title: t('税率（基点）'),
              render: (_: unknown, item: TaxTemplateView) => (
                <FormField
                  id={`TaxTemplateEditor-7-${item.id}`}
                  label={`${t('税率（基点）')} · ${item.businessCode}`}
                >
                  <Input
                    aria-label={`${t('税率（基点）')}-${item.businessCode}`}
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={rates[item.id] ?? String(item.rateBasisPoints)}
                    disabled={!canEdit || pending}
                    onChange={(event) =>
                      setRates((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </FormField>
              ),
            },
            {
              title: t('生效日期'),
              render: (_: unknown, item: TaxTemplateView) => (
                <FormField
                  id={`TaxTemplateEditor-8-${item.id}`}
                  label={`${t('税模板生效日期')} · ${item.businessCode}`}
                >
                  <Input
                    aria-label={`${t('税模板生效日期')}-${item.businessCode}`}
                    type="date"
                    value={dates[item.id] ?? item.effectiveAt}
                    disabled={!canEdit || pending}
                    onChange={(event) =>
                      setDates((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </FormField>
              ),
            },
            {
              title: t('操作'),
              render: (_: unknown, item: TaxTemplateView) => (
                <Space>
                  <Button
                    size="small"
                    disabled={
                      pending ||
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
                    {t('保存修改')}
                  </Button>
                  <Button
                    size="small"
                    disabled={!canEdit || pending}
                    onClick={() =>
                      void save({
                        ...item,
                        isActive: !item.isActive,
                        version: item.version + 1,
                      })
                    }
                  >
                    {item.isActive ? t('停用') : t('启用')}
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
