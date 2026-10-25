import type {
  Role,
  SyncEvent,
  SyncEventResult,
  CategoryRepairRequest,
  SyncPullResponse,
  PaymentConflictView,
} from '@honsen/shared'

export type SyncActor = {
  id: string
  roles: readonly Role[]
  installationId: string
}

export type SyncStore = {
  listPaymentConflicts?(
    actor: SyncActor,
  ): Promise<{ conflicts: PaymentConflictView[] }>
  listCategoryQuarantine?(): Promise<
    Array<{
      categoryId: string
      businessCode: string
      name: string
      version: number
    }>
  >
  repairCategory?(input: {
    actor: SyncActor
    request: CategoryRepairRequest
  }): Promise<{ categoryId: string; version: number }>
  pushEvent(input: {
    event: SyncEvent
    installationId: string
    actorId: string
    recoveryReason?: string
  }): Promise<SyncEventResult>
  pullChanges(input: {
    actor: SyncActor
    cursor: string
    limit: number
    replayUntil?: string
    authorizationVersion?: string
  }): Promise<SyncPullResponse>
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
