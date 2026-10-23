import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { PostgresSyncStore } from '../../apps/server/src/sync/postgres-store.js'
import { SyncService } from '../../apps/server/src/sync/service.js'
import { createApp } from '../../apps/server/src/app.js'
import { AuthService, hashToken } from '../../apps/server/src/auth/service.js'
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  options: `-c role=${process.env.NEW_ROLE}`,
})
const actor = {
  id: process.env.TEST_ACTOR!,
  installationId: randomUUID(),
  roles: ['administrator' as const],
}
const store = new PostgresSyncStore(pool)
const service = new SyncService(store)
const categoryId = process.env.TEST_CATEGORY!
const auth = new AuthService(
  {
    async findActiveSession(token: string) {
      if (token !== hashToken('admin') && token !== hashToken('engineer'))
        return null
      return {
        ...actor,
        roles: token === hashToken('admin') ? ['administrator'] : ['engineer'],
        isEnabled: true,
      }
    },
  } as any,
  { verify: async () => false },
)
const app = createApp(auth, undefined, service)
try {
  const pending = await service.listCategoryQuarantine(actor)
  assert(pending.some((item) => item.categoryId === categoryId))
  const request = {
    requestId: randomUUID(),
    categoryId,
    expectedVersion: 1,
    newBusinessCode: `NEW-${randomUUID()}`,
    reason: 'test repair',
  }
  const call = (token: string) =>
    app.inject({
      method: 'POST',
      url: '/api/sync/category-repairs',
      headers: { authorization: `Bearer ${token}` },
      payload: request,
    })
  assert.equal((await call('engineer')).statusCode, 403)
  const response = await call('admin')
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().version, 2)
  assert.equal((await call('admin')).statusCode, 200)
  const input = (id: string) => ({
    actorId: actor.id,
    installationId: actor.installationId,
    event: {
      eventId: randomUUID(),
      entityType: 'material_category' as const,
      entityId: id,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id,
        businessCode: 'TEST-NEW',
        name: 'Fixture',
        isActive: true,
        version: 1,
      },
    },
  })
  const a = input(randomUUID()),
    b = input(randomUUID())
  assert.equal((await store.pushEvent(a)).status, 'accepted')
  assert.equal((await store.pushEvent(b)).errorCode, 'CATEGORY_CODE_CONFLICT')
  const changes = await store.pullChanges({ actor, cursor: '0', limit: 100 })
  assert(changes.changes.some((change) => change.entityId === a.event.entityId))
  console.log('T04 restricted role service push, pull, and repair: PASS')
} finally {
  await app.close()
  await pool.end()
}
