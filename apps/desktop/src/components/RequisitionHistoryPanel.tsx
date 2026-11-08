import { useUiLocale } from '../lib/ui-locale'
import { historyText, historyAuditText } from '../lib/history-locale'
import { Alert, Button, Card, Input, Select, Table, Tag } from 'antd'
import { currencySchema, formatMoney } from '@honsen/shared'
import { useEffect, useRef, useState } from 'react'
import type {
  RequisitionApi,
  RequisitionDetail,
  RequisitionHistoryCursor,
  RequisitionHistoryFilter,
  RequisitionHistoryPage,
} from '../lib/requisition-api'
import { buildHistoryWorkbook } from '../lib/history-excel'
import { tauriWorkflowApi } from '../lib/workflow-api'
import type { WorkflowApi } from '../lib/workflow-api'
import { OrderWorkflowPanel } from './OrderWorkflowPanel'
import { FormalPrintPreview } from './FormalPrintPreview'
import './RequisitionHistoryPanel.css'

export type HistoryEntryRequest = {
  filter: RequisitionHistoryFilter
  requestId: number
  orderId?: string
}

type Props = {
  entry?: HistoryEntryRequest
  api: Pick<
    RequisitionApi,
    | 'listRequisitionHistory'
    | 'getRequisitionDetail'
    | 'withdrawRequisition'
    | 'issueOwnerFormalOrder'
    | 'issueHonsenFormalOrder'
  >
  refreshKey: string
  projectId: string
  applicantId: string
  onCopy: (detail: RequisitionDetail) => void
  copyDisabled?: boolean
  workflowApi?: WorkflowApi
  canApprove: boolean
}

