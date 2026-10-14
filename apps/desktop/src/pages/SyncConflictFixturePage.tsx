import { SyncConflictPanel } from '../components/SyncConflictPanel'

export function SyncConflictFixturePage() {
  const attachmentFixture =
    new URLSearchParams(window.location.search).get('test') ===
    'sync-attachment-conflict'
  return (
    <main className="content">
      <SyncConflictPanel
        api={{
          listSyncConflicts: async () => [
            {
              id: '00000000-0000-4000-8000-000000000099',
              entityType: attachmentFixture ? 'attachment' : 'material',
              entityId: '00000000-0000-4000-8000-000000000098',
              serverVersion: 2,
              localPayloadJson: '{}',
              serverPayloadJson: '{}',
              serverOperation: 'upsert',
            },
          ],
          resolveSyncConflict: async () => {},
        }}
      />
    </main>
  )
}
