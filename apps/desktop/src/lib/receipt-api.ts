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

export type ReceiptApi = {
  recordReceipt(input: RecordReceiptInput): Promise<ReceiptView>
  chooseReceiptAttachment(
    receiptId: string,
  ): Promise<ReceiptAttachmentView | null>
  listReceiptAttachments(receiptId: string): Promise<ReceiptAttachmentView[]>
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
  closeSupplierOrderWithConditions: (orderId, reason) =>
    invoke()<void>('close_supplier_order_with_conditions', { orderId, reason }),
}
