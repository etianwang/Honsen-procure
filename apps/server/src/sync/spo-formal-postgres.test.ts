import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type { SyncEvent } from '@honsen/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { formalShortCode } from './formal-issue.js'

const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null

describe.skipIf(!pool)('SPO PostgreSQL formal registration', () => {
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

  async function fixture(sequence: number, childCurrency = 'XOF') {
    const parentId = randomUUID(),
      orderId = randomUUID()
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
    const event = (
      entityId: string,
      baseVersion: number,
      payload: Record<string, unknown>,
    ): SyncEvent => ({
      eventId: randomUUID(),
      entityType: 'purchase_order',
      entityId,
      operation: 'upsert',
      baseVersion,
      payload,
    })
    const push = (e: SyncEvent, id = actorId) =>
      store.pushEvent({ event: e, installationId, actorId: id })
    expect(
      await push(
        event(parentId, 0, {
          ...approved,
          workflowStatus: 'pending_confirmation',
          confirmedBy: null,
          confirmedAt: null,
        }),
        applicantId,
      ),
    ).toMatchObject({ status: 'accepted' })
    expect(await push(event(parentId, 1, approved))).toMatchObject({
      status: 'accepted',
    })
    const supplierId = randomUUID()
    await pool!.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,is_deleted,payload_json,updated_by) VALUES('supplier',$1,1,FALSE,$2,$3)",
      [supplierId, { countryId, name: 'synthetic supplier' }, actorId],
    )
    const draft = {
      ...approved,
      parentOrderId: parentId,
      procurementMode: null,
      workflowStatus: 'draft',
      confirmedBy: null,
      confirmedAt: null,
      supplierId,
      supplierSnapshotJson: JSON.stringify({ name: 'synthetic supplier' }),
      supplierTermsCompletedAt: 1792022400,
      currency: childCurrency,
      lockedExchangeRateDecimal: childCurrency === 'XOF' ? '1' : '76.5',
      lines: approved.lines.map((line) => ({
        ...line,
        id: randomUUID(),
        currency: childCurrency,
      })),
    }
    expect(await push(event(orderId, 0, draft))).toMatchObject({
      status: 'accepted',
    })
    const payload = {
      ...draft,
      workflowStatus: 'sent',
      documentType: 'SPO',
      formalDocumentNo:
        countryCode +
        '-' +
        projectCode +
        '-20261015-SPO-' +
        formalShortCode(installationId) +
        '-' +
        sequence,
      formalInstallationId: installationId,
      formalSequence: String(sequence),
      formallyIssuedAt: 1792022401,
      formalSnapshotJson: JSON.stringify(draft),
    }
    return {
      parentId,
      orderId,
      draft,
      payload,
      event,
      push,
      issued: event(orderId, 1, payload),
    }
  }
  it('registers the sent child once, retains conflicts, pulls frozen snapshots and denies parent closure', async () => {
    const f = await fixture(101)
    expect(await f.push(f.issued)).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    expect(await f.push(f.issued)).toMatchObject({
      status: 'accepted',
      serverVersion: 2,
    })
    const changed = f.event(f.orderId, 2, { ...f.payload, totalMinor: '999' })
    expect(await f.push(changed)).toMatchObject({ status: 'conflict' })
    expect(await f.push(changed)).toMatchObject({ status: 'conflict' })
    expect(
      await f.push(
        f.event(f.orderId, 2, { ...f.payload, workflowStatus: 'receiving' }),
      ),
    ).toMatchObject({ status: 'accepted' })
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
      page.changes.filter((c) => c.entityId === f.orderId).at(-1)?.payload,
    ).toEqual({ ...f.payload, workflowStatus: 'receiving' })
    expect(
      (
        await pool!.query(
          'SELECT count(*)::int AS count FROM formal_issue_registry WHERE order_id=$1',
          [f.orderId],
        )
      ).rows[0].count,
    ).toBe(1)
    const duplicate = await fixture(101)
    expect(await duplicate.push(duplicate.issued)).toMatchObject({
      status: 'conflict',
    })
    const crossCurrency = await fixture(106, 'CNY')
    const parentPayload = (
      await pool!.query(
        'SELECT payload_json FROM sync_entities WHERE entity_id=$1',
        [crossCurrency.parentId],
      )
    ).rows[0].payload_json
    const hpa = {
      ...parentPayload,
      workflowStatus: 'executing',
      documentType: 'HPA',
      formalDocumentNo:
        countryCode +
        '-' +
        projectCode +
        '-20261015-HPA-' +
        formalShortCode(installationId) +
        '-900',
      formalInstallationId: installationId,
      formalSequence: '900',
      formallyIssuedAt: 1792022401,
      formalSnapshotJson: JSON.stringify(parentPayload),
    }
    expect(
      await crossCurrency.push(
        crossCurrency.event(crossCurrency.parentId, 2, hpa),
      ),
    ).toMatchObject({ status: 'accepted' })
    expect(await crossCurrency.push(crossCurrency.issued)).toMatchObject({
      status: 'accepted',
    })
    expect(crossCurrency.payload.currency).toBe('CNY')
    expect(
      JSON.parse(crossCurrency.payload.formalSnapshotJson)
        .lockedExchangeRateDecimal,
    ).toBe('76.5')
    const tampered = await fixture(105)
    await pool!.query(
      "UPDATE sync_entities SET payload_json=jsonb_set(payload_json,'{selfApproved}','true') WHERE entity_id=$1",
      [tampered.parentId],
    )
    expect(await tampered.push(tampered.issued)).toMatchObject({
      status: 'validation_error',
    })
    const denied = await fixture(102)
    await pool!.query(
      "UPDATE sync_entities SET payload_json=jsonb_set(payload_json,'{workflowStatus}','\"completed\"') WHERE entity_id=$1",
      [denied.parentId],
    )
    expect(await denied.push(denied.issued)).toMatchObject({
      status: 'validation_error',
    })
    expect(
      (
        await pool!.query(
          'SELECT count(*)::int AS count FROM formal_issue_registry WHERE order_id=$1',
          [denied.orderId],
        )
      ).rows[0].count,
    ).toBe(0)
  })
  it('denies forged approval, uncompleted terms, live first-login and rolls back late failure before retry', async () => {
    const f = await fixture(103)
    await pool!.query(
      'UPDATE users SET requires_password_change=TRUE WHERE id=$1',
      [actorId],
    )
    expect(await f.push(f.issued)).toMatchObject({ status: 'validation_error' })
    await pool!.query(
      'UPDATE users SET requires_password_change=FALSE WHERE id=$1',
      [actorId],
    )
    expect(
      await f.push(
        f.event(f.orderId, 1, { ...f.payload, supplierTermsCompletedAt: null }),
      ),
    ).toMatchObject({ status: 'validation_error' })
    await pool!.query(
      "DELETE FROM server_change_log WHERE entity_id=$1 AND payload_json->>'workflowStatus'='approved'",
      [f.parentId],
    )
    expect(await f.push(f.issued)).toMatchObject({ status: 'validation_error' })
    const retry = await fixture(104)
    await pool!.query(
      "CREATE OR REPLACE FUNCTION fail_spo_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload_json->>'documentType'='SPO' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$",
    )
    await pool!.query(
      'CREATE TRIGGER fail_spo_log BEFORE INSERT ON server_change_log FOR EACH ROW EXECUTE FUNCTION fail_spo_log()',
    )
    try {
      await expect(retry.push(retry.issued)).rejects.toThrow('injected')
    } finally {
      await pool!.query('DROP TRIGGER fail_spo_log ON server_change_log')
      await pool!.query('DROP FUNCTION fail_spo_log()')
    }
    expect(
      (
        await pool!.query(
          'SELECT count(*)::int AS count FROM formal_issue_registry WHERE order_id=$1',
          [retry.orderId],
        )
      ).rows[0].count,
    ).toBe(0)
    expect(await retry.push(retry.issued)).toMatchObject({ status: 'accepted' })
  })
})
