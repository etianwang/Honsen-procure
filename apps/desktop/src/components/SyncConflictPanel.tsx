import { useEffect, useState } from 'react'
import type { SyncApi, SyncConflictView } from '../lib/sync-api'

export function SyncConflictPanel({ api }: { api: SyncApi }) {
  const [items, setItems] = useState<SyncConflictView[]>([])
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    void api
      .listSyncConflicts()
      .then(setItems)
      .catch(() => setMessage('无法读取同步冲突。'))
  }, [api])
  async function resolve(
    item: SyncConflictView,
    resolution: 'keep_local' | 'use_server',
  ) {
    if (!reason.trim()) {
      setMessage('请填写处理原因。')
      return
    }
    await api.resolveSyncConflict({ conflictId: item.id, resolution, reason })
    setItems((current) => current.filter(({ id }) => id !== item.id))
    setMessage('冲突已解决，并保留审计记录。')
  }
  return (
    <section className="card" aria-label="同步冲突">
      <div className="card-header">
        <h3>同步冲突</h3>
      </div>
      <div className="workflow-comments">
        <label>
          处理原因
          <input
            aria-label="处理原因"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {message && <p role="status">{message}</p>}
        {items.map((item) => (
          <article className="workflow-comment" key={item.id}>
            <div>
              <strong>{item.entityType}</strong>
              <p>
                云端版本 {item.serverVersion} · {item.serverOperation}
              </p>
              {item.entityType === 'attachment' && (
                <p>
                  附件归档元数据不可覆盖；保留本地会记录管理员决定并恢复游标。
                </p>
              )}
              <button
                className="secondary-button"
                type="button"
                onClick={() => void resolve(item, 'keep_local')}
              >
                保留本地
              </button>{' '}
              {item.entityType !== 'attachment' && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void resolve(item, 'use_server')}
                >
                  采用云端
                </button>
              )}
            </div>
          </article>
        ))}
        {items.length === 0 && <p>没有待处理的同步冲突。</p>}
      </div>
    </section>
  )
}