export function RequisitionHistoryPanel({
  entry,
  api,
  refreshKey,
  projectId,
  applicantId,
  onCopy,
  copyDisabled = false,
  workflowApi,
  canApprove,
}: Props) {
  const { locale } = useUiLocale()
  const t = (message: Parameters<typeof historyText>[1]) =>
    historyText(locale, message)
  const statusText = (state: string) => {
    const keys: Record<string, Parameters<typeof historyText>[1]> = {
      draft: '草稿',
      pending_confirmation: '待确认',
      rejected: '已驳回',
      confirmed: '已批准',
      approved: '已批准',
      formally_issued: '已发单',
      executing: '采购执行中',
      receiving: '收货中',
      completed: '已完成',
      completed_with_conditions: '附条件完成',
      cancelled: '已取消',
    }
    return t(keys[state] ?? '未知状态')
  }
  const labels = {
    zh: [
      '单据编号',
      '项目',
      '工地',
      '金额',
      '采购模式',
      '最后更新',
      '操作',
      '未正式编号',
    ],
    en: [
      'Document',
      'Project',
      'Site',
      'Amount',
      'Procurement mode',
      'Last updated',
      'Actions',
      'Not formally numbered',
    ],
    fr: [
      'Document',
      'Projet',
      'Chantier',
      'Montant',
      'Mode d’achat',
      'Dernière mise à jour',
      'Actions',
      'Sans numéro officiel',
    ],
  }[locale]
  const numberLabel = (displayNo: string, state: string) =>
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      displayNo,
    )
      ? state === 'draft'
        ? t('草稿')
        : labels[7]
      : displayNo || (state === 'draft' ? t('草稿') : labels[7])
  const numberLocale =
    locale === 'zh' ? 'zh-CN' : locale === 'fr' ? 'fr-FR' : 'en-US'
  const [records, setRecords] = useState<RequisitionHistoryPage['records']>([])
  const [cursor, setCursor] = useState<RequisitionHistoryCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const listRequest = useRef(0)
  const pagePending = useRef(false)
  const [query, setQuery] = useState(entry?.filter.query ?? '')
  const [dateFrom, setDateFrom] = useState(entry?.filter.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(entry?.filter.dateTo ?? '')
  const [dateError, setDateError] = useState(false)
  const [workflowStatus, setWorkflowStatus] = useState(
    entry?.filter.workflowStatus ?? '',
  )
  const [currentProjectOnly, setCurrentProjectOnly] = useState(
    entry?.filter.projectId === projectId,
  )
  const [filter, setFilter] = useState<RequisitionHistoryFilter>(
    entry?.filter ?? {},
  )
  const entryTarget = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<RequisitionDetail | null>(null)
  const [detailError, setDetailError] = useState(false)
  const [detailLoading, setDetailLoading] = useState(!!entry?.orderId)
  const [withdrawError, setWithdrawError] = useState(false)
  const [issueError, setIssueError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [exportLocale, setExportLocale] = useState<
    'zh-CN' | 'fr-FR' | 'en-US' | null
  >(null)
  async function exportExcel() {
    setExporting(true)
    setExportError(false)
    try {
      const bytes = await buildHistoryWorkbook(
        {
          ...api,
          listOrderComments: (workflowApi ?? tauriWorkflowApi)
            .listOrderComments,
          getInternalExportDocument: async (orderId) => {
            const invoke = (
              window as Window & {
                __TAURI__?: {
                  core?: {
                    invoke?: (name: string, args: object) => Promise<unknown>
                  }
                }
              }
            ).__TAURI__?.core?.invoke
            if (!invoke) throw Error('Desktop unavailable')
            return invoke('get_internal_export_document', { orderId })
          },
        },
        filter,
        exportLocale ??
          (locale === 'en' ? 'en-US' : locale === 'fr' ? 'fr-FR' : 'zh-CN'),
      )
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = 'Honsen-Procure-history.xlsx'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }
  const detailRequest = useRef(0)

  useEffect(() => {
    if (!entry) return
    entryTarget.current?.scrollIntoView({ block: 'start' })
  }, [entry])

  useEffect(() => {
    if (!entry?.orderId) return
    const request = ++detailRequest.current
    let active = true
    void api
      .getRequisitionDetail(entry.orderId)
      .then((value) => {
        if (active && request === detailRequest.current) setDetail(value)
      })
      .catch(() => {
        if (active && request === detailRequest.current) setDetailError(true)
      })
      .finally(() => {
        if (active && request === detailRequest.current) setDetailLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, entry])

  useEffect(() => {
    let active = true
    const request = ++listRequest.current
    pagePending.current = false
    setLoading(true)
    api
      .listRequisitionHistory(undefined, filter)
      .then((page) => {
        if (!active || request !== listRequest.current) return
        setRecords(page.records)
        setCursor(page.nextCursor)
        setError(false)
      })
      .catch(() => {
        if (active && request === listRequest.current) setError(true)
      })
      .finally(() => {
        if (active && request === listRequest.current) setLoading(false)
      })
    return () => {
      active = false
      listRequest.current += 1
    }
  }, [api, filter, refreshKey, retry])

  async function loadMore() {
    if (!cursor || loading || pagePending.current) return
    const request = listRequest.current
    pagePending.current = true
    setLoading(true)
    setError(false)
    try {
      const page = await api.listRequisitionHistory(cursor, filter)
      if (request !== listRequest.current) return
      setRecords((current) => [...current, ...page.records])
      setCursor(page.nextCursor)
    } catch {
      if (request === listRequest.current) setError(true)
    } finally {
      if (request === listRequest.current) {
        pagePending.current = false
        setLoading(false)
      }
    }
  }

  async function openDetail(orderId: string) {
    const request = ++detailRequest.current
    setDetail(null)
    setDetailError(false)
    setDetailLoading(true)
    try {
      const result = await api.getRequisitionDetail(orderId)
      if (request === detailRequest.current) setDetail(result)
    } catch {
      if (request === detailRequest.current) setDetailError(true)
    } finally {
      if (request === detailRequest.current) setDetailLoading(false)
    }
  }

  async function withdrawHistoricalOrder(orderId: string) {
    setWithdrawError(false)
    try {
      await api.withdrawRequisition(orderId)
      await openDetail(orderId)
      setRetry((value) => value + 1)
    } catch {
      setWithdrawError(true)
    }
  }

  async function issueOrder(orderId: string, mode: string | null) {
    setIssueError(false)
    try {
      if (mode === 'owner_self_purchase')
        await api.issueOwnerFormalOrder(orderId)
      else await api.issueHonsenFormalOrder(orderId)
      await openDetail(orderId)
      setRetry((value) => value + 1)
    } catch {
      setIssueError(true)
    }
  }

  return (
    <Card ref={entryTarget} className="card" title={t('请购历史')}>
      <p>
        {t(
          '导出当前筛选范围的全部授权记录，包含内部评论与审计；此文件用于内部核对。',
        )}
      </p>
      <label htmlFor="history-export-language">{t('Excel导出语言')}</label>
      <Select
        id="history-export-language"
        aria-label={t('Excel导出语言')}
        value={
          exportLocale ??
          (locale === 'en' ? 'en-US' : locale === 'fr' ? 'fr-FR' : 'zh-CN')
        }
        onChange={setExportLocale}
        options={[
          { value: 'zh-CN', label: '中文' },
          { value: 'fr-FR', label: 'Français' },
          { value: 'en-US', label: 'English' },
        ]}
      />
      <Button
        loading={exporting}
        disabled={exporting}
        onClick={() => void exportExcel()}
      >
        {t('导出Excel')}
      </Button>
      {exportError && (
        <Alert
          type="error"
          title={t('导出失败，未下载部分结果；请刷新列表后重试。')}
        />
      )}
      <form
        className="history-filters"
        onSubmit={(event) => {
          event.preventDefault()
          if (dateFrom && dateTo && dateFrom > dateTo) {
            setDateError(true)
            return
          }
          setDateError(false)
          setRecords([])
          listRequest.current += 1
          setCursor(null)
          detailRequest.current += 1
          setDetail(null)
          setLoading(true)
          setError(false)
          setFilter({
            query: query.trim() || undefined,
            workflowStatus: workflowStatus || undefined,
            projectId: currentProjectOnly ? projectId : undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          })
        }}
      >
        <label>
          {t('搜索单号、项目或工地')}
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          {t('申请日期从')}
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              setDateFrom(event.target.value)
              setDateError(false)
            }}
          />
        </label>
        <label>
          {t('申请日期至')}
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            aria-invalid={dateError}
            aria-describedby={dateError ? 'history-date-error' : undefined}
            onChange={(event) => {
              setDateTo(event.target.value)
              setDateError(false)
            }}
          />
          {dateError ? (
            <span id="history-date-error" role="alert">
              {t('结束日期不能早于开始日期。')}
            </span>
          ) : null}
        </label>
        <label>
          {t('请购状态')}
          <select
            value={workflowStatus}
            onChange={(event) => setWorkflowStatus(event.target.value)}
          >
            <option value="">{t('全部状态')}</option>
            <option value="draft">{t('草稿')}</option>
            <option value="pending_confirmation">{t('待确认')}</option>
            <option value="rejected">{t('已驳回')}</option>
            <option value="confirmed">{t('已批准')}</option>
            <option value="approved">{t('已批准（新状态）')}</option>
            <option value="formally_issued">{t('已发单')}</option>
            <option value="executing">{t('采购执行中')}</option>
            <option value="receiving">{t('收货中')}</option>
            <option value="completed">{t('已完成')}</option>
            <option value="completed_with_conditions">{t('附条件完成')}</option>
            <option value="cancelled">{t('已取消')}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={currentProjectOnly}
            onChange={(event) => setCurrentProjectOnly(event.target.checked)}
          />
          {t('仅当前项目')}
        </label>
        <Button htmlType="submit" aria-label={t('筛选')}>
          {t('筛选')}
        </Button>
      </form>
      {error ? (
        <Alert
          type="error"
          title={t('历史加载失败。')}
          action={
            <Button
              onClick={() => {
                listRequest.current += 1
                setLoading(true)
                setError(false)
                setRetry((value) => value + 1)
              }}
            >
              {t('重试')}
            </Button>
          }
        />
      ) : null}
      <div
        className="history-table-region"
        role="region"
        tabIndex={0}
        aria-label={t('请购历史')}
      >
        <Table
          aria-label={t('请购历史')}
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={records}
          pagination={false}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: error ? t('历史加载失败。') : t('暂无请购记录。'),
          }}
          columns={[
            {
              title: labels[0],
              key: 'document',
              render: (_, record) => (
                <Button type="link" onClick={() => void openDetail(record.id)}>
                  {numberLabel(record.displayNo, record.workflowStatus)}
                </Button>
              ),
            },
            { title: labels[1], dataIndex: 'projectName' },
            { title: labels[2], dataIndex: 'site' },
            {
              title: t('申请人'),
              key: 'applicant',
              render: (_, record) => record.applicantName || '—',
            },
            {
              title: t('申请日期'),
              key: 'orderDate',
              render: (_, record) => record.orderDate || '—',
            },
            {
              title: labels[3],
              key: 'amount',
              align: 'right',
              render: (_, record) => {
                const currency = currencySchema.safeParse(
                  record.primaryCurrency,
                )
                return currency.success
                  ? formatMoney(
                      { currency: currency.data, minor: record.totalMinor },
                      numberLocale,
                    )
                  : '—'
              },
            },
            {
              title: labels[4],
              key: 'mode',
              render: (_, record) =>
                record.procurementMode === 'owner_self_purchase'
                  ? t('业主自购')
                  : record.procurementMode === 'honsen_self_purchase'
                    ? t('Honsen自购')
                    : t('历史模式未记录'),
            },
            {
              title: t('请购状态'),
              key: 'status',
              render: (_, record) => (
                <Tag>{statusText(record.workflowStatus)}</Tag>
              ),
            },
            {
              title: labels[5],
              key: 'updated',
              render: (_, record) =>
                new Intl.DateTimeFormat(numberLocale, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(record.updatedAt * 1000)),
            },
            {
              title: labels[6],
              key: 'actions',
              render: (_, record) => (
                <Button size="small" onClick={() => void openDetail(record.id)}>
                  {t('查看详情：')}
                  {numberLabel(record.displayNo, record.workflowStatus)}
                </Button>
              ),
            },
          ]}
        />
      </div>
      {cursor ? (
        <Button loading={loading} onClick={() => void loadMore()}>
          {t('加载更多')}
        </Button>
      ) : null}
      {detailError ? (
        <Alert type="error" title={t('详情读取失败或无权查看。')} />
      ) : null}
      {withdrawError ? (
        <Alert type="error" title={t('撤回失败：当前状态或授权不允许撤回。')} />
      ) : null}
      {issueError ? (
        <Alert
          type="error"
          title={t('正式下达失败：请检查审批状态、授权和冻结报价。')}
        />
      ) : null}
      {detailLoading ? <p role="status">{t('正在读取详情…')}</p> : null}
      {detail ? (
        <section aria-label={t('请购详情')}>
          <h3>
            {detail.formalDocumentNo ??
              numberLabel(detail.displayNo, detail.workflowStatus)}
          </h3>
          {detail.formalDocumentNo ? (
            <FormalPrintPreview orderId={detail.id} />
          ) : null}
          {detail.workflowStatus === 'pending_confirmation' &&
          detail.applicantId === applicantId ? (
            <Button onClick={() => void withdrawHistoricalOrder(detail.id)}>
              {t('撤回历史申请')}
            </Button>
          ) : null}
          {canApprove &&
          (detail.procurementMode === 'owner_self_purchase' ||
            detail.procurementMode === 'honsen_self_purchase') &&
          (detail.workflowStatus === 'confirmed' ||
            detail.workflowStatus === 'approved') ? (
            <Button
              onClick={() => void issueOrder(detail.id, detail.procurementMode)}
            >
              {detail.procurementMode === 'owner_self_purchase'
                ? t('正式下达业主申请')
                : t('正式签发 HPA')}
            </Button>
          ) : null}
          {detail.projectId === projectId &&
          detail.procurementMode &&
          detail.lines.length > 0 ? (
            <Button disabled={copyDisabled} onClick={() => onCopy(detail)}>
              {t('复制为新草稿')}
            </Button>
          ) : (
            <p>{t('仅当前项目中已记录采购模式且包含材料的请购可复制。')}</p>
          )}
          <p>
            {detail.projectName} · {detail.site} ·{' '}
            {statusText(detail.workflowStatus)} ·{' '}
            {detail.procurementMode === 'owner_self_purchase'
              ? t('业主自购')
              : detail.procurementMode === 'honsen_self_purchase'
                ? t('Honsen自购')
                : t('历史模式未记录')}
          </p>
          {detail.formalDocumentNo ? (
            <p>
              {t('正式编号：')}
              {detail.formalDocumentNo}
            </p>
          ) : null}
          <p>
            {t('申请日期：')}
            {detail.orderDate} · {t('交货地址：')}
            {detail.deliveryAddress}
          </p>
          {detail.expectedDeliveryDate ? (
            <p>
              {t('预计到货：')}
              {detail.expectedDeliveryDate}
            </p>
          ) : null}
          {detail.notes ? (
            <p>
              {t('备注：')}
              {detail.notes}
            </p>
          ) : null}
          <ul aria-label={t('请购明细')}>
            {detail.lines.map((line, index) => (
              <li key={`${detail.id}-${index}`}>
                {line.materialName} · {line.model} · {line.specification} ·{' '}
                {line.quantity} {line.unit} · {line.unitPriceMinor}{' '}
                {line.currency} / {line.unit} · {line.lineTotalMinor}{' '}
                {line.currency}
              </li>
            ))}
          </ul>
          <p>
            {t('总额：')}
            {detail.totalMinor} {detail.primaryCurrency}
          </p>
          <h4>{t('附件')}</h4>
          {detail.attachments.length ? (
            <ul>
              {detail.attachments.map((attachment) => (
                <li key={attachment.id}>
                  {attachment.originalName} · {attachment.uploadState}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('无附件')}</p>
          )}
          <h4>{t('审计记录')}</h4>
          {detail.audits.length ? (
            <ul>
              {detail.audits.map((audit) => (
                <li key={audit.id}>
                  {historyAuditText(locale, audit.action)}
                  {audit.reason ? ` · ${audit.reason}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('无审计记录')}</p>
          )}
          {workflowApi ? (
            <OrderWorkflowPanel
              key={`${detail.id}:${detail.workflowStatus}`}
              api={workflowApi}
              orderId={detail.id}
              workflowStatus={detail.workflowStatus}
              canApprove={canApprove}
              onChanged={() => {
                setRetry((value) => value + 1)
                void openDetail(detail.id)
              }}
            />
          ) : null}
        </section>
      ) : null}
    </Card>
  )
}
