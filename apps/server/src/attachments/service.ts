import { randomUUID } from 'node:crypto'
import {
  attachmentImportSchema,
  attachmentMetadataSchema,
  type AttachmentImport,
  type AttachmentMetadata,
} from '@honsen/shared'
import type { Pool, PoolClient } from 'pg'
import type { SyncActor } from '../sync/types.js'
import { CosError, type CosStorage } from './cos.js'

type Stored = {
  payload_json: AttachmentImport
  object_key: string
  version_id: string | null
  status: 'pending_upload' | 'uploaded'
  project_id: string
  country_id: string
  uploaded_by: string
  created_at: string
}
export class AttachmentError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code)
  }
}
export class AttachmentService {
  constructor(
    private readonly pool: Pool,
    private readonly cos: Pick<CosStorage, 'upload' | 'inspect' | 'download'>,
    private readonly prefix = 'honsen-procure/attachments/',
  ) {
    if (!/^[a-zA-Z0-9/_-]+\/$/.test(prefix) || prefix.includes('..'))
      throw new AttachmentError('INVALID_ATTACHMENT_PREFIX')
  }
  private async authorize(
    client: PoolClient,
    actor: SyncActor,
    orderId: string,
    write: boolean,
  ) {
    if (
      write &&
      !actor.roles.some((r) => ['purchaser', 'administrator'].includes(r))
    )
      throw new AttachmentError('FORBIDDEN', 403)
    const result = await client.query<{
      project_id: string
      country_id: string
    }>(
      `SELECT p.id AS project_id,p.country_id FROM sync_entities o JOIN projects p ON p.id::text=o.payload_json->>'projectId' JOIN countries c ON c.id=p.country_id JOIN user_project_bindings b ON b.project_id=p.id AND b.user_id=$2 AND b.deleted_at IS NULL JOIN user_project_scope_bindings scope ON scope.user_id=b.user_id AND scope.project_id=b.project_id AND scope.deleted_at IS NULL AND scope.department_id::text=o.payload_json->>'departmentId' AND scope.team_id::text=o.payload_json->>'teamId' JOIN departments d ON d.id=scope.department_id AND d.is_active AND d.deleted_at IS NULL JOIN teams t ON t.id=scope.team_id AND t.department_id=d.id AND t.is_active AND t.deleted_at IS NULL WHERE o.entity_type='purchase_order' AND o.entity_id=$1 AND NOT o.is_deleted AND p.is_active AND p.deleted_at IS NULL AND c.is_active AND c.deleted_at IS NULL AND c.id::text=o.payload_json->>'countryId' FOR SHARE OF o,p,c,b,scope,d,t`,
      [orderId, actor.id],
    )
    const scope = result.rows[0]
    if (!scope) throw new AttachmentError('FORBIDDEN', 403)
    return scope
  }
  private metadata(row: Stored): AttachmentMetadata {
    return attachmentMetadataSchema.parse({
      ...row.payload_json,
      objectKey: row.object_key,
      versionId: row.version_id,
      status: 'uploaded',
      projectId: row.project_id,
      countryId: row.country_id,
      uploadedBy: row.uploaded_by,
      createdAt: Number(row.created_at),
    })
  }
  async prepare(actor: SyncActor, input: unknown) {
    const data = attachmentImportSchema.parse(input)
    const client = await this.pool.connect()
    let row: Stored
    try {
      await client.query('BEGIN')
      const scope = await this.authorize(client, actor, data.orderId, true)
      const parent = await client.query<{ parent_id: string | null }>(
        `SELECT payload_json->>'parentOrderId' AS parent_id FROM sync_entities WHERE entity_type='purchase_order' AND entity_id=$1`,
        [data.orderId],
      )
      const root = parent.rows[0]?.parent_id ?? data.orderId
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `attachment-order:${root}`,
      ])
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `attachment:${data.id}`,
      ])
      if (data.sourceAttachmentId) {
        const source = await client.query(
          `SELECT 1 FROM attachments WHERE id=$1 AND order_id=$2 AND owner_type=$3 AND owner_id=$4 AND project_id=$5 AND country_id=$6 AND status='uploaded' AND content_type IN ('image/heic','image/heif') AND NOT (payload_json ? 'sourceAttachmentId') FOR SHARE`,
          [
            data.sourceAttachmentId,
            data.orderId,
            data.ownerType,
            data.ownerId,
            scope.project_id,
            scope.country_id,
          ],
        )
        if (!source.rowCount)
          throw new AttachmentError('ATTACHMENT_SOURCE_NOT_VERIFIED', 409)
        const derivative = await client.query(
          `SELECT 1 FROM attachments WHERE payload_json->>'sourceAttachmentId'=$1 AND id<>$2`,
          [data.sourceAttachmentId, data.id],
        )
        if (derivative.rowCount)
          throw new AttachmentError('ATTACHMENT_DERIVATIVE_EXISTS', 409)
      }
      if (data.ownerType !== 'purchase_order') {
        const owner = await client.query(
          `SELECT 1 FROM sync_entities WHERE entity_type=$1 AND entity_id=$2 AND NOT is_deleted AND payload_json->>'orderId'=$3`,
          [data.ownerType, data.ownerId, data.orderId],
        )
        if (owner.rowCount !== 1)
          throw new AttachmentError('ATTACHMENT_OWNER_NOT_SYNCED', 409)
      }
      const existing = await client.query<Stored>(
        'SELECT * FROM attachments WHERE id=$1 FOR UPDATE',
        [data.id],
      )
      if (existing.rows[0]) {
        row = existing.rows[0]
        const stored = attachmentImportSchema.parse(row.payload_json)
        if (JSON.stringify(stored) !== JSON.stringify(data))
          throw new AttachmentError('IMMUTABLE_ATTACHMENT', 409)
        if (row.status === 'uploaded') {
          await client.query('COMMIT')
          return { metadata: this.metadata(row) }
        }
      } else {
        const usage = await client.query<{ total: string; photos: string }>(
          `SELECT COALESCE(SUM(a.byte_length),0)::text AS total,COUNT(*) FILTER(WHERE a.owner_type='receipt' AND a.owner_id=$2 AND NOT (a.payload_json ? 'sourceAttachmentId'))::text AS photos FROM attachments a WHERE a.order_id=$1 OR a.order_id IN (SELECT entity_id FROM sync_entities WHERE entity_type='purchase_order' AND payload_json->>'parentOrderId'=$1::text)`,
          [root, data.ownerId],
        )
        if (
          BigInt(usage.rows[0]?.total ?? '0') + BigInt(data.byteLength) >
          209715200n
        )
          throw new AttachmentError('ORDER_ATTACHMENT_LIMIT')
        if (
          data.ownerType === 'receipt' &&
          !data.sourceAttachmentId &&
          Number(usage.rows[0]?.photos ?? 0) >= 10
        )
          throw new AttachmentError('RECEIPT_PHOTO_LIMIT')
        const key = `${this.prefix}${scope.country_id}/${scope.project_id}/${data.id}/${randomUUID()}`
        const createdAt = Math.floor(Date.now() / 1000)
        await client.query(
          `INSERT INTO attachments (id,order_id,owner_type,owner_id,project_id,country_id,original_name,content_type,byte_length,checksum,object_key,status,uploaded_by,created_at,payload_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_upload',$12,$13,$14)`,
          [
            data.id,
            data.orderId,
            data.ownerType,
            data.ownerId,
            scope.project_id,
            scope.country_id,
            data.originalName,
            data.contentType,
            data.byteLength,
            data.checksum,
            key,
            actor.id,
            createdAt,
            data,
          ],
        )
        await client.query(
          `INSERT INTO attachment_audit (attachment_id,actor_id,action) VALUES ($1,$2,'prepared')`,
          [data.id, actor.id],
        )
        row = {
          payload_json: data,
          object_key: key,
          version_id: null,
          status: 'pending_upload',
          project_id: scope.project_id,
          country_id: scope.country_id,
          uploaded_by: actor.id,
          created_at: String(createdAt),
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return {
      upload: {
        id: data.id,
        ...(await this.cos.upload(
          row.object_key,
          data.contentType,
          data.checksum,
          data.byteLength,
        )),
      },
    }
  }
  async complete(actor: SyncActor, id: string) {
    // Network verification happens outside the database transaction; commit rechecks authorization.
    const stored = await this.pool.query<Stored>(
      'SELECT * FROM attachments WHERE id=$1',
      [id],
    )
    const row = stored.rows[0]
    if (!row) throw new AttachmentError('ATTACHMENT_NOT_FOUND', 404)
    const preflight = await this.pool.connect()
    try {
      await this.authorize(preflight, actor, row.payload_json.orderId, true)
    } finally {
      preflight.release()
    }
    let versionId = row.version_id
    if (row.status !== 'uploaded')
      versionId = (
        await this.cos.inspect(
          row.object_key,
          row.payload_json.byteLength,
          row.payload_json.checksum,
          row.payload_json.contentType,
        )
      ).versionId
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await this.authorize(client, actor, row.payload_json.orderId, true)
      const current = (
        await client.query<Stored>(
          'SELECT * FROM attachments WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0]
      if (!current) throw new AttachmentError('ATTACHMENT_NOT_FOUND', 404)
      if (current.status === 'uploaded') {
        await client.query('COMMIT')
        return this.metadata(current)
      }
      const metadata = this.metadata({
        ...current,
        status: 'uploaded',
        version_id: versionId,
      })
      await client.query(
        `UPDATE attachments SET status='uploaded',version_id=$2 WHERE id=$1`,
        [id, versionId],
      )
      await client.query(
        `INSERT INTO attachment_audit (attachment_id,actor_id,action) VALUES ($1,$2,'verified')`,
        [id, actor.id],
      )
      await client.query(
        `INSERT INTO sync_entities (entity_type,entity_id,version,payload_json,updated_by) VALUES ('attachment',$1,1,$2,$3)`,
        [id, metadata, actor.id],
      )
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('honsen-change-log'))",
      )
      await client.query(
        `INSERT INTO server_change_log (entity_type,entity_id,operation,version,payload_json,actor_id) VALUES ('attachment',$1,'upsert',1,$2,$3)`,
        [id, metadata, actor.id],
      )
      await client.query('COMMIT')
      return metadata
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  async download(actor: SyncActor, id: string) {
    const client = await this.pool.connect()
    let row: Stored
    try {
      await client.query('BEGIN')
      const current = (
        await client.query<Stored>(
          `SELECT * FROM attachments WHERE id=$1 AND status='uploaded'`,
          [id],
        )
      ).rows[0]
      if (!current) throw new AttachmentError('ATTACHMENT_NOT_FOUND', 404)
      row = current
      await this.authorize(client, actor, row.payload_json.orderId, false)
      await client.query(
        `INSERT INTO attachment_audit (attachment_id,actor_id,action) VALUES ($1,$2,'download_authorized')`,
        [id, actor.id],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return {
      metadata: this.metadata(row),
      download: {
        id,
        ...(await this.cos.download(row.object_key, row.version_id)),
      },
    }
  }
}

export function attachmentStatus(error: unknown) {
  if (error instanceof AttachmentError || error instanceof CosError)
    return { status: error.status, code: error.code }
  return null
}
