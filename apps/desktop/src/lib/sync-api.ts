export type SyncConflictView = {
  id: string
  entityType: string
  entityId: string
  serverVersion: number
  localPayloadJson: string
  serverPayloadJson: string
  serverOperation: string
}

export type SyncApi = {
  listSyncConflicts(): Promise<SyncConflictView[]>
  resolveSyncConflict(input: {
    conflictId: string
    resolution: 'keep_local' | 'use_server'
    reason: string
  }): Promise<void>
  resolvePurchaseOrderConflict(input: {
    conflictId: string
    resolution: 'use_server' | 'replace_draft'
    reason: string
  }): Promise<void>
}

function invoke<T>(command: string, args?: object): Promise<T> {
  const call = (
    window as Window & {
      __TAURI__?: {
        core?: { invoke?: <U>(name: string, input?: object) => Promise<U> }
      }
    }
  ).__TAURI__?.core?.invoke
  if (!call) return Promise.reject(new Error('桌面主机不可用'))
  return call<T>(command, args)
}

export const tauriSyncApi: SyncApi = {
  listSyncConflicts: () => invoke('list_sync_conflicts'),
  resolveSyncConflict: (input) => invoke('resolve_sync_conflict', { input }),
  resolvePurchaseOrderConflict: (input) =>
    invoke('resolve_purchase_order_conflict', { input }),
}
