import type { RequisitionDraft } from '@honsen/shared'
import type { OrderAuditView } from './workflow-api'

export type RequisitionTotalsView = {
  subtotalMinor: string
  lineDiscountMinor: string
  orderDiscountMinor: string
  freightMinor: string
  taxMinor: string
  totalMinor: string
}

export type RequisitionHistoryCursor = { updatedAt: number; id: string }
export type RequisitionHistoryFilter = {
  query?: string
  workflowStatus?: string
  projectId?: string
}

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

export type RequisitionDetail = {
  id: string
  displayNo: string
  formalDocumentNo: string | null
  applicantId: string
  projectName: string
  projectId: string
  site: string
  workflowStatus: string
  procurementMode: string | null
  orderDate: string
  deliveryAddress: string
  expectedDeliveryDate: string | null
  notes: string | null
  primaryCurrency: string
  totalMinor: string
  lines: {
    materialName: string
    model: string
    specification: string
    quantity: string
    unit: string
    currency: string
    unitPriceMinor: string
    lineTotalMinor: string
  }[]
  attachments: {
    id: string
    originalName: string
    contentType: string
    byteLength: number
    uploadState: string
  }[]
  audits: OrderAuditView[]
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

export type FormalIssueView = {
  documentType: string
  formalDocumentNo: string
  formalInstallationId: string
  formalSequence: number
}

export type RequisitionApi = {
  getRequisitionDetail(orderId: string): Promise<RequisitionDetail>
  listRequisitionHistory(
    cursor?: RequisitionHistoryCursor,
    filter?: RequisitionHistoryFilter,
  ): Promise<RequisitionHistoryPage>
  saveRequisitionDraft(draft: RequisitionDraft): Promise<RequisitionTotalsView>
  setProcurementMode(orderId: string, mode: string): Promise<void>
  saveOwnerPurchasePricing(input: {
    orderId: string
    lines: OwnerLinePricingInput[]
    revisionReason: string | null
  }): Promise<OwnerLinePricingView[]>
  issueOwnerFormalOrder(orderId: string): Promise<FormalIssueView>
  issueHonsenFormalOrder(orderId: string): Promise<FormalIssueView>
  submitRequisitionDraft(orderId: string): Promise<void>
  withdrawRequisition(orderId: string): Promise<void>
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
  getRequisitionDetail: (orderId) =>
    tauriInvoke()<RequisitionDetail>('get_requisition_detail', { orderId }),
  listRequisitionHistory: (cursor, filter) =>
    tauriInvoke()<RequisitionHistoryPage>('list_requisition_history', {
      cursor: cursor ?? null,
      filter: filter ?? null,
    }),
  saveRequisitionDraft: (draft) =>
    tauriInvoke()<RequisitionTotalsView>('save_requisition_draft', { draft }),
  setProcurementMode: (orderId, mode) =>
    tauriInvoke()<void>('set_procurement_mode', { orderId, mode }),
  saveOwnerPurchasePricing: (input) =>
    tauriInvoke()<OwnerLinePricingView[]>('save_owner_purchase_pricing', {
      input,
    }),
  issueOwnerFormalOrder: (orderId) =>
    tauriInvoke()<FormalIssueView>('issue_owner_formal_order', { orderId }),
  issueHonsenFormalOrder: (orderId) =>
    tauriInvoke()<FormalIssueView>('issue_honsen_formal_order', { orderId }),
  submitRequisitionDraft: (orderId) =>
    tauriInvoke()<void>('submit_requisition_draft', { orderId }),
  withdrawRequisition: (orderId) =>
    tauriInvoke()<void>('withdraw_requisition', { orderId }),
}
