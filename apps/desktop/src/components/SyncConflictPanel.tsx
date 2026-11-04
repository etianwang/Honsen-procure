import { useUiLocale } from '../lib/ui-locale'
import {
  governanceText,
  type GovernanceMessage,
} from '../lib/governance-messages'
import { useEffect, useState } from 'react'
import type { UiLocale } from '@honsen/shared'
import type { SyncApi, SyncConflictView } from '../lib/sync-api'
import { paymentConflictMessages } from '../lib/payment-conflict-messages'

export function SyncConflictPanel({
  api,
  locale: explicitLocale,
}: {
  api: SyncApi
  locale?: UiLocale
}) {
  const { locale: activeLocale } = useUiLocale()
  const text = (key: GovernanceMessage) => governanceText(activeLocale, key)
  const [items, setItems] = useState<SyncConflictView[]>([])
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const locale =
    explicitLocale ??
    (activeLocale === 'zh'
      ? 'zh-CN'
      : activeLocale === 'fr'
        ? 'fr-FR'
        : 'en-US')
  const t = paymentConflictMessages[locale]
  useEffect(() => {
    let active = true
    const update = () => setRefresh((value) => value + 1)
    window.addEventListener('honsen-procurement-synced', update)
    void Promise.allSettled([
      api.listSyncConflicts(),
      api.listPaymentSyncConflicts(),
    ]).then(([local, payments]) => {
      if (!active) return
      if (local.status === 'rejected' && payments.status === 'rejected') {
        setItems([])
        setMessage('无法读取同步冲突。')
        return
      }
      const localItems = local.status === 'fulfilled' ? local.value : []
      setItems(
        payments.status === 'fulfilled'
          ? [
              ...localItems.filter(
                (item) => item.entityType !== 'procurement_expenditure',
              ),
              ...payments.value,
            ]
          : localItems,
      )
      if (payments.status === 'rejected') setMessage('unavailable')
    })
    return () => {
      active = false
      window.removeEventListener('honsen-procurement-synced', update)
    }
  }, [api, refresh])
  async function resolve(
    item: SyncConflictView,
    resolution: 'keep_local' | 'use_server' | 'replace_draft',
  ) {
    if (!reason.trim()) {
      setMessage('请填写处理原因。')
      return
    }
    if (busyId) return
    setBusyId(item.id)
    try {
      if (item.entityType === 'procurement_expenditure') {
        if (!item.eventId || item.paymentResolutionState) return
        await api.resolvePaymentSyncConflict({
          conflictId: item.id,
          eventId: item.eventId,
          reason,
        })
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, paymentResolutionState: 'pending' }
              : entry,
          ),
        )
        setMessage('')
        return
      } else if (item.entityType === 'purchase_order') {
        await api.resolvePurchaseOrderConflict({
          conflictId: item.id,
          resolution:
            resolution === 'keep_local' ? 'replace_draft' : 'use_server',
          reason,
        })
      } else {
        await api.resolveSyncConflict({
          conflictId: item.id,
          resolution: resolution as 'keep_local' | 'use_server',
          reason,
        })
      }
      setItems((current) => current.filter(({ id }) => id !== item.id))
      setMessage('冲突已解决，并保留审计记录。')
    } catch (error) {
      setMessage(
        typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'sync_account_boundary'
          ? '该冲突属于其他账户或未归属旧事件，当前账户不能处理。'
          : '冲突处理失败，原记录已保留。',
      )
    } finally {
      setBusyId(null)
    }
  }
  return (
    <section className="card" aria-label={text('同步冲突')}>
      <div className="card-header">
        <h3>{text('同步冲突')}</h3>
      </div>
      <div className="workflow-comments">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setRefresh((value) => value + 1)}
        >
          {t.refresh}
        </button>
        <label>
          {text('处理原因')}
          <input
            aria-label={text('处理原因')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {message && (
          <p role="status">
            {message === 'unavailable'
              ? t.unavailable
              : text(message as GovernanceMessage)}
          </p>
        )}
        {items.map((item) => (
          <article className="workflow-comment" key={item.id}>
            <div>
              <strong>{item.entityType}</strong>
              <p>
                {text('云端版本')} {item.serverVersion} · {item.serverOperation}
              </p>
              <details>
                <summary>{text('比较本地与云端内容')}</summary>
                <p>{text('本地')}</p>
                <pre>{item.localPayloadJson}</pre>
                <p>{text('云端')}</p>
                <pre>{item.serverPayloadJson}</pre>
              </details>
              {item.entityType === 'procurement_expenditure' ? (
                <>
                  <p>{t.hint}</p>
                  {item.paymentResolutionState === 'pending' && (
                    <p role="status">{t.pending}</p>
                  )}
                  {item.paymentResolutionState === 'confirmed' ? (
                    <>
                      <p role="status">{t.confirmed}</p>
                      <p>
                        {t.audit}: {item.resolvedBy} · {item.resolvedAt} ·{' '}
                        {item.resolutionReason}
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        !item.eventId ||
                        !!item.paymentResolutionState ||
                        busyId !== null
                      }
                      onClick={() => void resolve(item, 'use_server')}
                    >
                      {t.action}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void resolve(item, 'keep_local')}
                  >
                    {item.entityType === 'purchase_order'
                      ? text('创建替代草稿')
                      : text('保留本地')}
                  </button>{' '}
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void resolve(item, 'use_server')}
                  >
                    {text('采用云端')}
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && <p>{text('没有待处理的同步冲突。')}</p>}
      </div>
    </section>
  )
}
