import './SuppliersPricesPage.css'
import { MaterialPicker } from '../components/MaterialPicker'
import { SupplierPicker } from '../components/SupplierPicker'
import { Alert, Button, Form, Input, Modal, Spin } from 'antd'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatMoney } from '@honsen/shared'
import { canEditMaterials, type UserRole } from '../lib/permissions'
import { useUiLocale } from '../lib/ui-locale'
import { catalogText, type CatalogMessage } from '../lib/catalog-messages'
import { useSupplierPricesText } from '../lib/supplier-prices-messages'
import {
  tauriCatalogApi,
  type CatalogApi,
  type CatalogMaterialView,
  type CatalogPriceView,
  type CatalogComparisonCursor,
  type CatalogComparisonPage,
  type SupplierView,
  type SupplierPriceHistoryView,
  type SupplierSearchCursor,
} from '../lib/catalog-api'
import {
  priceFromForm,
  supplierFromForm,
  type PriceFormValues,
  type SupplierFormValues,
} from '../lib/catalog-maintenance'
import {
  PriceFormFields,
  SupplierFormFields,
} from '../components/CatalogMaintenanceFields'

type Props = {
  role: UserRole
  countryId?: string
  projectId?: string
  contextNotice?: string
  api?: CatalogApi
}

export function SuppliersPricesPage({
  role,
  countryId,
  projectId,
  contextNotice,
  api = tauriCatalogApi,
}: Props) {
  const { locale } = useUiLocale()
  const c = (key: CatalogMessage) => catalogText(locale, key)
  const t = useSupplierPricesText()
  const canEdit = canEditMaterials(role)
  const moneyLocale =
    locale === 'zh' ? 'zh-CN' : locale === 'fr' ? 'fr-FR' : 'en-US'
  const contextKey = `${countryId ?? ''}:${projectId ?? ''}`
  const [reload, setReload] = useState(0)
  const [supplierQuery, setSupplierQuery] = useState('')
  const [supplierResult, setSupplierResult] = useState<{
    key: string
    rows: SupplierView[]
    nextCursor: SupplierSearchCursor | null
    failed?: boolean
  } | null>(null)
  const [supplierPagination, setSupplierPagination] = useState<{
    key: string
    cursors: (SupplierSearchCursor | null)[]
    page: number
  }>({ key: '', cursors: [null], page: 0 })
  const [supplierSelection, setSupplierSelection] = useState<{
    key: string
    record: SupplierView
  } | null>(null)
  const [materialSelection, setMaterialSelection] = useState<{
    key: string
    record: CatalogMaterialView
  } | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [historyCursors, setHistoryCursors] = useState<(string | null)[]>([
    null,
  ])
  const [historyResult, setHistoryResult] = useState<{
    key: string
    rows: SupplierPriceHistoryView[]
    failed?: boolean
  } | null>(null)
  const [comparisonResult, setComparisonResult] = useState<{
    key: string
    rows: CatalogPriceView[]
    nextCursor: CatalogComparisonCursor | null
    failed?: boolean
  } | null>(null)
  const [comparisonPagination, setComparisonPagination] = useState<{
    key: string
    cursors: (CatalogComparisonCursor | null)[]
    page: number
  }>({ key: '', cursors: [null], page: 0 })
  const [comparisonRetry, setComparisonRetry] = useState(0)
  const [supplierEditor, setSupplierEditor] = useState<
    SupplierView | 'new' | null
  >(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [editorContext, setEditorContext] = useState('')
  const [saving, setSaving] = useState(false)
  const savePending = useRef(false)
  const saveGeneration = useRef(0)
  useLayoutEffect(
    () => () => {
      saveGeneration.current += 1
    },
    [contextKey, api, canEdit],
  )
  const [notice, setNotice] = useState<{
    kind: 'supplier' | 'price'
    key: string
  } | null>(null)
  const [saveError, setSaveError] = useState<'supplier' | 'price' | null>(null)
  const [supplierForm] = Form.useForm<SupplierFormValues>()
  const [priceForm] = Form.useForm<PriceFormValues>()
  const supplierFilterKey = JSON.stringify([contextKey, supplierQuery])
  const supplierPage =
    supplierPagination.key === supplierFilterKey ? supplierPagination.page : 0
  const supplierCursors =
    supplierPagination.key === supplierFilterKey
      ? supplierPagination.cursors
      : [null]
  const supplierCursor = supplierCursors[supplierPage] ?? null
  const supplierKey = JSON.stringify([
    supplierFilterKey,
    supplierCursor,
    reload,
  ])
  const suppliers =
    supplierResult?.key === supplierKey ? supplierResult.rows : []
  const selectedSupplier =
    supplierSelection?.key === contextKey
      ? (suppliers.find((row) => row.id === supplierSelection.record.id) ??
        supplierSelection.record)
      : undefined
  const selectedSupplierId = selectedSupplier?.id
  const selectedMaterial =
    materialSelection?.key === contextKey ? materialSelection.record : undefined
  const historyCursor = historyCursors[historyPage]
  const historyKey = `${contextKey}:${selectedSupplier?.id ?? ''}:${historyCursor ?? ''}:${reload}`
  const comparisonFilterKey = JSON.stringify([
    contextKey,
    selectedMaterial?.id,
    reload,
  ])
  const comparisonPage =
    comparisonPagination.key === comparisonFilterKey
      ? comparisonPagination.page
      : 0
  const comparisonCursors =
    comparisonPagination.key === comparisonFilterKey
      ? comparisonPagination.cursors
      : [null]
  const comparisonCursor = comparisonCursors[comparisonPage] ?? null
  const comparisonKey = JSON.stringify([
    comparisonFilterKey,
    comparisonCursor,
    comparisonRetry,
  ])
  const history = historyResult?.key === historyKey ? historyResult : null
  const comparison =
    comparisonResult?.key === comparisonKey ? comparisonResult : null
  const materialName = (
    material: Pick<CatalogMaterialView, 'nameZh' | 'nameEn' | 'nameFr'>,
  ) =>
    locale === 'en'
      ? material.nameEn || material.nameZh
      : locale === 'fr'
        ? material.nameFr || material.nameZh
        : material.nameZh

  useEffect(() => {
    let active = true
    if (!countryId || !projectId) return
    const timer = window.setTimeout(() => {
      void Promise.resolve()
        .then(async () => {
          if (api.searchSuppliersPage)
            return api.searchSuppliersPage(
              supplierQuery.trim(),
              countryId,
              supplierCursor,
            )
          const rows = await api.listSuppliers()
          const terms = supplierQuery
            .trim()
            .toLocaleLowerCase()
            .split(/\s+/)
            .filter(Boolean)
          return {
            records: rows.filter(
              (row) =>
                row.countryId === countryId &&
                terms.every((term) =>
                  [
                    row.name,
                    row.businessCode,
                    row.contactName,
                    row.address,
                    row.city,
                  ].some((field) => field?.toLocaleLowerCase().includes(term)),
                ),
            ),
            nextCursor: null,
          }
        })
        .then((page) => {
          if (active)
            setSupplierResult({
              key: supplierKey,
              rows: page.records,
              nextCursor: page.nextCursor,
            })
        })
        .catch(() => {
          if (active)
            setSupplierResult({
              key: supplierKey,
              rows: [],
              nextCursor: null,
              failed: true,
            })
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [api, countryId, projectId, supplierQuery, supplierCursor, supplierKey])

  useEffect(() => {
    let active = true
    if (selectedSupplier && projectId)
      void (
        api.listSupplierPrices
          ? api.listSupplierPrices(
              selectedSupplier.id,
              projectId,
              historyCursor,
            )
          : Promise.reject(new Error('History API unavailable'))
      )
        .then((rows) => {
          if (active) setHistoryResult({ key: historyKey, rows })
        })
        .catch(() => {
          if (active)
            setHistoryResult({ key: historyKey, rows: [], failed: true })
        })
    return () => {
      active = false
    }
  }, [api, selectedSupplier, projectId, historyCursor, historyKey])

  useEffect(() => {
    let active = true
    if (selectedMaterial && projectId)
      void Promise.resolve()
        .then(async (): Promise<CatalogComparisonPage> => {
          if (api.listCatalogComparisonPage)
            return api.listCatalogComparisonPage(
              selectedMaterial.id,
              projectId,
              comparisonCursor,
            )
          // Small injected preview adapters provide the comparison rows directly.
          const records = await api.listCatalogPrices(
            selectedMaterial.id,
            projectId,
            null,
            true,
          )
          return { records, nextCursor: null }
        })
        .then(({ records, nextCursor }) => {
          if (active)
            setComparisonResult({
              key: comparisonKey,
              rows: records,
              nextCursor,
            })
        })
        .catch(() => {
          if (active)
            setComparisonResult({
              key: comparisonKey,
              rows: [],
              nextCursor: null,
              failed: true,
            })
        })
    return () => {
      active = false
    }
  }, [api, selectedMaterial, projectId, comparisonKey, comparisonCursor])

  useEffect(() => {
    if (!supplierEditor) return
    supplierForm.resetFields()
    supplierForm.setFieldsValue(
      supplierEditor === 'new'
        ? { isPreferred: false, isBlacklisted: false, isActive: true }
        : {
            ...supplierEditor,
            contactName: supplierEditor.contactName ?? undefined,
            address: supplierEditor.address ?? undefined,
            city: supplierEditor.city ?? undefined,
            country: supplierEditor.country ?? undefined,
            phone: supplierEditor.phone ?? undefined,
            whatsapp: supplierEditor.whatsapp ?? undefined,
            email: supplierEditor.email ?? undefined,
            paymentTerms: supplierEditor.paymentTerms ?? undefined,
            deliveryLeadTime: supplierEditor.deliveryLeadTime ?? undefined,
            notes: supplierEditor.notes ?? undefined,
          },
    )
  }, [supplierEditor, supplierForm])

  useEffect(() => {
    if (!quoteOpen || !selectedMaterial || editorContext !== contextKey) return
    priceForm.resetFields()
    const date = new Date()
    priceForm.setFieldsValue({
      unit: selectedMaterial.unit,
      effectiveAt: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    })
  }, [quoteOpen, selectedMaterial, editorContext, contextKey, priceForm])

  const openSupplierEditor = (supplier: SupplierView | 'new') => {
    if (savePending.current) return
    setQuoteOpen(false)
    setEditorContext(contextKey)
    setSaveError(null)
    setSupplierEditor(supplier)
  }
  const saveSupplier = async (values: SupplierFormValues) => {
    if (
      savePending.current ||
      !countryId ||
      !projectId ||
      !canEdit ||
      editorContext !== contextKey ||
      !supplierEditor
    )
      return
    savePending.current = true
    const generation = saveGeneration.current
    setSaving(true)
    setSaveError(null)
    setNotice(null)
    try {
      const payload = supplierFromForm(
        values,
        supplierEditor === 'new' ? undefined : supplierEditor,
        countryId,
      )
      await api.saveSupplier(payload)
      if (generation !== saveGeneration.current) return
      setSupplierSelection({ key: contextKey, record: payload })
      setHistoryPage(0)
      setHistoryCursors([null])
      setNotice({ kind: 'supplier', key: contextKey })
      setSupplierEditor(null)
      supplierForm.resetFields()
      setReload((value) => value + 1)
    } catch {
      if (generation === saveGeneration.current) setSaveError('supplier')
    } finally {
      savePending.current = false
      setSaving(false)
    }
  }
  const openQuote = () => {
    if (savePending.current || !selectedMaterial) return
    setSupplierEditor(null)
    setEditorContext(contextKey)
    setSaveError(null)
    setQuoteOpen(true)
  }
  const savePrice = async (values: PriceFormValues) => {
    if (
      savePending.current ||
      !selectedMaterial ||
      !countryId ||
      !projectId ||
      !canEdit ||
      editorContext !== contextKey
    )
      return
    savePending.current = true
    const generation = saveGeneration.current
    setSaving(true)
    setSaveError(null)
    setNotice(null)
    try {
      await api.addMaterialPrice(priceFromForm(values, selectedMaterial.id))
      if (generation !== saveGeneration.current) return
      setNotice({ kind: 'price', key: contextKey })
      setQuoteOpen(false)
      priceForm.resetFields()
      setHistoryPage(0)
      setHistoryCursors([null])
      setReload((value) => value + 1)
    } catch {
      if (generation === saveGeneration.current) setSaveError('price')
    } finally {
      savePending.current = false
      setSaving(false)
    }
  }
  const currencyGroups = new Map<string, CatalogPriceView[]>()
  for (const row of comparison?.rows ?? []) {
    const key = `${row.currency}\u0000${row.unit}`
    const group = currencyGroups.get(key)
    if (group) group.push(row)
    else currencyGroups.set(key, [row])
  }
  if (!api.listCatalogComparisonPage)
    for (const rows of currencyGroups.values())
      rows.sort((a, b) => {
        const difference = BigInt(a.unitPriceMinor) - BigInt(b.unitPriceMinor)
        return difference < 0n ? -1 : difference > 0n ? 1 : 0
      })
  if (!countryId || !projectId)
    return (
      <Alert
        type="info"
        showIcon
        title={contextNotice || t('请选择有效项目授权后查看供应商与价格。')}
      />
    )
  return (
    <section className="supplier-prices-page">
      <header className="page-heading">
        <div>
          <p>{t('当前授权国家的供应商，以及本地保留的供应材料和报价记录。')}</p>
        </div>
        <Button
          onClick={() => setReload((value) => value + 1)}
          disabled={saving}
        >
          {t('重新加载')}
        </Button>
      </header>
      {!canEdit && (
        <Alert
          type="info"
          showIcon
          title={t('只读权限：可以查看资料，不能新增或修改供应商与报价。')}
        />
      )}
      {notice?.key === contextKey && (
        <Alert
          type="success"
          role="status"
          showIcon
          title={
            notice.kind === 'supplier'
              ? t('供应商已保存到本地；等待同步确认。')
              : t('报价已保存到本地；等待同步确认。')
          }
        />
      )}
      {supplierResult?.key === supplierKey && supplierResult.failed && (
        <Alert
          type="error"
          showIcon
          title={t('无法读取供应商或材料，请检查本地授权后重试。')}
        />
      )}
      <div className="supplier-layout">
        <section className="supplier-list" aria-label={c('供应商')}>
          <div className="supplier-toolbar">
            <label htmlFor="supplier-page-search">
              <span>{t('搜索供应商名称、编码或联系人')}</span>
              <Input
                id="supplier-page-search"
                value={supplierQuery}
                onChange={(e) => {
                  setSupplierQuery(e.target.value)
                  setSupplierPagination({ key: '', cursors: [null], page: 0 })
                }}
                aria-label={t('搜索供应商名称、编码或联系人')}
                placeholder={t('搜索供应商名称、编码或联系人')}
              />
            </label>
            <Button
              type="primary"
              disabled={!canEdit || saving}
              onClick={() => openSupplierEditor('new')}
            >
              {c('新增供应商')}
            </Button>
          </div>
          {supplierResult?.key !== supplierKey ? (
            <div role="status" className="supplier-loading">
              <Spin />
              {t('正在读取供应商…')}
            </div>
          ) : supplierResult.failed ? null : suppliers.length ? (
            <div
              className="supplier-table-scroll"
              role="region"
              aria-label={t('供应商列表，可横向滚动')}
              tabIndex={0}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{c('编码')}</th>
                    <th>{c('供应商')}</th>
                    <th>{c('状态')}</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((row) => (
                    <tr
                      key={row.id}
                      aria-selected={selectedSupplierId === row.id}
                    >
                      <td>{row.businessCode}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setSupplierSelection({
                              key: contextKey,
                              record: row,
                            })
                            setHistoryPage(0)
                            setHistoryCursors([null])
                          }}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td>
                        {row.isActive ? c('启用') : c('停用')}
                        {row.isBlacklisted ? ` · ${c('黑名单')}` : ''}
                        {row.isPreferred ? ` · ${c('首选供应商')}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="status">{c('暂无供应商')}</p>
          )}
          <nav className="supplier-pagination" aria-label={t('供应商分页')}>
            <Button
              disabled={
                supplierResult?.key !== supplierKey || supplierPage === 0
              }
              onClick={() =>
                setSupplierPagination({
                  key: supplierFilterKey,
                  cursors: supplierCursors,
                  page: supplierPage - 1,
                })
              }
            >
              {t('上一页')}
            </Button>
            {supplierResult?.key === supplierKey && !supplierResult.failed && (
              <span role="status">
                {t('当前页')} {supplierPage + 1} · {suppliers.length} {t('项')}
              </span>
            )}
            <Button
              disabled={
                supplierResult?.key !== supplierKey ||
                !supplierResult?.nextCursor
              }
              onClick={() => {
                if (supplierResult?.nextCursor)
                  setSupplierPagination({
                    key: supplierFilterKey,
                    cursors: [
                      ...supplierCursors.slice(0, supplierPage + 1),
                      supplierResult.nextCursor,
                    ],
                    page: supplierPage + 1,
                  })
              }}
            >
              {t('下一页')}
            </Button>
          </nav>
        </section>
        <section className="supplier-detail">
          {selectedSupplier ? (
            <>
              <header className="supplier-detail-header">
                <h3>{selectedSupplier.name}</h3>
                <Button
                  disabled={!canEdit || saving}
                  onClick={() => openSupplierEditor(selectedSupplier)}
                >
                  {c('编辑供应商')}
                </Button>
              </header>
              <dl className="supplier-contact-details">
                {[
                  [c('联系人'), selectedSupplier.contactName],
                  [c('地址'), selectedSupplier.address],
                  [c('城市'), selectedSupplier.city],
                  [c('国家'), selectedSupplier.country],
                  [c('电话'), selectedSupplier.phone],
                  ['WhatsApp', selectedSupplier.whatsapp],
                  [c('邮箱'), selectedSupplier.email],
                  [c('付款条件'), selectedSupplier.paymentTerms],
                  [c('交货期'), selectedSupplier.deliveryLeadTime],
                  [c('备注'), selectedSupplier.notes],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || '—'}</dd>
                  </div>
                ))}
              </dl>
              <h3>{t('供应材料与报价记录')}</h3>
              <p>
                {t(
                  '包含本地已保留的有效及停用记录；不代表系统外的完整交易历史。',
                )}
              </p>
              {!history ? (
                <div role="status" className="supplier-loading">
                  <Spin />
                  {t('正在读取报价…')}
                </div>
              ) : history.failed ? (
                <Alert
                  type="error"
                  title={t('无法读取报价；未显示不完整结果，请重试。')}
                />
              ) : (
                <div
                  className="supplier-table-scroll"
                  role="region"
                  aria-label={t('报价历史，可横向滚动')}
                  tabIndex={0}
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{c('材料')}</th>
                        <th>{c('型号')}</th>
                        <th>{c('规格')}</th>
                        <th>{c('货币')}</th>
                        <th>{t('单价')}</th>
                        <th>{c('单位')}</th>
                        <th>{c('生效日期')}</th>
                        <th>{t('材料状态')}</th>
                        <th>{t('报价状态')}</th>
                        <th>{c('来源备注')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.rows.map((row) => (
                        <tr key={row.priceId}>
                          <td>
                            {materialName({
                              nameZh: row.materialNameZh,
                              nameEn: row.materialNameEn,
                              nameFr: row.materialNameFr,
                            })}
                          </td>
                          <td>{row.materialModel}</td>
                          <td>{row.materialSpecification}</td>
                          <td>{row.currency}</td>
                          <td>
                            {formatMoney(
                              {
                                currency: row.currency,
                                minor: row.unitPriceMinor,
                              },
                              moneyLocale,
                            )}
                          </td>
                          <td>{row.unit}</td>
                          <td>{row.effectiveAt}</td>
                          <td>{row.materialActive ? c('启用') : c('停用')}</td>
                          <td>{row.isActive ? c('启用') : c('停用')}</td>
                          <td>{row.sourceNote || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!history.rows.length && (
                    <p role="status">{t('暂无已保留的报价记录。')}</p>
                  )}
                </div>
              )}
              <div className="supplier-pagination">
                <Button
                  disabled={historyPage === 0 || !history || saving}
                  onClick={() => setHistoryPage((value) => value - 1)}
                >
                  {t('上一页')}
                </Button>
                <Button
                  disabled={
                    !history ||
                    history.failed ||
                    history.rows.length !== 25 ||
                    saving
                  }
                  onClick={() => {
                    const cursor = history?.rows.at(-1)?.priceId
                    if (!cursor) return
                    setHistoryCursors((values) => [
                      ...values.slice(0, historyPage + 1),
                      cursor,
                    ])
                    setHistoryPage((value) => value + 1)
                  }}
                >
                  {t('下一页')}
                </Button>
              </div>
            </>
          ) : (
            <p role="status">{t('请选择供应商查看联系资料和报价记录。')}</p>
          )}
        </section>
      </div>
      <section className="supplier-material-comparison">
        <header>
          <h3>{t('按材料比价')}</h3>
          <p>{t('同币种、同单位分组排序；不同币种或单位不作高低比较。')}</p>
        </header>
        <div className="supplier-toolbar">
          <label>
            <span>{t('选择材料')}</span>
            <MaterialPicker
              api={api}
              projectId={projectId}
              ariaLabel={t('选择材料')}
              value={selectedMaterial?.id}
              valueLabel={
                selectedMaterial
                  ? materialName(selectedMaterial) +
                    ' · ' +
                    selectedMaterial.model
                  : undefined
              }
              disabled={saving}
              onChange={(record) => {
                if (record?.id !== selectedMaterial?.id) {
                  setComparisonPagination({ key: '', cursors: [null], page: 0 })
                }
                setMaterialSelection({ key: contextKey, record })
              }}
            />
          </label>
          <Button
            disabled={!canEdit || !selectedMaterial || saving}
            onClick={openQuote}
          >
            {c('维护报价')}
          </Button>
        </div>
        {!selectedMaterial ? (
          <p role="status">{t('请选择材料以分页查看该项目可见的有效报价。')}</p>
        ) : !comparison ? (
          <div role="status" className="supplier-loading">
            <Spin />
            {t('正在读取报价…')}
          </div>
        ) : comparison.failed ? (
          <Alert
            type="error"
            title={t('无法读取报价；未显示不完整结果，请重试。')}
            action={
              <Button onClick={() => setComparisonRetry((value) => value + 1)}>
                {t('重试报价')}
              </Button>
            }
          />
        ) : comparison.rows.length ? (
          [...currencyGroups.entries()].map(([key, rows]) => (
            <section className="supplier-currency-group" key={key}>
              <h4>
                {rows[0].currency} · {rows[0].unit}
              </h4>
              <div
                className="supplier-table-scroll"
                role="region"
                aria-label={t('材料报价，可横向滚动')}
                tabIndex={0}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{c('供应商')}</th>
                      <th>{c('货币')}</th>
                      <th>{t('单价')}</th>
                      <th>{c('单位')}</th>
                      <th>{c('状态')}</th>
                      <th>{c('生效日期')}</th>
                      <th>{c('来源备注')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.priceId}>
                        <td>{row.supplierName}</td>
                        <td>{row.currency}</td>
                        <td>
                          {formatMoney(
                            {
                              currency: row.currency,
                              minor: row.unitPriceMinor,
                            },
                            moneyLocale,
                          )}
                        </td>
                        <td>{row.unit}</td>
                        <td>
                          {row.isBlacklisted
                            ? c('黑名单')
                            : row.isPreferredSupplier
                              ? c('首选供应商')
                              : c('启用')}
                        </td>
                        <td>{row.effectiveAt}</td>
                        <td>{row.sourceNote || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        ) : (
          <p role="status">
            {comparisonPage === 0 ? c('暂无有效报价') : t('当前页暂无报价')}
          </p>
        )}
        {selectedMaterial && api.listCatalogComparisonPage && (
          <nav className="supplier-pagination" aria-label={t('比价分页')}>
            <Button
              disabled={!comparison || comparisonPage === 0}
              onClick={() =>
                setComparisonPagination({
                  key: comparisonFilterKey,
                  cursors: comparisonCursors,
                  page: comparisonPage - 1,
                })
              }
            >
              {t('上一页')}
            </Button>
            {comparison && !comparison.failed && (
              <span role="status">
                {t('当前页')} {comparisonPage + 1} · {comparison.rows.length}{' '}
                {t('项')}
              </span>
            )}
            <Button
              disabled={!comparison?.nextCursor}
              onClick={() => {
                if (!comparison?.nextCursor) return
                setComparisonPagination({
                  key: comparisonFilterKey,
                  cursors: [
                    ...comparisonCursors.slice(0, comparisonPage + 1),
                    comparison.nextCursor,
                  ],
                  page: comparisonPage + 1,
                })
              }}
            >
              {t('下一页')}
            </Button>
          </nav>
        )}
      </section>
      <Modal
        className="catalog-maintenance-modal"
        title={supplierEditor === 'new' ? c('新增供应商') : c('编辑供应商')}
        open={supplierEditor !== null && editorContext === contextKey}
        onCancel={() => {
          if (!savePending.current) {
            setSupplierEditor(null)
            supplierForm.resetFields()
            setSaveError(null)
          }
        }}
        onOk={() => supplierForm.submit()}
        okText={c('保存供应商')}
        okButtonProps={{
          'aria-label': c('保存供应商'),
          'aria-busy': saving,
          disabled: saving,
        }}
        cancelText={c('取消')}
        cancelButtonProps={{ disabled: saving }}
        confirmLoading={saving}
        closable={!saving}
        mask={{ closable: !saving }}
        keyboard={!saving}
        destroyOnHidden
      >
        {saveError === 'supplier' && (
          <Alert
            type="error"
            title={t('供应商保存失败；输入已保留，请检查权限或字段后重试。')}
          />
        )}
        <Form
          form={supplierForm}
          layout="vertical"
          onFinish={saveSupplier}
          disabled={saving || !canEdit}
        >
          <SupplierFormFields editing={supplierEditor !== 'new'} />
        </Form>
      </Modal>
      <Modal
        className="catalog-maintenance-modal"
        title={c('维护报价')}
        open={quoteOpen && editorContext === contextKey}
        onCancel={() => {
          if (!savePending.current) {
            setQuoteOpen(false)
            priceForm.resetFields()
            setSaveError(null)
          }
        }}
        onOk={() => priceForm.submit()}
        okText={c('保存报价')}
        okButtonProps={{
          'aria-label': c('保存报价'),
          'aria-busy': saving,
          disabled: saving,
        }}
        cancelText={c('取消')}
        cancelButtonProps={{ disabled: saving }}
        confirmLoading={saving}
        closable={!saving}
        mask={{ closable: !saving }}
        keyboard={!saving}
        destroyOnHidden
      >
        {selectedMaterial && (
          <p>
            {materialName(selectedMaterial)} · {selectedMaterial.model} ·{' '}
            {selectedMaterial.specification}
          </p>
        )}
        {saveError === 'price' && (
          <Alert
            type="error"
            title={t(
              '报价保存失败；输入已保留，请检查授权、供应商状态和金额后重试。',
            )}
          />
        )}
        <Form
          form={priceForm}
          layout="vertical"
          onFinish={savePrice}
          disabled={saving || !canEdit}
        >
          <PriceFormFields
            suppliers={suppliers}
            supplierControl={
              <SupplierPicker
                api={api}
                countryId={countryId}
                knownSupplier={selectedSupplier}
                disabled={saving}
              />
            }
          />
        </Form>
      </Modal>
    </section>
  )
}
