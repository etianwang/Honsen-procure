import { Form, Input, Select, Switch } from 'antd'
import { useUiLocale } from '../lib/ui-locale'
import { catalogText, type CatalogMessage } from '../lib/catalog-messages'
import type { SupplierView } from '../lib/catalog-api'
import { currencySchema } from '@honsen/shared'

export function SupplierFormFields({ editing }: { editing: boolean }) {
  const { locale } = useUiLocale()
  const t = (key: CatalogMessage) => catalogText(locale, key)
  return (
    <>
      <Form.Item
        label={t('供应商编码')}
        name="businessCode"
        rules={[{ required: true, message: t('请填写供应商编码') }]}
      >
        <Input disabled={editing} maxLength={64} />
      </Form.Item>
      <Form.Item
        label={t('供应商名称')}
        name="name"
        rules={[{ required: true, message: t('请填写供应商名称') }]}
      >
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item label={t('联系人')} name="contactName">
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item label={t('地址')} name="address">
        <Input.TextArea
          maxLength={1000}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </Form.Item>
      <Form.Item label={t('城市')} name="city">
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item label={t('国家')} name="country">
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item label={t('电话')} name="phone">
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item label="WhatsApp" name="whatsapp">
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item
        label={t('邮箱')}
        name="email"
        rules={[{ type: 'email', message: t('请填写有效邮箱') }]}
      >
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item label={t('付款条件')} name="paymentTerms">
        <Input maxLength={1000} />
      </Form.Item>
      <Form.Item label={t('交货期')} name="deliveryLeadTime">
        <Input maxLength={1000} />
      </Form.Item>
      <Form.Item label={t('备注')} name="notes">
        <Input.TextArea
          maxLength={1000}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </Form.Item>
      <Form.Item
        label={t('首选供应商')}
        name="isPreferred"
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>
      <Form.Item
        label={t('黑名单')}
        name="isBlacklisted"
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>
      <Form.Item label={t('启用状态')} name="isActive" valuePropName="checked">
        <Switch checkedChildren={t('启用')} unCheckedChildren={t('停用')} />
      </Form.Item>
    </>
  )
}
export function PriceFormFields({ suppliers }: { suppliers: SupplierView[] }) {
  const { locale } = useUiLocale()
  const t = (key: CatalogMessage) => catalogText(locale, key)
  return (
    <>
      <Form.Item
        label={t('供应商')}
        name="supplierId"
        rules={[{ required: true, message: t('请选择供应商') }]}
      >
        <Select
          placeholder={t('选择启用且非黑名单供应商')}
          options={suppliers
            .filter((supplier) => supplier.isActive && !supplier.isBlacklisted)
            .map((supplier) => ({
              value: supplier.id,
              label: `${supplier.businessCode} · ${supplier.name}`,
            }))}
        />
      </Form.Item>
      <Form.Item label={t('货币')} name="currency" rules={[{ required: true }]}>
        <Select options={currencySchema.options.map((value) => ({ value }))} />
      </Form.Item>
      <Form.Item
        label={t('单价（最小货币单位）')}
        name="unitPriceMinor"
        rules={[
          {
            required: true,
            pattern: /^\d+$/,
            message: t('请输入非负整数，不可使用小数'),
          },
        ]}
      >
        <Input inputMode="numeric" />
      </Form.Item>
      <Form.Item
        label={t('单位')}
        name="unit"
        rules={[{ required: true, message: t('请填写单位') }]}
      >
        <Input maxLength={64} />
      </Form.Item>
      <Form.Item
        label={t('生效日期')}
        name="effectiveAt"
        rules={[{ required: true, message: t('请选择生效日期') }]}
      >
        <Input type="date" />
      </Form.Item>
      <Form.Item label={t('来源备注')} name="sourceNote">
        <Input.TextArea
          maxLength={1000}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </Form.Item>
    </>
  )
}
