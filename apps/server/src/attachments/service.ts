import type { Pool } from 'pg'
import { z } from 'zod'
import type { SyncActor } from '../sync/types.js'

const types: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  dwg: 'image/vnd.dwg',
  zip: 'application/zip',
}

export const attachmentIntentSchema = z
  .object({
    id: z.uuid(),
    ownerType: z.enum(['procurement_expenditure', 'receipt']),
    ownerId: z.uuid(),
    orderId: z.uuid(),
    projectId: z.uuid(),
    originalName: z.string().trim().min(1).max(255),
    contentType: z.string().min(1).max(128),
    byteLength: z.number().int().min(1).max(104857600),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.number().int().nonnegative(),
  })
  .superRefine((value, context) => {
    const extension = value.originalName.includes('.')
      ? (value.originalName.split('.').at(-1)?.toLowerCase() ?? '')
      : ''
    if (types[extension] !== value.contentType)
      context.addIssue({
        code: 'custom',
        message: 'unsupported attachment type',
      })
  })

export interface AttachmentObjectStore {
  signUpload(key: string, contentType: string): Promise<string>
  verify(key: string, byteLength: number, checksum: string): Promise<boolean>
  signDownload(key: string): Promise<string>
}

export class AttachmentError extends Error {
  constructor(
    public readonly code:
      'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'NOT_UPLOADED',
  ) {
    super(code)
  }
}

type UploadRow = {
  id: string
  owner_type: string
  owner_id: string
  order_id: string
  project_id: string
  original_name: string
  content_type: string
  byte_length: string
  checksum_sha256: string
  object_key: string
  uploader_id: string
  created_at: Date
  uploaded_at: Date | null
}

export class AttachmentService {
  constructor(
    private readonly pool: Pool,
    private readonly objects: AttachmentObjectStore,
  ) {}

  private async requireScope(
    actor: SyncActor,
    orderId: string,
    projectId: string,
  ) {
    const order = await this.pool.query<{
      payload_json: Record<string, unknown>
    }>(
      "SELECT payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1 AND NOT is_deleted",
      [orderId],
    )
    const payload = order.rows[0]?.payload_json
    if (!payload || payload.projectId !== projectId)
      throw new AttachmentError('FORBIDDEN')
    const binding = await this.pool.query(
      `SELECT 1 FROM user_project_scope_bindings s
       JOIN user_project_bindings b ON b.user_id = s.user_id AND b.project_id = s.project_id
       WHERE s.user_id = $1 AND s.project_id = $2
         AND s.department_id::text = $3 AND s.team_id::text = $4
         AND s.deleted_at IS NULL AND b.deleted_at IS NULL`,
      [actor.id, projectId, payload.departmentId, payload.teamId],
    )
    if (!binding.rowCount) throw new AttachmentError('FORBIDDEN')
    return payload
  }

