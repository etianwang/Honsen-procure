import { SyncConflictPanel } from '../components/SyncConflictPanel'

export function SyncConflictFixturePage() {
  return (
    <main className="content">
      <SyncConflictPanel
        api={{
          listSyncConflicts: async () => [
            {
              id: '00000000-0000-4000-8000-000000000099',
              entityType: 'material',
              entityId: '00000000-0000-4000-8000-000000000098',
              serverVersion: 2,
              localPayloadJson: '{}',
              serverPayloadJson: '{}',
              serverOperation: 'upsert',
            },
          ],
          resolveSyncConflict: async () => {
            if (
              new URLSearchParams(window.location.search).get('deny') ===
              'account'
            ) {
              throw { code: 'sync_account_boundary' }
            }
          },
        }}
      />
    </main>
  )
}
