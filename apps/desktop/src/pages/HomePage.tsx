import { Alert, Button, Card } from 'antd'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RequisitionApi } from '../lib/requisition-api'
import { loadWorkbench } from '../lib/workbench'

type HomePageProps = {
  api: Pick<RequisitionApi, 'listRequisitionHistory'>
  projectId?: string
  onOpenMaterials: () => void
  onNewRequisition: () => void
  onOpenExecution: () => void
}

const statusLabels: Record<string, string> = {
  draft: '草稿',
  pending_confirmation: '待审批',
  rejected: '已驳回',
  confirmed: '已批准',
  approved: '已批准',
  executing: '采购执行中',
  formally_issued: '待收货',
  receiving: '收货中',
}

export function HomePage({
  api,
  projectId,
  onOpenMaterials,
  onNewRequisition,
  onOpenExecution,
}: HomePageProps) {
  const [result, setResult] = useState<{
    key: string
    data: Awaited<ReturnType<typeof loadWorkbench>> | null
    failed: boolean
  } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const requestKey = `${projectId ?? ''}:${refresh}`
  const data = result?.key === requestKey ? result.data : null
  const failed = result?.key === requestKey && result.failed
  useEffect(() => {
    let active = true
    void loadWorkbench(api, projectId)
      .then((value) => {
        if (active) setResult({ key: requestKey, data: value, failed: false })
      })
      .catch(() => {
        if (active) setResult({ key: requestKey, data: null, failed: true })
      })
    return () => {
      active = false
    }
  }, [api, projectId, requestKey])
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>今日概览</h2>
          <p>当前授权范围内已保存的采购申请；统计按父单计算。</p>
        </div>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={onNewRequisition}
        >
          新建采购申请
        </Button>
        <Button
          onClick={() => setRefresh((value) => value + 1)}
          loading={!data && !failed}
        >
          刷新待办
        </Button>
      </section>
      {failed ? (
        <Alert
          type="error"
          showIcon
          title="无法读取已保存订单，请刷新重试或重新登录。"
        />
      ) : !data ? (
        <p role="status">正在读取已保存订单…</p>
      ) : (
        <>
          <section className="metric-grid" aria-label="采购统计">
            {(
              [
                ['待审批', data.counts.pending_confirmation],
                ['采购进行中', data.counts.purchasing],
                ['待收货', data.counts.receiving],
              ] as const
            ).map(([label, count]) => (
              <article className="metric" key={label}>
                <div className="metric-label">{label}</div>
                <div className="metric-value">{count}</div>
              </article>
            ))}
          </section>
          <Card
            className="card"
            title="待处理订单"
            extra={
              <Button type="link" onClick={onNewRequisition}>
                打开请购历史
              </Button>
            }
          >
            {data.orders.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">单据编号</th>
                    <th scope="col">项目</th>
                    <th scope="col">工地</th>
                    <th scope="col">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.displayNo}</td>
                      <td>{order.projectName}</td>
                      <td>{order.site}</td>
                      <td>
                        {statusLabels[order.workflowStatus] ??
                          order.workflowStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>当前授权范围内没有待处理订单。</p>
            )}
          </Card>
          <Card
            className="card"
            title="已保存申请金额（不含取消，整数最小货币单位）"
          >
            {data.amounts.length ? (
              <ul>
                {data.amounts.map((amount) => (
                  <li key={amount.currency}>
                    {amount.minor} {amount.currency}
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无已保存金额。</p>
            )}
          </Card>
        </>
      )}
      <Button onClick={onOpenExecution}>打开采购执行与收货</Button>{' '}
      <Button onClick={onOpenMaterials}>打开材料库</Button>
    </>
  )
}
