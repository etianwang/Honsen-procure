import {
  calculateDraftTotals,
  type RequisitionDraft,
  type RequisitionLine,
} from '@honsen/shared'
import { Alert, Button, Card, Input, Select, Space } from 'antd'
import { Minus, Plus, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CatalogApi, CatalogMaterialView } from '../lib/catalog-api'
import type { RequisitionApi } from '../lib/requisition-api'

export type RequisitionContext = Omit<
  RequisitionDraft,
  | 'id'
  | 'displayNo'
  | 'lines'
  | 'orderDiscount'
  | 'orderFreight'
  | 'taxRateBasisPoints'
> & {
  displayNo: string
}

type RequisitionPageProps = {
  api: RequisitionApi
  catalogApi: Pick<CatalogApi, 'searchCatalog'>
  context: RequisitionContext
}

type EditorLine = RequisitionLine

function newLine(currency: EditorLine['currency']): EditorLine {
  return {
    id: crypto.randomUUID(),
    materialId: null,
    materialSnapshot: {
      nameZh: '',
      nameFr: null,
      model: '',
      specification: '',
    },
    supplierId: null,
    supplierSnapshot: null,
    currency,
    quantity: '1',
    unit: '',
    unitPriceMinor: '0',
    lineDiscount: { kind: 'fixed_minor', minor: '0' },
    lineFreight: { kind: 'fixed_minor', minor: '0' },
    freightIncluded: false,
    sortOrder: 0,
  }
}

function toOrder(
  id: string,
  lines: EditorLine[],
  context: RequisitionContext,
): RequisitionDraft {
  return {
    ...context,
    id,
    lines: lines.map((line, index) => ({ ...line, sortOrder: index })),
    orderDiscount: { kind: 'fixed_minor', minor: '0' },
    orderFreight: { kind: 'fixed_minor', minor: '0' },
    taxRateBasisPoints:
      new Set(lines.map((line) => line.currency)).size > 1 ? 0 : 1800,
  }
}

function materialLine(
  line: EditorLine,
  material: CatalogMaterialView,
): EditorLine {
  const quote = material.prices.at(0)
  return {
    ...line,
    materialId: material.id,
    materialSnapshot: {
      nameZh: material.nameZh,
      nameFr: material.nameFr,
      model: material.model,
      specification: material.specification,
    },
    supplierSnapshot: quote
      ? { id: quote.supplierId, name: quote.supplierName }
      : null,
    supplierId: quote?.supplierId ?? null,
    unit: material.unit,
    unitPriceMinor: quote?.unitPriceMinor ?? '0',
    currency: quote?.currency ?? line.currency,
  }
}

