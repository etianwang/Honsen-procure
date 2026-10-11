import { SupplierAllocationPanel } from '../components/SupplierAllocationPanel'
import {
  tauriSupplierOrderApi,
  type SupplierOrderApi,
} from '../lib/supplier-order-api'

const parentOrderId = '00000000-0000-4000-8000-000000000401'

const fallbackApi: SupplierOrderApi = {
  async allocateSupplierChildOrders(_parentOrderId, allocations) {
    return allocations.map((allocation) => ({
      childOrderId: crypto.randomUUID(),
      supplierId: allocation.supplierId,
      currency: allocation.currency,
      sourceTotalMinor: '0',
      primaryTotalMinor: '0',
      lockedExchangeRateDecimal: allocation.lockedExchangeRateDecimal,
    }))
  },
  async saveSupplierChildTerms() {
    return {
      subtotalMinor: '0',
      lineDiscountMinor: '0',
      orderDiscountMinor: '0',
      freightMinor: '0',
      taxMinor: '0',
      totalMinor: '0',
    }
  },
  async sendSupplierOrder() {},
}

export function SupplierAllocationFixturePage() {
  const hasTauri = Boolean(
    (
      window as Window & {
        __TAURI__?: { core?: { invoke?: unknown } }
      }
    ).__TAURI__?.core?.invoke,
  )
  return (
    <main className="fixture-page">
      <SupplierAllocationPanel
        api={hasTauri ? tauriSupplierOrderApi : fallbackApi}
        parentOrderId={parentOrderId}
        suppliers={[
          {
            id: '00000000-0000-4000-8000-000000000402',
            name: 'fixture supplier A',
          },
          {
            id: '00000000-0000-4000-8000-000000000403',
            name: 'fixture supplier B',
          },
        ]}
        lines={[
          {
            id: '00000000-0000-4000-8000-000000000404',
            materialName: 'fixture cable',
            quantity: '2.5',
            unit: '米',
            currency: 'XOF',
          },
          {
            id: '00000000-0000-4000-8000-000000000405',
            materialName: 'fixture pipe',
            quantity: '4',
            unit: '根',
            currency: 'USD',
          },
        ]}
      />
    </main>
  )
}
