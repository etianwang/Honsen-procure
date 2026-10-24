import { Alert, Button, Card, Empty, Modal, Select, Space } from 'antd'
import { useCallback, useEffect, useState } from 'react'
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
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState('')
  const [preview, setPreview] = useState<{
    name: string
    type: string
    data: string
  } | null>(null)
  const refresh = useCallback(async () => {
    try {
      const [files, targets] = await Promise.all([
        attachmentApi.list(orderId),
        attachmentApi.targets(orderId),
      ])
      setFiles(files)
      setTargets(targets)
    } catch {
      setMessage(t.error)
    }
  }, [orderId, t.error])
  useEffect(() => {
    void refresh()
    const update = () => void refresh()
    window.addEventListener('honsen-procurement-synced', update)
    return () => window.removeEventListener('honsen-procurement-synced', update)
  }, [refresh])
  useEffect(() => {
    const update = (event: Event) =>
      setSyncState((event as CustomEvent<{ state: string }>).detail.state)
    window.addEventListener('honsen-procurement-status', update)
    return () => window.removeEventListener('honsen-procurement-status', update)
  }, [])
  async function importFile(file: File) {
    const target = targets.find((v) => v.ownerId === targetId)
    if (!target) return
    setBusy(true)
    try {
      await attachmentApi.import(orderId, target, file)
      setMessage(t.saved)
      await refresh()
    } catch {
      setMessage(t.error)
    } finally {
      setBusy(false)
    }
  }
  async function view(file: AttachmentView) {
    setBusy(true)
    try {
      setPreview({
        name: file.originalName,
        type: file.contentType,
        data: await attachmentApi.read(file.id),
      })
      await refresh()
    } catch {
      setMessage(t.error)
    } finally {
      setBusy(false)
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
            disabled={busy || !targets.length}
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
        <Button loading={busy} onClick={procurementMutation}>
          {t.retry}
        </Button>
        <span role="status">
          {syncState === 'syncing'
            ? t.syncing
            : syncState === 'synced'
              ? t.synced
              : syncState === 'conflict'
                ? t.conflict
                : syncState === 'error'
                  ? t.syncError
                  : syncState === 'pending'
                    ? t.pending
                    : ''}
        </span>
      </Space>
      {message ? (
        <Alert role="status" title={message} type="info" showIcon />
      ) : null}
      {files.length ? (
        <ul>
          {files.map((file) => (
            <li key={file.id}>
              <Space wrap>
                <span>
                  {file.originalName} · {t[file.ownerType]} · {file.byteLength}{' '}
                  B · {file.uploadState === 'uploaded' ? t.uploaded : t.pending}{' '}
                  · {file.availableLocally ? t.local : t.remote}
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
      ) : (
        <Empty description={t.empty} />
      )}
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
            {preview.type.startsWith('image/') ? (
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
