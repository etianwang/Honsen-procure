import { useUiLocale } from '../lib/ui-locale'
import { homeText, homeMoney, type HomeMessage } from '../lib/home-messages'
import { Alert, Button, Card } from 'antd'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RequisitionApi } from '../lib/requisition-api'
import { loadWorkbench } from '../lib/workbench'

type HomePageProps = {
  api: Pick<RequisitionApi, 'listRequisitionHistory'>
  projectId?: string
  onOpenMaterials: () => void
  onNewRequisition?: () => void
  onOpenHistory: (workflowStatus?: string, orderId?: string) => void
  onOpenExecution?: () => void
}

const statusLabels: Record<string, HomeMessage> = {
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
  onOpenHistory,
  onOpenExecution,
}: HomePageProps) {
  const { locale } = useUiLocale()
  const t = (key: HomeMessage) => homeText(locale, key)
  const [result, setResult] = useState<{
    key: string
    data: Awaited<ReturnType<typeof loadWorkbench>> | null
    failed: boolean
  } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const requestKey = `${projectId ?? ''}:${refresh}`
  const data = result?.key === requestKey ? result.data : null
  const failed = result?.key === requestKey && result.failed
  const numberLabel = (displayNo: string, state: string) =>
    !displayNo ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      displayNo,
    )
      ? state === 'draft'
        ? t('草稿')
        : locale === 'zh'
          ? '未正式编号'
          : locale === 'fr'
            ? 'Sans numéro officiel'
            : 'Not formally numbered'
      : displayNo
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
    <div className="home-workbench">
      <section className="page-heading">
        <div>
          <h2>{t('今日概览')}</h2>
          <p>{t('当前授权范围内已保存的采购申请；统计按父单计算。')}</p>
        </div>
        {onNewRequisition && (
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={onNewRequisition}
          >
            {t('新建采购申请')}
          </Button>
        )}
        <Button
          onClick={() => setRefresh((value) => value + 1)}
          loading={!data && !failed}
        >
          {t('刷新待办')}
        </Button>
      </section>
      {failed ? (
        <Alert
          type="error"
          showIcon
          title={t('无法读取已保存订单，请刷新重试或重新登录。')}
        />
      ) : !data ? (
        <p role="status">{t('正在读取已保存订单…')}</p>
      ) : (
        <>
          <section className="metric-grid" aria-label={t('采购统计')}>
            {(
              [
                ['待审批', data.counts.pending_confirmation],
                ['采购进行中', data.counts.purchasing],
                ['待收货', data.counts.receiving],
              ] as const
            ).map(([label, count]) => (
              <article className="metric" key={t(label)}>
                <div className="metric-label">{t(label)}</div>
                <div className="metric-value">
                  {count.toLocaleString(
                    locale === 'zh'
                      ? 'zh-CN'
                      : locale === 'en'
                        ? 'en-US'
                        : 'fr-FR',
                  )}
                </div>
                <div>
                  {(label === '待审批'
                    ? ['pending_confirmation']
                    : label === '采购进行中'
                      ? ['approved', 'confirmed', 'executing']
                      : ['formally_issued', 'receiving']
                  ).map((state) => (
                    <Button
                      key={state}
                      type="link"
                      onClick={() => onOpenHistory(state)}
                    >
                      {state === 'confirmed'
                        ? locale === 'zh'
                          ? '已批准（旧状态）'
                          : locale === 'fr'
                            ? 'Approuvée (ancien statut)'
                            : 'Approved (legacy status)'
                        : t(statusLabels[state] ?? '未知状态')}
                    </Button>
                  ))}
                </div>
              </article>
            ))}
          </section>
          <Card
            className="card"
            title={t('待处理订单')}
            extra={
              <Button type="link" onClick={() => onOpenHistory()}>
                {t('打开请购历史')}
              </Button>
            }
          >
            {data.orders.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t('单据编号')}</th>
                    <th scope="col">{t('项目')}</th>
                    <th scope="col">{t('工地')}</th>
                    <th scope="col">{t('状态')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Button
                          type="link"
                          onClick={() => onOpenHistory(undefined, order.id)}
                        >
                          {numberLabel(order.displayNo, order.workflowStatus)}
                        </Button>
                      </td>
                      <td>{order.projectName}</td>
                      <td>{order.site}</td>
                      <td>
                        {t(statusLabels[order.workflowStatus] ?? '未知状态')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>{t('当前授权范围内没有待处理订单。')}</p>
            )}
          </Card>
          <Card className="card" title={t('已保存申请金额（不含取消）')}>
            {data.amounts.length ? (
              <ul>
                {data.amounts.map((amount) => (
                  <li key={amount.currency}>
                    {homeMoney(amount.minor, amount.currency, locale)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('暂无已保存金额。')}</p>
            )}
          </Card>
        </>
      )}
      <div className="home-shortcuts">
        {onOpenExecution && (
          <Button onClick={onOpenExecution}>{t('打开采购执行与收货')}</Button>
        )}
        <Button onClick={onOpenMaterials}>{t('打开材料库')}</Button>
      </div>
    </div>
  )
}
