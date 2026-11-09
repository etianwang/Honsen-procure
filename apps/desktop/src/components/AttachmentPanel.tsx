import { Alert, Button, Card, Empty, Modal, Select, Space } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UiLocale } from '@honsen/shared'
import {
  attachmentApi,
  type AttachmentTarget,
  type AttachmentView,
} from '../lib/attachment-api'
import { attachmentMessages } from '../lib/attachment-messages'
import { procurementMutation } from '../lib/procurement-sync'

export function AttachmentPanel({
  orderId,
  locale = 'zh-CN',
}: {
  orderId: string
  locale?: UiLocale
}) {
  const t = attachmentMessages[locale]
  const [files, setFiles] = useState<AttachmentView[]>([])
  const [targets, setTargets] = useState<AttachmentTarget[]>([])
  const [targetId, setTargetId] = useState(orderId)
  const [message, setMessage] = useState<'saved' | 'error' | ''>('')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [localPending, setLocalPending] = useState(false)
  const mounted = useRef(false)
  const generation = useRef(0)
  const operation = useRef(0)
  const pending = useRef(false)
  const importedId = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState('')
  const [preview, setPreview] = useState<{
    name: string
    type: string
    data: string
  } | null>(null)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    try {
      const [files, targets] = await Promise.all([
        attachmentApi.list(orderId),
        attachmentApi.targets(orderId),
      ])
      if (!mounted.current || request !== generation.current) return false
      setFiles(files)
      setTargets(targets)
      setLoadFailed(false)
      if (
        importedId.current &&
        files.some(
          (file) =>
            file.id === importedId.current && file.uploadState === 'uploaded',
        )
      ) {
        importedId.current = null
        setLocalPending(false)
      }
      return true
    } catch {
      if (mounted.current && request === generation.current) setLoadFailed(true)
      return false
    } finally {
      if (mounted.current && request === generation.current) setLoading(false)
    }
  }, [orderId])
  useEffect(() => {
    mounted.current = true
    void refresh()
    const update = () => void refresh()
    window.addEventListener('honsen-procurement-synced', update)
    return () => {
      mounted.current = false
      generation.current++
      operation.current++
      window.removeEventListener('honsen-procurement-synced', update)
    }
  }, [refresh])
  useEffect(() => {
    const update = (event: Event) =>
      setSyncState((event as CustomEvent<{ state: string }>).detail.state)
    window.addEventListener('honsen-procurement-status', update)
    return () => window.removeEventListener('honsen-procurement-status', update)
  }, [])
  async function importFile(file: File) {
    if (pending.current) return
    const target = targets.find((v) => v.ownerId === targetId)
    if (!target) return
    pending.current = true
    const request = ++operation.current
    setBusy(true)
    setMessage('')
    setSyncState('pending')
    try {
      const id = await attachmentApi.import(orderId, target, file)
      if (!mounted.current || request !== operation.current) return
      importedId.current = id
      setLocalPending(true)
      setMessage('saved')
      await refresh()
    } catch {
      if (mounted.current && request === operation.current) setMessage('error')
    } finally {
      if (mounted.current && request === operation.current) {
        pending.current = false
        setBusy(false)
      }
    }
  }
  async function view(file: AttachmentView) {
    if (pending.current) return
    pending.current = true
    const request = ++operation.current
    setBusy(true)
    setMessage('')
    try {
      const data = await attachmentApi.read(file.id)
      if (!mounted.current || request !== operation.current) return
      setPreview({ name: file.originalName, type: file.contentType, data })
      await refresh()
    } catch {
      if (mounted.current && request === operation.current) setMessage('error')
    } finally {
      if (mounted.current && request === operation.current) {
        pending.current = false
        setBusy(false)
      }
    }
  }
  return (
    <Card className="card" title={t.title}>
      <p className="muted">{t.limits}</p>
      <Space wrap>
        <label>
          {t.target}
          <Select
            aria-label={t.target}
            disabled={busy || loading}
            value={targetId}
            onChange={setTargetId}
            style={{ minWidth: 200, maxWidth: '100%' }}
            options={targets.map((v) => ({
              value: v.ownerId,
              label: `${t[v.ownerType]} ${v.description}`,
            }))}
          />
        </label>
        <label>
          {t.file}
          <input
            aria-label={t.file}
            type="file"
            disabled={busy || loading || loadFailed || !targets.length}
            accept={
              targetId === orderId
                ? '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.heic,.dwg,.zip'
                : targets.find((v) => v.ownerId === targetId)?.ownerType ===
                    'receipt'
                  ? '.jpg,.jpeg,.png,.heic'
                  : '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.heic,.dwg,.zip'
            }
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void importFile(file)
            }}
          />
        </label>
        <Button
          disabled={busy || loading}
          onClick={() => {
            void refresh()
            procurementMutation()
          }}
        >
          {t.retry}
        </Button>
        <span role="status">
          {syncState === 'syncing'
            ? t.syncing
            : syncState === 'synced'
              ? localPending ||
                files.some(
                  (file) => file.uploadState !== 'uploaded' || !!file.lastError,
                )
                ? t.pending
                : t.lastSynced
              : syncState === 'conflict'
                ? t.conflict
                : syncState === 'error'
                  ? t.syncError
                  : syncState === 'pending'
                    ? t.pending
                    : ''}
        </span>
      </Space>
      {busy && <Alert role="status" title={t.working} type="info" showIcon />}
      {loading && (
        <Alert role="status" title={t.loading} type="info" showIcon />
      )}
      {loadFailed && (
        <Alert role="alert" title={t.loadFailed} type="error" showIcon />
      )}
      {message && (
        <Alert
          role={message === 'error' ? 'alert' : 'status'}
          title={
            message === 'saved' && loadFailed
              ? t.savedRefreshFailed
              : t[message]
          }
          type={
            message === 'error' ? 'error' : loadFailed ? 'warning' : 'success'
          }
          showIcon
        />
      )}
      {files.length ? (
        <ul>
          {files.map((file) => (
            <li key={file.id}>
              <Space wrap>
                <span>
                  {file.originalName} · {t[file.ownerType]} · {file.byteLength}{' '}
                  B · {file.uploadState === 'uploaded' ? t.uploaded : t.pending}{' '}
                  · {file.availableLocally ? t.local : t.remote}
                  {file.sourceAttachmentId
                    ? ` · ${t.derived}`
                    : ['image/heic', 'image/heif'].includes(file.contentType)
                      ? ` · ${t.original}`
                      : ''}
                </span>
                <Button disabled={busy} onClick={() => void view(file)}>
                  {t.view}
                </Button>
                {file.lastError ? (
                  <span>
                    {t.syncError} ({file.retryCount})
                  </span>
                ) : null}
              </Space>
            </li>
          ))}
        </ul>
      ) : !loading && !loadFailed ? (
        <Empty description={t.empty} />
      ) : null}
      <Modal
        title={preview?.name}
        open={preview !== null}
        onCancel={() => setPreview(null)}
        footer={<Button onClick={() => setPreview(null)}>{t.close}</Button>}
        width={800}
        destroyOnHidden
      >
        {preview ? (
          <>
            <a href={preview.data} download={preview.name}>
              {t.download}
            </a>
            {['image/jpeg', 'image/png'].includes(preview.type) ? (
              <img
                src={preview.data}
                alt={preview.name}
                style={{ maxWidth: '100%', maxHeight: '65vh' }}
              />
            ) : preview.type === 'application/pdf' ? (
              <iframe
                title={preview.name}
                src={preview.data}
                style={{ width: '100%', height: '65vh', border: 0 }}
              />
            ) : null}
          </>
        ) : null}
      </Modal>
    </Card>
  )
}
