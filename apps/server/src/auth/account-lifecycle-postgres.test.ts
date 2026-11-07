import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import argon2 from 'argon2'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { AuthorizationService } from '../authorization/service.js'
import { PostgresAuthorizationStore } from '../authorization/postgres-store.js'
import { SyncService } from '../sync/service.js'
import { PostgresSyncStore } from '../sync/postgres-store.js'
import { AuthService, hashToken } from './service.js'
import { registerAccounts } from './accounts.js'
import { materialFixture } from '../sync/catalog-fixtures.js'

let beforePush: (() => Promise<void>) | undefined
class GatedSyncStore extends PostgresSyncStore {
  override async pushEvent(
    input: Parameters<PostgresSyncStore['pushEvent']>[0],
  ) {
    await beforePush?.()
    return super.pushEvent(input)
  }
}

const url = process.env.TEST_DATABASE_URL
const control = url ? new Pool({ connectionString: url }) : null
const database = 'account_lifecycle_' + randomUUID().replaceAll('-', '')
const role = 'lifecycle_runtime_' + randomUUID().replaceAll('-', '')
const superId = randomUUID(),
  adminId = randomUUID(),
  projectId = randomUUID(),
  countryId = randomUUID(),
  departmentId = randomUUID(),
  teamId = randomUUID()
const scope = { projectId, departmentId, teamId }
let owner: Pool,
  runtime: Pool,
  app: ReturnType<typeof createApp>,
  superToken: string,
  adminToken: string
const username = () => 'Synthetic' + randomUUID().replaceAll('-', '')
async function user(id: string, roles: string[]) {
  await owner.query(
    "INSERT INTO users(id,business_code,username,display_name,password_hash,ui_locale,requires_password_change) VALUES($1::uuid,$1::text,$2,'合成用户',$3,'zh-CN',FALSE)",
    [id, username(), await argon2.hash(randomUUID())],
  )
  for (const role of roles)
    await owner.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [
      id,
      role,
    ])
}
async function bind(id: string) {
  await owner.query(
    'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
    [id, projectId],
  )
  await owner.query(
    'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
    [id, projectId, departmentId, teamId],
  )
}
async function session(id: string) {
  const token = randomUUID() + randomUUID()
  await owner.query(
    "INSERT INTO account_sessions(id,user_id,token_hash,installation_id,expires_at) VALUES($1,$2,$3,$4,NOW()+interval '1 hour')",
    [randomUUID(), id, hashToken(token), randomUUID()],
  )
  return token
}
async function target(roles = ['engineer']) {
  const id = randomUUID()
  await user(id, roles)
  await bind(id)
  return id
}
const headers = (token: string) => ({ authorization: `Bearer ${token}` })
const get = (id: string, token = superToken) =>
  app.inject({
    method: 'GET',
    url: `/api/accounts/${id}`,
    headers: headers(token),
  })
const patch = (
  id: string,
  expectedAccountVersion: string,
  fields: Record<string, unknown>,
  token = superToken,
) =>
  app.inject({
    method: 'PATCH',
    url: `/api/accounts/${id}`,
    headers: headers(token),
    payload: { expectedAccountVersion, ...fields },
  })

