import {
  calculateDraftTotals,
  type RequisitionDraft,
  type RequisitionLine,
} from '@honsen/shared'
import { Alert, Button, Card, Input, Select, Space } from 'antd'
import { Minus, Plus, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { OrderWorkflowPanel } from '../components/OrderWorkflowPanel'
import { RequisitionHistoryPanel } from '../components/RequisitionHistoryPanel'
import type { CatalogApi, CatalogMaterialView } from '../lib/catalog-api'
import type {
  OwnerLinePricingInput,
  RequisitionApi,
} from '../lib/requisition-api'
import type { WorkflowApi } from '../lib/workflow-api'

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
  workflowApi?: WorkflowApi
  canApprove?: boolean
}

type EditorLine = RequisitionLine
type ProcurementMode = 'owner_self_purchase' | 'honsen_self_purchase'
type OwnerPricing = {
  quoteKind: 'catalog_price' | 'manual_reference'
  materialPriceId: string | null
  manualPrice: string
  manualReason: string
  rate: string
  markupKind: 'percent_basis_points' | 'fixed_minor'
  markup: string
  converted: string | null
  final: string | null
}

function newOwnerPricing(): OwnerPricing {
  return {
    quoteKind: 'catalog_price',
    materialPriceId: null,
    manualPrice: '',
    manualReason: '',
    rate: '',
    markupKind: 'percent_basis_points',
    markup: '0',
    converted: null,
    final: null,
  }
}

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
  mode: ProcurementMode,
): EditorLine {
  const quote = mode === 'honsen_self_purchase' ? material.prices.at(0) : null
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

function OwnerPricingFields({
  line,
  material,
  primaryCurrency,
  pricing,
  disabled,
  onChange,
  onCurrencyChange,
}: {
  line: EditorLine
  material: CatalogMaterialView | undefined
  primaryCurrency: EditorLine['currency']
  pricing: OwnerPricing
  disabled: boolean
  onChange: (update: Partial<OwnerPricing>) => void
  onCurrencyChange: (currency: EditorLine['currency']) => void
}) {
  const price = material?.prices.find(
    ({ priceId }) => priceId === pricing.materialPriceId,
  )
  return (
    <>
      <label>
        报价来源
        <Select
          aria-label="报价来源"
          disabled={disabled || !line.materialId}
          value={pricing.quoteKind}
          options={[
            { value: 'catalog_price', label: '目录报价' },
            { value: 'manual_reference', label: '手工参考价（需原因）' },
          ]}
          onChange={(quoteKind: OwnerPricing['quoteKind']) =>
            onChange({
              quoteKind,
              materialPriceId: null,
              converted: null,
              final: null,
            })
          }
        />
      </label>
      {pricing.quoteKind === 'catalog_price' ? (
        <label>
          选择报价
          <Select
            aria-label="选择报价"
            disabled={disabled || !line.materialId}
            value={pricing.materialPriceId ?? undefined}
            placeholder="请选择报价"
            options={(material?.prices ?? []).map((item) => ({
              value: item.priceId,
              label: `${item.supplierName} · ${item.unitPriceMinor} ${item.currency}`,
            }))}
            onChange={(materialPriceId: string) => {
              const selected = material?.prices.find(
                ({ priceId }) => priceId === materialPriceId,
              )
              if (selected) onCurrencyChange(selected.currency)
              onChange({ materialPriceId, converted: null, final: null })
            }}
          />
        </label>
      ) : (
        <>
          <label className="owner-manual-reference">
            手工参考单价（最小货币单位）
            <Input
              aria-label="手工参考单价（最小货币单位）"
              disabled={disabled}
              inputMode="numeric"
              value={pricing.manualPrice}
              onChange={(event) =>
                onChange({
                  manualPrice: event.target.value,
                  converted: null,
                  final: null,
                })
              }
            />
          </label>
          <label className="owner-manual-reference">
            手工参考原因
            <Input
              aria-label="手工参考原因"
              disabled={disabled}
              value={pricing.manualReason}
              onChange={(event) =>
                onChange({ manualReason: event.target.value })
              }
            />
          </label>
        </>
      )}
      {line.currency !== primaryCurrency ? (
        <label>
          {line.currency} → {primaryCurrency} 锁定汇率
          <Input
            aria-label={`${line.currency} → ${primaryCurrency} 锁定汇率`}
            disabled={disabled}
            inputMode="decimal"
            value={pricing.rate}
            onChange={(event) =>
              onChange({
                rate: event.target.value,
                converted: null,
                final: null,
              })
            }
          />
        </label>
      ) : null}
      <label>
        加价方式
        <Select
          aria-label="加价方式"
          disabled={disabled}
          value={pricing.markupKind}
          options={[
            { value: 'percent_basis_points', label: '百分比（基点）' },
            { value: 'fixed_minor', label: '固定每单位金额' },
          ]}
          onChange={(markupKind: OwnerPricing['markupKind']) =>
            onChange({ markupKind, markup: '0', converted: null, final: null })
          }
        />
      </label>
      <label>
        {pricing.markupKind === 'percent_basis_points'
          ? '加价（基点）'
          : `加价（${primaryCurrency} 最小货币单位）`}
        <Input
          aria-label="加价"
          disabled={disabled}
          inputMode="numeric"
          value={pricing.markup}
          onChange={(event) =>
            onChange({
              markup: event.target.value,
              converted: null,
              final: null,
            })
          }
        />
      </label>
      <label>
        换算参考单价（只读）
        <Input
          aria-label="换算参考单价（只读）"
          readOnly
          value={pricing.converted ?? '—'}
        />
      </label>
      <label>
        最终单价（只读）
        <Input
          aria-label="最终单价（只读）"
          readOnly
          value={pricing.final ?? '—'}
        />
      </label>
      {pricing.quoteKind === 'manual_reference' ? (
        <p className="owner-manual-reference">
          手工参考价会被审计，且不会写回材料目录。
        </p>
      ) : null}
      {price ? (
        <output>
          来源：{price.unitPriceMinor} {price.currency}
        </output>
      ) : null}
    </>
  )
}

export function RequisitionPage({
  api,
  catalogApi,
  context,
  workflowApi,
  canApprove = false,
}: RequisitionPageProps) {
  const [lines, setLines] = useState<EditorLine[]>([newLine(context.currency)])
  const [orderId] = useState(() => crypto.randomUUID())
  const [materials, setMaterials] = useState<CatalogMaterialView[]>([])
  const [mode, setMode] = useState<ProcurementMode>('honsen_self_purchase')
  const [ownerPricing, setOwnerPricing] = useState<
    Record<string, OwnerPricing>
  >({})
  const [pricingRevisionReason, setPricingRevisionReason] = useState('')
  const [pricingIncomplete, setPricingIncomplete] = useState(false)
  const [status, setStatus] = useState<'draft' | 'pending'>('draft')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    catalogApi
      .searchCatalog('', context.projectId)
      .then(setMaterials)
      .catch(() => setMaterials([]))
  }, [catalogApi, context.projectId])

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
    if (mode === 'owner_self_purchase' || status === 'pending' || !totals)
      return
    const timer = window.setTimeout(() => {
      void api.saveRequisitionDraft(draft).catch(() => undefined)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [api, draft, mode, status, totals])

  function updateLine(index: number, update: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...update } : line,
      ),
    )
  }

  function updateOwnerPricing(lineId: string, update: Partial<OwnerPricing>) {
    setOwnerPricing((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] ?? newOwnerPricing()), ...update },
    }))
  }

  function ownerPricingInputs(): OwnerLinePricingInput[] {
    return lines.map((line) => {
      const pricing = ownerPricing[line.id] ?? newOwnerPricing()
      return {
        orderItemId: line.id,
        quoteSource:
          pricing.quoteKind === 'catalog_price'
            ? {
                kind: 'catalog_price',
                materialPriceId: pricing.materialPriceId ?? '',
              }
            : {
                kind: 'manual_reference',
                unitPriceMinor: pricing.manualPrice,
                reason: pricing.manualReason,
              },
        lockedExchangeRateDecimal:
          line.currency === context.primaryCurrency ? '1' : pricing.rate,
        markup:
          pricing.markupKind === 'percent_basis_points'
            ? {
                kind: 'percent_basis_points',
                basisPoints: Number(pricing.markup),
              }
            : { kind: 'fixed_minor', minor: pricing.markup },
      }
    })
  }

  async function saveOwnerPricing() {
    await api.saveRequisitionDraft(draft)
    await api.setProcurementMode(orderId, mode)
    let result
    try {
      result = await api.saveOwnerPurchasePricing({
        orderId,
        lines: ownerPricingInputs(),
        revisionReason: pricingRevisionReason || null,
      })
    } catch (error) {
      setPricingIncomplete(true)
      throw error
    }
    setOwnerPricing((current) => ({
      ...current,
      ...Object.fromEntries(
        result.map((line) => [
          line.orderItemId,
          {
            ...(current[line.orderItemId] ?? newOwnerPricing()),
            converted: line.convertedReferenceUnitMinor,
            final: line.finalUnitPriceMinor,
          },
        ]),
      ),
    }))
    setPricingIncomplete(false)
    setPricingRevisionReason('')
  }

  async function saveDraft() {
    try {
      if (mode === 'owner_self_purchase') await saveOwnerPricing()
      else {
        await api.saveRequisitionDraft(draft)
        await api.setProcurementMode(orderId, mode)
      }
      setMessage('草稿已自动保存到本机')
    } catch {
      setMessage(
        '基础草稿已保存，但可信定价未完成。请修正报价后再次保存；当前不能提交。',
      )
    }
  }

  async function submit() {
    if (!totals) {
      setMessage('请完成材料、数量和金额后再提交。')
      return
    }
    try {
      if (mode === 'owner_self_purchase') await saveOwnerPricing()
      else {
        await api.saveRequisitionDraft(draft)
        await api.setProcurementMode(orderId, mode)
      }
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
        <label>
          采购模式
          <Select
            aria-label="采购模式"
            disabled={status === 'pending'}
            value={mode}
            options={[
              { value: 'owner_self_purchase', label: '业主自行采购' },
              { value: 'honsen_self_purchase', label: '弘盛自行采购' },
            ]}
            onChange={(value: ProcurementMode) => setMode(value)}
          />
        </label>
        {mode === 'owner_self_purchase' ? (
          <label>
            价格修订原因（已有定价时必填）
            <Input
              aria-label="价格修订原因"
              disabled={status === 'pending'}
              value={pricingRevisionReason}
              onChange={(event) => setPricingRevisionReason(event.target.value)}
            />
          </label>
        ) : null}
        {pricingIncomplete ? (
          <Alert
            type="error"
            showIcon
            title="基础草稿已保存，报价定价未完成"
            description="请检查报价、汇率和修订原因后再次保存；系统已阻止提交审批。"
          />
        ) : null}
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
                        updateLine(index, materialLine(line, material, mode))
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
                {mode === 'owner_self_purchase' ? (
                  <OwnerPricingFields
                    line={line}
                    material={materials.find(
                      ({ id }) => id === line.materialId,
                    )}
                    primaryCurrency={context.primaryCurrency}
                    pricing={ownerPricing[line.id] ?? newOwnerPricing()}
                    disabled={status === 'pending'}
                    onChange={(update) => updateOwnerPricing(line.id, update)}
                    onCurrencyChange={(currency) =>
                      updateLine(index, { currency })
                    }
                  />
                ) : null}
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
      {status === 'pending' && workflowApi ? (
        <OrderWorkflowPanel
          api={workflowApi}
          orderId={orderId}
          canApprove={canApprove}
          onRejected={() => {
            setStatus('draft')
            setMessage('申请已驳回，可修改报价并重新提交。')
          }}
        />
      ) : null}
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
      <RequisitionHistoryPanel api={api} refreshKey={status} />
    </>
  )
}
