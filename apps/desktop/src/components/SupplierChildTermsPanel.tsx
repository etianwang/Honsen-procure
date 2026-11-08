import { useUiLocale } from '../lib/ui-locale'
import {
  supplierText,
  type SupplierMessage,
  type SupplierNotice,
} from '../lib/supplier-workflow-messages'
import { FormalPrintPreview } from './FormalPrintPreview'
import { Alert, Button, Card, Checkbox, Input, Space } from 'antd'
import { useRef, useState } from 'react'
import type {
  SupplierChildTermsInput,
  SupplierOrderApi,
} from '../lib/supplier-order-api'

type ChildLine = {
  id: string
  materialName: string
  currency: string
}

type SupplierChildTermsPanelProps = {
  api: SupplierOrderApi
  orderId: string
  lines: ChildLine[]
}

const zero = { kind: 'fixed_minor', minor: '0' } as const

export function SupplierChildTermsPanel({
  api,
  orderId,
  lines,
}: SupplierChildTermsPanelProps) {
  const { locale } = useUiLocale()
  const t = (key: SupplierMessage) => supplierText(locale, key)
  const [taxRateBasisPoints, setTaxRateBasisPoints] = useState('0')
  const [manualStampDutyMinor, setManualStampDutyMinor] = useState('0')
  const [orderDiscount, setOrderDiscount] = useState('0')
  const [orderFreight, setOrderFreight] = useState('0')
  const [lineTerms, setLineTerms] = useState(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        { discount: '0', freight: '0', freightIncluded: false },
      ]),
    ),
  )
  const [saved, setSaved] = useState(false)
  const requestPending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [messageType, setMessageType] = useState<'success' | 'error'>('error')
  const [message, setMessage] = useState<SupplierNotice | null>(null)

  function input(): SupplierChildTermsInput | null {
    const tax = Number(taxRateBasisPoints)
    if (
      !/^\d+$/.test(taxRateBasisPoints) ||
      tax > 100_000 ||
      !/^(0|[1-9]\d*)$/.test(manualStampDutyMinor) ||
      BigInt(manualStampDutyMinor) > 9223372036854775807n ||
      !/^\d+$/.test(orderDiscount) ||
      !/^\d+$/.test(orderFreight)
    ) {
      setMessage({ key: '税率、折扣和运费必须为非负整数金额/基点。' })
      return null
    }
    return {
      orderId,
      taxRateBasisPoints: tax,
      manualStampDutyMinor,
      orderDiscount: { kind: 'fixed_minor', minor: orderDiscount },
      orderFreight: { kind: 'fixed_minor', minor: orderFreight },
      lines: lines.map((line) => {
        const terms = lineTerms[line.id]
        return {
          orderItemId: line.id,
          lineDiscount: { ...zero, minor: terms.discount },
          lineFreight: { ...zero, minor: terms.freight },
          freightIncluded: terms.freightIncluded,
        }
      }),
    }
  }

  async function save() {
    if (requestPending.current) return
    setMessageType('error')
    const payload = input()
    if (!payload) return
    requestPending.current = true
    setBusy(true)
    setMessage(null)
    try {
      const total = await api.saveSupplierChildTerms(payload)
      setMessageType('success')
      setSaved(true)
      setMessage({ key: 'saved', values: { total: total.totalMinor } })
    } catch {
      setMessage({ key: '保存失败：请确认子单仍为草稿且所有金额有效。' })
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }

  async function send() {
    if (requestPending.current) return
    setMessageType('error')
    if (!saved) {
      setMessage({ key: '请先保存税、折扣和运费条款。' })
      return
    }
    requestPending.current = true
    setBusy(true)
    setMessage(null)
    try {
      const issued = await api.sendSupplierOrder(orderId)
      setMessageType('success')
      if (issued) {
        setMessage({
          key: 'issued',
          values: { number: issued.formalDocumentNo },
        })
        return
      }
      setMessage({ key: '供应商子单已签发 SPO 并发送，可开始登记收货。' })
    } catch {
      setMessage({
        key: '发送失败：请确认父单已批准、子单条款已保存且订单尚未签发；原条款已保留。',
      })
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }

  return (
    <Card className="card" title={t('供应商子单条款')}>
      <FormalPrintPreview orderId={orderId} />
      <p className="muted">
        {t(
          '子单只使用一种币种；保存后的税、折扣、运费和金额会写入不可变审计。',
        )}
      </p>
      {message ? (
        <Alert
          title={supplierText(locale, message.key, message.values)}
          type={messageType}
          role={messageType === 'error' ? 'alert' : 'status'}
          showIcon
        />
      ) : null}
      <div className="requisition-lines" aria-label={t('子单明细条款')}>
        {lines.map((line) => {
          const terms = lineTerms[line.id]
          return (
            <article className="requisition-line" key={line.id}>
              <strong>{line.materialName}</strong> · {line.currency}
              <div className="requisition-fields">
                <label>
                  {t('行折扣（最小货币单位）')}
                  <Input
                    disabled={busy}
                    aria-label={`${line.materialName} ${t('行折扣')}`}
                    inputMode="numeric"
                    value={terms.discount}
                    onChange={(event) =>
                      setLineTerms((current) => ({
                        ...current,
                        [line.id]: {
                          ...current[line.id],
                          discount: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  {t('行运费（最小货币单位）')}
                  <Input
                    disabled={busy}
                    aria-label={`${line.materialName} ${t('行运费')}`}
                    inputMode="numeric"
                    value={terms.freight}
                    onChange={(event) =>
                      setLineTerms((current) => ({
                        ...current,
                        [line.id]: {
                          ...current[line.id],
                          freight: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <Checkbox
                  disabled={busy}
                  checked={terms.freightIncluded}
                  onChange={(event) =>
                    setLineTerms((current) => ({
                      ...current,
                      [line.id]: {
                        ...current[line.id],
                        freightIncluded: event.target.checked,
                      },
                    }))
                  }
                >
                  {t('单价已含运费')}
                </Checkbox>
              </div>
            </article>
          )
        })}
      </div>
      <div className="requisition-fields">
        <label>
          {t('印花税（手填，单据币种最小单位）')}
          <Input
            disabled={busy}
            aria-label={t('印花税（手填，单据币种最小单位）')}
            inputMode="numeric"
            value={manualStampDutyMinor}
            onChange={(event) => setManualStampDutyMinor(event.target.value)}
          />
        </label>
        <label>
          {t('税率（基点；18% = 1800）')}
          <Input
            disabled={busy}
            aria-label={t('子单税率')}
            inputMode="numeric"
            value={taxRateBasisPoints}
            onChange={(event) => setTaxRateBasisPoints(event.target.value)}
          />
        </label>
        <label>
          {t('单据折扣（最小货币单位）')}
          <Input
            disabled={busy}
            aria-label={t('子单单据折扣')}
            inputMode="numeric"
            value={orderDiscount}
            onChange={(event) => setOrderDiscount(event.target.value)}
          />
        </label>
        <label>
          {t('单据运费（最小货币单位）')}
          <Input
            disabled={busy}
            aria-label={t('子单单据运费')}
            inputMode="numeric"
            value={orderFreight}
            onChange={(event) => setOrderFreight(event.target.value)}
          />
        </label>
      </div>
      <Space className="requisition-actions" wrap>
        <Button
          disabled={busy}
          loading={busy}
          type="primary"
          onClick={() => void save()}
        >
          {t('保存子单条款')}
        </Button>
        <Button disabled={busy} loading={busy} onClick={() => void send()}>
          {t('发送供应商')}
        </Button>
      </Space>
    </Card>
  )
}
