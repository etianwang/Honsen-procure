export type ProcurementExpenditure = {
  id: string
  orderId: string
  receiptId: string | null
  counterpartyType: 'market_casual' | 'registered_supplier'
  supplierId: string | null
  payeeName: string
  currency: string
  amountMinor: string
  paymentDate: string
  paymentMethod: 'cash' | 'bank_transfer' | 'mobile_payment' | 'other'
  paymentHandlerId: string
  notes: string | null
  status: 'recorded' | 'reversed'
  correctsExpenditureId: string | null
  correctionReason: string | null
  createdBy: string
  createdAt: number
}

export type ExpenditureVoucher = {
  id: string
  expenditureId: string
  originalName: string
  contentType: string
  byteLength: number
  checksum: string
  uploadState: 'pending_upload' | 'pending_download' | 'uploaded'
}

export type RecordProcurementExpenditureInput = Omit<
  ProcurementExpenditure,
  'status' | 'createdBy' | 'createdAt'
>

export type ProcurementExpenditureApi = {
  list(orderId: string): Promise<ProcurementExpenditure[]>
  listVouchers(expenditureId: string): Promise<ExpenditureVoucher[]>
  chooseVoucher(expenditureId: string): Promise<ExpenditureVoucher | null>
  record(
    input: RecordProcurementExpenditureInput,
  ): Promise<ProcurementExpenditure>
  reverse(
    id: string,
    reversalId: string,
    reason: string,
  ): Promise<ProcurementExpenditure>
}

type Invoke = <T>(command: string, args?: object) => Promise<T>

function invoke(): Invoke {
  const command = (
    window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }
  ).__TAURI__?.core?.invoke
  if (!command) throw new Error('桌面主机不可用')
  return command
}

export const tauriProcurementExpenditureApi: ProcurementExpenditureApi = {
  list: (orderId) =>
    invoke()<ProcurementExpenditure[]>('list_procurement_expenditures', {
      orderId,
    }),
  listVouchers: (expenditureId) =>
    invoke()<ExpenditureVoucher[]>('list_expenditure_vouchers', {
      expenditureId,
    }),
  chooseVoucher: (expenditureId) =>
    invoke()<ExpenditureVoucher | null>('choose_expenditure_voucher', {
      expenditureId,
    }),
  record: (input) =>
    invoke()<ProcurementExpenditure>('record_procurement_expenditure', {
      input,
    }),
  reverse: (expenditureId, reversalId, reason) =>
    invoke()<ProcurementExpenditure>('reverse_procurement_expenditure', {
      expenditureId,
      reversalId,
      reason,
    }),
}
