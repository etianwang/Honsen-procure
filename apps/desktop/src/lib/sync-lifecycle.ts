export type SyncState = {
  kind:
    | 'syncing'
    | 'synced'
    | 'pending'
    | 'retrying'
    | 'offline-pending'
    | 'auth-required'
    | 'account-boundary'
  pendingCount?: number
  conflictCount?: number
  quarantinedCount?: number
  quoteRejectedCount?: number
  lastSuccessAt?: number | null
}

type SyncStatus = {
  pendingCount: number
  conflictCount: number
  quarantinedCount: number
  quoteRejectedCount?: number
  lastSuccessAt: number | null
}

export async function readSyncStatus(
  invoke: (command: string) => Promise<unknown>,
): Promise<SyncStatus> {
  const value = await invoke('sync_status')
  if (
    !value ||
    typeof value !== 'object' ||
    !('pendingCount' in value) ||
    typeof value.pendingCount !== 'number' ||
    !Number.isSafeInteger(value.pendingCount) ||
    value.pendingCount < 0 ||
    !('conflictCount' in value) ||
    typeof value.conflictCount !== 'number' ||
    !Number.isSafeInteger(value.conflictCount) ||
    value.conflictCount < 0 ||
    !('quarantinedCount' in value) ||
    typeof value.quarantinedCount !== 'number' ||
    !Number.isSafeInteger(value.quarantinedCount) ||
    value.quarantinedCount < 0 ||
    !('lastSuccessAt' in value) ||
    (value.lastSuccessAt !== null &&
      (!Number.isSafeInteger(value.lastSuccessAt) ||
        Number(value.lastSuccessAt) < 0))
  ) {
    throw new Error('invalid local sync status')
  }
  return value as SyncStatus
}

export function startSyncLifecycle(
  invoke: (command: string) => Promise<unknown>,
  onState: (state: SyncState) => void,
  host: EventTarget,
): () => void {
  let active = true
  let running = false
  let offline = false
  let authRequired = false
  let accountBoundary = false
  let requestedDuringRun = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let statusTimer: ReturnType<typeof setInterval> | undefined
  let lastStatus: SyncStatus | undefined

  const publish = (kind: SyncState['kind'], status = lastStatus) => {
    onState({ kind, ...(status ?? {}) })
  }

  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void run()
    }, delay)
  }

  const run = async () => {
    if (!active || offline || authRequired || accountBoundary) return
    if (running) {
      requestedDuringRun = true
      return
    }
    running = true
    publish('syncing')
    try {
      const push = await invoke('push_pending_sync')
      if (
        !push ||
        typeof push !== 'object' ||
        !('acceptedCount' in push) ||
        !Number.isSafeInteger(push.acceptedCount) ||
        !('pendingCount' in push) ||
        !Number.isSafeInteger(push.pendingCount) ||
        typeof push.pendingCount !== 'number' ||
        push.pendingCount < 0
      )
        throw new Error('invalid sync acknowledgement')
      if (!active || offline) return
      await invoke('pull_sync')
      if (!active || offline) return
      const status = await readSyncStatus(invoke)
      if (!active || offline) return
      lastStatus = status
      failures = 0
      publish(
        status.pendingCount > 0 ||
          status.conflictCount > 0 ||
          status.quarantinedCount > 0
          ? 'pending'
          : 'synced',
      )
      if (!statusTimer)
        statusTimer = setInterval(() => {
          void pollStatus()
        }, 5_000)
      schedule(60_000)
    } catch (error) {
      if (!active || offline) return
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'reauthentication_required' ||
          error.code === 'forbidden')
      ) {
        authRequired = true
        publish('auth-required')
        return
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'sync_account_boundary'
      ) {
        accountBoundary = true
        try {
          lastStatus = await readSyncStatus(invoke)
        } catch {
          /* preserve the boundary error */
        }
        if (active) publish('account-boundary')
        return
      }
      failures += 1
      publish('retrying')
      schedule(
        Math.min(60_000, 1_000 * 2 ** Math.min(failures - 1, 6)) +
          Math.floor(Math.random() * 250),
      )
    } finally {
      running = false
      if (
        requestedDuringRun &&
        active &&
        !offline &&
        !authRequired &&
        !accountBoundary
      ) {
        requestedDuringRun = false
        schedule(0)
      }
    }
  }

  const pollStatus = async () => {
    if (
      !active ||
      offline ||
      authRequired ||
      accountBoundary ||
      running ||
      failures > 0
    )
      return
    try {
      const status = await readSyncStatus(invoke)
      if (!active || offline || authRequired || accountBoundary || running)
        return
      const newPending = status.pendingCount > (lastStatus?.pendingCount ?? 0)
      lastStatus = status
      if (newPending) {
        publish('pending')
        schedule(0)
      } else if (
        status.pendingCount > 0 ||
        status.conflictCount > 0 ||
        status.quarantinedCount > 0
      )
        publish('pending')
    } catch {
      if (!active || offline) return
      failures += 1
      publish('retrying')
      schedule(1_000)
    }
  }

  const online = () => {
    offline = false
    if (!authRequired && !accountBoundary) schedule(0)
  }
  const onOffline = () => {
    offline = true
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!authRequired && !accountBoundary) publish('offline-pending')
  }
  host.addEventListener('online', online)
  host.addEventListener('offline', onOffline)
  schedule(0)
  return () => {
    active = false
    if (timer) clearTimeout(timer)
    if (statusTimer) clearInterval(statusTimer)
    host.removeEventListener('online', online)
    host.removeEventListener('offline', onOffline)
  }
}
