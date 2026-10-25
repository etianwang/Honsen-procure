export type ProcurementSyncReport = {
  uploadedCount: number
  pendingCount: number
  conflictCount: number
}
export function startProcurementSync(
  sync: () => Promise<ProcurementSyncReport>,
  events: EventTarget = window,
) {
  let stopped = false,
    running = false,
    queued = false,
    failures = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const notify = (state: string, report?: ProcurementSyncReport) =>
    events.dispatchEvent(
      new CustomEvent('honsen-procurement-status', {
        detail: { state, ...report },
      }),
    )
  async function run() {
    if (stopped) return
    if (running) {
      queued = true
      return
    }
    running = true
    notify('syncing')
    try {
      const report = await sync()
      failures = 0
      if (!stopped) {
        notify(
          report.conflictCount
            ? 'conflict'
            : report.pendingCount
              ? 'pending'
              : 'synced',
          report,
        )
        events.dispatchEvent(new Event('honsen-procurement-synced'))
      }
    } catch {
      failures++
      if (!stopped) notify('error')
    } finally {
      running = false
      if (!stopped) {
        const delay = queued
          ? 0
          : failures
            ? Math.min(120000, 1000 * 2 ** Math.min(failures, 7)) +
              Math.floor(Math.random() * 1000)
            : 30000
        queued = false
        timer = setTimeout(() => void run(), delay)
      }
    }
  }
  const request = () => {
    if (timer) clearTimeout(timer)
    void run()
  }
  events.addEventListener('online', request)
  events.addEventListener('honsen-procurement-mutation', request)
  timer = setTimeout(() => void run(), 0)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    events.removeEventListener('online', request)
    events.removeEventListener('honsen-procurement-mutation', request)
  }
}

export function procurementMutation() {
  window.dispatchEvent(new Event('honsen-procurement-mutation'))
}
export function syncProcurement(): Promise<ProcurementSyncReport> {
  const invoke = (
    window as Window & {
      __TAURI__?: { core?: { invoke?: <T>(command: string) => Promise<T> } }
    }
  ).__TAURI__?.core?.invoke
  return invoke
    ? invoke<ProcurementSyncReport>('sync_attachments')
    : Promise.reject(new Error('DESKTOP_HOST_UNAVAILABLE'))
}
