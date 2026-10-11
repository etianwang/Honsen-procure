import type {
  Role,
  SyncChange,
  SyncEvent,
  SyncEventResult,
} from '@honsen/shared'

export type SyncActor = {
  id: string
  roles: readonly Role[]
}

export type SyncStore = {
  pushEvent(input: {
    event: SyncEvent
    installationId: string
    actorId: string
  }): Promise<SyncEventResult>
  pullChanges(input: {
    actor: SyncActor
    cursor: string
    limit: number
  }): Promise<{ changes: SyncChange[]; nextCursor: string }>
  hasActiveProjectBinding(
    accountId: string,
    projectId: string,
  ): Promise<boolean>
}
