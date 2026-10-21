import { useEffect, useState } from 'react'
import type {
  CategoryRepairApi,
  LocalCategoryConflict,
  RemoteCategoryConflict,
} from '../lib/category-repair-api'

export function CategoryRepairPanel({ api }: { api: CategoryRepairApi }) {
  const [local, setLocal] = useState<LocalCategoryConflict[]>([])
  const [remote, setRemote] = useState<RemoteCategoryConflict[]>([])
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void api
      .listLocal()
      .then(setLocal)
      .catch(() => setMessage('无法读取本地分类冲突。'))
    void api
      .listRemote()
      .then(setRemote)
      .catch(() => setMessage('云端隔离列表不可用，请联网后重试。'))
  }, [api])
  async function repair(item: LocalCategoryConflict | RemoteCategoryConflict) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(code) || !reason.trim()) {
      setMessage('请填写合法的新编码和修复原因。')
      return
    }
    setBusy(true)
    try {
      if ('eventId' in item) {
        await api.repairLocal(item.eventId, code, reason)
        setLocal((items) => items.filter((row) => row.eventId !== item.eventId))
        setMessage('已保留原事件并生成新的待同步事件。')
      } else {
        await api.repairRemote({
          categoryId: item.categoryId,
          expectedVersion: item.version,
          newBusinessCode: code,
          reason,
        })
        setRemote((items) =>
          items.filter((row) => row.categoryId !== item.categoryId),
        )
        setMessage('云端修复已记录，桌面同步已完成。')
      }
      setCode('')
      setReason('')
    } catch {
      setMessage('修复未完成；原记录仍保留，请检查权限、网络和编码。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card" aria-label="分类编码冲突">
      <div className="card-header">
        <h3>分类编码冲突</h3>
      </div>
      <div className="workflow-comments">
        <label>
          分类新编码
          <input
            aria-label="分类新编码"
            value={code}
            maxLength={64}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <label>
          分类修复原因
          <input
            aria-label="分类修复原因"
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {message && <p role="status">{message}</p>}
        {local.map((item) => (
          <article className="workflow-comment" key={item.eventId}>
            <p>冲突分类 {item.businessCode}</p>
            <p>
              {item.name} · {item.categoryId}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void repair(item)}
            >
              修复本地分类
            </button>
          </article>
        ))}
        {remote.map((item) => (
          <article className="workflow-comment" key={item.categoryId}>
            <p>云端隔离分类 {item.businessCode}</p>
            <p>
              {item.name} · {item.categoryId} · 版本 {item.version}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void repair(item)}
            >
              修复云端分类
            </button>
          </article>
        ))}
        {local.length === 0 && remote.length === 0 && (
          <p>没有已发现的分类编码冲突。</p>
        )}
      </div>
    </section>
  )
}
