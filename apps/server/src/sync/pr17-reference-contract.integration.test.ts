import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verify } from 'argon2'
import { Pool } from 'pg'
import { beforeAll, afterAll, expect, it, describe } from 'vitest'
import type { SyncEvent, SyncPullResponse } from '@honsen/shared'
import { createApp } from '../app.js'
import { AuthService, hashToken } from '../auth/service.js'
import { PostgresAuthStore } from '../db/postgres-auth-store.js'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'
import {
  materialFixture,
  supplierFixture,
  priceFixture,
} from './catalog-fixtures.js'

// Independent QA: real authenticated HTTP handler, PostgreSQL, and exported SQLite replay transcript.
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const sync = new SyncService(new PostgresSyncStore(pool))
const api = createApp(
  new AuthService(new PostgresAuthStore(pool), { verify }),
  undefined,
  sync,
)
const [
  writer,
  reader,
  a,
  b,
  pa,
  pb,
  department,
  team,
  material,
  sa,
  sb,
  qa,
  qb,
] = Array.from({ length: 13 }, (): string => randomUUID())
const installation = randomUUID()
const transcriptPath =
  process.env.PR17_QA_TRANSCRIPT ??
  join(tmpdir(), `pr17-reference-${randomUUID()}.json`)
const [c, pc, sc, qc] = Array.from({ length: 4 }, (): string => randomUUID())
let adminHeader: { authorization: string },
  readerHeader: { authorization: string }
