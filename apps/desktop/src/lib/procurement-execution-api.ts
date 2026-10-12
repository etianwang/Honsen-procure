export type ProcurementExecutionLine = {
  id: string
  materialName: string
  quantity: string
  unit: string
  currency: 'XOF' | 'CNY' | 'USD' | 'EUR'
}

export type ProcurementExecutionChild = {
  id: string
  displayNo: string
  currency: string
  lines: ProcurementExecutionLine[]
}

export type ProcurementExecutionOrder = {
  id: string
  displayNo: string
  primaryCurrency: string
  lines: ProcurementExecutionLine[]
  children: ProcurementExecutionChild[]
}

export type ProcurementExecutionApi = {
  listConfirmedProcurementOrders(): Promise<ProcurementExecutionOrder[]>
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
}
