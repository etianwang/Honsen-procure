import { Alert, Button, Card, Input } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type {
  RequisitionApi,
  RequisitionDetail,
  RequisitionHistoryCursor,
  RequisitionHistoryFilter,
  RequisitionHistoryPage,
} from '../lib/requisition-api'
import type { WorkflowApi } from '../lib/workflow-api'
import { OrderWorkflowPanel } from './OrderWorkflowPanel'

type Props = {
  api: Pick<
    RequisitionApi,
    'listRequisitionHistory' | 'getRequisitionDetail' | 'withdrawRequisition'
  >
  refreshKey: string
  projectId: string
  applicantId: string
  onCopy: (detail: RequisitionDetail) => void
  workflowApi?: WorkflowApi
  canApprove: boolean
}

export function RequisitionHistoryPanel({
  api,
  refreshKey,
  projectId,
  applicantId,
  onCopy,
  workflowApi,
  canApprove,
}: Props) {
  const [records, setRecords] = useState<RequisitionHistoryPage['records']>([])
  const [cursor, setCursor] = useState<RequisitionHistoryCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [workflowStatus, setWorkflowStatus] = useState('')
  const [currentProjectOnly, setCurrentProjectOnly] = useState(false)
  const [filter, setFilter] = useState<RequisitionHistoryFilter>({})
  const [detail, setDetail] = useState<RequisitionDetail | null>(null)
  const [detailError, setDetailError] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [withdrawError, setWithdrawError] = useState(false)
  const detailRequest = useRef(0)

  useEffect(() => {
    let active = true
    api
      .listRequisitionHistory(undefined, filter)
      .then((page) => {
        if (!active) return
        setRecords(page.records)
        setCursor(page.nextCursor)
        setError(false)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, filter, refreshKey, retry])

  async function loadMore() {
    if (!cursor || loading) return
    setLoading(true)
    setError(false)
    try {
      const page = await api.listRequisitionHistory(cursor, filter)
      setRecords((current) => [...current, ...page.records])
      setCursor(page.nextCursor)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
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

  return (
    <Card className="card" title="请购历史">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setRecords([])
          setCursor(null)
          detailRequest.current += 1
          setDetail(null)
          setLoading(true)
          setError(false)
          setFilter({
            query: query.trim() || undefined,
            workflowStatus: workflowStatus || undefined,
            projectId: currentProjectOnly ? projectId : undefined,
          })
        }}
      >
        <label>
          搜索单号、项目或工地
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          请购状态
          <select
            value={workflowStatus}
            onChange={(event) => setWorkflowStatus(event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="pending_confirmation">待确认</option>
            <option value="rejected">已驳回</option>
            <option value="confirmed">已批准</option>
            <option value="approved">已批准（新状态）</option>
            <option value="formally_issued">已发单</option>
            <option value="executing">采购执行中</option>
            <option value="receiving">收货中</option>
            <option value="completed">已完成</option>
            <option value="completed_with_conditions">附条件完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={currentProjectOnly}
            onChange={(event) => setCurrentProjectOnly(event.target.checked)}
          />
          仅当前项目
        </label>
        <Button htmlType="submit" aria-label="筛选">
          筛选
        </Button>
      </form>
      {error ? (
        <Alert
          type="error"
          title="历史加载失败。"
          action={
            <Button
              onClick={() => {
                setLoading(true)
                setError(false)
                setRetry((value) => value + 1)
              }}
            >
              重试
            </Button>
          }
        />
      ) : null}
      {!loading && records.length === 0 && !error ? (
        <p>暂无请购记录。</p>
      ) : null}
      {records.length > 0 ? (
        <ul aria-label="请购历史">
          {records.map((record) => (
            <li key={record.id}>
              {record.displayNo} · {record.projectName} · {record.site} ·{' '}
              {record.workflowStatus} · {record.totalMinor}{' '}
              {record.primaryCurrency}{' '}
              <Button onClick={() => void openDetail(record.id)}>
                查看详情：{record.displayNo}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {cursor ? (
        <Button loading={loading} onClick={() => void loadMore()}>
          加载更多
        </Button>
      ) : null}
      {detailError ? (
        <Alert type="error" title="详情读取失败或无权查看。" />
      ) : null}
      {withdrawError ? (
        <Alert type="error" title="撤回失败：当前状态或授权不允许撤回。" />
      ) : null}
      {detailLoading ? <p role="status">正在读取详情…</p> : null}
      {detail ? (
        <section aria-label="请购详情">
          <h3>{detail.displayNo}</h3>
          {detail.workflowStatus === 'pending_confirmation' &&
          detail.applicantId === applicantId ? (
            <Button onClick={() => void withdrawHistoricalOrder(detail.id)}>
              撤回历史申请
            </Button>
          ) : null}
          {detail.projectId === projectId &&
          detail.procurementMode &&
          detail.lines.length > 0 ? (
            <Button onClick={() => onCopy(detail)}>复制为新草稿</Button>
          ) : (
            <p>仅当前项目中已记录采购模式且包含材料的请购可复制。</p>
          )}
          <p>
            {detail.projectName} · {detail.site} · {detail.workflowStatus} ·{' '}
            {detail.procurementMode ?? '历史模式未记录'}
          </p>
          <p>
            申请日期：{detail.orderDate} · 交货地址：{detail.deliveryAddress}
          </p>
          {detail.expectedDeliveryDate ? (
            <p>预计到货：{detail.expectedDeliveryDate}</p>
          ) : null}
          {detail.notes ? <p>备注：{detail.notes}</p> : null}
          <ul aria-label="请购明细">
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
            总额：{detail.totalMinor} {detail.primaryCurrency}
          </p>
          <h4>附件</h4>
          {detail.attachments.length ? (
            <ul>
              {detail.attachments.map((attachment) => (
                <li key={attachment.id}>
                  {attachment.originalName} · {attachment.uploadState}
                </li>
              ))}
            </ul>
          ) : (
            <p>无附件</p>
          )}
          <h4>审计记录</h4>
          {detail.audits.length ? (
            <ul>
              {detail.audits.map((audit) => (
                <li key={audit.id}>
                  {audit.action}
                  {audit.reason ? ` · ${audit.reason}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p>无审计记录</p>
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