let startCursor = '0'
const event = (
  entityType: SyncEvent['entityType'],
  entityId: string,
  payload: Record<string, unknown>,
  baseVersion = 0,
  operation: SyncEvent['operation'] = 'upsert',
): SyncEvent => ({
  eventId: randomUUID(),
  entityType,
  entityId,
  payload,
  baseVersion,
  operation,
})
async function token(id: string) {
  const value = randomBytes(32).toString('base64url')
  await new PostgresAuthStore(pool).createSession({
    id: randomUUID(),
    accountId: id,
    installationId: installation,
    tokenHash: hashToken(value),
    expiresAt: new Date(Date.now() + 3600000),
  })
  return { authorization: `Bearer ${value}` }
}
async function bind(user: string, project: string) {
  await pool.query(
    'INSERT INTO user_project_bindings(user_id,project_id) VALUES ($1,$2) ON CONFLICT(user_id,project_id) DO UPDATE SET deleted_at=NULL',
    [user, project],
  )
  await pool.query(
    'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES ($1,$2,$3,$4) ON CONFLICT(user_id,project_id,department_id,team_id) DO UPDATE SET deleted_at=NULL',
    [user, project, department, team],
  )
}
async function push(events: SyncEvent[], headers = adminHeader) {
  const response = await api.inject({
    method: 'POST',
    url: '/api/sync/push',
    headers,
    payload: { deviceId: installation, events },
  })
  expect(response.statusCode).toBe(200)
  return response.json<{
    results: Array<{ status: string; errorCode?: string }>
  }>().results
}
async function pull(query: Record<string, string>, headers = readerHeader) {
  const response = await api.inject({
    method: 'GET',
    url: '/api/sync/pull?' + new URLSearchParams({ limit: '500', ...query }),
    headers,
  })
  expect(response.statusCode).toBe(200)
  return response.json<SyncPullResponse>()
}
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PR17 reference contract',
  () => {
    beforeAll(async () => {
      if (!process.env.TEST_DATABASE_URL)
        throw new Error('isolated test database required')
      await runMigrations(pool)
      startCursor = (
        await pool.query(
          'SELECT COALESCE(MAX(sequence),0)::text AS cursor FROM server_change_log',
        )
      ).rows[0].cursor
      expect(
        (await pool.query('SHOW server_version')).rows[0].server_version,
      ).toMatch(/^16\./)
      for (const id of [writer, reader]) {
        await pool.query(
          "INSERT INTO users(id,business_code,username,password_hash,ui_locale,requires_password_change) VALUES($1,$1::uuid::text,$1::uuid::text,'unused-fixture','en-US',false)",
          [id],
        )
        await pool.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [
          id,
          id === writer ? 'administrator' : 'purchaser',
        ])
      }
      for (const id of [a, b, c])
        await pool.query(
          "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1,$1::uuid::text,'Independent QA','UTC')",
          [id],
        )
      for (const [id, country] of [
        [pa, a],
        [pb, b],
        [pc, c],
      ])
        await pool.query(
          "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1,$2,$1::uuid::text,'QA','QA','QA','USD','zh_en')",
          [id, country],
        )
      await pool.query(
        "INSERT INTO departments(id,business_code,name) VALUES($1,$1::uuid::text,'QA')",
        [department],
      )
      await pool.query(
        "INSERT INTO teams(id,department_id,business_code,name) VALUES($1,$2,$1::uuid::text,'QA')",
        [team, department],
      )
      await bind(writer, pa)
      await bind(writer, pb)
      await bind(writer, pc)
      await bind(reader, pb)
      adminHeader = await token(writer)
      readerHeader = await token(reader)
      const setup = [
        ...[a, c].map((id) =>
          event('country', id, {
            kind: 'country',
            id,
            businessCode: id,
            name: 'QA',
            timeZone: 'UTC',
            isActive: true,
          }),
        ),
        event('country', b, {
          kind: 'country',
          id: b,
          business_code: b,
          name: 'QA',
          time_zone: 'UTC',
          is_active: true,
          version: 999,
        }),
        ...[
          [pa, a],
          [pc, c],
        ].map(([id, countryId]) =>
          event('project', id!, {
            kind: 'project',
            id,
            countryId,
            businessCode: id,
            name: 'QA',
            site: 'QA',
            departmentName: 'QA',
            defaultCurrency: 'USD',
            defaultLanguagePair: 'zh_en',
            isActive: true,
          }),
        ),
        event('project', pb, {
          kind: 'project',
          id: pb,
          country_id: b,
          business_code: pb,
          name: 'QA',
          site: 'QA',
          department_name: 'QA',
          default_currency: 'USD',
          default_language_pair: 'zh_en',
          is_active: true,
          version: 0,
        }),
        event('material', material, materialFixture(material)),
        event('supplier', sa, supplierFixture(sa, a)),
        event('material_price', qa, priceFixture(qa, material, sa)),
        event('supplier', sb, supplierFixture(sb, b)),
        event('material_price', qb, priceFixture(qb, material, sb)),
        event('supplier', sc, supplierFixture(sc, c)),
        event('material_price', qc, priceFixture(qc, material, sc)),
      ]
      expect((await push(setup)).every((r) => r.status === 'accepted')).toBe(
        true,
      )
    }, 30000)
    afterAll(async () => {
      await api.close()
      try {
        // Keep this 500-row fixture from changing unrelated suites' first-page expectations.
        const owners = [writer, reader]
        await pool.query(
          'DELETE FROM catalog_sync_quarantine WHERE entity_id IN (SELECT entity_id FROM sync_entities WHERE updated_by=ANY($1::uuid[])) OR change_sequence IN (SELECT sequence FROM server_change_log WHERE actor_id=ANY($1::uuid[]))',
          [owners],
        )
        await pool.query(
          'DELETE FROM server_change_log WHERE actor_id=ANY($1::uuid[])',
          [owners],
        )
        await pool.query(
          'DELETE FROM sync_entities WHERE updated_by=ANY($1::uuid[])',
          [owners],
        )
        await pool.query(
          'DELETE FROM audit_entries WHERE actor_id=ANY($1::uuid[])',
          [owners],
        )
        await pool.query(
          'DELETE FROM sync_events WHERE origin_account_id=ANY($1::uuid[])',
          [owners],
        )
      } finally {
        await pool.end()
        if (!process.env.PR17_QA_TRANSCRIPT)
          rmSync(transcriptPath, { force: true })
      }
    })

    it('contract: B cursor passes A history; grant/revoke/regrant and bounded replay keep the arrival window', async () => {
      // Cross the actual desktop page boundary with normal, versioned Push events.
      for (let base = 1; base <= 505; base += 100) {
        const batch = Array.from(
          { length: Math.min(100, 506 - base) },
          (_, i) =>
            event(
              'material',
              material,
              { ...materialFixture(material), version: base + i + 1 },
              base + i,
            ),
        )
        expect((await push(batch)).every((r) => r.status === 'accepted')).toBe(
          true,
        )
      }
      const before = await pull({ cursor: startCursor })
      expect(before.changes.some((c) => [sa, qa].includes(c.entityId))).toBe(
        false,
      )
      expect(before.changes.some((c) => c.entityId === qb)).toBe(true)
      const hiddenSequence = (
        await pool.query(
          'SELECT sequence::text FROM server_change_log WHERE entity_id=$1',
          [qa],
        )
      ).rows[0].sequence
      expect(BigInt(before.nextCursor) > BigInt(hiddenSequence)).toBe(true)
      await bind(reader, pa)
      const expanded = await pull({ cursor: before.nextCursor })
      expect(expanded.authorizationVersion).not.toBe(
        before.authorizationVersion,
      )
      const replay: SyncPullResponse[] = []
      let cursor = '0'
      // Match the production desktop's fixed page size.
      const first = await pull({
        cursor,
        limit: '500',
        authorizationVersion: expanded.authorizationVersion!,
        replayUntil: expanded.replayUntil!,
      })
      replay.push(first)
      cursor = first.nextCursor
      const late = randomUUID()
      expect(
        (
          await push([
            event('material_price', late, {
              ...priceFixture(late, material, sa),
              unitPriceMinor: '27',
            }),
          ])
        )[0].status,
      ).toBe('accepted')
      for (let i = 0; i < 20; i++) {
        const page = await pull({
          cursor,
          limit: '500',
          authorizationVersion: expanded.authorizationVersion!,
          replayUntil: expanded.replayUntil!,
        })
        replay.push(page)
        if (page.changes.length < 500) break
        cursor = page.nextCursor
      }
      const recovered = replay.flatMap((p) => p.changes)
      expect(
        recovered.some((change) => [sc, qc].includes(change.entityId)),
      ).toBe(false)
      expect(recovered.some((c) => c.entityId === sa)).toBe(true)
      expect(recovered.some((c) => c.entityId === qa)).toBe(true)
      expect(recovered.some((c) => c.entityId === late)).toBe(false)
      const incremental = await pull({ cursor: before.nextCursor })
      expect(incremental.changes.some((c) => c.entityId === late)).toBe(true)
      expect(
        incremental.changes.some((change) =>
          [sc, qc].includes(change.entityId),
        ),
      ).toBe(false)
      await pool.query(
        'UPDATE user_project_scope_bindings SET deleted_at=NOW() WHERE user_id=$1 AND project_id=$2',
        [reader, pa],
      )
      const revoked = await pull({
        cursor: '0',
        authorizationVersion: expanded.authorizationVersion!,
        replayUntil: expanded.replayUntil!,
      })
      expect(revoked.changes).toEqual([])
      expect(revoked.authorizationVersion).not.toBe(
        expanded.authorizationVersion,
      )
      const denied = await pull({ cursor: '0' })
      expect(
        denied.changes.some((c) => [sa, qa, late, sc, qc].includes(c.entityId)),
      ).toBe(false)
      await bind(reader, pa)
      const restored = await pull({ cursor: incremental.nextCursor })
      expect(restored.authorizationVersion).not.toBe(
        expanded.authorizationVersion,
      )
      const restoredReplay: SyncPullResponse[] = []
      let restoredCursor = '0'
      for (let i = 0; i < 20; i++) {
        const page = await pull({
          cursor: restoredCursor,
          limit: '500',
          authorizationVersion: restored.authorizationVersion!,
          replayUntil: restored.replayUntil!,
        })
        restoredReplay.push(page)
        if (page.changes.length < 500) break
        restoredCursor = page.nextCursor
      }
      expect(
        restoredReplay
          .flatMap((p) => p.changes)
          .some((change) => change.entityId === late),
      ).toBe(true)
      expect(
        restoredReplay
          .flatMap((p) => p.changes)
          .some((change) => [sc, qc].includes(change.entityId)),
      ).toBe(false)
      writeFileSync(
        transcriptPath,
        JSON.stringify(
          {
            reader,
            material,
            sa,
            sb,
            qa,
            qb,
            late,
            before,
            expanded,
            replay,
            incremental,
            revoked,
            restored,
            restoredReplay,
          },
          null,
          2,
        ),
      )
    }, 120000)

    it('contract: malformed create/update/identity/reference rejection is atomic; legacy tombstones remain legal', async () => {
      const validUpdate = await pool.query(
        'SELECT payload_json,version FROM sync_entities WHERE entity_id=$1',
        [qa],
      )
      const count = await pool.query(
        'SELECT count(*)::int AS n FROM server_change_log',
      )
      const bad = [
        event('supplier', randomUUID(), { countryId: b }),
        event('material_price', randomUUID(), {
          supplierId: sb,
          materialId: material,
        }),
        event(
          'material_price',
          qa,
          { ...priceFixture(qa, material, sa), currency: undefined },
          1,
        ),
        event('supplier', randomUUID(), supplierFixture(randomUUID(), b)),
        event(
          'material_price',
          randomUUID(),
          priceFixture(randomUUID(), randomUUID(), sb),
        ),
      ]
      // Use consistent payload IDs for reference failures, so identity validation cannot hide that boundary.
      bad[4]!.payload.id = bad[4]!.entityId
      const crossId = randomUUID()
      bad.push(
        event('material_price', crossId, priceFixture(crossId, material, sa)),
      )
      await pool.query(
        'UPDATE user_project_scope_bindings SET deleted_at=NOW() WHERE user_id=$1 AND project_id=$2',
        [reader, pa],
      )
      const results = await push(bad, readerHeader)
      expect(results.every((r) => r.status === 'validation_error')).toBe(true)
      expect(results.at(-1)?.errorCode).toBe('FORBIDDEN')
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM server_change_log'))
          .rows,
      ).toEqual(count.rows)
      expect(
        (
          await pool.query(
            'SELECT payload_json,version FROM sync_entities WHERE entity_id=$1',
            [qa],
          )
        ).rows,
      ).toEqual(validUpdate.rows)
      expect(
        (
          await pool.query(
            'SELECT 1 FROM sync_entities WHERE entity_id=ANY($1::uuid[])',
            [bad.filter((e) => e.entityId !== qa).map((e) => e.entityId)],
          )
        ).rowCount,
      ).toBe(0)
      const legacyId = randomUUID(),
        legacyPrice = randomUUID()
      const legacy = (v: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(v)
            .filter(([, value]) => value !== null)
            .map(([key, value]) => [
              key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
              value,
            ]),
        )
      expect(
        (
          await push(
            [
              event('supplier', legacyId, legacy(supplierFixture(legacyId, b))),
              event(
                'material_price',
                legacyPrice,
                legacy(priceFixture(legacyPrice, material, legacyId)),
              ),
            ],
            readerHeader,
          )
        ).every((r) => r.status === 'accepted'),
      ).toBe(true)
      expect(
        (
          await push(
            [
              event('material_price', legacyPrice, {}, 1, 'soft_delete'),
              event('supplier', legacyId, {}, 1, 'soft_delete'),
            ],
            readerHeader,
          )
        ).every((r) => r.status === 'accepted'),
      ).toBe(true)
    })

    it('contract: restricted API database role quarantines bad history and only audited scoped administrators recover it', async () => {
      const role = 'pr17_qa_' + randomUUID().replaceAll('-', '')
      await pool.query(`CREATE ROLE "${role}" NOLOGIN`)
      const restricted = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        options: `-c role=${role}`,
      })
      try {
        await pool.query(`GRANT USAGE ON SCHEMA public TO "${role}"`)
        await pool.query(
          `GRANT SELECT ON users,user_roles,countries,projects,departments,teams,user_project_bindings,user_project_scope_bindings,category_code_quarantine,category_code_repairs TO "${role}"`,
        )
        // PostgreSQL SELECT ... FOR SHARE needs UPDATE on its locked relations.
        await pool.query(
          `GRANT UPDATE ON projects,departments,teams,user_project_bindings,user_project_scope_bindings TO "${role}"`,
        )
        await pool.query(
          `GRANT SELECT,INSERT,UPDATE ON sync_entities,sync_events,audit_entries,server_change_log TO "${role}"`,
        )
        await pool.query(
          `GRANT USAGE ON SEQUENCE server_change_log_sequence_seq TO "${role}"`,
        )
        const policy = JSON.parse(
          readFileSync(
            new URL(
              '../../../../deploy/linux/api-grant-policy.json',
              import.meta.url,
            ),
            'utf8',
          ),
        )['010_catalog_sync_quarantine.sql'][0]
        expect(policy).toEqual({
          kind: 'table',
          name: 'catalog_sync_quarantine',
          privileges: ['SELECT', 'INSERT', 'UPDATE'],
        })
        await pool.query(
          `GRANT ${policy.privileges.join(',')} ON catalog_sync_quarantine TO "${role}"`,
        )
        expect(
          (await restricted.query('SELECT current_user')).rows[0].current_user,
        ).toBe(role)
        const broken = randomUUID(),
          raw = {
            id: broken,
            countryId: b,
            name: 'Original incomplete evidence',
          }
        await pool.query(
          "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('supplier',$1,1,$2,$3)",
          [broken, raw, writer],
        )
        await pool.query(
          "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id) VALUES('supplier',$1,'upsert',1,$2,$3)",
          [broken, raw, writer],
        )
        const healthy = randomUUID()
        expect(
          (
            await push([
              event('supplier', healthy, supplierFixture(healthy, b)),
            ])
          )[0].status,
        ).toBe('accepted')
        const limited = new SyncService(new PostgresSyncStore(restricted))
        const actor = {
          id: writer,
          roles: ['administrator'] as const,
          installationId: installation,
        }
        const transcript = JSON.parse(readFileSync(transcriptPath, 'utf8'))
        const page = await limited.pull(actor, {
          cursor: transcript.incremental.nextCursor,
          limit: 500,
        })
        expect(
          page.changes.find((c) => c.entityId === broken)?.payload
            .__catalogQuarantine,
        ).toBe('INVALID_CATALOG_PAYLOAD')
        expect(page.changes.some((c) => c.entityId === healthy)).toBe(true)
        const badPage = await limited.pull(
          { ...actor, id: reader, roles: ['purchaser'] },
          { cursor: transcript.incremental.nextCursor, limit: 500 },
        )
        const request = {
          requestId: randomUUID(),
          entityType: 'supplier',
          entityId: broken,
          expectedVersion: 1,
          payload: supplierFixture(broken, b),
          reason: 'Independent QA verified original source facts',
        }
        await expect(
          limited.repairCatalog(
            { ...actor, id: reader, roles: ['purchaser'] },
            request,
          ),
        ).rejects.toThrow('FORBIDDEN')
        expect(
          (await limited.repairCatalog({ ...actor, id: reader }, request))
            .status,
        ).toBe('validation_error')
        expect(
          (
            await limited.repairCatalog(actor, {
              ...request,
              payload: { id: broken, countryId: b },
            })
          ).status,
        ).toBe('validation_error')
        const repaired = await limited.repairCatalog(actor, request)
        expect(repaired.status).toBe('accepted')
        expect(await limited.repairCatalog(actor, request)).toEqual(repaired)
        const originals = await restricted.query(
          'SELECT original_payload,resolved_event_id FROM catalog_sync_quarantine WHERE entity_id=$1',
          [broken],
        )
        expect(originals.rows.length).toBeGreaterThan(0)
        for (const row of originals.rows)
          expect(row.original_payload).toEqual(raw)
        expect(
          originals.rows.every(
            (row) => row.resolved_event_id === request.requestId,
          ),
        ).toBe(true)
        expect(
          (
            await restricted.query(
              "SELECT count(*)::int AS n FROM audit_entries WHERE entity_id=$1 AND action='catalog_history_recovered'",
              [broken],
            )
          ).rows[0].n,
        ).toBe(1)
        const repairedPage = await limited.pull(
          { ...actor, id: reader, roles: ['purchaser'] },
          { cursor: page.nextCursor, limit: 500 },
        )
        expect(
          repairedPage.changes.some(
            (c) => c.entityId === broken && c.version === 2,
          ),
        ).toBe(true)
        writeFileSync(
          transcriptPath,
          JSON.stringify(
            { ...transcript, badPage, repairedPage, broken },
            null,
            2,
          ),
        )
        await expect(
          restricted.query('DELETE FROM catalog_sync_quarantine'),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
          restricted.query('CREATE TABLE public.pr17_forbidden(id int)'),
        ).rejects.toMatchObject({ code: '42501' })
      } finally {
        await restricted.end()
        await pool.query(`DROP OWNED BY "${role}"`)
        await pool.query(`DROP ROLE "${role}"`)
      }
    })
  },
)
