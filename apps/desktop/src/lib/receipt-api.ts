export type ReceiptItemInput = {
  orderItemId: string
  quantity: string
  unit: string
}

export type RecordReceiptInput = {
  id: string
  orderId: string
  receivedAt: string
  receiverId: string
  overReceiptReason: string | null
  attachmentIds: string[]
  items: ReceiptItemInput[]
}

export type ReceiptView = {
  id: string
  orderId: string
  workflowStatus: string
  receivedItemCount: number
}

export type ReceiptAttachmentView = {
  id: string
  receiptId: string
  originalName: string
  contentType: string
  byteLength: number
  checksum: string
  uploadState: 'pending_upload' | 'pending_download' | 'uploaded'
}

export type AttachmentSyncResult = {
  pendingAttachmentCount: number
  attachmentSyncFailed: boolean
  attachmentTransferCount: number
  attachmentTransferBytes: number
}

export type AttachmentTransferProgress = {
  attachmentId: string
  direction: 'upload' | 'download'
  transferredBytes: number
  totalBytes: number
  state: 'preparing' | 'transferring' | 'completed'
}

export function formatAttachmentBytes(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return '未知大小'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function attachmentTransferProgressMessage(
  progress: AttachmentTransferProgress,
): string {
  const direction = progress.direction === 'upload' ? '上传' : '下载'
  if (progress.state === 'completed')
    return `附件${direction}完成：${formatAttachmentBytes(progress.totalBytes)}。`
  return `附件${direction}中：${formatAttachmentBytes(progress.transferredBytes)} / ${formatAttachmentBytes(progress.totalBytes)}。`
}

type TauriEvent = { payload: AttachmentTransferProgress }
type TauriEventApi = {
  listen(
    event: string,
    handler: (event: TauriEvent) => void,
  ): Promise<() => void>
}

export function listenForAttachmentTransferProgress(
  onProgress: (progress: AttachmentTransferProgress) => void,
): () => void {
  const events = (window as Window & { __TAURI__?: { event?: TauriEventApi } })
    .__TAURI__?.event
  if (!events) return () => undefined
  let disposed = false
  let unlisten: (() => void) | undefined
  void events
    .listen('attachment-transfer-progress', (event) =>
      onProgress(event.payload),
    )
    .then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
  return () => {
    disposed = true
    unlisten?.()
  }
}

export function attachmentSyncStatusMessage(
  result: AttachmentSyncResult,
): string {
  if (result.attachmentSyncFailed)
    return `附件同步失败，仍有 ${result.pendingAttachmentCount} 个待同步文件；可在联网后重试。`
  if (result.pendingAttachmentCount)
    return `仍有 ${result.pendingAttachmentCount} 个附件等待同步。`
  if (result.attachmentTransferCount)
    return `已同步 ${result.attachmentTransferCount} 个附件（${formatAttachmentBytes(result.attachmentTransferBytes)}）。`
  return '附件已同步到云端。'
}

export type ReceiptApi = {
  recordReceipt(input: RecordReceiptInput): Promise<ReceiptView>
  chooseReceiptAttachment(
    receiptId: string,
  ): Promise<ReceiptAttachmentView | null>
  listReceiptAttachments(receiptId: string): Promise<ReceiptAttachmentView[]>
  syncPendingAttachments(): Promise<AttachmentSyncResult>
  closeSupplierOrderWithConditions(
    orderId: string,
    reason: string,
  ): Promise<void>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function invoke(): TauriInvoke {
  const result = (
    window as Window & { __TAURI__?: { core?: { invoke?: TauriInvoke } } }
  ).__TAURI__?.core?.invoke
  if (!result) throw new Error('桌面主机不可用')
  return result
}

export const tauriReceiptApi: ReceiptApi = {
  recordReceipt: (input) => invoke()<ReceiptView>('record_receipt', { input }),
  chooseReceiptAttachment: (receiptId) =>
    invoke()<ReceiptAttachmentView | null>('choose_receipt_attachment', {
      receiptId,
    }),
  listReceiptAttachments: (receiptId) =>
    invoke()<ReceiptAttachmentView[]>('list_receipt_attachments', {
      receiptId,
    }),
  syncPendingAttachments: () =>
    invoke()<AttachmentSyncResult>('push_pending_sync'),
  closeSupplierOrderWithConditions: (orderId, reason) =>
    invoke()<void>('close_supplier_order_with_conditions', { orderId, reason }),
}
