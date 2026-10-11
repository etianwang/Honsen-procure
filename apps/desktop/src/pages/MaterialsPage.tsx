import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Spin,
  Switch,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import {
  formatMoney,
  type Material,
  type MaterialPrice,
  type Supplier,
} from '@honsen/shared'
import {
  tauriCatalogApi,
  type CatalogApi,
  type CatalogMaterialView,
  type SupplierView,
} from '../lib/catalog-api'
import {
  MaterialImageCropper,
  type MaterialImageDraft,
} from '../components/MaterialImageCropper'
import { canEditMaterials, type UserRole } from '../lib/permissions'

type MaterialsPageProps = { role: UserRole; api?: CatalogApi }
type MaterialFormValues = {
  sku?: string
  nameZh: string
  nameFr?: string
  aliases?: string
  brand?: string
  model: string
  specification: string
  unit: string
  notes?: string
  isActive: boolean
}
type SupplierFormValues = {
  businessCode: string
  name: string
  contactName?: string
  address?: string
  city?: string
  country?: string
  phone?: string
  whatsapp?: string
  email?: string
  paymentTerms?: string
  deliveryLeadTime?: string
  isPreferred: boolean
  isBlacklisted: boolean
  isActive: boolean
}
type PriceFormValues = {
  supplierId: string
  currency: 'XOF' | 'CNY' | 'USD' | 'EUR'
  unitPriceMinor: string
  unit: string
  effectiveAt: string
  sourceNote?: string
}