  async createIntent(actor: SyncActor, input: unknown) {
    const value = attachmentIntentSchema.parse(input)
    const order = await this.requireScope(actor, value.orderId, value.projectId)
    await this.requireOwnerWrite(
      actor,
      value.ownerType,
      value.ownerId,
      value.orderId,
      value.projectId,
      order,
    )
    const client = await this.pool.connect()
    let row: UploadRow
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        value.orderId,
      ])
      const prior = await client.query<UploadRow>(
        'SELECT * FROM attachment_uploads WHERE id = $1',
        [value.id],
      )
      if (prior.rows[0]) {
        row = prior.rows[0]
        if (
          row.owner_type !== value.ownerType ||
          row.owner_id !== value.ownerId ||
          row.order_id !== value.orderId ||
          row.project_id !== value.projectId ||
          row.original_name !== value.originalName ||
          row.content_type !== value.contentType ||
          Number(row.byte_length) !== value.byteLength ||
          row.checksum_sha256 !== value.checksum ||
          Math.floor(row.created_at.getTime() / 1000) !== value.createdAt
        )
          throw new AttachmentError('CONFLICT')
      } else {
        const total = await client.query<{ total: string }>(
          'SELECT COALESCE(SUM(byte_length), 0)::text AS total FROM attachment_uploads WHERE order_id = $1',
          [value.orderId],
        )
        if (Number(total.rows[0]?.total ?? 0) + value.byteLength > 209715200)
          throw new AttachmentError('CONFLICT')
        if (
          value.ownerType === 'receipt' &&
          value.contentType.startsWith('image/')
        ) {
          const photos = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM attachment_uploads WHERE owner_type = 'receipt' AND owner_id = $1 AND content_type LIKE 'image/%'",
            [value.ownerId],
          )
          if (Number(photos.rows[0]?.count ?? 0) >= 10)
            throw new AttachmentError('CONFLICT')
        }
        const objectKey = `attachments/${value.projectId}/${value.id}`
        const inserted = await client.query<UploadRow>(
          `INSERT INTO attachment_uploads
           (id, owner_type, owner_id, order_id, project_id, original_name, content_type, byte_length, checksum_sha256, object_key, uploader_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12)) RETURNING *`,
          [
            value.id,
            value.ownerType,
            value.ownerId,
            value.orderId,
            value.projectId,
            value.originalName,
            value.contentType,
            value.byteLength,
            value.checksum,
            objectKey,
            actor.id,
            value.createdAt,
          ],
        )
        row = inserted.rows[0]!
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return {
      uploaded: row.uploaded_at !== null,
      url: row.uploaded_at
        ? null
        : await this.objects.signUpload(row.object_key, row.content_type),
    }
  }

  private async requireOwnerWrite(
    actor: SyncActor,
    ownerType: string,
    ownerId: string,
    orderId: string,
    projectId: string,
    order: Record<string, unknown>,
  ) {
    const owner = await this.pool.query<{
      payload_json: Record<string, unknown>
    }>(
      'SELECT payload_json FROM sync_entities WHERE entity_type = $1 AND entity_id = $2 AND NOT is_deleted',
      [ownerType, ownerId],
    )
    const record = owner.rows[0]?.payload_json
    if (!record || record.orderId !== orderId || record.projectId !== projectId)
      throw new AttachmentError('FORBIDDEN')
    if (ownerType === 'receipt') {
      if (
        !actor.roles.some(
          (role) => role === 'purchaser' || role === 'administrator',
        ) &&
        !(actor.roles.includes('engineer') && record.createdBy === actor.id)
      )
        throw new AttachmentError('FORBIDDEN')
      return
    }
    const parentId =
      typeof order.parentOrderId === 'string' ? order.parentOrderId : null
    const parent = parentId
      ? await this.pool.query<{ payload_json: Record<string, unknown> }>(
          "SELECT payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1 AND NOT is_deleted",
          [parentId],
        )
      : null
    const mode =
      order.procurementMode ?? parent?.rows[0]?.payload_json.procurementMode
    if (
      mode !== 'honsen_self_purchase' ||
      !actor.roles.some(
        (role) => role === 'purchaser' || role === 'administrator',
      )
    )
      throw new AttachmentError('FORBIDDEN')
  }

  async complete(actor: SyncActor, id: string) {
    const row = await this.getScoped(actor, id)
    const order = await this.requireScope(actor, row.order_id, row.project_id)
    await this.requireOwnerWrite(
      actor,
      row.owner_type,
      row.owner_id,
      row.order_id,
      row.project_id,
      order,
    )
    if (row.uploaded_at) return { uploaded: true }
    if (
      !(await this.objects.verify(
        row.object_key,
        Number(row.byte_length),
        row.checksum_sha256,
      ))
    )
      throw new AttachmentError('NOT_UPLOADED')
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const updated = await client.query<UploadRow>(
        'UPDATE attachment_uploads SET uploaded_at = NOW() WHERE id = $1 AND uploaded_at IS NULL RETURNING *',
        [id],
      )
      if (updated.rows[0]) {
        const value = updated.rows[0]
        await client.query(
          `INSERT INTO server_change_log (entity_type, entity_id, operation, version, payload_json, actor_id)
           VALUES ('attachment', $1, 'upsert', 1, $2, $3)`,
          [
            id,
            {
              id,
              ownerType: value.owner_type,
              ownerId: value.owner_id,
              orderId: value.order_id,
              projectId: value.project_id,
              originalName: value.original_name,
              contentType: value.content_type,
              byteLength: Number(value.byte_length),
              checksum: value.checksum_sha256,
              uploaderId: value.uploader_id,
              createdAt: Math.floor(value.created_at.getTime() / 1000),
            },
            value.uploader_id,
          ],
        )
      }
      await client.query('COMMIT')
      return { uploaded: true }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async download(actor: SyncActor, id: string) {
    const row = await this.getScoped(actor, id)
    if (!row.uploaded_at) throw new AttachmentError('NOT_UPLOADED')
    return { url: await this.objects.signDownload(row.object_key) }
  }

  private async getScoped(actor: SyncActor, id: string): Promise<UploadRow> {
    const result = await this.pool.query<UploadRow>(
      'SELECT * FROM attachment_uploads WHERE id = $1',
      [id],
    )
    const row = result.rows[0]
    if (!row) throw new AttachmentError('NOT_FOUND')
    await this.requireScope(actor, row.order_id, row.project_id)
    return row
  }
}