describe.skipIf(!control)(
  'managed account lifecycle through restricted PostgreSQL runtime',
  () => {
    beforeAll(async () => {
      await control!.query(`CREATE DATABASE "${database}"`)
      const connection = new URL(url!)
      connection.pathname = '/' + database
      owner = new Pool({ connectionString: connection.toString() })
      await runMigrations(owner)
      await owner.query(
        "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1::uuid,$1::text,'synthetic','UTC')",
        [countryId],
      )
      await owner.query(
        "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1::uuid,$2,$1::text,'synthetic','site','department','XOF','zh_fr')",
        [projectId, countryId],
      )
      await owner.query(
        "INSERT INTO departments(id,business_code,name) VALUES($1::uuid,$1::text,'synthetic')",
        [departmentId],
      )
      await owner.query(
        "INSERT INTO teams(id,department_id,business_code,name) VALUES($1::uuid,$2,$1::text,'synthetic')",
        [teamId, departmentId],
      )
      await user(superId, ['super_administrator'])
      await user(adminId, ['administrator'])
      await bind(adminId)
      superToken = await session(superId)
      adminToken = await session(adminId)
      const password = randomUUID()
      await control!.query(
        `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'`,
      )
      const grants = await readFile(
        new URL('../../../../deploy/baota/runtime-grants.sql', import.meta.url),
        'utf8',
      )
      await owner.query(grants.replaceAll(':"runtime_role"', `"${role}"`))
      connection.username = role
      connection.password = password
      runtime = new Pool({ connectionString: connection.toString() })
      const auth = new AuthService(new PostgresAuthStore(runtime), {
        verify: argon2.verify,
      })
      app = createApp(
        auth,
        undefined,
        new SyncService(new GatedSyncStore(runtime)),
        new AuthorizationService(new PostgresAuthorizationStore(runtime)),
      )
      registerAccounts(app, auth, runtime)
    })
    it('rejects split-parent receipt writes through the API while preserving child receiving and retry', async () => {
      const id = await target(['purchaser']),
        token = await session(id),
        parent = randomUUID(),
        child = randomUUID()
      for (const [orderId, parentOrderId] of [
        [parent, null],
        [child, parent],
      ]) {
        await owner.query(
          "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('purchase_order',$1,1,$2,$3)",
          [
            orderId,
            {
              projectId,
              countryId,
              departmentId,
              teamId,
              parentOrderId,
              workflowStatus: 'executing',
            },
            id,
          ],
        )
      }
      const receiptId = randomUUID()
      const event = {
        eventId: randomUUID(),
        entityType: 'receipt',
        entityId: receiptId,
        operation: 'upsert',
        baseVersion: 0,
        payload: { orderId: parent, projectId, receiverId: id, items: [] },
      }
      const push = (value: unknown) =>
        app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: headers(token),
          payload: { deviceId: randomUUID(), events: [value] },
        })
      expect((await push(event)).json().results[0].errorCode).toBe(
        'RECEIPT_PARENT_SPLIT',
      )
      expect(
        (
          await owner.query(
            "SELECT 1 FROM sync_entities WHERE entity_type='receipt' AND entity_id=$1",
            [receiptId],
          )
        ).rowCount,
      ).toBe(0)
      const valid = { ...event, payload: { ...event.payload, orderId: child } }
      const first = (await push(valid)).json().results[0]
      expect(first.status).toBe('accepted')
      expect((await push(valid)).json().results[0]).toEqual(first)
      expect(
        (
          await owner.query(
            "SELECT payload_json->>'orderId' AS order_id FROM sync_entities WHERE entity_type='receipt' AND entity_id=$1",
            [receiptId],
          )
        ).rows[0].order_id,
      ).toBe(child)
    })
    it.each([
      'roles',
      'disable',
      'session',
      'expired',
      'replay',
      'unchanged',
    ] as const)(
      'revalidates in-flight push authority after %s change',
      async (change) => {
        const id = await target(['purchaser']),
          token = await session(id),
          entityId = randomUUID()
        let reached!: () => void, release!: () => void
        const waiting = new Promise<void>((resolve) => {
          reached = resolve
        })
        const resume = new Promise<void>((resolve) => {
          release = resolve
        })
        const payload = {
          deviceId: randomUUID(),
          events: [
            {
              eventId: randomUUID(),
              entityType: 'material',
              entityId,
              operation: 'upsert',
              baseVersion: 0,
              payload: materialFixture(entityId),
            },
          ],
        }
        if (change === 'replay') {
          const initial = await app.inject({
            method: 'POST',
            url: '/api/sync/push',
            headers: headers(token),
            payload,
          })
          expect(initial.json().results[0].status).toBe('accepted')
        }
        beforePush = async () => {
          reached()
          await resume
        }
        const request = app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: headers(token),
          payload,
        })
        const pending = Promise.resolve(request)
        try {
          await waiting
          const before = (await get(id)).json()
          if (change === 'session' || change === 'expired')
            await owner.query(
              change === 'session'
                ? 'UPDATE account_sessions SET revoked_at=NOW() WHERE token_hash=$1'
                : "UPDATE account_sessions SET expires_at=NOW()-interval '1 second' WHERE token_hash=$1",
              [hashToken(token)],
            )
          else
            expect(
              (
                await patch(
                  id,
                  before.accountVersion,
                  change === 'roles' || change === 'replay'
                    ? { roles: ['viewer'] }
                    : change === 'disable'
                      ? { isEnabled: false }
                      : { displayName: '仍获授权' },
                )
              ).statusCode,
            ).toBe(200)
          release()
          const response = await pending
          expect(response.statusCode).toBe(200)
          expect(response.json().results[0].errorCode).toBe(
            change === 'unchanged' ? undefined : 'FORBIDDEN',
          )
          expect(
            (
              await owner.query(
                "SELECT 1 FROM sync_entities WHERE entity_type='material' AND entity_id=$1",
                [entityId],
              )
            ).rowCount,
          ).toBe(change === 'unchanged' || change === 'replay' ? 1 : 0)
        } finally {
          beforePush = undefined
          release()
          await pending
        }
      },
    )
    afterAll(async () => {
      await app?.close()
      await runtime?.end()
      await owner?.end()
      if (control) {
        try {
          let remaining = 1
          for (let n = 0; n < 200; n++) {
            remaining = (
              await control.query<{ count: number }>(
                'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1',
                [database],
              )
            ).rows[0]!.count
            if (!remaining) break
            await delay(25)
          }
          if (remaining)
            throw new Error('TEST_DATABASE_CONNECTIONS_NOT_DRAINED')
          await control.query(`DROP DATABASE IF EXISTS "${database}"`)
          await control.query(`DROP ROLE IF EXISTS "${role}"`)
        } finally {
          await control.end()
        }
      }
    })
    it('updates profile without renaming credentials, rejects stale versions and retains audit', async () => {
      const id = await target(),
        before = (await get(id)).json()
      expect(before.roles).toEqual(['engineer'])
      const saved = await patch(id, before.accountVersion, {
        displayName: '合成新姓名',
        uiLocale: 'fr-FR',
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json().displayName).toBe('合成新姓名')
      expect(saved.json().username).toBe(before.username)
      expect(saved.json().accountVersion).not.toBe(before.accountVersion)
      expect(
        (await patch(id, before.accountVersion, { displayName: 'stale' }))
          .statusCode,
      ).toBe(409)
      expect(
        (await patch(id, saved.json().accountVersion, { username: 'Renamed' }))
          .statusCode,
      ).toBe(400)
      const audit = await owner.query(
        "SELECT actor_id,reason FROM audit_entries WHERE entity_id=$1 AND action='account_updated'",
        [id],
      )
      expect(audit.rowCount).toBe(1)
      expect(audit.rows[0].actor_id).toBe(superId)
      expect(audit.rows[0].reason).toContain('合成新姓名')
    })
    it('changes ordinary roles and disables without deleting history, old sessions or outboxes authorizing writes', async () => {
      const id = await target(['engineer', 'viewer']),
        token = await session(id)
      const before = (await get(id)).json()
      const saved = await patch(id, before.accountVersion, {
        roles: ['engineer'],
        isEnabled: false,
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json().roles).toEqual(['engineer'])
      expect(saved.json().isEnabled).toBe(false)
      expect(
        (await owner.query('SELECT id FROM users WHERE id=$1', [id])).rowCount,
      ).toBe(1)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/sync/push',
            headers: headers(token),
            payload: { installationId: randomUUID(), events: [] },
          })
        ).statusCode,
      ).toBe(401)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/sync/pull',
            headers: headers(token),
          })
        ).statusCode,
      ).toBe(401)
      const enabled = await patch(id, saved.json().accountVersion, {
        isEnabled: true,
      })
      expect(enabled.statusCode).toBe(200)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/sync/pull',
            headers: headers(token),
          })
        ).statusCode,
      ).toBe(401)
    })
    it('unlocks through audited management and rejects privilege escalation, protected targets and cross-scope mutation', async () => {
      const id = await target()
      await owner.query(
        "UPDATE users SET failed_login_attempts=5,locked_until=NOW()+interval '15 minutes' WHERE id=$1",
        [id],
      )
      const before = (await get(id, adminToken)).json()
      expect(before.isLocked).toBe(true)
      const saved = await patch(
        id,
        before.accountVersion,
        { unlock: true },
        adminToken,
      )
      expect(saved.statusCode).toBe(200)
      expect(saved.json().isLocked).toBe(false)
      expect(
        (
          await owner.query(
            'SELECT failed_login_attempts,locked_until FROM users WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual({ failed_login_attempts: 0, locked_until: null })
      expect(
        (
          await patch(
            id,
            saved.json().accountVersion,
            { roles: ['purchaser'] },
            adminToken,
          )
        ).statusCode,
      ).toBe(403)
      expect((await get(superId)).statusCode).toBe(403)
      expect((await patch(superId, '0', { isEnabled: false })).statusCode).toBe(
        403,
      )
      const unassigned = randomUUID()
      await user(unassigned, ['engineer'])
      expect((await get(unassigned, adminToken)).statusCode).toBe(403)
      expect((await get(randomUUID())).statusCode).toBe(404)
    })
    it('retains identity, roles, status and sessions if the final audit insert fails', async () => {
      const id = await target(),
        token = await session(id),
        before = (await get(id)).json()
      const trigger = 'reject_lifecycle_' + randomUUID().replaceAll('-', '')
      await owner.query(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='account_updated' THEN RAISE EXCEPTION 'synthetic lifecycle audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
      )
      try {
        expect(
          (
            await patch(id, before.accountVersion, {
              roles: ['viewer'],
              isEnabled: false,
            })
          ).statusCode,
        ).toBe(500)
        const actual = (await get(id)).json()
        expect(actual.roles).toEqual(before.roles)
        expect(actual.isEnabled).toBe(before.isEnabled)
        expect(actual.accountVersion).toBe(before.accountVersion)
        expect(
          (
            await new AuthService(new PostgresAuthStore(runtime), {
              verify: argon2.verify,
            }).authenticate(token)
          ).id,
        ).toBe(id)
      } finally {
        await owner.query(
          `DROP TRIGGER ${trigger} ON audit_entries; DROP FUNCTION ${trigger}()`,
        )
      }
      expect(
        (
          await patch(id, before.accountVersion, {
            roles: ['viewer'],
            isEnabled: false,
          })
        ).statusCode,
      ).toBe(200)
    })
    it('serializes competing updates and rechecks a revoked manager scope under the same user locks', async () => {
      const id = await target(),
        before = (await get(id)).json()
      const results = await Promise.all([
        patch(id, before.accountVersion, { displayName: 'first' }),
        patch(id, before.accountVersion, { displayName: 'second' }),
      ])
      expect(results.map((result) => result.statusCode).sort()).toEqual([
        200, 409,
      ])
      const current = (await get(id, adminToken)).json()
      const revoke = () =>
        app.inject({
          method: 'DELETE',
          url: `/api/authorization/bindings/${adminId}`,
          headers: headers(superToken),
          payload: scope,
        })
      try {
        const raced = await Promise.all([
          patch(
            id,
            current.accountVersion,
            { displayName: 'manager' },
            adminToken,
          ),
          revoke(),
        ])
        expect([200, 403]).toContain(raced[0].statusCode)
        expect(raced[1].statusCode).toBe(204)
        const fresh = (await get(id)).json()
        expect(
          (
            await patch(
              id,
              fresh.accountVersion,
              { displayName: 'after revoke' },
              adminToken,
            )
          ).statusCode,
        ).toBe(403)
      } finally {
        expect(
          (
            await app.inject({
              method: 'PUT',
              url: `/api/authorization/bindings/${adminId}`,
              headers: headers(superToken),
              payload: scope,
            })
          ).statusCode,
        ).toBe(200)
      }
    })
  },
)
