import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'
import {
  materialFixture,
  supplierFixture,
  priceFixture,
} from './catalog-fixtures.js'

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
    await pool!.query(
      'INSERT INTO user_project_bindings (user_id, project_id) VALUES ($1, $2)',
      [actorId, projectId],
    )
    await pool!.query(
      'INSERT INTO user_project_scope_bindings (user_id, project_id, department_id, team_id) VALUES ($1, $2, $3, $4)',
      [actorId, projectId, departmentId, teamId],
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
      confirmedBy: actorId,
      confirmedAt: 1792022400,
      selfApproved: false,
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
    const pending = {
      ...approved,
      workflowStatus: 'pending_confirmation',
      confirmedBy: null,
      confirmedAt: null,
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
    return { orderId, pending, approved, issued, event }
  }

  async function seedApproved(f: ReturnType<typeof fixture>) {
    expect(
      (
        await store.pushEvent({
          event: f.event(f.pending, 0),
          installationId,
          actorId: engineerId,
        })
      ).status,
    ).toBe('accepted')
    expect(
      (
        await store.pushEvent({
          event: f.event(f.approved, 1),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('accepted')
  }

  it('rejects applicant self-approval lies while accepting a distinct approver', async () => {
    const own = fixture(106)
    const ownPending = { ...own.pending, applicantId: actorId }
    const ownApproved = {
      ...own.approved,
      applicantId: actorId,
      confirmedBy: actorId,
    }
    const ownActor = {
      id: actorId,
      roles: ['purchaser' as const],
      installationId: randomUUID(),
    }
    const pushOwn = async (
      payload: Record<string, unknown>,
      baseVersion: number,
    ) =>
      (
        await service.push(ownActor, {
          deviceId: installationId,
          events: [own.event(payload, baseVersion)],
        })
      ).results[0]!.status
    expect(await pushOwn(ownPending, 0)).toBe('accepted')
    expect(await pushOwn({ ...ownPending, applicantId: engineerId }, 1)).toBe(
      'conflict',
    )
    expect(await pushOwn(ownApproved, 1)).toBe('validation_error')
    expect(await pushOwn({ ...ownApproved, selfApproved: true }, 1)).toBe(
      'validation_error',
    )
    const ownStored = await pool!.query<{
      version: string
      payload_json: Record<string, unknown>
    }>(
      `SELECT version, payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [own.orderId],
    )
    expect(ownStored.rows[0]?.version).toBe('1')
    expect(ownStored.rows[0]?.payload_json.workflowStatus).toBe(
      'pending_confirmation',
    )

    const forgedCreator = fixture(109)
    expect(
      (
        await service.push(ownActor, {
          deviceId: installationId,
          events: [forgedCreator.event(forgedCreator.pending, 0)],
        })
      ).results[0]!.status,
    ).toBe('validation_error')
    const directApproval = fixture(110)
    expect(
      (
        await service.push(ownActor, {
          deviceId: installationId,
          events: [directApproval.event(directApproval.approved, 0)],
        })
      ).results[0]!.status,
    ).toBe('validation_error')

    const other = fixture(107)
    expect(
      (
        await service.push(
          { id: engineerId, roles: ['engineer'], installationId: randomUUID() },
          {
            deviceId: installationId,
            events: [other.event(other.pending, 0)],
          },
        )
      ).results[0]!.status,
    ).toBe('accepted')
    expect(
      (
        await service.push(ownActor, {
          deviceId: installationId,
          events: [other.event(other.approved, 1)],
        })
      ).results[0]!.status,
    ).toBe('accepted')
    const repricedApproved = {
      ...other.approved,
      lines: [
        {
          ...other.approved.lines[0],
          ownerManualReferenceReason: 'updated fixture quote',
        },
      ],
    }
    expect(
      (
        await service.push(ownActor, {
          deviceId: installationId,
          events: [other.event(repricedApproved, 2)],
        })
      ).results[0]!.status,
    ).toBe('accepted')
    const repricedIssued = {
      ...other.issued,
      lines: repricedApproved.lines,
      formalSnapshotJson: JSON.stringify(repricedApproved),
    }
    expect(
      (
        await service.push(ownActor, {
          deviceId: installationId,
          events: [other.event(repricedIssued, 3)],
        })
      ).results[0]!.status,
    ).toBe('accepted')
  })

  it('preserves an issued offline snapshot and audits a revoked catalog quote', async () => {
    const f = fixture(111)
    const supplierId = randomUUID()
    const line = {
      ...f.approved.lines[0],
      ownerQuoteSource: 'catalog_price',
      ownerCatalogPriceId: randomUUID(),
      ownerManualReferenceReason: null,
      materialId: randomUUID(),
      supplierSnapshotJson: JSON.stringify({
        id: supplierId,
        name: 'fixture',
      }),
      unit: 'pcs',
    }
    const pending = { ...f.pending, lines: [line] }
    const approved = { ...f.approved, lines: [line] }
    const issued = {
      ...f.issued,
      lines: [line],
      formalSnapshotJson: JSON.stringify(approved),
    }
    for (const [entityType, entityId, payload] of [
      ['material', line.materialId, materialFixture(line.materialId)],
      ['supplier', supplierId, supplierFixture(supplierId, countryId)],
      [
        'material_price',
        line.ownerCatalogPriceId,
        {
          ...priceFixture(
            line.ownerCatalogPriceId,
            line.materialId,
            supplierId,
          ),
          unitPriceMinor: '100',
        },
      ],
    ] as const) {
      expect(
        (
          await store.pushEvent({
            event: {
              eventId: randomUUID(),
              entityType,
              entityId,
              operation: 'upsert',
              baseVersion: 0,
              payload,
            },
            installationId,
            actorId: engineerId,
          })
        ).status,
      ).toBe('accepted')
    }
    expect(
      (
        await store.pushEvent({
          event: f.event(pending, 0),
          installationId,
          actorId: engineerId,
        })
      ).status,
    ).toBe('accepted')
    expect(
      (
        await store.pushEvent({
          event: f.event(approved, 1),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('accepted')
    await pool!.query(
      `UPDATE sync_entities SET is_deleted = true WHERE entity_type = 'material_price' AND entity_id = $1`,
      [line.ownerCatalogPriceId],
    )
    expect(
      (
        await store.pushEvent({
          event: f.event(issued, 2),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('accepted')
    const result = await pool!.query(
      `SELECT payload_json FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [f.orderId],
    )
    expect(result.rows[0].payload_json.lines[0].ownerFinalUnitPriceMinor).toBe(
      '120',
    )
    const audit = await pool!.query(
      `SELECT 1 FROM audit_entries WHERE entity_type = 'purchase_order' AND entity_id = $1 AND action = 'issued_quote_verification_discrepancy'`,
      [f.orderId],
    )
    expect(audit.rowCount).toBe(1)
  })

  it('never revives a soft-deleted approved order by formal issue Push', async () => {
    const f = fixture(108)
    const push = (
      payload: Record<string, unknown>,
      operation: 'upsert' | 'soft_delete',
      baseVersion: number,
    ) =>
      store.pushEvent({
        event: { ...f.event(payload, baseVersion), operation },
        installationId,
        actorId: baseVersion === 0 ? engineerId : actorId,
      })
    expect((await push(f.pending, 'upsert', 0)).status).toBe('accepted')
    expect((await push(f.approved, 'upsert', 1)).status).toBe('accepted')
    expect((await push(f.approved, 'soft_delete', 2)).status).toBe('accepted')
    const revival = { event: f.event(f.issued, 3), installationId, actorId }
    expect((await store.pushEvent(revival)).status).toBe('conflict')
    expect((await store.pushEvent(revival)).status).toBe('conflict')
    const stored = await pool!.query<{ is_deleted: boolean; version: string }>(
      `SELECT is_deleted, version FROM sync_entities WHERE entity_type = 'purchase_order' AND entity_id = $1`,
      [f.orderId],
    )
    expect(stored.rows[0]).toEqual({ is_deleted: true, version: '3' })
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM formal_issue_registry WHERE order_id = $1',
          [f.orderId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query('SELECT 1 FROM sync_conflicts WHERE event_id = $1', [
          revival.event.eventId,
        ])
      ).rowCount,
    ).toBe(1)
  })

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
    await seedApproved(f)
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
          event: f.event(tampered, 2),
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
            2,
          ),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('validation_error')
    expect(
      (
        await store.pushEvent({
          event: f.event(f.issued, 2),
          installationId,
          actorId,
        })
      ).status,
    ).toBe('accepted')
  })

  it('denies an engineer approval and issue even for a bound own-project order', async () => {
    const f = fixture(102)
    const actor = {
      id: engineerId,
      roles: ['engineer' as const],
      installationId: randomUUID(),
    }
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
    expect(await push(f.pending)).toBe('accepted')
    expect(
      (
        await service.push(
          { id: actorId, roles: ['purchaser'], installationId: randomUUID() },
          {
            deviceId: installationId,
            events: [f.event(f.approved, 1)],
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
    await seedApproved(f)
    expect((await push(f.issued, 2)).status).toBe('accepted')
    expect((await push({ ...f.issued, totalMinor: '999' }, 3)).status).toBe(
      'conflict',
    )
    expect((await push({ ...f.issued, notes: 'rewritten' }, 3)).status).toBe(
      'conflict',
    )
    expect(
      (await push({ ...f.issued, deliveryAddress: 'rewritten' }, 3)).status,
    ).toBe('conflict')
    expect(
      (
        await push(
          {
            ...f.issued,
            lines: [{ ...f.issued.lines[0], ownerFinalUnitPriceMinor: '121' }],
          },
          3,
        )
      ).status,
    ).toBe('conflict')
    expect(
      (await push({ ...f.issued, workflowStatus: 'completed' }, 3)).status,
    ).toBe('conflict')
    expect(
      (await push({ ...f.issued, workflowStatus: 'receiving' }, 3)).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'receiving' }, 4)).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'completed' }, 5)).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'formally_issued' }, 6))
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
    await seedApproved(conditions)
    expect((await conditionsPush(conditions.issued, 2)).status).toBe('accepted')
    expect(
      (
        await conditionsPush(
          { ...conditions.issued, workflowStatus: 'receiving' },
          3,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (
        await conditionsPush(
          { ...conditions.issued, workflowStatus: 'completed_with_conditions' },
          4,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (await push({ ...f.issued, workflowStatus: 'completed' }, 6)).status,
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
    await seedApproved(cancelled)
    expect((await cancelPush(cancelled.issued, 2)).status).toBe('accepted')
    expect(
      (
        await cancelPush(
          { ...cancelled.issued, workflowStatus: 'receiving' },
          3,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (
        await cancelPush(
          { ...cancelled.issued, workflowStatus: 'cancelled' },
          4,
        )
      ).status,
    ).toBe('accepted')
    expect(
      (
        await cancelPush(
          { ...cancelled.issued, workflowStatus: 'receiving' },
          5,
        )
      ).status,
    ).toBe('conflict')
  }, 30_000)
})
