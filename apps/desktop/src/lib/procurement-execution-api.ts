export type ProcurementExecutionLine = {
  id: string
  materialName: string
  quantity: string
  receivedQuantity: string
  remainingQuantity: string
  unit: string
  currency: 'XOF' | 'CNY' | 'USD' | 'EUR'
}

export type ProcurementExecutionChild = {
  id: string
  displayNo: string
  currency: string
  lines: ProcurementExecutionLine[]
  paymentSummary: ProcurementPaymentSummary
}
export type ProcurementPaymentSummary = { currency: string; payableMinor: string; paidMinor: string; remainingMinor: string; overpaidMinor: string; status: string; records: { id: string; payeeName: string; currency: string; amountMinor: string; paymentDate: string; paymentType: string; status: string }[] }

export type ProcurementExecutionOrder = {
  id: string
  displayNo: string
  primaryCurrency: string
  procurementMode: 'honsen_self_purchase' | 'owner_self_purchase' | null
  workflowStatus: string
  lines: ProcurementExecutionLine[]
  children: ProcurementExecutionChild[]
  paymentSummary: ProcurementPaymentSummary
}

export type ProcurementExecutionApi = {
  listConfirmedProcurementOrders(): Promise<ProcurementExecutionOrder[]>
  startHonsenMarketExecution(orderId: string): Promise<void>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function tauriInvoke(): TauriInvoke {
  const invoke = (
    window as Window & { __TAURI__?: { core?: { invoke?: TauriInvoke } } }
  ).__TAURI__?.core?.invoke
  if (!invoke) throw new Error('桌面主机不可用')
  return invoke
}

export const tauriProcurementExecutionApi: ProcurementExecutionApi = {
  listConfirmedProcurementOrders: () =>
    tauriInvoke()<ProcurementExecutionOrder[]>(
      'list_confirmed_procurement_orders',
    ),
  startHonsenMarketExecution: (orderId) =>
    tauriInvoke()<void>('start_honsen_market_execution', { orderId }),
}
