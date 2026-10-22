import { useEffect, useState } from 'react'
import type {
  CategoryRepairApi,
  LocalCategoryConflict,
  PendingCategoryRepair,
  RemoteCategoryConflict,
} from '../lib/category-repair-api'

export function CategoryRepairPanel({ api }: { api: CategoryRepairApi }) {
  const [local, setLocal] = useState<LocalCategoryConflict[]>([])
  const [remote, setRemote] = useState<RemoteCategoryConflict[]>([])
  const [pending, setPending] = useState<PendingCategoryRepair[]>([])
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
    void api
      .listPending()
      .then(setPending)
      .catch(() => setMessage('无法读取待确认的修复请求。'))
  }, [api])
  async function retryPending(item: PendingCategoryRepair) {
    setBusy(true)
    try {
      await api.repairRemote(item)
      setPending((items) =>
        items.filter((row) => row.categoryId !== item.categoryId),
      )
      setRemote((items) =>
        items.filter((row) => row.categoryId !== item.categoryId),
      )
      setMessage('云端修复已确认，桌面同步已完成。')
    } catch {
      void api
        .listPending()
        .then(setPending)
        .catch(() => {})
      setMessage('修复仍待确认；请检查权限或网络后重试。')
    } finally {
      setBusy(false)
    }
  }
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
      void api
        .listPending()
        .then(setPending)
        .catch(() => {})
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
        {pending.map((item) => (
          <article className="workflow-comment" key={item.categoryId}>
            <p>
              待确认的云端修复 {item.categoryId} · {item.newBusinessCode}
            </p>
            <p>原因：{item.reason}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void retryPending(item)}
            >
              重试待确认修复
            </button>
          </article>
        ))}
        {local.length === 0 && remote.length === 0 && pending.length === 0 && (
          <p>没有已发现的分类编码冲突。</p>
        )}
      </div>
    </section>
  )
}
