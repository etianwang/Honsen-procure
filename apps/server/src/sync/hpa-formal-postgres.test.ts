import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type { SyncEvent } from '@honsen/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'
import { formalShortCode } from './formal-issue.js'

const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null

describe.skipIf(!pool)('HPA PostgreSQL formal registration', () => {
  const actorId = randomUUID(),
    applicantId = randomUUID(),
    projectId = randomUUID(),
    countryId = randomUUID(),
    departmentId = randomUUID(),
    teamId = randomUUID(),
    installationId = randomUUID()
  const countryCode = `HC-${countryId.slice(0, 8)}`,
    projectCode = `HP-${projectId.slice(0, 8)}`
  const store = new PostgresSyncStore(pool!)
  beforeAll(async () => {
    await runMigrations(pool!)
    for (const id of [actorId, applicantId])
      await pool!.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale,is_enabled,requires_password_change) VALUES($1,$2,$2,'fixture','zh-CN',TRUE,FALSE)",
        [id, `HPA-${id}`],
      )
    await pool!.query(
      "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1,$2,'fixture','UTC')",
      [countryId, countryCode],
    )
    await pool!.query(
      "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1,$2,$3,'fixture','site','department','XOF','zh_fr')",
      [projectId, countryId, projectCode],
    )
    await pool!.query(
      "INSERT INTO departments(id,business_code,name) VALUES($1,$2,'fixture')",
      [departmentId, `HD-${departmentId}`],
    )
    await pool!.query(
      "INSERT INTO teams(id,department_id,business_code,name) VALUES($1,$2,$3,'fixture')",
      [teamId, departmentId, `HT-${teamId}`],
    )
    for (const id of [actorId, applicantId]) {
      await pool!.query(
        'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
        [id, projectId],
      )
      await pool!.query(
        'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
        [id, projectId, departmentId, teamId],
      )
    }
    await pool!.query(
      "INSERT INTO user_roles(user_id,role) VALUES($1,'purchaser')",
      [actorId],
    )
  }, 60_000)
  afterAll(async () => {
    await pool!.end()
  })

  function fixture(sequence: number) {
    const approved = {
      countryId,
      projectId,
      departmentId,
      teamId,
      applicantId,
      parentOrderId: null,
      procurementMode: 'honsen_self_purchase',
      workflowStatus: 'approved',
      confirmedBy: actorId,
      confirmedAt: 1792022400,
      selfApproved: false,
      primaryCurrency: 'XOF',
      orderDate: '2026-10-15',
      lines: [
        {
          id: randomUUID(),
          currency: 'XOF',
          quantity: '2',
          unit: 'pcs',
          unitPriceMinor: '1250',
          lineTotalMinor: '2500',
          priceSource: 'manual',
        },
      ],
    }
    const payload = {
      ...approved,
      workflowStatus: 'executing',
      documentType: 'HPA',
      formalDocumentNo: `${countryCode}-${projectCode}-20261015-HPA-${formalShortCode(installationId)}-${sequence}`,
      formalInstallationId: installationId,
      formalSequence: String(sequence),
      formallyIssuedAt: 1792022400,
      formalSnapshotJson: JSON.stringify(approved),
    }
    const event: SyncEvent = {
      eventId: randomUUID(),
      entityType: 'purchase_order',
      entityId: randomUUID(),
      operation: 'upsert',
      baseVersion: 2,
      payload,
    }
    return { approved, payload, event }
  }
  const push = (event: SyncEvent, id = actorId) =>
    store.pushEvent({ event, installationId, actorId: id })
  async function approve(
    event: SyncEvent,
    approved: Record<string, unknown>,
    id = actorId,
  ) {
    expect(
      await push(
        {
          ...event,
          eventId: randomUUID(),
          baseVersion: 0,
          payload: {
            ...approved,
            workflowStatus: 'pending_confirmation',
            confirmedBy: null,
            confirmedAt: null,
          },
        },
        applicantId,
      ),
    ).toMatchObject({ status: 'accepted', serverVersion: 1 })
    expect(
      await push(
        { ...event, eventId: randomUUID(), baseVersion: 1, payload: approved },
        id,
      ),
    ).toMatchObject({ status: 'accepted', serverVersion: 2 })
  }

  it('registers once, replays acknowledgements, pulls frozen values and retains competing changes', async () => {
    const { approved, payload, event } = fixture(1)
    await approve(event, approved)
    expect(await push(event)).toMatchObject({
      status: 'accepted',
      serverVersion: 3,
    })
    expect(await push(event)).toMatchObject({
      status: 'accepted',
      serverVersion: 3,
    })
    const receiving = {
      ...event,
      eventId: randomUUID(),
      baseVersion: 3,
      payload: { ...payload, workflowStatus: 'receiving' },
    }
    expect(await push(receiving)).toMatchObject({
      status: 'accepted',
      serverVersion: 4,
    })
    const changed = {
      ...receiving,
      eventId: randomUUID(),
      baseVersion: 4,
      payload: {
        ...receiving.payload,
        lines: [{ ...payload.lines[0], unitPriceMinor: '999' }],
      },
    }
    expect(await push(changed)).toMatchObject({
      status: 'conflict',
      serverVersion: 4,
    })
    expect(await push(changed)).toMatchObject({
      status: 'conflict',
      serverVersion: 4,
    })
    const duplicate = {
      ...event,
      eventId: randomUUID(),
      entityId: randomUUID(),
    }
    await approve(duplicate, approved)
    expect(await push(duplicate)).toMatchObject({ status: 'conflict' })
    const page = await store.pullChanges({
      actor: {
        id: actorId,
        roles: ['purchaser'],
        installationId: randomUUID(),
      },
      cursor: '0',
      limit: 500,
    })
    expect(
      page.changes.filter((c) => c.entityId === event.entityId).at(-1)?.payload,
    ).toEqual(receiving.payload)
    expect(
      (
        await pool!.query(
          'SELECT document_type,formal_document_no,formal_snapshot_json FROM formal_issue_registry WHERE order_id=$1',
          [event.entityId],
        )
      ).rows,
    ).toEqual([
      {
        document_type: 'HPA',
        formal_document_no: payload.formalDocumentNo,
        formal_snapshot_json: approved,
      },
    ])
    expect(
      (
        await pool!.query(
          'SELECT local_payload_json FROM sync_conflicts WHERE event_id=$1',
          [changed.eventId],
        )
      ).rows[0]?.local_payload_json,
    ).toEqual(changed.payload)
  })

  it('denies forged approval and unprivileged issue, and rolls registration back on late failure', async () => {
    const forged = fixture(2)
    await approve(forged.event, forged.approved, applicantId)
    expect(await push(forged.event)).toMatchObject({
      status: 'validation_error',
    })
    const normal = fixture(3)
    await approve(normal.event, normal.approved)
    await pool!.query(
      'UPDATE users SET requires_password_change=TRUE WHERE id=$1',
      [actorId],
    )
    try {
      expect(await push(normal.event)).toMatchObject({
        status: 'validation_error',
      })
    } finally {
      await pool!.query(
        'UPDATE users SET requires_password_change=FALSE WHERE id=$1',
        [actorId],
      )
    }
    await pool!.query('DELETE FROM user_roles WHERE user_id=$1', [actorId])
    try {
      expect(await push(normal.event)).toMatchObject({
        status: 'validation_error',
      })
    } finally {
      await pool!.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1,'purchaser')",
        [actorId],
      )
    }
    expect(
      (
        await new SyncService(store).push(
          { id: applicantId, roles: ['engineer'], installationId },
          { deviceId: installationId, events: [normal.event] },
        )
      ).results[0],
    ).toMatchObject({ status: 'validation_error', errorCode: 'FORBIDDEN' })
    const suffix = randomUUID().replaceAll('-', '')
    const trigger = `hpa_fail_${suffix}`
    await pool!.query(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id = '${normal.event.entityId}'::uuid THEN RAISE EXCEPTION 'injected HPA changelog failure'; END IF; RETURN NEW; END $$`,
    )
    await pool!.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON server_change_log FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    )
    try {
      await expect(push(normal.event)).rejects.toThrow(
        'injected HPA changelog failure',
      )
    } finally {
      await pool!.query(`DROP TRIGGER ${trigger} ON server_change_log`)
      await pool!.query(`DROP FUNCTION ${trigger}()`)
    }
    expect(
      (
        await pool!.query(
          'SELECT 1 FROM formal_issue_registry WHERE order_id=$1',
          [normal.event.entityId],
        )
      ).rowCount,
    ).toBe(0)
    expect(
      (
        await pool!.query(
          "SELECT version FROM sync_entities WHERE entity_type='purchase_order' AND entity_id=$1",
          [normal.event.entityId],
        )
      ).rows[0]?.version,
    ).toBe('2')
    expect(await push(normal.event)).toMatchObject({
      status: 'accepted',
      serverVersion: 3,
    })
  })
})
