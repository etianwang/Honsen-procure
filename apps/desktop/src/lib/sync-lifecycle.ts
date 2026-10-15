export type SyncState = {
  kind:
    | 'syncing'
    | 'synced'
    | 'pending'
    | 'retrying'
    | 'offline-pending'
    | 'auth-required'
  pendingCount?: number
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
  let requestedDuringRun = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void run()
    }, delay)
  }

  const run = async () => {
    if (!active || offline || authRequired) return
    if (running) {
      requestedDuringRun = true
      return
    }
    running = true
    onState({ kind: 'syncing' })
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
      failures = 0
      onState({
        kind: push.pendingCount > 0 ? 'pending' : 'synced',
        pendingCount: push.pendingCount,
      })
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
        onState({ kind: 'auth-required' })
        return
      }
      failures += 1
      onState({ kind: 'retrying' })
      schedule(
        Math.min(60_000, 1_000 * 2 ** Math.min(failures - 1, 6)) +
          Math.floor(Math.random() * 250),
      )
    } finally {
      running = false
      if (requestedDuringRun && active && !offline && !authRequired) {
        requestedDuringRun = false
        schedule(0)
      }
    }
  }

  const online = () => {
    offline = false
    if (!authRequired) schedule(0)
  }
  const onOffline = () => {
    offline = true
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!authRequired) onState({ kind: 'offline-pending' })
  }
  host.addEventListener('online', online)
  host.addEventListener('offline', onOffline)
  schedule(0)
  return () => {
    active = false
    if (timer) clearTimeout(timer)
    host.removeEventListener('online', online)
    host.removeEventListener('offline', onOffline)
  }
}
