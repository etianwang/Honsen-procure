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
  itemCount: number
}

export type RfqApi = {
  createRfq(input: CreateRfqInput): Promise<RfqView>
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
}
