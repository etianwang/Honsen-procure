import type { RequisitionDraft } from '@honsen/shared'

export type RequisitionTotalsView = {
  subtotalMinor: string
  lineDiscountMinor: string
  orderDiscountMinor: string
  freightMinor: string
  taxMinor: string
  totalMinor: string
}

export type RequisitionApi = {
  saveRequisitionDraft(draft: RequisitionDraft): Promise<RequisitionTotalsView>
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
  submitRequisitionDraft: (orderId) =>
    tauriInvoke()<void>('submit_requisition_draft', { orderId }),
}
