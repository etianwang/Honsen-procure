import './MaterialsPage.css'
import {
  SupplierFormFields,
  PriceFormFields,
} from '../components/CatalogMaintenanceFields'
import {
  supplierFromForm,
  priceFromForm,
  type SupplierFormValues,
  type PriceFormValues,
} from '../lib/catalog-maintenance'
import { useUiLocale } from '../lib/ui-locale'
import { catalogText, type CatalogMessage } from '../lib/catalog-messages'
import { Alert, Button, Card, Form, Input, Modal, Spin, Switch } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import { formatMoney, type Material } from '@honsen/shared'
import {
  tauriCatalogApi,
  type CatalogApi,
  type CatalogMaterialView,
  type CatalogPriceView,
  type CatalogSearchCursor,
  type CatalogSearchPage,
  type SupplierView,
} from '../lib/catalog-api'
import {
  MaterialImageCropper,
  type MaterialImageDraft,
} from '../components/MaterialImageCropper'
import { canEditMaterials, type UserRole } from '../lib/permissions'

type MaterialsPageProps = {
  role: UserRole
  countryId?: string
  projectId?: string
  contextNotice?: string
  api?: CatalogApi
}
type MaterialFormValues = {
  sku?: string
  nameZh: string
  nameEn?: string
  nameFr?: string
  aliases?: string
  brand?: string
  model: string
  specification: string
  unit: string
  notes?: string
  isActive: boolean
}

