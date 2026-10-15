export type RecordProcurementExpenditureInput = {
  id: string
  orderId: string
  receiptId: string | null
  counterpartyType: 'market_casual'
  supplierId: null
  payeeName: string
  currency: string
  amountMinor: string
  paymentDate: string
  paymentMethod: 'cash' | 'bank_transfer' | 'mobile_payment' | 'other'
  paymentHandlerId: string
  notes: string | null
  voucherAttachmentIds: string[]
}

export type ProcurementExpenditureView = {
  id: string
  orderId: string
  voucherWarning: boolean
}

export type ProcurementExpenditureApi = {
  recordProcurementExpenditure(
    input: RecordProcurementExpenditureInput,
  ): Promise<ProcurementExpenditureView>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function invoke(): TauriInvoke {
  const result = (
    window as Window & { __TAURI__?: { core?: { invoke?: TauriInvoke } } }
  ).__TAURI__?.core?.invoke
  if (!result) throw new Error('桌面主机不可用')
  return result
}

export const tauriProcurementExpenditureApi: ProcurementExpenditureApi = {
  recordProcurementExpenditure: (input) =>
    invoke()<ProcurementExpenditureView>('record_procurement_expenditure', {
      input,
    }),
}
