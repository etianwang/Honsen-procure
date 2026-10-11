import { SupplierChildTermsPanel } from '../components/SupplierChildTermsPanel'
import {
  tauriSupplierOrderApi,
  type SupplierOrderApi,
} from '../lib/supplier-order-api'

const fallbackApi: SupplierOrderApi = {
  async allocateSupplierChildOrders() {
    return []
  },
  async saveSupplierChildTerms() {
    return {
      subtotalMinor: '3125',
      lineDiscountMinor: '125',
      orderDiscountMinor: '100',
      freightMinor: '75',
      taxMinor: '536',
      totalMinor: '3511',
    }
  },
  async sendSupplierOrder() {},
}

export function SupplierChildTermsFixturePage() {
  const hasTauri = Boolean(
    (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } })
      .__TAURI__?.core?.invoke,
  )
  return (
    <main className="fixture-page">
      <SupplierChildTermsPanel
        api={hasTauri ? tauriSupplierOrderApi : fallbackApi}
        orderId="00000000-0000-4000-8000-000000000451"
        lines={[
          {
            id: '00000000-0000-4000-8000-000000000452',
            materialName: 'fixture cable',
            currency: 'XOF',
          },
        ]}
      />
    </main>
  )
}
