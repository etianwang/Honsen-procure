import { Alert, Button, Form, Input, Modal, Select, Spin } from 'antd'
import { useEffect, useState } from 'react'
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
  type SupplierView,
  type SupplierPriceHistoryView,
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
    failed?: boolean
  } | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [materialQuery, setMaterialQuery] = useState('')
  const [materialResult, setMaterialResult] = useState<{
    key: string
    rows: CatalogMaterialView[]
    failed?: boolean
  } | null>(null)
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
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
    failed?: boolean
  } | null>(null)
  const [supplierEditor, setSupplierEditor] = useState<
    SupplierView | 'new' | null
  >(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [editorContext, setEditorContext] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<'supplier' | 'price' | null>(null)
  const [saveError, setSaveError] = useState<'supplier' | 'price' | null>(null)
  const [supplierForm] = Form.useForm<SupplierFormValues>()
  const [priceForm] = Form.useForm<PriceFormValues>()
  const supplierKey = `${contextKey}:${reload}`
  const materialKey = `${contextKey}:${materialQuery}:${reload}`
  const suppliers =
    supplierResult?.key === supplierKey ? supplierResult.rows : []
  const materials =
    materialResult?.key === materialKey ? materialResult.rows : []
  const selectedSupplier = suppliers.find(
    (row) => row.id === selectedSupplierId,
  )
  const selectedMaterial = materials.find(
    (row) => row.id === selectedMaterialId,
  )
  const historyCursor = historyCursors[historyPage]
  const historyKey = `${contextKey}:${selectedSupplier?.id ?? ''}:${historyCursor ?? ''}:${reload}`
  const comparisonKey = `${contextKey}:${selectedMaterial?.id ?? ''}:${reload}`
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
    if (countryId && projectId)
      void api
        .listSuppliers()
        .then((rows) => {
          if (active)
            setSupplierResult({
              key: supplierKey,
              rows: rows.filter((row) => row.countryId === countryId),
            })
        })
        .catch(() => {
          if (active)
            setSupplierResult({ key: supplierKey, rows: [], failed: true })
        })
    return () => {
      active = false
    }
  }, [api, countryId, projectId, supplierKey])

  useEffect(() => {
    let active = true
    if (countryId && projectId)
      void api
        .searchCatalog(materialQuery, projectId)
        .then((rows) => {
          if (active) setMaterialResult({ key: materialKey, rows })
        })
        .catch(() => {
          if (active)
            setMaterialResult({ key: materialKey, rows: [], failed: true })
        })
    return () => {
      active = false
    }
  }, [api, countryId, projectId, materialQuery, materialKey])

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
      void (async () => {
        const rows: CatalogPriceView[] = []
        let cursor: string | null = null
        const seen = new Set<string>()
        for (;;) {
          const page = await api.listCatalogPrices(
            selectedMaterial.id,
            projectId,
            cursor,
            true,
          )
          if (!active) return
          for (const row of page) {
            if (seen.has(row.priceId))
              throw new Error('Non-progressing quote cursor')
            seen.add(row.priceId)
            rows.push(row)
          }
          if (page.length < 25) break
          cursor = page[page.length - 1].priceId
        }
        if (active) setComparisonResult({ key: comparisonKey, rows })
      })().catch(() => {
        if (active)
          setComparisonResult({ key: comparisonKey, rows: [], failed: true })
      })
    return () => {
      active = false
    }
  }, [api, selectedMaterial, projectId, comparisonKey])

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
    setQuoteOpen(false)
    setEditorContext(contextKey)
    setSaveError(null)
    setSupplierEditor(supplier)
  }
  const saveSupplier = async (values: SupplierFormValues) => {
    if (
      !countryId ||
      !projectId ||
      !canEdit ||
      editorContext !== contextKey ||
      !supplierEditor
    )
      return
    setSaving(true)
    setSaveError(null)
    try {
      const payload = supplierFromForm(
        values,
        supplierEditor === 'new' ? undefined : supplierEditor,
        countryId,
      )
      await api.saveSupplier(payload)
      setSelectedSupplierId(payload.id)
      setHistoryPage(0)
      setHistoryCursors([null])
      setNotice('supplier')
      setSupplierEditor(null)
      supplierForm.resetFields()
      setReload((value) => value + 1)
    } catch {
      setSaveError('supplier')
    } finally {
      setSaving(false)
    }
  }
  const openQuote = () => {
    if (!selectedMaterial) return
    setSupplierEditor(null)
    setEditorContext(contextKey)
    setSaveError(null)
    setQuoteOpen(true)
  }
  const savePrice = async (values: PriceFormValues) => {
    if (
      !selectedMaterial ||
      !countryId ||
      !projectId ||
      !canEdit ||
      editorContext !== contextKey
    )
      return
    setSaving(true)
    setSaveError(null)
    try {
      await api.addMaterialPrice(priceFromForm(values, selectedMaterial.id))
      setNotice('price')
      setQuoteOpen(false)
      priceForm.resetFields()
      setHistoryPage(0)
      setHistoryCursors([null])
      setReload((value) => value + 1)
    } catch {
      setSaveError('price')
    } finally {
      setSaving(false)
    }
  }
  const currencyGroups = new Map<string, CatalogPriceView[]>()
  for (const row of comparison?.rows ?? []) {
    const key = `${row.currency}\u0000${row.unit}`
    currencyGroups.set(key, [...(currencyGroups.get(key) ?? []), row])
  }
  for (const rows of currencyGroups.values())
    rows.sort((a, b) =>
      BigInt(a.unitPriceMinor) < BigInt(b.unitPriceMinor)
        ? -1
        : BigInt(a.unitPriceMinor) > BigInt(b.unitPriceMinor)
          ? 1
          : a.supplierName.localeCompare(b.supplierName),
    )
  const filteredSuppliers = suppliers.filter((row) =>
    [row.name, row.businessCode, row.contactName, row.address, row.city].some(
      (value) =>
        value?.toLocaleLowerCase().includes(supplierQuery.toLocaleLowerCase()),
    ),
  )

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
          <h2>{t('供应商与价格')}</h2>
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
      {notice && (
        <Alert
          type="success"
          showIcon
          title={
            notice === 'supplier'
              ? t('供应商已保存到本地；等待同步确认。')
              : t('报价已保存到本地；等待同步确认。')
          }
        />
      )}
      {((supplierResult?.key === supplierKey && supplierResult.failed) ||
        (materialResult?.key === materialKey && materialResult.failed)) && (
        <Alert
          type="error"
          showIcon
          title={t('无法读取供应商或材料，请检查本地授权后重试。')}
        />
      )}
      <div className="supplier-layout">
        <section className="supplier-list" aria-label={c('供应商')}>
          <div className="supplier-toolbar">
            <Input
              value={supplierQuery}
              onChange={(e) => setSupplierQuery(e.target.value)}
              aria-label={t('搜索供应商名称、编码或联系人')}
              placeholder={t('搜索供应商名称、编码或联系人')}
            />
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
          ) : supplierResult.failed ? null : filteredSuppliers.length ? (
            <div className="supplier-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{c('编码')}</th>
                    <th>{c('供应商')}</th>
                    <th>{c('状态')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map((row) => (
                    <tr
                      key={row.id}
                      aria-selected={selectedSupplierId === row.id}
                    >
                      <td>{row.businessCode}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSupplierId(row.id)
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
                <div className="supplier-table-scroll">
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
          <Input
            aria-label={t('搜索材料名称、型号或规格')}
            value={materialQuery}
            onChange={(e) => {
              setMaterialQuery(e.target.value)
              setSelectedMaterialId('')
            }}
            placeholder={t('搜索材料名称、型号或规格')}
          />
          <Select
            aria-label={t('选择材料')}
            loading={materialResult?.key !== materialKey}
            placeholder={t('选择材料')}
            value={selectedMaterial?.id}
            onChange={(value) => setSelectedMaterialId(value)}
            options={materials.map((row) => ({
              value: row.id,
              label: `${materialName(row)} · ${row.model} · ${row.specification}`,
            }))}
          />
          <Button
            disabled={
              !canEdit ||
              !selectedMaterial ||
              saving ||
              !suppliers.some((row) => row.isActive && !row.isBlacklisted)
            }
            onClick={openQuote}
          >
            {c('维护报价')}
          </Button>
        </div>
        {materials.length === 100 && (
          <p role="status">{t('已达到材料搜索结果上限，请缩小搜索范围。')}</p>
        )}
        {!selectedMaterial ? (
          <p role="status">{t('请选择材料以读取该项目可见的全部有效报价。')}</p>
        ) : !comparison ? (
          <div role="status" className="supplier-loading">
            <Spin />
            {t('正在读取报价…')}
          </div>
        ) : comparison.failed ? (
          <Alert
            type="error"
            title={t('无法读取报价；未显示不完整结果，请重试。')}
          />
        ) : comparison.rows.length ? (
          [...currencyGroups.entries()].map(([key, rows]) => (
            <section className="supplier-currency-group" key={key}>
              <h4>
                {rows[0].currency} · {rows[0].unit}
              </h4>
              <div className="supplier-table-scroll">
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
          <p role="status">{c('暂无有效报价')}</p>
        )}
      </section>
      <Modal
        className="catalog-maintenance-modal"
        title={supplierEditor === 'new' ? c('新增供应商') : c('编辑供应商')}
        open={supplierEditor !== null && editorContext === contextKey}
        onCancel={() => {
          if (!saving) {
            setSupplierEditor(null)
            supplierForm.resetFields()
            setSaveError(null)
          }
        }}
        onOk={() => supplierForm.submit()}
        okText={c('保存供应商')}
        cancelText={c('取消')}
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
          if (!saving) {
            setQuoteOpen(false)
            priceForm.resetFields()
            setSaveError(null)
          }
        }}
        onOk={() => priceForm.submit()}
        okText={c('保存报价')}
        cancelText={c('取消')}
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
          <PriceFormFields suppliers={suppliers} />
        </Form>
      </Modal>
    </section>
  )
}
