import { createHash, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { AttachmentService } from './service.js'
import { CosStorage } from './cos.js'
import { PostgresSyncStore } from '../sync/postgres-store.js'
import { createApp } from '../app.js'
import { AuthService, hashToken } from '../auth/service.js'
import type { LoginAccount, AuthStore } from '../auth/types.js'

const url = process.env.TEST_DATABASE_URL
describe.skipIf(!url)(
  'PostgreSQL attachment authorization and archival',
  () => {
    const pool = new Pool({ connectionString: url })
    const actor = { id: randomUUID(), roles: ['purchaser'] as const },
      countryId = randomUUID(),
      projectId = randomUUID(),
      orderId = randomUUID()
    const file = Buffer.from(
      '%PDF-1.4\n% Synthetic attachment API integration\n%%EOF\n',
    )
    const data = () => ({
      id: randomUUID(),
      orderId,
      ownerType: 'purchase_order',
      ownerId: orderId,
      originalName: 'synthetic.pdf',
      contentType: 'application/pdf',
      byteLength: file.length,
      checksum: createHash('sha256').update(file).digest('hex'),
    })
    const real =
      process.env.HONSEN_COS_LIVE === '1'
        ? CosStorage.fromEnvironment(process.env)
        : undefined
    const fake = {
      async upload() {
        return {
          url: 'https://synthetic.test/upload',
          headers: {},
          expiresAt: 9999999999,
        }
      },
      async inspect() {
        return { versionId: null, byteLength: file.length }
      },
      async download() {
        return {
          url: 'https://synthetic.test/download',
          headers: {},
          expiresAt: 9999999999,
        }
      },
    }
    const service = new AttachmentService(
      pool,
      real ?? fake,
      `honsen-procure-tests/${randomUUID()}/`,
    )
    beforeAll(async () => {
      await runMigrations(pool)
      await pool.query(
        `INSERT INTO users (id,business_code,username,password_hash,ui_locale,is_enabled) VALUES ($1::uuid,$1::text,$1::text,'fixture','zh-CN',true)`,
        [actor.id],
      )
      await pool.query(
        `INSERT INTO countries (id,business_code,name,time_zone) VALUES ($1::uuid,$1::text,'Synthetic','UTC')`,
        [countryId],
      )
      await pool.query(
        `INSERT INTO projects (id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES ($1::uuid,$2::uuid,$1::text,'Synthetic','Synthetic','Synthetic','XOF','zh_fr')`,
        [projectId, countryId],
      )
      await pool.query(
        `INSERT INTO user_project_bindings (user_id,project_id) VALUES ($1,$2)`,
        [actor.id, projectId],
      )
      await new PostgresSyncStore(pool).pushEvent({
        actorId: actor.id,
        installationId: randomUUID(),
        event: {
          eventId: randomUUID(),
          entityType: 'purchase_order',
          entityId: orderId,
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            countryId,
            projectId,
            currency: 'XOF',
            procurementMode: 'honsen_self_purchase',
            workflowStatus: 'executing',
          },
        },
      })
    })
    afterAll(async () => {
      await pool.end()
    })
    it('prepares idempotently, rejects replacement and verifies once before publishing metadata', async () => {
      const input = data()
      const account: LoginAccount = {
        ...actor,
        roles: ['purchaser'],
        username: 'synthetic',
        passwordHash: 'fixture',
        locale: 'zh-CN',
        isEnabled: true,
        lockedUntil: null,
        requiresPasswordChange: false,
      }
      const authStore: AuthStore = {
        async findAccountByUsername() {
          return account
        },
        async findActiveSession(token) {
          return token === hashToken('synthetic-test-token') ? account : null
        },
        async registerFailedLogin() {},
        async registerSuccessfulLogin() {},
        async createSession() {},
      }
      const app = createApp(
        new AuthService(authStore, { verify: async () => true }),
        undefined,
        undefined,
        undefined,
        service,
      )
      const headers = { authorization: 'Bearer synthetic-test-token' }
      let key: string | undefined,
        versionId: string | null = null
      try {
        const prepared = await app.inject({
          method: 'POST',
          url: '/api/attachments/prepare',
          headers,
          payload: input,
        })
        expect(prepared.statusCode).toBe(200)
        const retry = await service.prepare(actor, input)
        expect('upload' in retry).toBe(true)
        await expect(
          service.prepare(actor, { ...input, checksum: '0'.repeat(64) }),
        ).rejects.toMatchObject({ code: 'IMMUTABLE_ATTACHMENT' })
        if (real) {
          const upload = prepared.json().upload
          const response = await fetch(upload.url, {
            method: 'PUT',
            headers: upload.headers,
            body: file,
            signal: AbortSignal.timeout(30000),
          })
          expect(response.ok).toBe(true)
          key = new URL(upload.url).pathname.slice(1)
          versionId = response.headers.get('x-cos-version-id')
        }
        const complete = await app.inject({
          method: 'POST',
          url: `/api/attachments/${input.id}/complete`,
          headers,
        })
        expect(complete.statusCode).toBe(200)
        expect(complete.json()).toMatchObject({
          status: 'uploaded',
          checksum: input.checksum,
          byteLength: file.length,
        })
        versionId = complete.json().versionId
        expect((await service.complete(actor, input.id)).checksum).toBe(
          input.checksum,
        )
        const download = await app.inject({
          method: 'GET',
          url: `/api/attachments/${input.id}/download`,
          headers,
        })
        expect(download.statusCode).toBe(200)
        if (real) {
          const response = await fetch(download.json().download.url, {
            signal: AbortSignal.timeout(30000),
          })
          expect(response.status).toBe(200)
          expect(
            createHash('sha256')
              .update(Buffer.from(await response.arrayBuffer()))
              .digest('hex'),
          ).toBe(input.checksum)
        }
        expect(
          (
            await pool.query(
              `SELECT 1 FROM server_change_log WHERE entity_type='attachment' AND entity_id=$1`,
              [input.id],
            )
          ).rowCount,
        ).toBe(1)
        expect(
          (
            await new PostgresSyncStore(pool).pullChanges({
              actor: { ...actor, roles: ['purchaser'] },
              cursor: '0',
              limit: 500,
            })
          ).changes.some((c) => c.entityId === input.id),
        ).toBe(true)
        await expect(
          service.download(
            { id: randomUUID(), roles: ['purchaser'] },
            input.id,
          ),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
        await expect(
          pool.query(
            `UPDATE attachments SET original_name='replacement.pdf' WHERE id=$1`,
            [input.id],
          ),
        ).rejects.toThrow('attachment archive is immutable')
      } finally {
        await app.close()
        if (real && key)
          expect(await real.removeOwnedTestObject(key, versionId)).toBe(204)
      }
    }, 120000)
    it('rejects an engineer upload and an unrelated receipt owner', async () => {
      await expect(
        service.prepare({ ...actor, roles: ['engineer'] }, data()),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(
        service.prepare(actor, {
          ...data(),
          ownerType: 'receipt',
          ownerId: randomUUID(),
          originalName: 'photo.png',
          contentType: 'image/png',
        }),
      ).rejects.toMatchObject({ code: 'ATTACHMENT_OWNER_NOT_SYNCED' })
    })
    it('rejects unsafe filenames, unsupported MIME and files above the original size limit', async () => {
      for (const override of [
        { originalName: '../synthetic.pdf' },
        { originalName: 'synthetic.exe' },
        { contentType: 'application/x-msdownload' },
        { byteLength: 104857601 },
      ])
        await expect(
          service.prepare(actor, { ...data(), ...override }),
        ).rejects.toThrow()
    })
  },
)
