import { shellText, useUiLocale, type ShellMessage } from '../lib/ui-locale'
import type { SyncState } from '../lib/sync-lifecycle'

export function SyncStatusDetails({ state }: { state?: SyncState }) {
  const { locale } = useUiLocale()
  const t = (key: ShellMessage) => shellText(locale, key)
  const detailLabel =
    locale === 'zh'
      ? '同步详情'
      : locale === 'fr'
        ? 'Détails de synchronisation'
        : 'Sync details'
  const status =
    state?.kind === 'syncing'
      ? t('同步中')
      : state?.kind === 'synced'
        ? locale === 'zh'
          ? '上次同步成功'
          : locale === 'fr'
            ? 'Dernière synchronisation réussie'
            : 'Last sync succeeded'
        : state?.kind === 'pending'
          ? t('待同步')
          : state?.kind === 'retrying'
            ? t('连接失败，等待重试；本地数据待同步')
            : state?.kind === 'upgrade-required'
              ? t('服务版本已停用，请升级客户端；本地数据已保留')
              : state?.kind === 'auth-required'
                ? t('登录已失效，请重新在线登录')
                : state?.kind === 'account-boundary'
                  ? t('多账号拉取已暂停，需先完成账号隔离恢复')
                  : t('离线本地数据')
  const count = (value?: number) =>
    value === undefined
      ? t('未知')
      : value.toLocaleString(
          locale === 'zh' ? 'zh-CN' : locale === 'fr' ? 'fr-FR' : 'en-US',
        )
  return (
    <div className="honsen-shell-sync">
      <div role="status" aria-label={t('同步状态')} aria-live="polite">
        <span>{status}</span>
        <span>
          {' '}
          · {t('待同步')} {count(state?.pendingCount)}
        </span>
        {!!state?.quarantinedCount && (
          <span>
            {' '}
            · {t('待归属旧事件')} {count(state.quarantinedCount)}
          </span>
        )}
        {!!state?.conflictCount && (
          <span>
            {' '}
            · {t('未解决冲突')} {count(state.conflictCount)}
          </span>
        )}
        {!!state?.quoteRejectedCount && (
          <span className="honsen-shell-sync-warning">
            {' '}
            · {count(state.quoteRejectedCount)}{' '}
            {t('项报价失效，请撤回采购单并重新选价')}
          </span>
        )}
      </div>
      <details
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary')?.focus()
          }
        }}
      >
        <summary>{detailLabel}</summary>
        <dl>
          <dt>{t('同步状态')}</dt>
          <dd>
            {state?.kind === 'synced'
              ? t('上次同步成功；新操作可能待同步')
              : status}
          </dd>
          <dt>{t('待同步')}</dt>
          <dd>{count(state?.pendingCount)}</dd>
          <dt>{t('未解决冲突')}</dt>
          <dd>{count(state?.conflictCount)}</dd>
          <dt>{t('待归属旧事件')}</dt>
          <dd>{count(state?.quarantinedCount)}</dd>
          <dt>{t('项报价失效，请撤回采购单并重新选价')}</dt>
          <dd>{count(state?.quoteRejectedCount)}</dd>
          <dt>{t('上次拉取成功')}</dt>
          <dd>
            {state?.lastSuccessAt == null
              ? t('未知')
              : new Date(state.lastSuccessAt * 1000).toLocaleString(
                  locale === 'zh'
                    ? 'zh-CN'
                    : locale === 'en'
                      ? 'en-US'
                      : 'fr-FR',
                )}
          </dd>
        </dl>
      </details>
    </div>
  )
}
