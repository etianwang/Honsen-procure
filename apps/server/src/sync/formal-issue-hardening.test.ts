import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null

describe.skipIf(!pool)('owner formal issue trust boundary', () => {
  const actorId = randomUUID()
  const engineerId = randomUUID()
  const countryId = randomUUID()
  const projectId = randomUUID()
  const departmentId = randomUUID()
  const teamId = randomUUID()
  const installationId = randomUUID()
  const countryCode = `FC${countryId.slice(0, 8)}`
  const projectCode = `FP${projectId.slice(0, 8)}`
  const shortCode = (() => {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    let bits = BigInt(`0x${installationId.replaceAll('-', '')}`)
    let code = ''
    for (let index = 0; index < 8; index += 1) {
      code = alphabet[Number(bits & 31n)] + code
      bits >>= 5n
    }
    return code
  })()
  const store = new PostgresSyncStore(pool!)
  const service = new SyncService(store)

  beforeAll(async () => {
    await runMigrations(pool!)
    await pool!.query(
      `INSERT INTO users (id, business_code, username, password_hash, ui_locale, is_enabled)
       VALUES ($1, $2, $3, 'fixture', 'zh-CN', TRUE),
              ($4, $5, $6, 'fixture', 'zh-CN', TRUE)`,
      [
        actorId,
        `F-${actorId}`,
        `formal-${actorId}`,
        engineerId,
        `F-${engineerId}`,
        `formal-${engineerId}`,
      ],
    )
    await pool!.query(
      `INSERT INTO countries (id, business_code, name, time_zone) VALUES ($1, $2, 'fixture country', 'UTC')`,
      [countryId, countryCode],
    )
    await pool!.query(
      `INSERT INTO projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair)
       VALUES ($1, $2, $3, 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr')`,
      [projectId, countryId, projectCode],
    )
    await pool!.query(
      'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
      [engineerId, projectId],
    )
    await pool!.query(
      "INSERT INTO departments (id, business_code, name) VALUES ($1, $2, 'fixture department')",
      [departmentId, `FD-${departmentId}`],
    )
    await pool!.query(
      "INSERT INTO teams (id, department_id, business_code, name) VALUES ($1, $2, $3, 'fixture team')",
      [teamId, departmentId, `FT-${teamId}`],
    )
    await pool!.query(
      'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
      [engineerId, projectId, departmentId, teamId],
    )
  }, 60_000)

  afterAll(async () => {
    await pool!.end()
  })

  function fixture(sequence: number) {
    const orderId = randomUUID()
    const line = {
      id: randomUUID(),
      currency: 'XOF',
      ownerQuoteSource: 'manual_reference',
      ownerCatalogPriceId: null,
      ownerManualReferenceReason: 'fixture',
      ownerManualReferenceActorId: actorId,
      ownerManualReferenceAt: 1792022400,
      ownerSourceUnitPriceMinor: '100',
      ownerLockedExchangeRateDecimal: '1',
      ownerConvertedReferenceUnitMinor: '100',
      ownerMarkupJson: '{"kind":"fixed_minor","minor":"20"}',
      ownerFinalUnitPriceMinor: '120',
    }
    const approved = {
      countryId,
      projectId,
      applicantId: engineerId,
      departmentId,
      teamId,
      procurementMode: 'owner_self_purchase',
      workflowStatus: 'approved',
      primaryCurrency: 'XOF',
      orderDate: '2026-10-15',
      deliveryAddress: 'original address',
      notes: 'original note',
      totalMinor: '120',
      lines: [line],
    }
    const documentNo = `${countryCode}-${projectCode}-20261015-OPA-${shortCode}-${sequence}`
    const issued = {
      ...approved,
      workflowStatus: 'formally_issued',
      documentType: 'OPA',
      formalDocumentNo: documentNo,
      formalInstallationId: installationId,
      formalSequence: String(sequence),
      formallyIssuedAt: 1792022400,
      formalSnapshotJson: JSON.stringify(approved),
    }
    function event(payload: Record<string, unknown>, baseVersion: number) {
      return {
        eventId: randomUUID(),
        entityType: 'purchase_order' as const,
        entityId: orderId,
        operation: 'upsert' as const,
        baseVersion,
        payload,
      }
    }
    return { orderId, approved, issued, event }
  }

  it('denies direct base-version-zero issue, then requires exact approved server snapshot', async () => {
    const f = fixture(101)
    expect(
      (
        await store.pushEvent({
          event: f.event(f.issued, 0),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('validation_error')
    expect(
      (
        await store.pushEvent({
          event: f.event(f.approved, 0),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('accepted')
    const tampered = {
      ...f.issued,
      formalSnapshotJson: JSON.stringify({
        ...f.approved,
        notes: 'not on server',
      }),
    }
    expect(
      (
        await store.pushEvent({
          event: f.event(tampered, 1),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('conflict')
    expect(
      (
        await store.pushEvent({
          event: f.event(
            { ...f.issued, deliveryAddress: 'changed at signing' },
            1,
          ),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('validation_error')
    expect(
      (
        await store.pushEvent({
          event: f.event(f.issued, 1),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('accepted')
  })

  it('denies an engineer approval and issue even for a bound own-project order', async () => {
    const f = fixture(102)
    const actor = { id: engineerId, roles: ['engineer' as const] }
    const push = async (payload: Record<string, unknown>) =>
      (
        await service.push(actor, {
          deviceId: installationId,
          events: [f.event(payload, 0)],
        })
      ).results[0]!.status
    expect(await push(f.approved)).toBe('validation_error')
    expect(await push(f.issued)).toBe('validation_error')
    expect(
      await push({
        ...f.approved,
        workflowStatus: 'draft',
        confirmedBy: engineerId,
      }),
    ).toBe('validation_error')
    expect(
      (
        await service.push(
          { id: actorId, roles: ['purchaser'] },
          {
            deviceId: installationId,
            events: [f.event(f.approved, 0)],
          },
        )
      ).results[0]!.status,
    ).toBe('accepted')
  })

  it('rejects postissue frozen changes and backward/terminal transitions without overwriting', async () => {
    const f = fixture(103)
    const push = (payload: Record<string, unknown>, baseVersion: number) =>
      store.pushEvent({
        event: f.event(payload, baseVersion),
        installationId,
        actorId,
      })
    expect((await push(f.approved, 0)).status).toBe('accepted')
    expect((await push(f.issued, 1)).status).toBe('accepted')
    expect((await push({ ...f.issued, totalMinor: '999' }, 2)).status).toBe(
      'conflict',
    )
    expect((await push({ ...f.issued, notes: 'rewritten' }, 2)).status).toBe(
      'conflict',
    )
    expect(
      (await push({ ...f.issued, deliveryAddress: 'rewritten' }, 2)).status,
    ).toBe('conflict')
    expect(
      (
        await push(
          {
            ...f.issued,
            lines: [{ ...f.issued.lines[0], ownerFinalUnitPriceMinor: '121' }],
          },
          2,
        )
      ).status,
    ).toBe('conflict')
    expect(
      (await push({ ...f.issued, workflowStatus: 'completed' }, 2)).status,
    ).toBe('conflict')
    expect(
      (await push({ ...f.issued, workflowStatus: 'receiving' }, 2)).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'receiving' }, 3)).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'completed' }, 4)).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'formally_issued' }, 5))
        .status,
    ).toBe('conflict')
    const conditions = fixture(105)
    const conditionsPush = (
      payload: Record<string, unknown>,
      baseVersion: number,
    ) =>
      store.pushEvent({
        event: conditions.event(payload, baseVersion),
        installationId,
        actorId,
      })
    expect((await conditionsPush(conditions.approved, 0)).status).toBe(
      'accepted',
    )
    expect((await conditionsPush(conditions.issued, 1)).status).toBe('accepted')
    expect(
      (
        await conditionsPush(
          { ...conditions.issued, workflowStatus: 'receiving' },
          2,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (
        await conditionsPush(
          { ...conditions.issued, workflowStatus: 'completed_with_conditions' },
          3,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'completed' }, 5)).status,
    ).toBe('conflict')
    const stored = await pool!.query<{ payload_json: Record<string, unknown> }>(
      `SELECT payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [f.orderId],
    )
    expect(stored.rows[0]?.payload_json).toMatchObject({
      workflowStatus: 'completed',
      notes: 'original note',
      deliveryAddress: 'original address',
      totalMinor: '120',
    })

    const cancelled = fixture(104)
    const cancelPush = (
      payload: Record<string, unknown>,
      baseVersion: number,
    ) =>
      store.pushEvent({
        event: cancelled.event(payload, baseVersion),
        installationId,
        actorId,
      })
    expect((await cancelPush(cancelled.approved, 0)).status).toBe('accepted')
    expect((await cancelPush(cancelled.issued, 1)).status).toBe('accepted')
    expect(
      (
        await cancelPush(
          { ...cancelled.issued, workflowStatus: 'receiving' },
          2,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (
        await cancelPush(
          { ...cancelled.issued, workflowStatus: 'cancelled' },
          3,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (
        await cancelPush(
          { ...cancelled.issued, workflowStatus: 'receiving' },
          4,
        )
      ).status,
    ).toBe('conflict')
  })
})
