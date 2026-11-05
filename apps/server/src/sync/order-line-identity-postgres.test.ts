import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SyncEvent } from '@honsen/shared'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'

const url = process.env.TEST_DATABASE_URL
const pool = url ? new Pool({ connectionString: url }) : null

describe.skipIf(!pool)(
  'PostgreSQL globally owned purchase-order line UUIDs',
  () => {
    const actor = randomUUID(),
      installationId = randomUUID(),
      country = randomUUID(),
      project = randomUUID(),
      department = randomUUID(),
      team = randomUUID()
    const store = new PostgresSyncStore(pool!)
    beforeAll(async () => {
      await runMigrations(pool!)
      await pool!.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale,is_enabled,requires_password_change) VALUES($1::uuid,$1::text,$1::text,'fixture','zh-CN',true,false)",
        [actor],
      )
      await pool!.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1::uuid,'purchaser')",
        [actor],
      )
      await pool!.query(
        "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1::uuid,$1::text,'Synthetic','UTC')",
        [country],
      )
      await pool!.query(
        "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1::uuid,$2,$1::text,'Synthetic','Synthetic','Synthetic','XOF','zh_fr')",
        [project, country],
      )
      await pool!.query(
        "INSERT INTO departments(id,business_code,name) VALUES($1::uuid,$1::text,'Synthetic')",
        [department],
      )
      await pool!.query(
        "INSERT INTO teams(id,department_id,business_code,name) VALUES($1::uuid,$2,$1::text,'Synthetic')",
        [team, department],
      )
      await pool!.query(
        'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1::uuid,$2)',
        [actor, project],
      )
      await pool!.query(
        'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1::uuid,$2,$3,$4)',
        [actor, project, department, team],
      )
    })
    afterAll(async () => {
      await pool!.end()
    })
    function event(id: string, line: string): SyncEvent {
      return {
        eventId: randomUUID(),
        entityId: id,
        entityType: 'purchase_order',
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          parentOrderId: null,
          procurementMode: 'honsen_self_purchase',
          countryId: country,
          projectId: project,
          departmentId: department,
          teamId: team,
          applicantId: actor,
          workflowStatus: 'draft',
          primaryCurrency: 'XOF',
          currency: 'XOF',
          notes: `private-${id}`,
          lines: [
            {
              id: line,
              currency: 'XOF',
              quantity: '1',
              unit: 'pcs',
              unitPriceMinor: '100',
              lineTotalMinor: '100',
              priceSource: 'manual',
            },
          ],
        },
      }
    }
    const push = (e: SyncEvent) =>
      store.pushEvent({ event: e, actorId: actor, installationId })
    it('serializes concurrent orders, retains the losing payload and never discloses its occupying order', async () => {
      const line = randomUUID(),
        inputs = [
          event(randomUUID(), line),
          event(randomUUID(), line.toUpperCase()),
        ]
      const results = await Promise.all(inputs.map(push))
      expect(results.map((r) => r.status).sort()).toEqual([
        'accepted',
        'conflict',
      ])
      const winning = results.findIndex((r) => r.status === 'accepted'),
        losing = 1 - winning
      expect(results[losing]).toMatchObject({
        serverVersion: 0,
        serverPayload: {},
        serverOperation: 'upsert',
      })
      expect(JSON.stringify(results[losing])).not.toContain(
        String(inputs[winning]!.payload.notes),
      )
      expect(JSON.stringify(results[losing])).not.toContain(
        inputs[winning]!.entityId,
      )
      expect(await push(inputs[losing]!)).toEqual(results[losing])
      expect(await push(inputs[winning]!)).toEqual(results[winning])
      const rows = await pool!.query(
        "SELECT entity_id FROM sync_entities WHERE entity_type='purchase_order' AND entity_id=ANY($1::uuid[])",
        [inputs.map((e) => e.entityId)],
      )
      expect(rows.rows.map((r) => r.entity_id)).toEqual([
        inputs[winning]!.entityId,
      ])
      const conflict = (
        await pool!.query(
          'SELECT local_payload_json,server_payload_json FROM sync_conflicts WHERE event_id=$1',
          [inputs[losing]!.eventId],
        )
      ).rows[0]
      expect(conflict.local_payload_json).toEqual(inputs[losing]!.payload)
      expect(conflict.server_payload_json).toEqual({})
      const updated = {
        ...inputs[winning]!,
        eventId: randomUUID(),
        baseVersion: 1,
        payload: {
          ...inputs[winning]!.payload,
          notes: 'authorized own-order edit',
        },
      }
      expect(await push(updated)).toMatchObject({
        status: 'accepted',
        serverVersion: 2,
      })
      expect(await push(event(randomUUID(), randomUUID()))).toMatchObject({
        status: 'accepted',
      })
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int AS n FROM server_change_log WHERE entity_type='purchase_order' AND entity_id=$1",
            [inputs[winning]!.entityId],
          )
        ).rows[0].n,
      ).toBe(2)
    })
    it('keeps soft-deleted order line identities reserved without rewriting its historical payload', async () => {
      const first = event(randomUUID(), randomUUID())
      expect((await push(first)).status).toBe('accepted')
      const tombstone = {
        ...first,
        eventId: randomUUID(),
        operation: 'soft_delete' as const,
        baseVersion: 1,
      }
      expect((await push(tombstone)).status).toBe('accepted')
      const clone = event(
        randomUUID(),
        String((first.payload.lines as { id: string }[])[0]!.id),
      )
      expect((await push(clone)).status).toBe('conflict')
      const row = (
        await pool!.query(
          "SELECT payload_json,is_deleted,version FROM sync_entities WHERE entity_type='purchase_order' AND entity_id=$1",
          [first.entityId],
        )
      ).rows[0]
      expect(row.payload_json).toEqual(first.payload)
      expect(row.is_deleted).toBe(true)
      expect(Number(row.version)).toBe(2)
    })
    it('retains duplicate or malformed declared line identities instead of publishing an unprojectable order', async () => {
      for (const invalid of ['duplicate', 'not-a-uuid']) {
        const first = event(randomUUID(), randomUUID())
        const lines = first.payload.lines as { id: string }[]
        if (invalid === 'duplicate')
          lines.push({ ...lines[0]!, id: lines[0]!.id.toUpperCase() })
        else lines[0]!.id = invalid
        const result = await push(first)
        expect(result).toMatchObject({
          status: 'conflict',
          serverVersion: 0,
          serverPayload: {},
        })
        expect(await push(first)).toEqual(result)
        expect(
          (
            await pool!.query(
              "SELECT 1 FROM server_change_log WHERE entity_type='purchase_order' AND entity_id=$1",
              [first.entityId],
            )
          ).rowCount,
        ).toBe(0)
      }
    })
  },
)
