import type { RequisitionDraft } from '@honsen/shared'

export type RequisitionTotalsView = {
  subtotalMinor: string
  lineDiscountMinor: string
  orderDiscountMinor: string
  freightMinor: string
  taxMinor: string
  totalMinor: string
}

export type RequisitionHistoryCursor = { updatedAt: number; id: string }

export type RequisitionHistoryPage = {
  records: {
    id: string
    displayNo: string
    projectName: string
    site: string
    workflowStatus: string
    procurementMode: string | null
    primaryCurrency: string
    totalMinor: string
    updatedAt: number
  }[]
  nextCursor: RequisitionHistoryCursor | null
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
  listRequisitionHistory(
    cursor?: RequisitionHistoryCursor,
  ): Promise<RequisitionHistoryPage>
  saveRequisitionDraft(draft: RequisitionDraft): Promise<RequisitionTotalsView>
  setProcurementMode(orderId: string, mode: string): Promise<void>
  saveOwnerPurchasePricing(input: {
    orderId: string
    lines: OwnerLinePricingInput[]
    revisionReason: string | null
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
  listRequisitionHistory: (cursor) =>
    tauriInvoke()<RequisitionHistoryPage>('list_requisition_history', {
      cursor: cursor ?? null,
    }),
  saveRequisitionDraft: (draft) =>
    tauriInvoke()<RequisitionTotalsView>('save_requisition_draft', { draft }),
  setProcurementMode: (orderId, mode) =>
    tauriInvoke()<void>('set_procurement_mode', { orderId, mode }),
  saveOwnerPurchasePricing: (input) =>
    tauriInvoke()<OwnerLinePricingView[]>('save_owner_purchase_pricing', {
      input,
    }),
  submitRequisitionDraft: (orderId) =>
    tauriInvoke()<void>('submit_requisition_draft', { orderId }),
}