export function RequisitionPage({
  api,
  catalogApi,
  context,
}: RequisitionPageProps) {
  const [lines, setLines] = useState<EditorLine[]>([newLine(context.currency)])
  const [orderId] = useState(() => crypto.randomUUID())
  const [materials, setMaterials] = useState<CatalogMaterialView[]>([])
  const [status, setStatus] = useState<'draft' | 'pending'>('draft')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    catalogApi
      .searchCatalog('')
      .then(setMaterials)
      .catch(() => setMaterials([]))
  }, [catalogApi])

  const draft = useMemo(
    () => toOrder(orderId, lines, context),
    [context, lines, orderId],
  )
  const totals = useMemo(() => {
    try {
      return calculateDraftTotals(draft)
    } catch {
      return null
    }
  }, [draft])

  useEffect(() => {
    if (status === 'pending' || !totals) return
    const timer = window.setTimeout(() => {
      void api.saveRequisitionDraft(draft).catch(() => undefined)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [api, draft, status, totals])

  function updateLine(index: number, update: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...update } : line,
      ),
    )
  }

  async function saveDraft() {
    try {
      await api.saveRequisitionDraft(draft)
      setMessage('草稿已自动保存到本机')
    } catch {
      setMessage('草稿保存失败，请检查必填材料和金额。')
    }
  }

  async function submit() {
    if (!totals) {
      setMessage('请完成材料、数量和金额后再提交。')
      return
    }
    try {
      await api.saveRequisitionDraft(draft)
      await api.submitRequisitionDraft(draft.id)
      setStatus('pending')
      setMessage('采购申请已提交，状态：待确认')
    } catch {
      setMessage('提交失败，请检查订单内容。')
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h2>新建采购申请</h2>
          <p>
            {context.displayNo} · {context.site} ·
            草稿仅保存在本机，联网后再同步。
          </p>
        </div>
        <span className={`status ${status === 'pending' ? 'blue' : 'yellow'}`}>
          {status === 'pending' ? '待确认' : '草稿'}
        </span>
      </section>
      {message ? (
        <Alert
          className="requisition-alert"
          type="info"
          title={message}
          showIcon
        />
      ) : null}
      <Card className="card" title="材料明细">
        <div className="requisition-lines">
          {lines.map((line, index) => (
            <article className="requisition-line" key={line.id}>
              <div className="requisition-line-heading">
                <strong>第 {index + 1} 行</strong>
                <Button
                  aria-label={`删除第 ${index + 1} 行`}
                  disabled={lines.length === 1 || status === 'pending'}
                  icon={<Minus size={15} />}
                  onClick={() =>
                    setLines((current) => current.filter((_, i) => i !== index))
                  }
                >
                  删除
                </Button>
              </div>
              <div className="requisition-fields">
                <label>
                  材料
                  <Select
                    aria-label="材料"
                    disabled={status === 'pending'}
                    value={line.materialId ?? undefined}
                    placeholder="选择材料"
                    options={materials.map((material) => ({
                      value: material.id,
                      label: `${material.nameZh} · ${material.model}`,
                    }))}
                    onChange={(materialId) => {
                      const material = materials.find(
                        ({ id }) => id === materialId,
                      )
                      if (material)
                        updateLine(index, materialLine(line, material))
                    }}
                  />
                </label>
                <label>
                  币种
                  <Select
                    aria-label="行币种"
                    disabled={status === 'pending'}
                    value={line.currency}
                    options={['XOF', 'CNY', 'USD', 'EUR'].map((value) => ({
                      value,
                    }))}
                    onChange={(currency) => updateLine(index, { currency })}
                  />
                </label>
                <label>
                  数量
                  <Input
                    aria-label="数量"
                    disabled={status === 'pending'}
                    value={line.quantity}
                    inputMode="decimal"
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                  />
                </label>
                <label>
                  单位
                  <Input
                    aria-label="单位"
                    disabled={status === 'pending'}
                    value={line.unit}
                    onChange={(event) =>
                      updateLine(index, { unit: event.target.value })
                    }
                  />
                </label>
                <label>
                  单价（最小货币单位）
                  <Input
                    aria-label="单价（最小货币单位）"
                    disabled={status === 'pending'}
                    value={line.unitPriceMinor}
                    inputMode="numeric"
                    onChange={(event) =>
                      updateLine(index, { unitPriceMinor: event.target.value })
                    }
                  />
                </label>
                <label>
                  行折扣（最小货币单位）
                  <Input
                    aria-label="行折扣（最小货币单位）"
                    disabled={status === 'pending'}
                    value={
                      line.lineDiscount.kind === 'fixed_minor'
                        ? line.lineDiscount.minor
                        : '0'
                    }
                    inputMode="numeric"
                    onChange={(event) =>
                      updateLine(index, {
                        lineDiscount: {
                          kind: 'fixed_minor',
                          minor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  行运费（最小货币单位）
                  <Input
                    aria-label="行运费（最小货币单位）"
                    disabled={status === 'pending'}
                    value={
                      line.lineFreight.kind === 'fixed_minor'
                        ? line.lineFreight.minor
                        : '0'
                    }
                    inputMode="numeric"
                    onChange={(event) =>
                      updateLine(index, {
                        lineFreight: {
                          kind: 'fixed_minor',
                          minor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
        <Space className="requisition-actions" wrap>
          <Button
            disabled={status === 'pending'}
            icon={<Plus size={16} />}
            onClick={() =>
              setLines((current) => [...current, newLine(context.currency)])
            }
          >
            新增材料行
          </Button>
          <Button
            disabled={status === 'pending'}
            onClick={() => void saveDraft()}
          >
            保存草稿
          </Button>
          <Button
            type="primary"
            disabled={status === 'pending'}
            icon={<Send size={16} />}
            onClick={() => void submit()}
          >
            提交确认
          </Button>
        </Space>
      </Card>
      <Card className="card" title="金额汇总">
        <output aria-label="订单总金额" className="requisition-total">
          {totals
            ? totals.sourceCurrencyTotals.length > 1
              ? '待供应商拆单后汇总主币种'
              : `${totals.totalMinor} ${context.currency}`
            : '待填写'}
        </output>
        <p className="muted">
          小计 {totals?.subtotalMinor ?? '—'} · 折扣{' '}
          {totals?.lineDiscountMinor ?? '—'} · 运费{' '}
          {totals?.freightMinor ?? '—'} · 税额 {totals?.taxMinor ?? '—'}
        </p>
        {totals?.sourceCurrencyTotals.length &&
        totals.sourceCurrencyTotals.length > 1 ? (
          <p className="muted">
            源币种小计：
            {totals.sourceCurrencyTotals
              .map((item) => `${item.totalMinor} ${item.currency}`)
              .join(' · ')}
          </p>
        ) : null}
      </Card>
    </>
  )
}