export function MaterialsPage({
  role,
  countryId,
  projectId,
  contextNotice,
  api = tauriCatalogApi,
}: MaterialsPageProps) {
  const { locale } = useUiLocale()
  const t = (key: CatalogMessage) => catalogText(locale, key)
  const canEdit = canEditMaterials(role)
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [pagination, setPagination] = useState<{
    key: string
    cursors: (CatalogSearchCursor | null)[]
    page: number
  }>({ key: '', cursors: [null], page: 0 })
  const [catalogResult, setCatalogResult] = useState<
    (CatalogSearchPage & { key: string; failed?: boolean }) | null
  >(null)
  const filterKey = JSON.stringify([
    projectId,
    query,
    canEdit && includeInactive,
  ])
  const pageIndex = pagination.key === filterKey ? pagination.page : 0
  const pageCursors = pagination.key === filterKey ? pagination.cursors : [null]
  const pageCursor = pageCursors[pageIndex] ?? null
  const requestKey = JSON.stringify([filterKey, pageCursor, reloadKey])
  const currentCatalog =
    catalogResult?.key === requestKey ? catalogResult : null
  const loading = !!projectId && !currentCatalog
  const materials = currentCatalog?.records ?? []
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editor, setEditor] = useState<CatalogMaterialView | 'new' | null>(null)
  const [supplierManagerOpen, setSupplierManagerOpen] = useState(false)
  const [supplierEditor, setSupplierEditor] = useState<
    SupplierView | 'new' | null
  >(null)
  const [quoteMaterial, setQuoteMaterial] =
    useState<CatalogMaterialView | null>(null)
  const [detailMaterial, setDetailMaterial] =
    useState<CatalogMaterialView | null>(null)
  const [detailPrices, setDetailPrices] = useState<CatalogPriceView[]>([])
  const [detailCursors, setDetailCursors] = useState<(string | null)[]>([null])
  const [detailPage, setDetailPage] = useState(0)
  const [detailMore, setDetailMore] = useState(false)
  const [detailBusy, setDetailBusy] = useState(false)
  const detailRequest = useRef(0)
  const [imageDraft, setImageDraft] = useState<MaterialImageDraft | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierView[]>([])
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<MaterialFormValues>()
  const [supplierForm] = Form.useForm<SupplierFormValues>()
  const [priceForm] = Form.useForm<PriceFormValues>()

  useEffect(() => {
    let isCurrent = true
    if (!projectId) return
    const timer = window.setTimeout(() => {
      const request = Promise.resolve().then(() =>
        api.searchCatalogPage
          ? api.searchCatalogPage(
              query.trim(),
              projectId,
              pageCursor,
              canEdit && includeInactive,
            )
          : api
              .searchCatalog(
                query.trim(),
                projectId,
                canEdit && includeInactive,
              )
              .then((records) => ({ records, nextCursor: null })),
      )
      void request
        .then((result) => {
          if (!isCurrent) return
          setError(null)
          setCatalogResult({ ...result, key: requestKey })
        })
        .catch(() => {
          if (isCurrent)
            setCatalogResult({
              key: requestKey,
              records: [],
              nextCursor: null,
              failed: true,
            })
        })
    }, 250)
    return () => {
      isCurrent = false
      window.clearTimeout(timer)
    }
  }, [api, projectId, query, requestKey, pageCursor, canEdit, includeInactive])

  useEffect(() => {
    if (!editor) return
    const material = editor === 'new' ? undefined : editor
    form.resetFields()
    form.setFieldsValue(
      material
        ? {
            sku: material.sku ?? undefined,
            nameZh: material.nameZh,
            nameEn: material.nameEn ?? undefined,
            nameFr: material.nameFr ?? undefined,
            aliases: material.aliases.join(', '),
            brand: material.brand ?? undefined,
            model: material.model,
            specification: material.specification,
            unit: material.unit,
            notes: material.notes ?? undefined,
            isActive: material.isActive ?? true,
          }
        : { isActive: true },
    )
  }, [editor, form])

  useEffect(() => {
    if (!supplierEditor) return
    supplierForm.resetFields()
    const supplier = supplierEditor === 'new' ? undefined : supplierEditor
    supplierForm.setFieldsValue(
      supplier
        ? {
            businessCode: supplier.businessCode,
            name: supplier.name,
            contactName: supplier.contactName ?? undefined,
            address: supplier.address ?? undefined,
            city: supplier.city ?? undefined,
            country: supplier.country ?? undefined,
            phone: supplier.phone ?? undefined,
            whatsapp: supplier.whatsapp ?? undefined,
            email: supplier.email ?? undefined,
            paymentTerms: supplier.paymentTerms ?? undefined,
            deliveryLeadTime: supplier.deliveryLeadTime ?? undefined,
            notes: supplier.notes ?? undefined,
            isPreferred: supplier.isPreferred,
            isBlacklisted: supplier.isBlacklisted,
            isActive: supplier.isActive,
          }
        : { isPreferred: false, isBlacklisted: false, isActive: true },
    )
  }, [supplierEditor, supplierForm])

  useEffect(() => {
    if (!quoteMaterial) return
    priceForm.resetFields()
    priceForm.setFieldsValue({
      currency: 'XOF',
      unit: quoteMaterial.unit,
      effectiveAt: localIsoDate(),
    })
  }, [priceForm, quoteMaterial])

  function openEditor(material?: CatalogMaterialView) {
    setImageDraft(null)
    setEditor(material ?? 'new')
  }

  const onImageChange = useCallback((draft: MaterialImageDraft | null) => {
    setImageDraft(draft)
  }, [])

  async function saveMaterial(values: MaterialFormValues) {
    const existing = editor === 'new' ? undefined : editor
    const material: Material = {
      id: existing?.id ?? crypto.randomUUID(),
      categoryId: existing?.categoryId ?? null,
      sku: optionalText(values.sku),
      nameZh: values.nameZh.trim(),
      nameEn: optionalText(values.nameEn),
      nameFr: optionalText(values.nameFr),
      aliases: (values.aliases ?? '')
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
      brand: optionalText(values.brand),
      model: values.model.trim(),
      specification: values.specification.trim(),
      unit: values.unit.trim(),
      notes: optionalText(values.notes),
      isActive: values.isActive,
      version: (existing?.version ?? 0) + 1,
    }
    setSaving(true)
    try {
      await api.saveMaterial(material)
      if (imageDraft) {
        try {
          await api.saveMaterialImage({
            id: crypto.randomUUID(),
            materialId: material.id,
            sourceFileName: imageDraft.sourceFileName,
            sourceBase64: imageDraft.sourceBase64,
            squareCropBase64: imageDraft.squareCropBase64,
            cropJson: imageDraft.cropJson,
          })
        } catch {
          setNotice('材料已保存，但图片保存失败')
          setEditor(null)
          form.resetFields()
          setReloadKey((value) => value + 1)
          return
        }
      }
      setNotice(imageDraft ? '材料及图片已保存' : '材料已保存')
      setEditor(null)
      form.resetFields()
      setReloadKey((value) => value + 1)
    } catch {
      setError('无法保存材料')
    } finally {
      setSaving(false)
    }
  }

  async function loadSuppliers() {
    try {
      const result = await api.listSuppliers()
      setSuppliers(result)
      return result
    } catch {
      setError('无法读取供应商')
      return []
    }
  }

  async function openSupplierManager() {
    setSupplierManagerOpen(true)
    await loadSuppliers()
  }

  function openSupplierEditor(supplier?: SupplierView) {
    setSupplierEditor(supplier ?? 'new')
  }

  async function saveSupplier(values: SupplierFormValues) {
    const existing = supplierEditor === 'new' ? undefined : supplierEditor
    const supplierCountryId = existing?.countryId ?? countryId
    if (!supplierCountryId) {
      setError('请选择有效的授权范围后再新增供应商')
      return
    }
    const supplier = supplierFromForm(
      values,
      existing ?? undefined,
      supplierCountryId,
    )
    setSaving(true)
    try {
      await api.saveSupplier(supplier)
      setNotice('供应商已保存')
      setSupplierEditor(null)
      supplierForm.resetFields()
      await loadSuppliers()
    } catch {
      setError('无法保存供应商')
    } finally {
      setSaving(false)
    }
  }

  async function openPriceEditor(material: CatalogMaterialView) {
    setQuoteMaterial(material)
    await loadSuppliers()
  }

  async function loadDetailPrices(
    material: CatalogMaterialView,
    after: string | null,
    page: number,
  ) {
    const request = ++detailRequest.current
    setDetailBusy(true)
    try {
      if (!projectId) throw new Error('missing project')
      const prices = await api.listCatalogPrices(
        material.id,
        projectId,
        after,
        true,
      )
      if (request !== detailRequest.current) return
      setDetailPrices(prices)
      setDetailPage(page)
      setDetailMore(prices.length === 25)
    } catch {
      if (request === detailRequest.current) setError('无法读取供应商报价')
    } finally {
      if (request === detailRequest.current) setDetailBusy(false)
    }
  }

  async function savePrice(values: PriceFormValues) {
    if (!quoteMaterial) return
    const price = priceFromForm(values, quoteMaterial.id)
    setSaving(true)
    try {
      await api.addMaterialPrice(price)
      setNotice('供应商报价已保存')
      setQuoteMaterial(null)
      priceForm.resetFields()
      setReloadKey((value) => value + 1)
    } catch {
      setError('无法保存供应商报价')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h2>{t('材料库总览')}</h2>
          <p>
            {t('每种材料最多展示四家有效供应商报价；同币种才可在订单内比较。')}
          </p>
        </div>
        {canEdit && (
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => openEditor()}
          >
            {t('新增材料')}
          </Button>
        )}
      </section>
      <section className="toolbar materials-toolbar" aria-label={t('材料筛选')}>
        <label className="materials-search" htmlFor="materials-search-input">
          <span>{t('搜索材料')}</span>
          <Input
            id="materials-search-input"
            className="search"
            type="search"
            placeholder={t('搜索名称、编码、型号或规格；空格组合关键词')}
            aria-label={t('搜索材料')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPagination({ key: '', cursors: [null], page: 0 })
            }}
            prefix={<Search size={16} aria-hidden="true" />}
          />
        </label>
        <Button
          icon={<SlidersHorizontal size={16} aria-hidden="true" />}
          aria-label={t('筛选')}
          aria-busy={loading}
          loading={loading}
          disabled={!projectId || loading}
          onClick={() => {
            setPagination({ key: '', cursors: [null], page: 0 })
            setReloadKey((value) => value + 1)
          }}
        >
          {t('筛选')}
        </Button>
        {canEdit && (
          <label>
            <Switch
              checked={includeInactive}
              onChange={(value) => {
                setIncludeInactive(value)
                setPagination({ key: '', cursors: [null], page: 0 })
              }}
              aria-label={t('显示停用材料')}
            />{' '}
            {t('显示停用材料')}
          </label>
        )}
        {canEdit && (
          <Button onClick={openSupplierManager}>{t('供应商管理')}</Button>
        )}
      </section>
      {notice && (
        <Alert
          type="success"
          title={t(notice as CatalogMessage)}
          showIcon
          closable
          onClose={() => setNotice(null)}
        />
      )}
      {!projectId ? (
        <Alert
          type="error"
          title={contextNotice ?? t('请选择有效的授权项目以查看报价')}
          showIcon
        />
      ) : currentCatalog?.failed || error ? (
        <Alert
          type="error"
          title={t(error ? (error as CatalogMessage) : '无法读取本地材料库')}
          showIcon
          action={
            <Button
              onClick={() => {
                setError(null)
                setReloadKey((value) => value + 1)
              }}
            >
              {t('重试')}
            </Button>
          }
        />
      ) : loading ? (
        <Spin aria-label={t('正在搜索材料')} />
      ) : (
        <CatalogTable
          materials={materials}
          api={api}
          canEdit={canEdit}
          onEdit={openEditor}
          onAddPrice={openPriceEditor}
          onDetails={(material) => {
            setDetailMaterial(material)
            setDetailPrices([])
            setDetailCursors([null])
            void loadDetailPrices(material, null, 0)
          }}
        />
      )}
      {projectId && (
        <nav className="materials-pagination" aria-label={t('材料分页')}>
          <Button
            disabled={loading || pageIndex === 0}
            onClick={() =>
              setPagination({
                key: filterKey,
                cursors: pageCursors,
                page: pageIndex - 1,
              })
            }
          >
            {t('上一页')}
          </Button>
          <span role="status">
            {t('当前页')} {pageIndex + 1} ·{' '}
            {loading
              ? t('正在搜索材料')
              : String(materials.length) + ' ' + t('项')}
          </span>
          <Button
            disabled={loading || !currentCatalog?.nextCursor}
            onClick={() => {
              if (!currentCatalog?.nextCursor) return
              setPagination({
                key: filterKey,
                cursors: [
                  ...pageCursors.slice(0, pageIndex + 1),
                  currentCatalog.nextCursor,
                ],
                page: pageIndex + 1,
              })
            }}
          >
            {t('下一页')}
          </Button>
        </nav>
      )}
      <p className="access-note">
        {canEdit
          ? t('采购员和管理员可新增、修改、停用材料及维护供应商价格。')
          : t('工程师与查看者仅可搜索和查看材料及供应商价格。')}
      </p>
      <Modal
        title={t('材料报价详情')}
        open={detailMaterial !== null}
        onCancel={() => {
          detailRequest.current++
          setDetailMaterial(null)
        }}
        footer={null}
      >
        {detailPrices.map((price) => (
          <p key={price.priceId}>
            {price.supplierName} ·{' '}
            {price.isPreferredSupplier ? t('首选 · ') : ''}
            {price.isBlacklisted ? t('黑名单 · ') : ''}
            {formatMoney(
              { currency: price.currency, minor: price.unitPriceMinor },
              locale === 'zh' ? 'zh-CN' : locale === 'fr' ? 'fr-FR' : 'en-US',
            )}{' '}
            · {price.unit} · {price.effectiveAt} ·{' '}
            {price.deliveryLeadTime ?? '—'} · {price.paymentTerms ?? '—'} ·{' '}
            {price.sourceNote ?? '—'}
          </p>
        ))}
        <Button
          disabled={detailBusy || detailPage === 0}
          onClick={() =>
            detailMaterial &&
            void loadDetailPrices(
              detailMaterial,
              detailCursors[detailPage - 1],
              detailPage - 1,
            )
          }
        >
          {t('上一页')}
        </Button>
        <Button
          disabled={detailBusy || !detailMore}
          onClick={() =>
            detailMaterial &&
            (() => {
              const after = detailPrices.at(-1)?.priceId ?? null
              setDetailCursors((current) => [
                ...current.slice(0, detailPage + 1),
                after,
              ])
              void loadDetailPrices(detailMaterial, after, detailPage + 1)
            })()
          }
        >
          {t('下一页')}
        </Button>
      </Modal>
      <Modal
        title={editor === 'new' ? t('新增材料') : t('编辑材料')}
        open={editor !== null}
        onCancel={() => setEditor(null)}
        onOk={() => form.submit()}
        okText={t('保存材料')}
        cancelText={t('取消')}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveMaterial}>
          <Form.Item
            label={t('材料名称')}
            name="nameZh"
            rules={[{ required: true, message: t('请填写材料名称') }]}
          >
            <Input autoFocus maxLength={255} />
          </Form.Item>
          <Form.Item
            label={t('型号')}
            name="model"
            rules={[{ required: true, message: t('请填写型号') }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            label={t('规格')}
            name="specification"
            rules={[{ required: true, message: t('请填写规格') }]}
          >
            <Input.TextArea
              maxLength={2000}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item
            label={t('单位')}
            name="unit"
            rules={[{ required: true, message: t('请填写单位') }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item label={t('材料编码 / SKU')} name="sku">
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item label={t('英语名称')} name="nameEn">
            <Input />
          </Form.Item>
          <Form.Item label={t('法语名称')} name="nameFr">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label={t('别名（以逗号分隔）')} name="aliases">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item label={t('品牌')} name="brand">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item label={t('备注')} name="notes">
            <Input.TextArea
              maxLength={1000}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item label={t('材料图片（保存前裁剪为正方形）')}>
            <MaterialImageCropper onChange={onImageChange} />
          </Form.Item>
          <Form.Item
            label={t('启用状态')}
            name="isActive"
            valuePropName="checked"
          >
            <Switch checkedChildren={t('启用')} unCheckedChildren={t('停用')} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('供应商管理')}
        open={supplierManagerOpen}
        onCancel={() => setSupplierManagerOpen(false)}
        footer={
          <>
            <Button
              aria-label={t('关闭供应商管理')}
              onClick={() => setSupplierManagerOpen(false)}
            >
              {t('关闭')}
            </Button>
            <Button type="primary" onClick={() => openSupplierEditor()}>
              {t('新增供应商')}
            </Button>
          </>
        }
        width={820}
      >
        {suppliers.length === 0 ? (
          <p role="status">{t('暂无供应商')}</p>
        ) : (
          <div
            className="materials-table-scroll"
            role="region"
            aria-label={t('供应商表格，可横向滚动')}
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('编码')}</th>
                  <th>{t('供应商')}</th>
                  <th>{t('联系人')}</th>
                  <th>{t('状态')}</th>
                  <th>{t('操作')}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.businessCode}</td>
                    <td>{supplier.name}</td>
                    <td>{supplier.contactName ?? '—'}</td>
                    <td>
                      {supplier.isBlacklisted
                        ? t('黑名单')
                        : supplier.isActive
                          ? t('启用')
                          : t('停用')}
                    </td>
                    <td>
                      <Button
                        type="link"
                        onClick={() => openSupplierEditor(supplier)}
                      >
                        {t('编辑供应商')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal
        title={supplierEditor === 'new' ? t('新增供应商') : t('编辑供应商')}
        open={supplierEditor !== null}
        onCancel={() => setSupplierEditor(null)}
        onOk={() => supplierForm.submit()}
        okText={t('保存供应商')}
        cancelText={t('取消')}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={supplierForm} layout="vertical" onFinish={saveSupplier}>
          <SupplierFormFields editing={supplierEditor !== 'new'} />
        </Form>
      </Modal>
      <Modal
        title={
          quoteMaterial
            ? `${t('维护报价')}：${quoteMaterial.nameZh}`
            : t('维护报价')
        }
        open={quoteMaterial !== null}
        onCancel={() => setQuoteMaterial(null)}
        onOk={() => priceForm.submit()}
        okText={t('保存报价')}
        cancelText={t('取消')}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={priceForm} layout="vertical" onFinish={savePrice}>
          <PriceFormFields suppliers={suppliers} />
        </Form>
      </Modal>
    </>
  )
}

function CatalogTable({
  materials,
  api,
  canEdit,
  onEdit,
  onAddPrice,
  onDetails,
}: {
  materials: CatalogMaterialView[]
  api: CatalogApi
  canEdit: boolean
  onEdit: (material: CatalogMaterialView) => void
  onAddPrice: (material: CatalogMaterialView) => void
  onDetails: (material: CatalogMaterialView) => void
}) {
  const { locale } = useUiLocale()
  const t = (key: CatalogMessage) => catalogText(locale, key)
  return (
    <Card
      className="card materials-catalog-card"
      title={
        <>
          <span>{t('当前页材料')}</span>{' '}
          <span className="muted">
            · {materials.length} {t('项')}
          </span>
        </>
      }
      extra={<span className="muted">{t('数据来自本地 SQLite')}</span>}
    >
      {materials.length === 0 ? (
        <p role="status">{t('未找到匹配材料')}</p>
      ) : (
        <div
          className="materials-table-scroll"
          role="region"
          aria-label={t('材料表格，可横向滚动')}
          tabIndex={0}
        >
          <table className="data-table materials-data-table">
            <thead>
              <tr>
                <th>{t('材料')}</th>
                <th>{t('型号 / 规格')}</th>
                <th>{t('单位')}</th>
                <th>{t('供应商报价（最多 4 家）')}</th>
                <th>{t('操作')}</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.id}>
                  <td>
                    <div className="material-name">
                      <MaterialThumbnail api={api} materialId={material.id} />
                      <strong>
                        {locale === 'fr'
                          ? material.nameFr || material.nameZh
                          : locale === 'en'
                            ? material.nameEn || material.nameZh
                            : material.nameZh}
                      </strong>
                      {material.isActive === false && <span>{t('停用')}</span>}
                    </div>
                  </td>
                  <td>
                    {material.model} · {material.specification}
                  </td>
                  <td>{material.unit}</td>
                  <td>
                    <div className="quote-grid">
                      {material.prices.map((price) => (
                        <div
                          className={`quote ${price.isPreferredSupplier ? 'preferred' : ''}`}
                          key={price.priceId}
                        >
                          <strong>
                            {price.supplierName}
                            {price.isPreferredSupplier ? t(' · 首选') : ''}
                          </strong>
                          <span>
                            {formatMoney(
                              {
                                currency: price.currency,
                                minor: price.unitPriceMinor,
                              },
                              locale === 'zh'
                                ? 'zh-CN'
                                : locale === 'fr'
                                  ? 'fr-FR'
                                  : 'en-US',
                            )}
                          </span>
                        </div>
                      ))}
                      {material.prices.length === 0 && (
                        <span className="muted">{t('暂无有效报价')}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Button type="link" onClick={() => onDetails(material)}>
                      {t('查看全部报价')}
                    </Button>
                    {canEdit && (
                      <>
                        <Button type="link" onClick={() => onEdit(material)}>
                          {t('编辑材料')}
                        </Button>
                        <Button
                          type="link"
                          disabled={material.isActive === false}
                          onClick={() => onAddPrice(material)}
                        >
                          {t('维护报价')}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function MaterialThumbnail({
  api,
  materialId,
}: {
  api: CatalogApi
  materialId: string
}) {
  const { locale } = useUiLocale()
  const t = (key: CatalogMessage) => catalogText(locale, key)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    api
      .getMaterialSquareImage(materialId)
      .then((image) => isCurrent && setSource(image))
      .catch(() => isCurrent && setSource(null))
    return () => {
      isCurrent = false
    }
  }, [api, materialId])

  return source ? (
    <img
      className="material-image material-thumbnail"
      src={source}
      alt={t('材料图片')}
    />
  ) : (
    <span className="material-image" aria-hidden="true">
      ▧
    </span>
  )
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function localIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
