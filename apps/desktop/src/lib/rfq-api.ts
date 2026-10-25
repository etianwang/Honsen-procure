export type CreateRfqInput = {
  id: string
  sourceOrderId: string
  supplierId: string
  displayNo: string
  currency: 'XOF' | 'CNY' | 'USD' | 'EUR'
}

export type RfqView = {
  id: string
  sourceOrderId: string
  supplierId: string
  displayNo: string
  currency: string
  status: 'draft' | 'sent' | 'closed'
  itemCount: number
}

export type RfqApi = {
  createRfq(input: CreateRfqInput): Promise<RfqView>
  listRfqs(sourceOrderId: string): Promise<RfqView[]>
  sendRfq(rfqId: string): Promise<void>
  closeRfq(rfqId: string): Promise<void>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function tauriInvoke(): TauriInvoke {
  const invoke = (
    window as Window & { __TAURI__?: { core?: { invoke?: TauriInvoke } } }
  ).__TAURI__?.core?.invoke
  if (!invoke) throw new Error('桌面主机不可用')
  return invoke
}

export const tauriRfqApi: RfqApi = {
  createRfq: (input) => tauriInvoke()<RfqView>('create_rfq', { input }),
  listRfqs: (sourceOrderId) =>
    tauriInvoke()<RfqView[]>('list_rfqs', { sourceOrderId }),
  sendRfq: (rfqId) => tauriInvoke()<void>('send_rfq', { rfqId }),
  closeRfq: (rfqId) => tauriInvoke()<void>('close_rfq', { rfqId }),
}
