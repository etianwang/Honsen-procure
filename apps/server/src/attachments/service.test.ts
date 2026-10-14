import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from '../sync/postgres-store.js'
import { AttachmentService } from './service.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null

describe.skipIf(!pool)('AttachmentService with isolated PostgreSQL', () => {
  const [
    actorId,
    otherId,
    countryId,
    projectId,
    departmentId,
    teamId,
    orderId,
    expenseId,
  ] = Array.from({ length: 8 }, () => randomUUID())
  let objectPresent = false
  const storage = {
    signUpload: async (key: string) => `https://test-objects.invalid/${key}`,
    signDownload: async (key: string) => `https://test-objects.invalid/${key}`,
    verify: async (_key: string, length: number, checksum: string) =>
      objectPresent && length === 4 && checksum === 'a'.repeat(64),
  }
  const actor = { id: actorId, roles: ['purchaser' as const] }
  const outsider = { id: otherId, roles: ['engineer' as const] }
  let service: AttachmentService

  beforeAll(async () => {
    await runMigrations(pool!)
    service = new AttachmentService(pool!, storage)
    for (const id of [actorId, otherId])
      await pool!.query(
        "INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled) VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE)",
        [id, `ATT-U-${id}`, `att-${id}`],
      )
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'fixture', 'UTC')",
      [countryId, `ATT-C-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'fixture', 'fixture', 'fixture', 'XOF', 'zh_fr')",
      [projectId, countryId, `ATT-P-${projectId}`],
    )
    await pool!.query(
      "INSERT INTO departments (id, business_code, name) VALUES ($1, $2, 'fixture')",
      [departmentId, `ATT-D-${departmentId}`],
    )
    await pool!.query(
      'INSERT INTO teams (id, department_id, business_code, name) VALUES ($1, $2, $3, $4)',
      [teamId, departmentId, `ATT-T-${teamId}`, 'fixture'],
    )
    await pool!.query(
      'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
      [actorId, projectId],
    )
    await pool!.query(
      'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
      [actorId, projectId, departmentId, teamId],
    )
    for (const [entityType, entityId, payload] of [
      [
        'purchase_order',
        orderId,
        {
          projectId,
          departmentId,
          teamId,
          procurementMode: 'honsen_self_purchase',
        },
      ],
      [
        'procurement_expenditure',
        expenseId,
        { orderId, projectId, amountMinor: '100' },
      ],
    ] as const)
      await pool!.query(
        'INSERT INTO sync_entities (entity_type, entity_id, version, payload_json, updated_by) VALUES ($1, $2, 1, $3, $4)',
        [entityType, entityId, payload, actorId],
      )
  })

  afterAll(async () => {
    await pool!.end()
  })

  it('retries a pending upload, verifies the object, publishes one scoped Pull change and denies other accounts', async () => {
    const id = randomUUID()
    const input = {
      id,
      ownerType: 'procurement_expenditure',
      ownerId: expenseId,
      orderId,
      projectId,
      originalName: 'voucher.pdf',
      contentType: 'application/pdf',
      byteLength: 4,
      checksum: 'a'.repeat(64),
      createdAt: 123,
    }
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    await expect(service.createIntent(outsider, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const intent = await service.createIntent(actor, input)
    expect(intent.uploaded).toBe(false)
    expect(await service.createIntent(actor, input)).toEqual(intent)
    await expect(
      service.createIntent(actor, { ...input, byteLength: 5 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(service.complete(actor, id)).rejects.toMatchObject({
      code: 'NOT_UPLOADED',
    })
    objectPresent = true
    expect(await service.complete(actor, id)).toEqual({ uploaded: true })
    expect(await service.complete(actor, id)).toEqual({ uploaded: true })
    const pulled = await new PostgresSyncStore(pool!).pullChanges({
      actor: { id: actorId, roles: ['engineer'] },
      cursor,
      limit: 20,
    })
    expect(
      pulled.changes.filter((change) => change.entityType === 'attachment'),
    ).toHaveLength(1)
    expect(pulled.changes.at(-1)?.payload).toMatchObject({
      id,
      ownerId: expenseId,
      projectId,
      checksum: input.checksum,
    })
    const denied = await new PostgresSyncStore(pool!).pullChanges({
      actor: outsider,
      cursor,
      limit: 20,
    })
    expect(denied.changes).toEqual([])
    await expect(service.download(outsider, id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await service.download(actor, id)).toMatchObject({
      url: expect.stringContaining(id),
    })
    await pool!.query(
      'UPDATE user_project_bindings SET deleted_at = NOW() WHERE user_id = $1 AND project_id = $2',
      [actorId, projectId],
    )
    await expect(service.download(actor, id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
