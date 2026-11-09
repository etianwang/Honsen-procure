import { useUiLocale, type UiLocale } from '../lib/ui-locale'
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
}

export function ReceiptFixturePage() {
  const { locale, setLocale } = useUiLocale()
  const hasTauri = Boolean(
    (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } })
      .__TAURI__?.core?.invoke,
  )
  return (
    <main className="fixture-page">
      <select
        aria-label="界面语言 / UI language / Langue"
        value={locale}
        onChange={(event) => setLocale(event.target.value as UiLocale)}
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
        <option value="fr">Français</option>
      </select>
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
            receivedQuantity: '0',
            remainingQuantity: '2.5',
          },
        ]}
      />
    </main>
  )
}
