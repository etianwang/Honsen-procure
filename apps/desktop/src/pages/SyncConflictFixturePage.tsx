import { SyncConflictPanel } from '../components/SyncConflictPanel'
import { CategoryRepairPanel } from '../components/CategoryRepairPanel'

const categoryApi = {
  listLocal: async () => [
    {
      eventId: '00000000-0000-4000-8000-000000000091',
      categoryId: '00000000-0000-4000-8000-000000000092',
      businessCode: 'CAT-OLD',
      name: 'Fixture',
    },
  ],
  listRemote: async () => [],
  listPending: async () =>
    new URLSearchParams(window.location.search).has('pending')
      ? [
          {
            categoryId: '00000000-0000-4000-8000-000000000094',
            expectedVersion: 1,
            newBusinessCode: 'CAT-RETRY',
            reason: '连接中断',
          },
        ]
      : [],
  repairLocal: async () => '00000000-0000-4000-8000-000000000093',
  repairRemote: async () => {},
}

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
          resolvePurchaseOrderConflict: async () => {},
        }}
      />
      <CategoryRepairPanel api={categoryApi} />
    </main>
  )
}
