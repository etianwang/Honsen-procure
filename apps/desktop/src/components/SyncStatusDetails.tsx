import { CloudCheck, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { shellText, useUiLocale, type ShellMessage } from '../lib/ui-locale'
import type { SyncState } from '../lib/sync-lifecycle'
import { ShellPopover } from './ShellPopover'

const stateText: Record<SyncState['kind'], [ShellMessage, ShellMessage]> = {
  syncing: ['同步中', '同步中'],
  synced: ['已同步', '上次同步成功；新操作可能待同步'],
  pending: ['待同步', '待同步'],
  retrying: ['同步失败', '连接失败，等待重试；本地数据待同步'],
  'offline-pending': ['离线', '离线本地数据'],
  'auth-required': ['登录失效', '登录已失效，请重新在线登录'],
  'account-boundary': ['账号隔离', '多账号拉取已暂停，需先完成账号隔离恢复'],
  'upgrade-required': [
    '需要升级',
    '服务版本已停用，请升级客户端；本地数据已保留',
  ],
}

export function SyncStatusDetails({
  state,
  open,
  onOpenChange,
}: {
  state?: SyncState
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { locale } = useUiLocale()
  const t = (key: ShellMessage) => shellText(locale, key)
  const kind = state?.kind ?? 'offline-pending'
  const [short, full] = stateText[kind]
  const urgent = [
    'auth-required',
    'account-boundary',
    'upgrade-required',
    'retrying',
  ].includes(kind)
  const hasIssues = !!(
    state?.quoteRejectedCount ||
    state?.conflictCount ||
    state?.quarantinedCount
  )
  const Icon =
    urgent || hasIssues
      ? TriangleAlert
      : kind === 'synced'
        ? CloudCheck
        : kind === 'offline-pending'
          ? CloudOff
          : RefreshCw
  const severity = urgent
    ? 'error'
    : hasIssues || kind === 'offline-pending' || !!state?.pendingCount
      ? 'warning'
      : undefined
  const count = (value?: number) =>
    value === undefined
      ? t('未知')
      : value.toLocaleString(
          locale === 'zh' ? 'zh-CN' : locale === 'fr' ? 'fr-FR' : 'en-US',
        )
  const issueCount =
    (state?.quoteRejectedCount ?? 0) +
    (state?.conflictCount ?? 0) +
    (state?.quarantinedCount ?? 0)
  let summary = short
  if (!urgent) {
    if (state?.quoteRejectedCount) summary = '报价失效'
    else if (state?.conflictCount) summary = '未解决冲突'
    else if (state?.quarantinedCount) summary = '待归属旧事件'
    else if (kind === 'synced' && state?.pendingCount) summary = '待同步'
  }
  const counts: [ShellMessage, number | undefined][] = [
    ['待同步', state?.pendingCount],
    ['未解决冲突', state?.conflictCount],
    ['待归属旧事件', state?.quarantinedCount],
    ['项报价失效，请撤回采购单并重新选价', state?.quoteRejectedCount],
  ]
  return (
    <div className="honsen-shell-sync">
      <div
        role="status"
        aria-label={t('同步状态')}
        className="honsen-shell-sr-only"
      >
        {t(full)} · {t('待同步')} {count(state?.pendingCount)}
        {counts
          .slice(1)
          .filter(([, value]) => !!value)
          .map(([label, value]) =>
            label === '项报价失效，请撤回采购单并重新选价'
              ? ` · ${count(value)} ${t(label)}`
              : ` · ${t(label)} ${count(value)}`,
          )}
      </div>
      <ShellPopover
        label={t('同步详情')}
        className="honsen-sync-trigger"
        severity={severity}
        open={open}
        onOpenChange={onOpenChange}
        trigger={
          <>
            <Icon size={16} aria-hidden="true" />
            <span>{t(summary)}</span>
            {!!state?.pendingCount && (
              <span
                className="honsen-sync-count"
                aria-label={`${t('待同步')} ${count(state.pendingCount)}`}
              >
                {count(state.pendingCount)}
              </span>
            )}
            {!!issueCount && (
              <span
                className="honsen-sync-count"
                aria-label={counts
                  .slice(1)
                  .filter(([, value]) => !!value)
                  .map(([label, value]) => `${t(label)} ${count(value)}`)
                  .join(' · ')}
              >
                +{count(issueCount)}
              </span>
            )}
          </>
        }
      >
        <dl className="honsen-sync-fields">
          <dt>{t('同步状态')}</dt>
          <dd>{t(full)}</dd>
          {counts.map(([label, value]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>{count(value)}</dd>
            </div>
          ))}
          <dt>{t('上次拉取成功')}</dt>
          <dd>
            {state?.lastSuccessAt == null
              ? t('未知')
              : new Date(state.lastSuccessAt * 1000).toLocaleString(
                  locale === 'zh'
                    ? 'zh-CN'
                    : locale === 'fr'
                      ? 'fr-FR'
                      : 'en-US',
                )}
          </dd>
        </dl>
      </ShellPopover>
    </div>
  )
}
