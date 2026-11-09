import { procurementMutation } from './procurement-sync'

export type SyncConflictView = {
  id: string
  entityType: string
  entityId: string
  serverVersion: number
  localPayloadJson: string
  serverPayloadJson: string
  serverOperation: string
  eventId?: string
  paymentResolutionState?: 'pending' | 'confirmed'
  resolvedBy?: string
  resolvedAt?: string
  resolutionReason?: string
}

export type SyncApi = {
  listSyncConflicts(): Promise<SyncConflictView[]>
  listPaymentSyncConflicts(): Promise<SyncConflictView[]>
  resolvePaymentSyncConflict(input: {
    conflictId: string
    eventId: string
    reason: string
  }): Promise<void>
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
  listPaymentSyncConflicts: () => invoke('list_payment_sync_conflicts'),
  resolvePaymentSyncConflict: (input) =>
    invoke<void>('resolve_payment_sync_conflict', { input }).then(
      procurementMutation,
    ),
  resolveSyncConflict: (input) => invoke('resolve_sync_conflict', { input }),
  resolvePurchaseOrderConflict: (input) =>
    invoke('resolve_purchase_order_conflict', { input }),
}