export function MaterialsPage({
  role,
  api = tauriCatalogApi,
}: MaterialsPageProps) {
  const canEdit = canEditMaterials(role)
  const [query, setQuery] = useState('')
  const [materials, setMaterials] = useState<CatalogMaterialView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [editor, setEditor] = useState<CatalogMaterialView | 'new' | null>(null)
  const [supplierManagerOpen, setSupplierManagerOpen] = useState(false)
  const [supplierEditor, setSupplierEditor] = useState<
    SupplierView | 'new' | null
  >(null)
  const [quoteMaterial, setQuoteMaterial] =
    useState<CatalogMaterialView | null>(null)
  const [imageDraft, setImageDraft] = useState<MaterialImageDraft | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierView[]>([])
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<MaterialFormValues>()
  const [supplierForm] = Form.useForm<SupplierFormValues>()
  const [priceForm] = Form.useForm<PriceFormValues>()

  useEffect(() => {
    let isCurrent = true
    api
      .searchCatalog(query)
      .then((result) => {
        if (!isCurrent) return
        setError(null)
        setMaterials(result)
      })
      .catch(() => isCurrent && setError('无法读取本地材料库'))
    return () => {
      isCurrent = false
    }
  }, [api, query, reloadKey])

  useEffect(() => {
    if (!editor) return
    const material = editor === 'new' ? undefined : editor
    form.setFieldsValue(
      material
        ? {
            sku: material.sku ?? undefined,
            nameZh: material.nameZh,
            nameFr: material.nameFr ?? undefined,
            aliases: material.aliases.join(', '),
            brand: material.brand ?? undefined,
            model: material.model,
            specification: material.specification,
            unit: material.unit,
            notes: material.notes ?? undefined,
            isActive: true,
          }
        : { isActive: true },
    )
  }, [editor, form])

  useEffect(() => {
    if (!supplierEditor) return
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
            isPreferred: supplier.isPreferred,
            isBlacklisted: supplier.isBlacklisted,
            isActive: supplier.isActive,
          }
        : { isPreferred: false, isBlacklisted: false, isActive: true },
    )
  }, [supplierEditor, supplierForm])

  useEffect(() => {
    if (!quoteMaterial) return
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
      sku: optionalText(values.sku),
      nameZh: values.nameZh.trim(),
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
    const supplier: Supplier = {
      id: existing?.id ?? crypto.randomUUID(),
      businessCode: values.businessCode.trim(),
      name: values.name.trim(),
      contactName: optionalText(values.contactName),
      address: optionalText(values.address),
      city: optionalText(values.city),
      country: optionalText(values.country),
      phone: optionalText(values.phone),
      whatsapp: optionalText(values.whatsapp),
      email: optionalText(values.email),
      paymentTerms: optionalText(values.paymentTerms),
      deliveryLeadTime: optionalText(values.deliveryLeadTime),
      isPreferred: values.isPreferred,
      isBlacklisted: values.isBlacklisted,
      isActive: values.isActive,
      version: (existing?.version ?? 0) + 1,
    }
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

  async function savePrice(values: PriceFormValues) {
    if (!quoteMaterial) return
    const price: MaterialPrice = {
      id: crypto.randomUUID(),
      materialId: quoteMaterial.id,
      supplierId: values.supplierId,
      currency: values.currency,
      unitPriceMinor: values.unitPriceMinor,
      unit: values.unit.trim(),
      effectiveAt: values.effectiveAt,
      sourceNote: optionalText(values.sourceNote),
      version: 1,
    }
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
          <h2>材料库总览</h2>
          <p>每种材料最多展示四家有效供应商报价；同币种才可在订单内比较。</p>
        </div>
        {canEdit && (
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => openEditor()}
          >
            新增材料
          </Button>
        )}
      </section>
      <section className="toolbar" aria-label="材料筛选">
        <Input
          className="search"
          type="search"
          placeholder="搜索材料名称、型号、规格或供应商"
          aria-label="搜索材料"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Search size={16} aria-hidden="true" />}
        />
        <Button disabled icon={<SlidersHorizontal size={16} />}>
          筛选
        </Button>
        {canEdit && <Button onClick={openSupplierManager}>供应商管理</Button>}
      </section>
      {notice && (
        <Alert
          type="success"
          title={notice}
          showIcon
          closable
          onClose={() => setNotice(null)}
        />
      )}
      {error ? (
        <Alert type="error" title={error} showIcon />
      ) : materials === null ? (
        <Spin aria-label="正在搜索材料" />
      ) : (
        <CatalogTable
          materials={materials}
          api={api}
          canEdit={canEdit}
          onEdit={openEditor}
          onAddPrice={openPriceEditor}
        />
      )}
      <p className="access-note">
        {canEdit
          ? '采购员和管理员可新增、修改、停用材料及维护供应商价格。'
          : '工程师与查看者仅可搜索和查看材料及供应商价格。'}
      </p>
      <Modal
        title={editor === 'new' ? '新增材料' : '编辑材料'}
        open={editor !== null}
        onCancel={() => setEditor(null)}
        onOk={() => form.submit()}
        okText="保存材料"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveMaterial}>
          <Form.Item
            label="材料名称"
            name="nameZh"
            rules={[{ required: true, message: '请填写材料名称' }]}
          >
            <Input autoFocus maxLength={255} />
          </Form.Item>
          <Form.Item
            label="型号"
            name="model"
            rules={[{ required: true, message: '请填写型号' }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            label="规格"
            name="specification"
            rules={[{ required: true, message: '请填写规格' }]}
          >
            <Input.TextArea
              maxLength={2000}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item
            label="单位"
            name="unit"
            rules={[{ required: true, message: '请填写单位' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item label="材料编码 / SKU" name="sku">
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item label="法语名称" name="nameFr">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="别名（以逗号分隔）" name="aliases">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item label="品牌" name="brand">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item label="备注" name="notes">
            <Input.TextArea
              maxLength={1000}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item label="材料图片（保存前裁剪为正方形）">
            <MaterialImageCropper onChange={onImageChange} />
          </Form.Item>
          <Form.Item label="启用状态" name="isActive" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="供应商管理"
        open={supplierManagerOpen}
        onCancel={() => setSupplierManagerOpen(false)}
        footer={
          <>
            <Button
              aria-label="关闭供应商管理"
              onClick={() => setSupplierManagerOpen(false)}
            >
              关闭
            </Button>
            <Button type="primary" onClick={() => openSupplierEditor()}>
              新增供应商
            </Button>
          </>
        }
        width={820}
      >
        {suppliers.length === 0 ? (
          <p role="status">暂无供应商</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>编码</th>
                <th>供应商</th>
                <th>联系人</th>
                <th>状态</th>
                <th>操作</th>
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
                      ? '黑名单'
                      : supplier.isActive
                        ? '启用'
                        : '停用'}
                  </td>
                  <td>
                    <Button
                      type="link"
                      onClick={() => openSupplierEditor(supplier)}
                    >
                      编辑供应商
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
      <Modal
        title={supplierEditor === 'new' ? '新增供应商' : '编辑供应商'}
        open={supplierEditor !== null}
        onCancel={() => setSupplierEditor(null)}
        onOk={() => supplierForm.submit()}
        okText="保存供应商"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={supplierForm} layout="vertical" onFinish={saveSupplier}>
          <Form.Item
            label="供应商编码"
            name="businessCode"
            rules={[{ required: true, message: '请填写供应商编码' }]}
          >
            <Input disabled={supplierEditor !== 'new'} maxLength={64} />
          </Form.Item>
          <Form.Item
            label="供应商名称"
            name="name"
            rules={[{ required: true, message: '请填写供应商名称' }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="联系人" name="contactName">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="地址" name="address">
            <Input.TextArea
              maxLength={1000}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item label="城市" name="city">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="国家" name="country">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="电话" name="phone">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="WhatsApp" name="whatsapp">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ type: 'email', message: '请填写有效邮箱' }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="付款条件" name="paymentTerms">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item label="交货期" name="deliveryLeadTime">
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item
            label="首选供应商"
            name="isPreferred"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="黑名单"
            name="isBlacklisted"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item label="启用状态" name="isActive" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={quoteMaterial ? `维护报价：${quoteMaterial.nameZh}` : '维护报价'}
        open={quoteMaterial !== null}
        onCancel={() => setQuoteMaterial(null)}
        onOk={() => priceForm.submit()}
        okText="保存报价"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={priceForm} layout="vertical" onFinish={savePrice}>
          <Form.Item
            label="供应商"
            name="supplierId"
            rules={[{ required: true, message: '请选择供应商' }]}
          >
            <Select
              placeholder="选择启用且非黑名单供应商"
              options={suppliers
                .filter(
                  (supplier) => supplier.isActive && !supplier.isBlacklisted,
                )
                .map((supplier) => ({
                  value: supplier.id,
                  label: `${supplier.businessCode} · ${supplier.name}`,
                }))}
            />
          </Form.Item>
          <Form.Item label="货币" name="currency" rules={[{ required: true }]}>
            <Select
              options={['XOF', 'CNY', 'USD', 'EUR'].map((value) => ({ value }))}
            />
          </Form.Item>
          <Form.Item
            label="单价（最小货币单位）"
            name="unitPriceMinor"
            rules={[
              {
                required: true,
                pattern: /^\d+$/,
                message: '请输入非负整数，不可使用小数',
              },
            ]}
          >
            <Input inputMode="numeric" />
          </Form.Item>
          <Form.Item
            label="单位"
            name="unit"
            rules={[{ required: true, message: '请填写单位' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            label="生效日期"
            name="effectiveAt"
            rules={[{ required: true, message: '请选择生效日期' }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item label="来源备注" name="sourceNote">
            <Input.TextArea
              maxLength={1000}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
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
}: {
  materials: CatalogMaterialView[]
  api: CatalogApi
  canEdit: boolean
  onEdit: (material: CatalogMaterialView) => void
  onAddPrice: (material: CatalogMaterialView) => void
}) {
  return (
    <Card
      className="card"
      title={
        <>
          <span>全部材料</span>{' '}
          <span className="muted">· {materials.length} 项</span>
        </>
      }
      extra={<span className="muted">数据来自本地 SQLite</span>}
    >
      {materials.length === 0 ? (
        <p role="status">未找到匹配材料</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>材料</th>
              <th>型号 / 规格</th>
              <th>单位</th>
              <th>供应商报价（最多 4 家）</th>
              {canEdit && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material.id}>
                <td>
                  <div className="material-name">
                    <MaterialThumbnail api={api} materialId={material.id} />
                    <strong>{material.nameZh}</strong>
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
                          {price.isPreferredSupplier ? ' · 首选' : ''}
                        </strong>
                        <span>
                          {formatMoney(
                            {
                              currency: price.currency,
                              minor: price.unitPriceMinor,
                            },
                            'zh-CN',
                          )}
                        </span>
                      </div>
                    ))}
                    {material.prices.length === 0 && (
                      <span className="muted">暂无有效报价</span>
                    )}
                  </div>
                </td>
                {canEdit && (
                  <td>
                    <Button type="link" onClick={() => onEdit(material)}>
                      编辑材料
                    </Button>
                    <Button type="link" onClick={() => onAddPrice(material)}>
                      维护报价
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
      alt="材料图片"
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
