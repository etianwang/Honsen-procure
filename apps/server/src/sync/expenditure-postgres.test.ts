import { readFile, readdir } from 'node:fs/promises'
import { procurementExpenditureSchema } from '@honsen/shared'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
import { PostgresSyncStore } from './postgres-store.js'
import { SyncService } from './service.js'

const url = process.env.TEST_DATABASE_URL
describe.skipIf(!url)('PostgreSQL payment ledger', () => {
  const pool = new Pool({ connectionString: url })
  const store = new PostgresSyncStore(pool)
  const service = new SyncService(store)
  const actor = {
    id: randomUUID(),
    installationId: randomUUID(),
    roles: ['purchaser'] as const,
  }
  const countryId = randomUUID(),
    projectId = randomUUID(),
    parentId = randomUUID(),
    departmentId = randomUUID(),
    teamId = randomUUID()
  const children = [randomUUID(), randomUUID()]
  const deviceId = randomUUID()
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
    await pool.query(
      "INSERT INTO departments(id,business_code,name) VALUES($1::uuid,$1::text,'Synthetic')",
      [departmentId],
    )
    await pool.query(
      "INSERT INTO teams(id,department_id,business_code,name) VALUES($1::uuid,$2::uuid,$1::text,'Synthetic')",
      [teamId, departmentId],
    )
    await pool.query(
      'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
      [actor.id, projectId, departmentId, teamId],
    )
    for (const id of [parentId, ...children]) {
      await store.pushEvent({
        actorId: actor.id,
        installationId: deviceId,
        event: {
          eventId: randomUUID(),
          entityId: id,
          entityType: 'purchase_order',
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            parentOrderId: id === parentId ? null : parentId,
            procurementMode: id === parentId ? 'honsen_self_purchase' : null,
            projectId,
            countryId,
            departmentId,
            teamId,
            currency: 'XOF',
            workflowStatus: 'executing',
            totalMinor: '1000',
          },
        },
      })
    }
  })
  afterAll(async () => {
    await pool.end()
  })
  const payment = (orderId: string, amountMinor = '100') => {
    const id = randomUUID()
    return {
      eventId: randomUUID(),
      entityId: id,
      entityType: 'procurement_expenditure' as const,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id,
        orderId,
        projectId,
        countryId,
        payeeName: 'Synthetic',
        currency: 'XOF',
        amountMinor,
        paymentDate: '2026-10-24',
        paymentType: 'progress',
        paymentMethod: 'cash',
        paymentHandlerId: actor.id,
        createdBy: actor.id,
        status: 'recorded',
        createdAt: 1792800000,
      } as Record<string, unknown>,
    }
  }
  it('persists three payments, retries safely, protects immutable rows and serializes duplicate reversals', async () => {
    const first = payment(children[0]!),
      second = payment(children[0]!, '200'),
      third = payment(children[1]!, '50')
    const push = async (events: (typeof first)[]) =>
      (await service.push(actor, { deviceId, events })).results
    expect((await push([first, second, third])).map((r) => r.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
    ])
    expect((await push([first]))[0]?.status).toBe('accepted')
    expect(
      (
        await push([
          {
            ...first,
            eventId: randomUUID(),
            baseVersion: 1,
            payload: { ...first.payload, orderId: children[1] },
          },
        ])
      )[0],
    ).toMatchObject({ status: 'validation_error', errorCode: 'FORBIDDEN' })
    expect(
      (
        await push([
          {
            ...first,
            eventId: randomUUID(),
            baseVersion: 1,
            payload: { ...first.payload, amountMinor: '999' },
          },
        ])
      )[0]?.status,
    ).toBe('conflict')
    const reversal = {
      ...payment(children[0]!),
      payload: {} as Record<string, unknown>,
    }
    reversal.payload = {
      ...first.payload,
      id: reversal.entityId,
      status: 'reversed',
      correctsExpenditureId: first.entityId,
      correctionReason: 'Synthetic correction',
    }
    const duplicate = {
      ...reversal,
      eventId: randomUUID(),
      entityId: randomUUID(),
    }
    duplicate.payload = { ...reversal.payload, id: duplicate.entityId }
    const results = await Promise.all([push([reversal]), push([duplicate])])
    expect(
      results
        .flat()
        .map((r) => r.status)
        .sort(),
    ).toEqual(['accepted', 'conflict'])
    const amounts = await pool.query<{ order_id: string; paid: string }>(
      `SELECT order_id, SUM(CASE WHEN status='reversed' THEN -amount_minor ELSE amount_minor END)::text AS paid FROM procurement_expenditures WHERE project_id=$1 GROUP BY order_id`,
      [projectId],
    )
    expect(
      Object.fromEntries(amounts.rows.map((r) => [r.order_id, r.paid])),
    ).toEqual({ [children[0]!]: '200', [children[1]!]: '50' })
    expect(
      (await store.getEntityPayload('purchase_order', children[0]!))
        ?.totalMinor,
    ).toBe('1000')
    const page = await service.pull(actor, { cursor: '0', limit: 500 })
    expect(
      page.changes.filter(
        (c) =>
          c.entityType === 'procurement_expenditure' &&
          c.payload.projectId === projectId,
      ),
    ).toHaveLength(4)
    expect(
      (await service.pull(actor, { cursor: page.nextCursor, limit: 500 }))
        .changes,
    ).toHaveLength(0)
    const original = await pool.query(
      `SELECT amount_minor,status FROM procurement_expenditures WHERE id=$1`,
      [first.entityId],
    )
    expect(original.rows[0]).toMatchObject({
      amount_minor: '100',
      status: 'recorded',
    })
  })
  it('adjudicates another creator payment conflict through normal sync without changing either ledger original', async () => {
    const admin = {
      id: randomUUID(),
      installationId: randomUUID(),
      roles: ['administrator'] as const,
    }
    await pool.query(
      "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES($1::uuid,$1::text,$1::text,'fixture','zh-CN')",
      [admin.id],
    )
    await pool.query(
      "INSERT INTO user_roles(user_id,role) VALUES($1,'administrator')",
      [admin.id],
    )
    await pool.query(
      'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
      [admin.id, projectId],
    )
    await pool.query(
      'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
      [admin.id, projectId, departmentId, teamId],
    )
    const original = payment(children[0]!)
    const send = async (
      who: typeof actor | typeof admin,
      event: typeof original,
    ) =>
      (
        await service.push(who, {
          deviceId: who.installationId,
          events: [event],
        })
      ).results[0]!
    expect((await send(actor, original)).status).toBe('accepted')
    const rejected = {
      ...original,
      eventId: randomUUID(),
      baseVersion: 1,
      payload: { ...original.payload, amountMinor: '999' },
    }
    expect((await send(actor, rejected)).status).toBe('conflict')
    const listed = await service.listPaymentConflicts(admin)
    const conflict = listed.conflicts.find(
      (c) => c.eventId === rejected.eventId,
    )!
    expect(conflict).toMatchObject({
      entityId: original.entityId,
      originAccountId: actor.id,
      localPayload: rejected.payload,
      serverPayload: original.payload,
    })
    await expect(service.listPaymentConflicts(actor)).rejects.toThrow(
      'FORBIDDEN',
    )
    const resolutionId = randomUUID()
    const event = {
      eventId: randomUUID(),
      entityType: 'payment_conflict_resolution' as const,
      entityId: resolutionId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id: resolutionId,
        conflictId: conflict.conflictId,
        eventId: rejected.eventId,
        action: 'use_server',
        reason: 'Compared immutable originals',
      },
    }
    const decide = async (who = admin, e = event) =>
      (await service.push(who, { deviceId: who.installationId, events: [e] }))
        .results[0]!
    expect(
      await decide({ ...admin, roles: [] as unknown as typeof admin.roles }),
    ).toMatchObject({ status: 'validation_error', errorCode: 'FORBIDDEN' })
    await pool.query(
      'UPDATE user_project_scope_bindings SET deleted_at=NOW() WHERE user_id=$1',
      [admin.id],
    )
    expect((await service.listPaymentConflicts(admin)).conflicts).toHaveLength(
      0,
    )
    expect(await decide()).toMatchObject({
      status: 'validation_error',
      errorCode: 'FORBIDDEN',
    })
    await pool.query(
      'UPDATE user_project_scope_bindings SET deleted_at=NULL WHERE user_id=$1',
      [admin.id],
    )
    await pool.query('UPDATE users SET is_enabled=FALSE WHERE id=$1', [
      admin.id,
    ])
    await expect(store.listPaymentConflicts(admin)).rejects.toThrow('FORBIDDEN')
    expect(await decide()).toMatchObject({
      status: 'validation_error',
      errorCode: 'FORBIDDEN',
    })
    await pool.query('UPDATE users SET is_enabled=TRUE WHERE id=$1', [admin.id])
    await pool.query(
      "DELETE FROM user_roles WHERE user_id=$1 AND role='administrator'",
      [admin.id],
    )
    expect(await decide()).toMatchObject({
      status: 'validation_error',
      errorCode: 'FORBIDDEN',
    })
    await pool.query(
      "INSERT INTO user_roles(user_id,role) VALUES($1,'administrator')",
      [admin.id],
    )
    await pool.query('UPDATE countries SET is_active=FALSE WHERE id=$1', [
      countryId,
    ])
    expect((await service.listPaymentConflicts(admin)).conflicts).toHaveLength(
      0,
    )
    expect(await decide()).toMatchObject({
      status: 'validation_error',
      errorCode: 'FORBIDDEN',
    })
    await pool.query('UPDATE countries SET is_active=TRUE WHERE id=$1', [
      countryId,
    ])
    expect(await decide()).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    expect(await decide()).toMatchObject({
      status: 'accepted',
      serverVersion: 1,
    })
    const otherId = randomUUID()
    expect(
      await decide(admin, {
        ...event,
        eventId: randomUUID(),
        entityId: otherId,
        payload: { ...event.payload, id: otherId },
      }),
    ).toMatchObject({
      status: 'validation_error',
      errorCode: 'PAYMENT_CONFLICT_ALREADY_RESOLVED',
    })
    const page = await service.pull(actor, { cursor: '0', limit: 500 })
    const decision = page.changes.find(
      (c) =>
        c.entityType === 'payment_conflict_resolution' &&
        c.entityId === resolutionId,
    )
    expect(decision?.payload).toMatchObject({
      ...event.payload,
      entityId: original.entityId,
      canonicalEntityId: original.entityId,
      localPayload: rejected.payload,
      serverPayload: original.payload,
      originAccountId: actor.id,
      resolvedBy: admin.id,
      orderId: children[0]!,
      projectId,
      countryId,
    })
    expect(decision?.payload.resolvedAt).toEqual(expect.any(String))
    expect(
      (await service.listPaymentConflicts(admin)).conflicts.find(
        (c) => c.conflictId === conflict.conflictId,
      )?.resolution?.id,
    ).toBe(resolutionId)
    expect(
      (
        await pool.query(
          'SELECT payload_json FROM procurement_expenditures WHERE id=$1',
          [original.entityId],
        )
      ).rows[0]?.payload_json,
    ).toEqual(original.payload)
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM payment_conflict_resolutions WHERE conflict_id=$1',
          [conflict.conflictId],
        )
      ).rows[0]?.n,
    ).toBe(1)
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_entries WHERE id=$1 AND action='payment_conflict_use_server'",
          [resolutionId],
        )
      ).rows[0]?.n,
    ).toBe(1)
    await expect(
      pool.query(
        "UPDATE payment_conflict_resolutions SET reason='rewrite' WHERE id=$1",
        [resolutionId],
      ),
    ).rejects.toThrow('append-only')
    const winner = {
      ...payment(children[0]!),
      payload: {} as Record<string, unknown>,
    }
    winner.payload = {
      ...original.payload,
      id: winner.entityId,
      status: 'reversed',
      correctsExpenditureId: original.entityId,
      correctionReason: 'First correction',
    }
    expect((await send(actor, winner)).status).toBe('accepted')
    const loser = { ...winner, eventId: randomUUID(), entityId: randomUUID() }
    loser.payload = {
      ...winner.payload,
      id: loser.entityId,
      correctionReason: 'Offline competing correction',
    }
    const rejectedResult = await send(actor, loser)
    expect(rejectedResult).toMatchObject({
      status: 'conflict',
      errorCode: 'PAYMENT_REVERSAL_CONFLICT',
      serverPayload: winner.payload,
      serverVersion: 1,
    })
    expect(await send(actor, loser)).toEqual(rejectedResult)
    const reversalConflict = (
      await service.listPaymentConflicts(admin)
    ).conflicts.find((c) => c.eventId === loser.eventId)!
    const correctionDecisionId = randomUUID()
    const correctionEvent = {
      ...event,
      eventId: randomUUID(),
      entityId: correctionDecisionId,
      payload: {
        ...event.payload,
        id: correctionDecisionId,
        conflictId: reversalConflict.conflictId,
        eventId: loser.eventId,
      },
    }
    // A failure after every business/audit insert must still leave no decision.
    await pool.query(
      `CREATE FUNCTION reject_test_payment_resolution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='payment_conflict_resolution' AND NEW.entity_id='${correctionDecisionId}' THEN RAISE EXCEPTION 'synthetic publication failure'; END IF; RETURN NEW; END $$`,
    )
    await pool.query(
      'CREATE TRIGGER reject_test_payment_resolution BEFORE INSERT ON server_change_log FOR EACH ROW EXECUTE FUNCTION reject_test_payment_resolution()',
    )
    try {
      await expect(decide(admin, correctionEvent)).rejects.toThrow(
        'synthetic publication failure',
      )
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM payment_conflict_resolutions WHERE id=$1',
            [correctionDecisionId],
          )
        ).rows[0]?.n,
      ).toBe(0)
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM sync_events WHERE event_id=$1',
            [correctionEvent.eventId],
          )
        ).rows[0]?.n,
      ).toBe(0)
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM audit_entries WHERE id=$1',
            [correctionDecisionId],
          )
        ).rows[0]?.n,
      ).toBe(0)
    } finally {
      await pool.query(
        'DROP TRIGGER reject_test_payment_resolution ON server_change_log',
      )
      await pool.query('DROP FUNCTION reject_test_payment_resolution()')
    }
    const competingId = randomUUID()
    const results = await Promise.all([
      decide(admin, correctionEvent),
      decide(admin, {
        ...correctionEvent,
        eventId: randomUUID(),
        entityId: competingId,
        payload: { ...correctionEvent.payload, id: competingId },
      }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([
      'accepted',
      'validation_error',
    ])
    const pulled = (
      await service.pull(actor, { cursor: '0', limit: 500 })
    ).changes.filter(
      (c) =>
        c.entityType === 'payment_conflict_resolution' &&
        c.payload.conflictId === reversalConflict.conflictId,
    )
    expect(pulled).toHaveLength(1)
    expect(pulled[0]?.payload).toMatchObject({
      entityId: loser.entityId,
      canonicalEntityId: winner.entityId,
      localPayload: loser.payload,
      serverPayload: winner.payload,
    })
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM procurement_expenditures WHERE corrects_expenditure_id=$1',
          [original.entityId],
        )
      ).rows[0]?.n,
    ).toBe(1)
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM procurement_expenditures WHERE id=$1',
          [loser.entityId],
        )
      ).rows[0]?.n,
    ).toBe(0)
    const staleSource = { ...rejected, eventId: randomUUID() }
    expect((await send(actor, staleSource)).status).toBe('conflict')
    const stale = (await service.listPaymentConflicts(admin)).conflicts.find(
      (c) => c.eventId === staleSource.eventId,
    )!
    await pool.query(
      "UPDATE sync_conflicts SET server_payload_json=jsonb_set(server_payload_json,'{amountMinor}','\"777\"') WHERE id=$1",
      [stale.conflictId],
    )
    const staleId = randomUUID()
    expect(
      await decide(admin, {
        ...event,
        eventId: randomUUID(),
        entityId: staleId,
        payload: {
          ...event.payload,
          id: staleId,
          conflictId: stale.conflictId,
          eventId: staleSource.eventId,
        },
      }),
    ).toMatchObject({
      status: 'validation_error',
      errorCode: 'STALE_PAYMENT_CONFLICT',
    })
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM payment_conflict_resolutions WHERE id=$1',
          [staleId],
        )
      ).rows[0]?.n,
    ).toBe(0)
  })
  it('retries missing receipt dependencies without accepting wrong-order vouchers', async () => {
    const event = payment(children[0]!)
    const receipt = randomUUID()
    event.payload.paymentHandlerId = randomUUID()
    event.payload.receiptId = receipt
    event.payload.counterpartyType = 'market_casual'
    event.payload.counterpartySnapshot = {
      type: 'market_casual',
      supplierId: null,
      name: 'Saved payee',
    }
    event.payload.voucherAttachmentIds = []
    const send = async () =>
      (await service.push(actor, { deviceId, events: [event] })).results[0]
    expect(await send()).toMatchObject({
      status: 'validation_error',
      errorCode: 'PAYMENT_DEPENDENCY_PENDING',
    })
    await pool.query(
      "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES('receipt',$1,1,$2,$3)",
      [receipt, { id: receipt, orderId: children[0], projectId }, actor.id],
    )
    expect((await send())?.status).toBe('accepted')
    expect(
      await store.getEntityPayload('procurement_expenditure', event.entityId),
    ).toMatchObject(event.payload)
    const wrong = payment(children[0]!)
    wrong.payload.receiptId = receipt
    const voucher = randomUUID()
    wrong.payload.voucherAttachmentIds = [voucher]
    await pool.query(
      "INSERT INTO attachments(id,order_id,owner_type,owner_id,project_id,country_id,original_name,content_type,byte_length,checksum,object_key,version_id,status,uploaded_by,created_at,payload_json) VALUES($1::uuid,$2::uuid,'purchase_order',$2::uuid,$3,$4,'wrong.pdf','application/pdf',1,$5,$1::text,'version','uploaded',$6,1,'{}')",
      [voucher, children[1], projectId, countryId, 'b'.repeat(64), actor.id],
    )
    expect(
      (await service.push(actor, { deviceId, events: [wrong] })).results[0]
        ?.status,
    ).toBe('validation_error')
    expect(
      await store.getEntityPayload('procurement_expenditure', wrong.entityId),
    ).toBe(null)
  })
  it('upgrades a baseline server payment without rewriting raw history or losing metadata', async () => {
    const schema = `payment_compat_${randomUUID().replaceAll('-', '')}`
    if (!/^payment_compat_[a-f0-9]+$/.test(schema))
      throw new Error('invalid test schema')
    await pool.query(`CREATE SCHEMA ${schema}`)
    const isolated = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    })
    try {
      const names = (
        await readdir(new URL('../../migrations/', import.meta.url))
      )
        .filter((n) => n.endsWith('.sql'))
        .sort()
      for (const name of names.filter(
        (n) => n !== '012_payment_sync_compatibility.sql',
      ))
        await isolated.query(
          await readFile(
            new URL(`../../migrations/${name}`, import.meta.url),
            'utf8',
          ),
        )
      const [
        user,
        country,
        project,
        department,
        team,
        order,
        receipt,
        voucher,
        id,
      ] = Array.from({ length: 9 }, () => randomUUID())
      await isolated.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale,is_enabled) VALUES($1::uuid,$1::text,$1::text,'fixture','zh-CN',true)",
        [user],
      )
      await isolated.query(
        "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1::uuid,$1::text,'fixture','UTC')",
        [country],
      )
      await isolated.query(
        "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1::uuid,$2,$1::text,'fixture','fixture','fixture','XOF','zh_fr')",
        [project, country],
      )
      await isolated.query(
        "INSERT INTO departments(id,business_code,name) VALUES($1::uuid,$1::text,'fixture')",
        [department],
      )
      await isolated.query(
        "INSERT INTO teams(id,department_id,business_code,name) VALUES($1::uuid,$2,$1::text,'fixture')",
        [team, department],
      )
      await isolated.query(
        'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
        [user, project],
      )
      await isolated.query(
        'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
        [user, project, department, team],
      )
      for (const [kind, entity, payload] of [
        [
          'purchase_order',
          order,
          {
            projectId: project,
            countryId: country,
            departmentId: department,
            teamId: team,
            currency: 'XOF',
            procurementMode: 'honsen_self_purchase',
            workflowStatus: 'executing',
          },
        ],
        [
          'receipt',
          receipt,
          { id: receipt, orderId: order, projectId: project },
        ],
      ] as const)
        await isolated.query(
          'INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by) VALUES($1,$2,1,$3,$4)',
          [kind, entity, payload, user],
        )
      await isolated.query(
        "INSERT INTO attachments(id,order_id,owner_type,owner_id,project_id,country_id,original_name,content_type,byte_length,checksum,object_key,version_id,status,uploaded_by,created_at,payload_json) VALUES($1::uuid,$2::uuid,'purchase_order',$2::uuid,$3,$4,'voucher.pdf','application/pdf',1,$5,$1::text,'version','uploaded',$6,1,'{}')",
        [voucher, order, project, country, 'a'.repeat(64), user],
      )
      const old = {
        id,
        orderId: order,
        projectId: project,
        receiptId: receipt,
        counterpartyType: 'market_casual',
        supplierId: null,
        payeeName: 'Historical payee',
        counterpartySnapshot: {
          type: 'market_casual',
          supplierId: null,
          name: 'Historical snapshot',
        },
        currency: 'XOF',
        amountMinor: '1200',
        paymentDate: '2026-10-15',
        paymentMethod: 'cash',
        paymentHandlerId: randomUUID(),
        notes: 'Retained note',
        status: 'recorded',
        voucherAttachmentIds: [voucher],
      }
      const recorded = '2026-10-15T10:00:00.000Z'
      await isolated.query(
        "INSERT INTO sync_entities(entity_type,entity_id,version,payload_json,updated_by,updated_at) VALUES('procurement_expenditure',$1,1,$2,$3,$4)",
        [id, old, user, recorded],
      )
      await isolated.query(
        "INSERT INTO server_change_log(entity_type,entity_id,operation,version,payload_json,actor_id,changed_at) VALUES('procurement_expenditure',$1,'upsert',1,$2,$3,$4)",
        [id, old, user, recorded],
      )
      await isolated.query(
        await readFile(
          new URL(
            '../../migrations/012_payment_sync_compatibility.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      const upgradedStore = new PostgresSyncStore(isolated)
      const canonical = await upgradedStore.getEntityPayload(
        'procurement_expenditure',
        id!,
      )
      expect(procurementExpenditureSchema.safeParse(canonical).success).toBe(
        true,
      )
      expect(canonical).toMatchObject({
        ...old,
        countryId: country,
        paymentType: 'other',
        createdBy: user,
        createdAt: Date.parse(recorded) / 1000,
      })
      const upgradedActor = {
        id: user!,
        installationId: randomUUID(),
        roles: ['purchaser'] as const,
      }
      const pulled = await upgradedStore.pullChanges({
        actor: upgradedActor,
        cursor: '0',
        limit: 500,
      })
      expect(pulled.changes.find((c) => c.entityId === id)?.payload).toEqual(
        canonical,
      )
      expect(
        (
          await isolated.query(
            "SELECT payload_json FROM sync_entities WHERE entity_type='procurement_expenditure' AND entity_id=$1",
            [id],
          )
        ).rows[0].payload_json,
      ).toEqual(old)
      expect(
        (
          await isolated.query(
            'SELECT payload_json FROM server_change_log WHERE entity_id=$1',
            [id],
          )
        ).rows[0].payload_json,
      ).toEqual(old)
      expect(
        (
          await isolated.query(
            'SELECT payload_json FROM procurement_expenditures WHERE id=$1',
            [id],
          )
        ).rows[0].payload_json,
      ).toEqual(canonical)
      // The baseline archived envelopes lack country/type/creator/time. Keep
      // those originals while publishing a separate verified canonical value.
      await isolated.query(
        "INSERT INTO user_roles(user_id,role) VALUES($1,'administrator')",
        [user],
      )
      const legacyRejected = randomUUID(),
        legacyConflict = randomUUID(),
        legacyDecision = randomUUID()
      const oldLocal = { ...old, amountMinor: '1300' }
      await isolated.query(
        `INSERT INTO sync_events(event_id,installation_id,actor_id,origin_account_id,origin_installation_id,origin_status,origin_attested_at,entity_type,entity_id,operation,base_version,result_status,server_version) VALUES($1,$2,$3,$3,$2,'attested',NOW(),'procurement_expenditure',$4,'upsert',1,'conflict',1)`,
        [legacyRejected, upgradedActor.installationId, user, id],
      )
      await isolated.query(
        `INSERT INTO sync_conflicts(id,event_id,origin_account_id,origin_installation_id,origin_status,entity_type,entity_id,base_version,server_version,local_payload_json,server_payload_json) VALUES($1,$2,$3,$4,'attested','procurement_expenditure',$5,1,1,$6,$7)`,
        [
          legacyConflict,
          legacyRejected,
          user,
          upgradedActor.installationId,
          id,
          oldLocal,
          old,
        ],
      )
      const upgradedAdmin = {
        ...upgradedActor,
        roles: ['administrator'] as const,
      }
      expect(
        (await upgradedStore.listPaymentConflicts(upgradedAdmin)).conflicts[0],
      ).toMatchObject({ localPayload: oldLocal, serverPayload: old })
      const resolution = await new SyncService(upgradedStore).push(
        upgradedAdmin,
        {
          deviceId: upgradedAdmin.installationId,
          events: [
            {
              eventId: randomUUID(),
              entityId: legacyDecision,
              entityType: 'payment_conflict_resolution',
              operation: 'upsert',
              baseVersion: 0,
              payload: {
                id: legacyDecision,
                conflictId: legacyConflict,
                eventId: legacyRejected,
                action: 'use_server',
                reason: 'Verified legacy originals',
              },
            },
          ],
        },
      )
      expect(resolution.results[0]).toMatchObject({
        status: 'accepted',
        serverVersion: 1,
      })
      const reconciled = await upgradedStore.pullChanges({
        actor: upgradedActor,
        cursor: '0',
        limit: 500,
      })
      expect(
        reconciled.changes.find((c) => c.entityId === legacyDecision)?.payload,
      ).toMatchObject({
        localPayload: oldLocal,
        serverPayload: old,
        canonicalPayload: canonical,
      })
      expect(
        (
          await isolated.query(
            "SELECT payload_json FROM sync_entities WHERE entity_type='procurement_expenditure' AND entity_id=$1",
            [id],
          )
        ).rows[0]?.payload_json,
      ).toEqual(old)
      const reversal = randomUUID()
      const result = await new SyncService(upgradedStore).push(upgradedActor, {
        deviceId: upgradedActor.installationId,
        events: [
          {
            eventId: randomUUID(),
            entityType: 'procurement_expenditure',
            entityId: reversal,
            operation: 'upsert',
            baseVersion: 0,
            payload: {
              ...canonical,
              id: reversal,
              status: 'reversed',
              correctsExpenditureId: id,
              correctionReason: 'Synthetic reversal',
              voucherAttachmentIds: [],
            },
          },
        ],
      })
      expect(result.results[0]?.status).toBe('accepted')
    } finally {
      await isolated.end()
      await pool.query(`DROP SCHEMA ${schema} CASCADE`)
    }
  }, 30000)
})
