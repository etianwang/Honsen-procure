export type LocalCategoryConflict = {
  eventId: string
  categoryId: string
  businessCode: string
  name: string
}
export type RemoteCategoryConflict = {
  categoryId: string
  businessCode: string
  name: string
  version: number
}
export type CategoryRepairApi = {
  listLocal(): Promise<LocalCategoryConflict[]>
  listRemote(): Promise<RemoteCategoryConflict[]>
  repairLocal(
    eventId: string,
    newBusinessCode: string,
    reason: string,
  ): Promise<string>
  repairRemote(input: {
    categoryId: string
    expectedVersion: number
    newBusinessCode: string
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

export const tauriCategoryRepairApi: CategoryRepairApi = {
  listLocal: () => invoke('list_local_category_conflicts'),
  listRemote: () => invoke('list_remote_category_quarantine'),
  repairLocal: (eventId, newBusinessCode, reason) =>
    invoke('repair_local_category_conflict', {
      eventId,
      newBusinessCode,
      reason,
    }),
  repairRemote: (input) => invoke('repair_remote_category', { input }),
}
