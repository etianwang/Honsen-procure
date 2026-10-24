export type RecordProcurementExpenditureInput = { id: string; orderId: string; payeeName: string; currency: string; amountMinor: string; paymentDate: string; paymentType: 'advance' | 'progress' | 'final' | 'other'; paymentMethod: 'cash' | 'bank_transfer' | 'mobile_payment' | 'other'; voucherReference: string | null; notes: string | null }
export type ProcurementExpenditureApi = { record(input: RecordProcurementExpenditureInput): Promise<void> }
type Invoke = <T>(command: string, args?: object) => Promise<T>
export const tauriProcurementExpenditureApi: ProcurementExpenditureApi = { record: (input) => {
  const invoke = (window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke
  if (!invoke) return Promise.reject(new Error('桌面主机不可用'))
  return invoke<void>('record_procurement_expenditure', { input })
} }
