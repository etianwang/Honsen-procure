import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

const url = process.env.TEST_DATABASE_URL
if (
  !url ||
  new URL(url).hostname !== '127.0.0.1' ||
  new URL(url).port !== '55440' ||
  new URL(url).pathname !== '/t04_review_test'
)
  throw new Error('isolated T04 review database required')
const pool = new Pool({ connectionString: url })
const actorId = randomUUID()
const installationId = randomUUID()
const actor = { id: actorId, roles: ['administrator' as const], installationId }
const service = new SyncService(new PostgresSyncStore(pool))

describe('T04 review: category code contract', () => {
  beforeAll(async () => {
    await runMigrations(pool)
    await pool.query(
      "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
      [actorId, `T04-${actorId}`, `t04-${actorId}`],
    )
  })
  afterAll(async () => {
    await pool.end()
  })
  function event(code: string) {
    const id = randomUUID()
    return {
      eventId: randomUUID(),
      entityType: 'material_category' as const,
      entityId: id,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id,
        businessCode: code,
        name: 'Synthetic category',
        isActive: true,
        version: 1,
      },
    }
  }
  it('characterizes rejection of a code accepted by the desktop reference validator', async () => {
    const result = await service.push(actor, {
      deviceId: installationId,
      events: [event('-CAT')],
    })
    expect(result.results[0]).toMatchObject({
      status: 'validation_error',
      errorCode: 'FORBIDDEN',
    })
  })
  it('characterizes server acceptance of the same code for two different category UUIDs', async () => {
    const code = `REVIEW-${randomUUID()}`
    const first = event(code)
    const second = event(code)
    const result = await service.push(actor, {
      deviceId: installationId,
      events: [first, second],
    })
    expect(result.results.map((item) => item.status)).toEqual([
      'accepted',
      'accepted',
    ])
    const rows = await pool.query(
      "SELECT entity_id FROM sync_entities WHERE entity_type = 'material_category' AND payload_json->>'businessCode' = $1",
      [code],
    )
    expect(rows.rowCount).toBe(2)
  })
})
