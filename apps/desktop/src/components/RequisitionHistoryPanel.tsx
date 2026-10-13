import { Alert, Button, Card } from 'antd'
import { useEffect, useState } from 'react'
import type {
  RequisitionApi,
  RequisitionHistoryCursor,
  RequisitionHistoryPage,
} from '../lib/requisition-api'

type Props = {
  api: Pick<RequisitionApi, 'listRequisitionHistory'>
  refreshKey: string
}

export function RequisitionHistoryPanel({ api, refreshKey }: Props) {
  const [records, setRecords] = useState<RequisitionHistoryPage['records']>([])
  const [cursor, setCursor] = useState<RequisitionHistoryCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    api
      .listRequisitionHistory()
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
  }, [api, refreshKey, retry])

  async function loadMore() {
    if (!cursor || loading) return
    setLoading(true)
    setError(false)
    try {
      const page = await api.listRequisitionHistory(cursor)
      setRecords((current) => [...current, ...page.records])
      setCursor(page.nextCursor)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="card" title="请购历史">
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
              {record.primaryCurrency}
            </li>
          ))}
        </ul>
      ) : null}
      {cursor ? (
        <Button loading={loading} onClick={() => void loadMore()}>
          加载更多
        </Button>
      ) : null}
    </Card>
  )
}
