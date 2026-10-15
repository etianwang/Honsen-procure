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
    departmentId?: string,
    teamId?: string,
  ): Promise<boolean>
  hasProjectBusinessUse(projectId: string): Promise<boolean>
  isCompatibleProjectTax(
    projectId: string,
    taxTemplateId: string,
  ): Promise<boolean>
  getEntityPayload(
    entityType: string,
    entityId: string,
  ): Promise<Record<string, unknown> | null>
}
