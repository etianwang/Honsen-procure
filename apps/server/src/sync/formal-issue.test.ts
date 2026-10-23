import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null
const actorId = randomUUID()
const applicantId = randomUUID()

function shortCode(id: string): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let bits = BigInt(`0x${id.replaceAll('-', '')}`)
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code = alphabet[Number(bits & 31n)] + code
    bits >>= 5n
  }
  return code
}

describe.skipIf(!pool)('formal issue Push/Pull', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
    await pool!.query(
      `INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled)
       VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE),
              ($4, $5, $6, 'fixture', 'zh-CN', TRUE)`,
      [
        actorId,
        `FORMAL-${actorId}`,
        `formal-${actorId}`,
        applicantId,
        `FORMAL-${applicantId}`,
        `formal-${applicantId}`,
      ],
    )
  }, 60_000)

  afterAll(async () => {
    await pool!.end()
  })

  it('keeps legacy unissued order tombstones compatible', async () => {
    const store = new PostgresSyncStore(pool!)
    const countryId = randomUUID(),
      projectId = randomUUID(),
      departmentId = randomUUID(),
      teamId = randomUUID()
    await pool!.query(
      "INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'fixture', 'UTC')",
      [countryId, `FORMAL-${countryId}`],
    )
    await pool!.query(
      "INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair) VALUES ($1, $2, $3, 'fixture', 'site', 'department', 'XOF', 'zh_fr')",
      [projectId, countryId, `FORMAL-${projectId}`],
    )
    await pool!.query(
      "INSERT INTO departments (id, business_code, name) VALUES ($1, $2, 'fixture')",
      [departmentId, `FORMAL-${departmentId}`],
    )
    await pool!.query(
      "INSERT INTO teams (id, department_id, business_code, name) VALUES ($1, $2, $3, 'fixture')",
      [teamId, departmentId, `FORMAL-${teamId}`],
    )
    await pool!.query(
      'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
      [actorId, projectId],
    )
    await pool!.query(
      'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
      [actorId, projectId, departmentId, teamId],
    )
    expect(
      await store.pushEvent({
        event: {
          eventId: randomUUID(),
          entityType: 'purchase_order',
          entityId: randomUUID(),
          operation: 'soft_delete',
          baseVersion: 0,
          payload: { projectId },
        },
        installationId: randomUUID(),
        actorId,
      }),
    ).toMatchObject({ status: 'accepted' })
  })

  it('rejects a duplicate formal number without replacing the first issued order', async () => {
    const countryId = randomUUID()
    const projectId = randomUUID()
    const countryCode = `SN${countryId.slice(0, 8)}`
    const projectCode = `P${projectId.slice(0, 8)}`
    await pool!.query(
      `INSERT INTO countries (id, business_code, name, time_zone)
       VALUES ($1, $2, 'fixture country', 'UTC')`,
      [countryId, countryCode],
    )
    await pool!.query(
      `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair)
       VALUES ($1, $2, $3, 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr')`,
      [projectId, countryId, projectCode],
    )
    const departmentId = randomUUID(),
      teamId = randomUUID()
    await pool!.query(
      "INSERT INTO departments (id, business_code, name) VALUES ($1, $2, 'fixture')",
      [departmentId, `FORMAL-${departmentId}`],
    )
    await pool!.query(
      "INSERT INTO teams (id, department_id, business_code, name) VALUES ($1, $2, $3, 'fixture')",
      [teamId, departmentId, `FORMAL-${teamId}`],
    )
    for (const userId of [actorId, applicantId]) {
      await pool!.query(
        'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
        [userId, projectId],
      )
      await pool!.query(
        'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
        [userId, projectId, departmentId, teamId],
      )
    }
    const installationId = randomUUID()
    const formalDocumentNo = `${countryCode}-${projectCode}-20261015-OPA-${shortCode(installationId)}-1`
    const line = {
      id: randomUUID(),
      currency: 'XOF',
      quantity: '1',
      ownerQuoteSource: 'manual_reference',
      ownerCatalogPriceId: null,
      ownerManualReferenceReason: 'fixture quote',
      ownerManualReferenceActorId: actorId,
      ownerManualReferenceAt: 1792022400,
      ownerSourceUnitPriceMinor: '100',
      ownerLockedExchangeRateDecimal: '1',
      ownerConvertedReferenceUnitMinor: '100',
      ownerMarkupJson: '{"kind":"fixed_minor","minor":"20"}',
      ownerFinalUnitPriceMinor: '120',
    }
    const snapshot = {
      countryId,
      projectId,
      applicantId,
      procurementMode: 'owner_self_purchase',
      workflowStatus: 'approved',
      confirmedBy: actorId,
      confirmedAt: 1792022400,
      selfApproved: false,
      primaryCurrency: 'XOF',
      orderDate: '2026-10-15',
      lines: [line],
    }
    const payload = {
      ...snapshot,
      workflowStatus: 'formally_issued',
      documentType: 'OPA',
      formalDocumentNo,
      formalInstallationId: installationId,
      formalSequence: '1',
      formallyIssuedAt: 1792022400,
      formalSnapshotJson: JSON.stringify(snapshot),
    }
    const store = new PostgresSyncStore(pool!)
    async function seedApproved(
      orderId: string,
      approvedPayload: Record<string, unknown> = snapshot,
    ) {
      expect(
        await store.pushEvent({
          event: {
            eventId: randomUUID(),
            entityType: 'purchase_order',
            entityId: orderId,
            operation: 'upsert',
            baseVersion: 0,
            payload: {
              ...approvedPayload,
              workflowStatus: 'pending_confirmation',
              confirmedBy: null,
              confirmedAt: null,
            },
          },
          installationId,
          actorId: applicantId,
        }),
      ).toMatchObject({ status: 'accepted', serverVersion: 1 })
      expect(
        await store.pushEvent({
          event: {
            eventId: randomUUID(),
            entityType: 'purchase_order',
            entityId: orderId,
            operation: 'upsert',
            baseVersion: 1,
            payload: approvedPayload,
          },
          installationId,
          actorId,
        }),
      ).toMatchObject({ status: 'accepted', serverVersion: 2 })
    }
    const cursor = (
      await pool!.query<{ sequence: string }>(
        'SELECT COALESCE(MAX(sequence), 0)::text AS sequence FROM server_change_log',
      )
    ).rows[0]!.sequence
    const firstId = randomUUID()
    const first = {
      event: {
        eventId: randomUUID(),
        entityType: 'purchase_order' as const,
        entityId: firstId,
        operation: 'upsert' as const,
        baseVersion: 2,
        payload,
      },
      installationId,
      actorId,
    }
    await seedApproved(firstId)
    expect(await store.pushEvent(first)).toMatchObject({ status: 'accepted' })
    const duplicate = {
      ...first,
      event: { ...first.event, eventId: randomUUID(), entityId: randomUUID() },
    }
    await seedApproved(duplicate.event.entityId)
    expect(await store.pushEvent(duplicate)).toMatchObject({
      status: 'conflict',
    })
    const firstStored = await pool!.query<{ payload_json: typeof payload }>(
      `SELECT payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [firstId],
    )
    expect(firstStored.rows[0]?.payload_json.formalDocumentNo).toBe(
      formalDocumentNo,
    )
    const duplicateStored = await pool!.query(
      `SELECT 1 FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [duplicate.event.entityId],
    )
    expect(duplicateStored.rowCount).toBe(1)
    expect(await store.pushEvent(first)).toMatchObject({
      status: 'accepted',
      serverVersion: 3,
    })
    const receiving = {
      ...first,
      event: {
        ...first.event,
        eventId: randomUUID(),
        baseVersion: 3,
        payload: { ...payload, workflowStatus: 'receiving' },
      },
    }
    expect(await store.pushEvent(receiving)).toMatchObject({
      status: 'accepted',
      serverVersion: 4,
    })
    const changedSnapshot = {
      ...receiving,
      event: {
        ...receiving.event,
        eventId: randomUUID(),
        baseVersion: 4,
        payload: {
          ...receiving.event.payload,
          formalSnapshotJson: JSON.stringify({
            ...snapshot,
            notes: 'rewritten',
          }),
        },
      },
    }
    expect(await store.pushEvent(changedSnapshot)).toMatchObject({
      status: 'conflict',
      serverVersion: 4,
    })
    const retained = await pool!.query<{ payload_json: typeof payload }>(
      `SELECT payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [firstId],
    )
    expect(retained.rows[0]?.payload_json.formalSnapshotJson).toBe(
      payload.formalSnapshotJson,
    )

    const badLine = { ...line, ownerFinalUnitPriceMinor: '121' }
    const badSnapshot = { ...snapshot, lines: [badLine] }
    const badPayload = {
      ...payload,
      formalDocumentNo: `${countryCode}-${projectCode}-20261015-OPA-${shortCode(installationId)}-2`,
      formalSequence: '2',
      lines: [badLine],
      formalSnapshotJson: JSON.stringify(badSnapshot),
    }
    const badId = randomUUID()
    await seedApproved(badId, badSnapshot)
    expect(
      await store.pushEvent({
        ...first,
        event: {
          ...first.event,
          eventId: randomUUID(),
          entityId: badId,
          payload: badPayload,
        },
      }),
    ).toMatchObject({ status: 'validation_error' })
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM formal_issue_registry WHERE order_id = $1',
          [badId],
        )
      ).rowCount,
    ).toBe(0)
    const zeroRateLine = {
      ...line,
      ownerLockedExchangeRateDecimal: '0',
      ownerConvertedReferenceUnitMinor: '0',
      ownerFinalUnitPriceMinor: '20',
    }
    const zeroRateId = randomUUID()
    await seedApproved(zeroRateId, { ...snapshot, lines: [zeroRateLine] })
    expect(
      await store.pushEvent({
        ...first,
        event: {
          ...first.event,
          eventId: randomUUID(),
          entityId: zeroRateId,
          payload: {
            ...badPayload,
            lines: [zeroRateLine],
            formalSnapshotJson: JSON.stringify({
              ...snapshot,
              lines: [zeroRateLine],
            }),
          },
        },
      }),
    ).toMatchObject({ status: 'validation_error' })

    const secondProjectId = randomUUID()
    const secondProjectCode = `P${secondProjectId.slice(0, 8)}`
    await pool!.query(
      `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair)
       VALUES ($1, $2, $3, 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr')`,
      [secondProjectId, countryId, secondProjectCode],
    )
    for (const userId of [actorId, applicantId]) {
      await pool!.query(
        'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
        [userId, secondProjectId],
      )
      await pool!.query(
        'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
        [userId, secondProjectId, departmentId, teamId],
      )
    }
    const reusedSequenceId = randomUUID()
    await seedApproved(reusedSequenceId, {
      ...snapshot,
      projectId: secondProjectId,
    })
    expect(
      await store.pushEvent({
        ...first,
        event: {
          ...first.event,
          eventId: randomUUID(),
          entityId: reusedSequenceId,
          payload: {
            ...payload,
            projectId: secondProjectId,
            formalDocumentNo: `${countryCode}-${secondProjectCode}-20261015-OPA-${shortCode(installationId)}-1`,
            formalSnapshotJson: JSON.stringify({
              ...snapshot,
              projectId: secondProjectId,
            }),
          },
        },
      }),
    ).toMatchObject({ status: 'conflict' })
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM formal_issue_registry WHERE order_id = $1',
          [reusedSequenceId],
        )
      ).rowCount,
    ).toBe(0)

    const pulled = await store.pullChanges({
      actor: { id: actorId, roles: ['engineer'], installationId: randomUUID() },
      cursor,
      limit: 20,
    })
    expect(
      pulled.changes
        .filter((change) => change.entityId === firstId)
        .map((change) => [change.version, change.payload.workflowStatus]),
    ).toEqual([
      [1, 'pending_confirmation'],
      [2, 'approved'],
      [3, 'formally_issued'],
      [4, 'receiving'],
    ])

    const retryId = randomUUID()
    const retryLine = { ...line, id: randomUUID() }
    const retryPayload = {
      ...payload,
      formalDocumentNo: `${countryCode}-${projectCode}-20261015-OPA-${shortCode(installationId)}-2`,
      formalSequence: '2',
      lines: [retryLine],
      formalSnapshotJson: JSON.stringify({ ...snapshot, lines: [retryLine] }),
    }
    const retryEvent = {
      ...first,
      event: {
        ...first.event,
        eventId: randomUUID(),
        entityId: retryId,
        payload: retryPayload,
      },
    }
    await seedApproved(retryId, { ...snapshot, lines: [retryLine] })
    expect(
      (
        await new SyncService(store).push(
          { id: actorId, roles: ['viewer'], installationId: randomUUID() },
          { deviceId: installationId, events: [retryEvent.event] },
        )
      ).results[0],
    ).toMatchObject({ status: 'validation_error' })
    const failingPool = {
      async connect() {
        const client = await pool!.connect()
        return {
          async query(sql: string, values?: unknown[]) {
            if (sql.includes('INSERT INTO server_change_log'))
              throw new Error('injected formal publication failure')
            return client.query(sql, values)
          },
          release() {
            client.release()
          },
        }
      },
    } as unknown as Pool
    await expect(
      new PostgresSyncStore(failingPool).pushEvent(retryEvent),
    ).rejects.toThrow('injected formal publication failure')
    const failed = await pool!.query(
      `SELECT
         (SELECT COUNT(*) FROM formal_issue_registry WHERE order_id = $1) AS registry,
         (SELECT COUNT(*) FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1) AS entity,
         (SELECT COUNT(*) FROM sync_events WHERE event_id = $2) AS event`,
      [retryId, retryEvent.event.eventId],
    )
    expect(failed.rows[0]).toEqual({ registry: '0', entity: '1', event: '0' })
    expect(
      (
        await new SyncService(store).push(
          { id: actorId, roles: ['purchaser'], installationId: randomUUID() },
          { deviceId: installationId, events: [retryEvent.event] },
        )
      ).results[0],
    ).toMatchObject({ status: 'accepted', serverVersion: 3 })

    const convertedLine = {
      ...line,
      id: randomUUID(),
      ownerSourceUnitPriceMinor: '125',
      ownerLockedExchangeRateDecimal: '0.008',
      ownerConvertedReferenceUnitMinor: '100',
      ownerFinalUnitPriceMinor: '120',
    }
    const convertedSnapshot = {
      ...snapshot,
      primaryCurrency: 'USD',
      lines: [convertedLine],
    }
    const crossZeroLine = {
      ...convertedLine,
      ownerLockedExchangeRateDecimal: '0',
      ownerConvertedReferenceUnitMinor: '0',
      ownerFinalUnitPriceMinor: '20',
    }
    const crossZeroId = randomUUID()
    await seedApproved(crossZeroId, {
      ...convertedSnapshot,
      lines: [crossZeroLine],
    })
    expect(
      await store.pushEvent({
        ...first,
        event: {
          ...first.event,
          eventId: randomUUID(),
          entityId: crossZeroId,
          payload: {
            ...payload,
            primaryCurrency: 'USD',
            formalSequence: '3',
            formalDocumentNo: `${countryCode}-${projectCode}-20261015-OPA-${shortCode(installationId)}-3`,
            lines: [crossZeroLine],
            formalSnapshotJson: JSON.stringify({
              ...convertedSnapshot,
              lines: [crossZeroLine],
            }),
          },
        },
      }),
    ).toMatchObject({ status: 'validation_error' })
    const convertedId = randomUUID()
    await seedApproved(convertedId, convertedSnapshot)
    expect(
      await store.pushEvent({
        ...first,
        event: {
          ...first.event,
          eventId: randomUUID(),
          entityId: convertedId,
          payload: {
            ...payload,
            primaryCurrency: 'USD',
            formalSequence: '3',
            formalDocumentNo: `${countryCode}-${projectCode}-20261015-OPA-${shortCode(installationId)}-3`,
            lines: [convertedLine],
            formalSnapshotJson: JSON.stringify(convertedSnapshot),
          },
        },
      }),
    ).toMatchObject({ status: 'accepted', serverVersion: 3 })
    const convertedPulled = await store.pullChanges({
      actor: {
        id: actorId,
        roles: ['purchaser'],
        installationId: randomUUID(),
      },
      cursor: pulled.nextCursor,
      limit: 20,
    })
    expect(
      convertedPulled.changes.find(
        (change) =>
          change.entityId === convertedId &&
          change.payload.workflowStatus === 'formally_issued',
      )?.payload,
    ).toMatchObject({
      primaryCurrency: 'USD',
      formalDocumentNo: `${countryCode}-${projectCode}-20261015-OPA-${shortCode(installationId)}-3`,
      lines: [
        {
          ownerConvertedReferenceUnitMinor: '100',
          ownerFinalUnitPriceMinor: '120',
        },
      ],
    })
  }, 30_000)
})
