import { ReceiptPanel } from '../components/ReceiptPanel'
import { tauriReceiptApi, type ReceiptApi } from '../lib/receipt-api'

const fallbackApi: ReceiptApi = {
  async recordReceipt(input) {
    return {
      id: input.id,
      orderId: input.orderId,
      workflowStatus: 'completed',
      receivedItemCount: input.items.length,
    }
  },
  async closeSupplierOrderWithConditions() {},
  async chooseReceiptAttachment() {
    return null
  },
  async listReceiptAttachments() {
    return []
  },
  async syncPendingAttachments() {
    return { pendingAttachmentCount: 0, attachmentSyncFailed: false }
  },
}

export function ReceiptFixturePage() {
  const hasTauri = Boolean(
    (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } })
      .__TAURI__?.core?.invoke,
  )
  return (
    <main className="fixture-page">
      <ReceiptPanel
        api={hasTauri ? tauriReceiptApi : fallbackApi}
        orderId="00000000-0000-4000-8000-000000000601"
        receiverId="00000000-0000-4000-8000-000000000602"
        lines={[
          {
            id: '00000000-0000-4000-8000-000000000603',
            materialName: 'fixture pipe',
            unit: '根',
            orderedQuantity: '2.5',
          },
        ]}
      />
    </main>
  )
}
