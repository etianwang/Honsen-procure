import { procurementMutation } from './procurement-sync'
export type RecordProcurementExpenditureInput = {
  id: string
  orderId: string
  receiptId?: string | null
  counterpartyType?: 'registered_supplier' | 'market_casual'
  supplierId?: string | null
  paymentHandlerId?: string
  voucherAttachmentIds?: string[]
  payeeName: string
  currency: string
  amountMinor: string
  paymentDate: string
  paymentType: 'advance' | 'progress' | 'final' | 'other'
  paymentMethod: 'cash' | 'bank_transfer' | 'mobile_payment' | 'other'
  voucherReference: string | null
  notes: string | null
}
export type ProcurementExpenditureApi = {
  record(input: RecordProcurementExpenditureInput): Promise<void>
  reverse(input: {
    id: string
    expenditureId: string
    reason: string
  }): Promise<void>
}
type Invoke = <T>(command: string, args?: object) => Promise<T>
function invoke<T>(command: string, args: object): Promise<T> {
  const host = (
    window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }
  ).__TAURI__?.core?.invoke
  if (!host) return Promise.reject(new Error('DESKTOP_HOST_UNAVAILABLE'))
  return host<T>(command, args)
}
export const tauriProcurementExpenditureApi: ProcurementExpenditureApi = {
  record: (input) =>
    invoke<void>('record_procurement_expenditure', { input }).then(
      procurementMutation,
    ),
  reverse: (input) =>
    invoke<void>('reverse_procurement_expenditure', { input }).then(
      procurementMutation,
    ),
}
