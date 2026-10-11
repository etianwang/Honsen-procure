export type SupplierChildAllocationInput = {
  parentItemId: string
  supplierId: string
  currency: 'XOF' | 'CNY' | 'USD' | 'EUR'
  childDisplayNo: string
  lockedExchangeRateDecimal: string
}

export type SupplierChildOrderView = {
  childOrderId: string
  supplierId: string
  currency: string
  sourceTotalMinor: string
  primaryTotalMinor: string
  lockedExchangeRateDecimal: string
}

export type SupplierChildLineTermsInput = {
  orderItemId: string
  lineDiscount: Adjustment
  lineFreight: Adjustment
  freightIncluded: boolean
}

export type SupplierChildTermsInput = {
  orderId: string
  lines: SupplierChildLineTermsInput[]
  orderDiscount: Adjustment
  orderFreight: Adjustment
  taxRateBasisPoints: number
}

export type SupplierChildTermsView = {
  subtotalMinor: string
  lineDiscountMinor: string
  orderDiscountMinor: string
  freightMinor: string
  taxMinor: string
  totalMinor: string
}

export type SupplierOrderApi = {
  allocateSupplierChildOrders(
    parentOrderId: string,
    allocations: SupplierChildAllocationInput[],
  ): Promise<SupplierChildOrderView[]>
  saveSupplierChildTerms(
    input: SupplierChildTermsInput,
  ): Promise<SupplierChildTermsView>
  sendSupplierOrder(orderId: string): Promise<void>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function tauriInvoke(): TauriInvoke {
  const invoke = (
    window as Window & {
      __TAURI__?: { core?: { invoke?: TauriInvoke } }
    }
  ).__TAURI__?.core?.invoke
  if (!invoke) throw new Error('桌面主机不可用')
  return invoke
}

export const tauriSupplierOrderApi: SupplierOrderApi = {
  allocateSupplierChildOrders: (parentOrderId, allocations) =>
    tauriInvoke()<SupplierChildOrderView[]>('allocate_supplier_child_orders', {
      parentOrderId,
      allocations,
    }),
  saveSupplierChildTerms: (input) =>
    tauriInvoke()<SupplierChildTermsView>('save_supplier_child_terms', {
      input,
    }),
  sendSupplierOrder: (orderId) =>
    tauriInvoke()<void>('send_supplier_order', { orderId }),
}
import type { Adjustment } from '@honsen/shared'
