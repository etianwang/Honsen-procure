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

export type ReceiptApi = {
  recordReceipt(input: RecordReceiptInput): Promise<ReceiptView>
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
  closeSupplierOrderWithConditions: (orderId, reason) =>
    invoke()<void>('close_supplier_order_with_conditions', { orderId, reason }),
}
