import { createHash, randomUUID } from 'node:crypto'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from '../sync/postgres-store.js'
import { attachmentObjectStoreConfig } from './config.js'
import { S3AttachmentStore } from './s3-store.js'
import { AttachmentService } from './service.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null
const realCosEnabled = process.env.RUN_COS_COMPAT_TEST === '1'

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
    receiptId,
  ] = Array.from({ length: 9 }, () => randomUUID())
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
      ['receipt', receiptId, { orderId, projectId, createdBy: actorId }],
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
    await expect(
      service.createIntent(actor, { ...input, checksum: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
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

  it('archives receipt photos separately from expense vouchers and limits a receipt to ten photos', async () => {
    await pool!.query(
      'UPDATE user_project_bindings SET deleted_at = NULL WHERE user_id = $1 AND project_id = $2',
      [actorId, projectId],
    )
    const input = {
      ownerType: 'receipt',
      ownerId: receiptId,
      orderId,
      projectId,
      originalName: 'photo.jpg',
      contentType: 'image/jpeg',
      byteLength: 4,
      checksum: 'a'.repeat(64),
      createdAt: 124,
    }
    await expect(
      service.createIntent(outsider, { ...input, id: randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    for (let index = 0; index < 10; index += 1) {
      const id = randomUUID()
      const intent = await service.createIntent(actor, { ...input, id })
      expect(intent.uploaded).toBe(false)
      expect(await service.complete(actor, id)).toEqual({ uploaded: true })
    }
    await expect(
      service.createIntent(actor, { ...input, id: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const rows = await pool!.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM server_change_log WHERE entity_type = 'attachment' AND payload_json->>'ownerType' = 'receipt' AND payload_json->>'ownerId' = $1",
      [receiptId],
    )
    expect(Number(rows.rows[0]?.count)).toBe(10)
  })

  it('lets a second scoped client recover one attachment change after failed completion and repeated Pull', async () => {
    await pool!.query(
      'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
      [otherId, projectId],
    )
    await pool!.query(
      'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
      [otherId, projectId, departmentId, teamId],
    )
    const id = randomUUID()
    const input = {
      id,
      ownerType: 'receipt' as const,
      ownerId: receiptId,
      orderId,
      projectId,
      originalName: 'second-client.pdf',
      contentType: 'application/pdf',
      byteLength: 4,
      checksum: 'a'.repeat(64),
      createdAt: 126,
    }
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const firstClient = new PostgresSyncStore(pool!)
    const secondClient = new PostgresSyncStore(pool!)
    const pullSecond = (at: string) =>
      secondClient.pullChanges({ actor: outsider, cursor: at, limit: 20 })

    objectPresent = false
    await service.createIntent(actor, input)
    await expect(service.complete(actor, id)).rejects.toMatchObject({
      code: 'NOT_UPLOADED',
    })
    expect((await pullSecond(cursor)).changes).toEqual([])

    objectPresent = true
    expect(await service.complete(actor, id)).toEqual({ uploaded: true })
    expect(await service.complete(actor, id)).toEqual({ uploaded: true })
    const firstPage = await firstClient.pullChanges({
      actor,
      cursor,
      limit: 20,
    })
    const secondPage = await pullSecond(cursor)
    expect(secondPage).toEqual(firstPage)
    expect(secondPage.changes).toHaveLength(1)
    expect(secondPage.changes[0]).toMatchObject({
      entityType: 'attachment',
      entityId: id,
      version: 1,
      payload: { ownerId: receiptId, checksum: input.checksum },
    })
    expect(await pullSecond(cursor)).toEqual(secondPage)
    expect(await pullSecond(secondPage.nextCursor)).toEqual({
      changes: [],
      nextCursor: secondPage.nextCursor,
    })
    expect(await service.download(outsider, id)).toMatchObject({
      url: expect.stringContaining(id),
    })
    await pool!.query(
      'UPDATE user_project_bindings SET deleted_at = NOW() WHERE user_id = $1 AND project_id = $2',
      [otherId, projectId],
    )
    expect((await pullSecond(cursor)).changes).toEqual([])
    await expect(service.download(outsider, id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it.skipIf(!realCosEnabled)(
    'uses server-issued COS URLs to transfer, verify and retrieve one isolated attachment',
    async () => {
      const config = attachmentObjectStoreConfig(process.env)
      const store = new S3AttachmentStore(
        config.bucket,
        config.region,
        config.endpoint,
        config.accessKeyId,
        config.secretAccessKey,
      )
      const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      })
      await pool!.query(
        'UPDATE user_project_bindings SET deleted_at = NULL WHERE user_id = $1 AND project_id = $2',
        [actorId, projectId],
      )
      const id = randomUUID()
      const key = `attachments/${projectId}/${id}`
      const bytes = Buffer.from(`honsen-stage5-server-cos-${id}`)
      const input = {
        id,
        ownerType: 'procurement_expenditure' as const,
        ownerId: expenseId,
        orderId,
        projectId,
        originalName: 'server-cos-proof.pdf',
        contentType: 'application/pdf',
        byteLength: bytes.length,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        createdAt: 125,
      }
      const service = new AttachmentService(pool!, store)
      try {
        const intent = await service.createIntent(actor, input)
        expect(intent.uploaded).toBe(false)
        expect(intent.url).toBeTruthy()
        expect(
          (
            await fetch(intent.url!, {
              method: 'PUT',
              headers: { 'content-type': input.contentType },
              body: bytes,
            })
          ).ok,
        ).toBe(true)
        expect(await service.complete(actor, id)).toEqual({ uploaded: true })
        const download = await service.download(actor, id)
        expect(
          Buffer.from(await (await fetch(download.url)).arrayBuffer()),
        ).toEqual(bytes)
      } finally {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        )
      }
    },
  )
})
