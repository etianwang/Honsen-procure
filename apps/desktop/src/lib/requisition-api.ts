import type { RequisitionDraft } from '@honsen/shared'

export type RequisitionTotalsView = {
  subtotalMinor: string
  lineDiscountMinor: string
  orderDiscountMinor: string
  freightMinor: string
  taxMinor: string
  totalMinor: string
}

export type OwnerQuoteSource =
  | { kind: 'catalog_price'; materialPriceId: string }
  | { kind: 'manual_reference'; unitPriceMinor: string; reason: string }

export type OwnerLinePricingInput = {
  orderItemId: string
  quoteSource: OwnerQuoteSource
  lockedExchangeRateDecimal: string
  markup:
    | { kind: 'percent_basis_points'; basisPoints: number }
    | { kind: 'fixed_minor'; minor: string }
}

export type OwnerLinePricingView = {
  orderItemId: string
  convertedReferenceUnitMinor: string
  markupMinor: string
  finalUnitPriceMinor: string
}

export type RequisitionApi = {
  saveRequisitionDraft(draft: RequisitionDraft): Promise<RequisitionTotalsView>
  saveOwnerPurchasePricing(input: {
    orderId: string
    lines: OwnerLinePricingInput[]
  }): Promise<OwnerLinePricingView[]>
  submitRequisitionDraft(orderId: string): Promise<void>
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

export const tauriRequisitionApi: RequisitionApi = {
  saveRequisitionDraft: (draft) =>
    tauriInvoke()<RequisitionTotalsView>('save_requisition_draft', { draft }),
  saveOwnerPurchasePricing: (input) =>
    tauriInvoke()<OwnerLinePricingView[]>('save_owner_purchase_pricing', {
      input,
    }),
  submitRequisitionDraft: (orderId) =>
    tauriInvoke()<void>('submit_requisition_draft', { orderId }),
}
