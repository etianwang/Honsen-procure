import { describe, expect, it } from 'vitest'
import { SyncService } from './service.js'
import type { SyncStore } from './types.js'

const engineer = {
  id: '00000000-0000-4000-8000-000000000001',
  roles: ['engineer'] as const,
}
const projectId = '00000000-0000-4000-8000-000000000002'
const departmentId = '00000000-0000-4000-8000-000000000011'
const teamId = '00000000-0000-4000-8000-000000000012'
const countryId = '00000000-0000-4000-8000-000000000013'
const supplierId = '00000000-0000-4000-8000-000000000014'
const purchaser = {
  id: '00000000-0000-4000-8000-000000000020',
  roles: ['purchaser'] as const,
}
const expenditureId = '00000000-0000-4000-8000-000000000021'
const orderId = '00000000-0000-4000-8000-000000000022'

class FixtureStore implements SyncStore {
  pushed = 0
  bound = true
  projectInUse = false
  order: Record<string, unknown> | null = {
    applicantId: engineer.id,
    projectId,
  }
  project: Record<string, unknown> | null = null
  expense: Record<string, unknown> | null = null
  supplier: Record<string, unknown> | null = null

  async pushEvent(input: Parameters<SyncStore['pushEvent']>[0]) {
    this.pushed += 1
    return {
      eventId: input.event.eventId,
      status: 'accepted' as const,
      serverVersion: 1,
    }
  }

  async pullChanges() {
    return { changes: [], nextCursor: '0' }
  }

  async hasActiveProjectBinding(
    _accountId: string,
    _projectId: string,
    departmentId?: string,
    teamId?: string,
  ) {
    if ((departmentId === undefined) !== (teamId === undefined)) return false
    return this.bound
  }

  async hasProjectBusinessUse() {
    return this.projectInUse
  }

  async getEntityPayload(entityType: string) {
    if (entityType === 'project') return this.project
    if (entityType === 'procurement_expenditure') return this.expense
    if (entityType === 'supplier') return this.supplier
    return this.order
  }
}

function purchaseOrderEvent(applicantId = engineer.id) {
  return {
    eventId: '00000000-0000-4000-8000-000000000003',
    entityType: 'purchase_order' as const,
    entityId: '00000000-0000-4000-8000-000000000004',
    operation: 'upsert' as const,
    baseVersion: 0,
    payload: { applicantId, projectId, departmentId, teamId },
  }
}

function expenditureEvent() {
  return {
    eventId: '00000000-0000-4000-8000-000000000023',
    entityType: 'procurement_expenditure' as const,
    entityId: expenditureId,
    operation: 'upsert' as const,
    baseVersion: 0,
    payload: {
      id: expenditureId,
      orderId,
      projectId,
      receiptId: null,
      counterpartyType: 'market_casual',
      supplierId: null,
      counterpartySnapshot: null,
      payeeName: 'fixture payee',
      currency: 'XOF',
      amountMinor: '1200',
      paymentDate: '2026-10-13',
      paymentMethod: 'cash',
      paymentHandlerId: purchaser.id,
      notes: null,
      status: 'recorded',
      correctsExpenditureId: null,
      correctionReason: null,
      createdBy: purchaser.id,
      createdAt: 1,
    },
  }
}

describe('SyncService', () => {
  it('accepts only bound receipt lines from the order and rejects malformed or cross-project writes', async () => {
    const store = new FixtureStore()
    const lineId = '00000000-0000-4000-8000-000000000024'
    const receiptId = '00000000-0000-4000-8000-000000000025'
    store.order = {
      applicantId: engineer.id,
      projectId,
      departmentId,
      teamId,
      lines: [{ id: lineId }],
    }
    const service = new SyncService(store)
    const event = {
      eventId: '00000000-0000-4000-8000-000000000026',
      entityType: 'receipt' as const,
      entityId: receiptId,
      operation: 'upsert' as const,
      baseVersion: 0,
      payload: {
        id: receiptId,
        orderId,
        projectId,
        receiverId: engineer.id,
        receivedAt: '2026-10-13',
        overReceiptReason: null,
        createdBy: engineer.id,
        createdAt: 1,
        completed: false,
        items: [
          {
            id: '00000000-0000-4000-8000-000000000027',
            orderItemId: lineId,
            quantity: '1.5',
            unit: 'pcs',
          },
        ],
        attachmentIds: [],
      },
    }
    const push = (submitted = event) =>
      service.push(engineer, {
        deviceId: '00000000-0000-4000-8000-000000000028',
        events: [submitted],
      })
    expect((await push()).results[0]?.status).toBe('accepted')
    store.bound = false
    expect((await push()).results[0]?.status).toBe('validation_error')
    store.bound = true
    expect(
      (
        await push({
          ...event,
          payload: {
            ...event.payload,
            projectId: '00000000-0000-4000-8000-000000000029',
          },
        })
      ).results[0]?.status,
    ).toBe('validation_error')
    expect(
      (
        await push({
          ...event,
          payload: {
            ...event.payload,
            items: [
              {
                ...event.payload.items[0]!,
                orderItemId: '00000000-0000-4000-8000-000000000030',
              },
            ],
          },
        })
      ).results[0]?.status,
    ).toBe('validation_error')
    expect(store.pushed).toBe(1)
  })
  it('accepts only scoped Honsen expenditure and rejects owner, engineer and invalid corrections', async () => {
    const store = new FixtureStore()
    store.order = {
      projectId,
      departmentId,
      teamId,
      procurementMode: 'honsen_self_purchase',
      workflowStatus: 'executing',
      countryId,
    }
    const service = new SyncService(store)
    const push = (
      actor: typeof purchaser | typeof engineer,
      event: Parameters<
        SyncStore['pushEvent']
      >[0]['event'] = expenditureEvent(),
    ) =>
      service.push(actor, {
        deviceId: '00000000-0000-4000-8000-000000000005',
        events: [event],
      })
    expect((await push(purchaser)).results[0]?.status).toBe('accepted')
    expect((await push(engineer)).results[0]?.status).toBe('validation_error')
    store.bound = false
    expect((await push(purchaser)).results[0]?.status).toBe('validation_error')
    store.bound = true
    store.order = {
      projectId,
      departmentId,
      teamId,
      procurementMode: 'owner_self_purchase',
      workflowStatus: 'executing',
    }
    expect((await push(purchaser)).results[0]?.status).toBe('validation_error')
    store.order = {
      projectId,
      departmentId,
      teamId,
      procurementMode: 'honsen_self_purchase',
      workflowStatus: 'approved',
    }
    expect((await push(purchaser)).results[0]?.status).toBe('validation_error')
    store.order = {
      projectId,
      departmentId,
      teamId,
      procurementMode: 'honsen_self_purchase',
      workflowStatus: 'executing',
      countryId,
    }
    const malformed = expenditureEvent()
    malformed.payload.amountMinor = '0'
    expect((await push(purchaser, malformed)).results[0]?.status).toBe(
      'validation_error',
    )
    const unlinked = expenditureEvent()
    unlinked.payload.status = 'reversed'
    expect((await push(purchaser, unlinked)).results[0]?.status).toBe(
      'validation_error',
    )
    const reversal = {
      ...expenditureEvent(),
      entityId: '00000000-0000-4000-8000-000000000024',
      payload: {
        ...expenditureEvent().payload,
        id: '00000000-0000-4000-8000-000000000024',
        status: 'reversed',
        correctsExpenditureId: expenditureId,
        correctionReason: 'fixture correction',
      },
    }
    store.expense = expenditureEvent().payload
    expect((await push(purchaser, reversal)).results[0]?.status).toBe(
      'accepted',
    )
    reversal.payload.amountMinor = '1300'
    expect((await push(purchaser, reversal)).results[0]?.status).toBe(
      'validation_error',
    )
    expect(store.pushed).toBe(2)
    store.supplier = { countryId, name: 'new supplier name' }
    const registered = {
      ...expenditureEvent(),
      payload: {
        ...expenditureEvent().payload,
        counterpartyType: 'registered_supplier',
        supplierId,
        counterpartySnapshot: {
          id: supplierId,
          name: 'historical supplier name',
          countryId,
        },
        payeeName: 'historical supplier name',
      },
    }
    expect((await push(purchaser, registered)).results[0]?.status).toBe(
      'accepted',
    )
  })
  it('accepts an engineer order only for the engineer and a bound project', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)

    const response = await service.push(engineer, {
      deviceId: '00000000-0000-4000-8000-000000000005',
      events: [purchaseOrderEvent()],
    })

    expect(response.results[0]?.status).toBe('accepted')
    expect(store.pushed).toBe(1)
  })

  it('rejects an engineer attempt to write another applicant order without mutation', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)

    const response = await service.push(engineer, {
      deviceId: '00000000-0000-4000-8000-000000000005',
      events: [purchaseOrderEvent('00000000-0000-4000-8000-000000000006')],
    })

    expect(response.results[0]).toMatchObject({ status: 'validation_error' })
    expect(store.pushed).toBe(0)
  })

  it('rejects an engineer order that omits the scoped department and team', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)
    const event = {
      ...purchaseOrderEvent(),
      payload: { applicantId: engineer.id, projectId },
    }
    const response = await service.push(engineer, {
      deviceId: '00000000-0000-4000-8000-000000000005',
      events: [event],
    })
    expect(response.results[0]).toMatchObject({ status: 'validation_error' })
    expect(store.pushed).toBe(0)
  })

  it('accepts an engineer comment only for their own bound-project order', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)
    const response = await service.push(engineer, {
      deviceId: '00000000-0000-4000-8000-000000000005',
      events: [
        {
          eventId: '00000000-0000-4000-8000-000000000007',
          entityType: 'order_comment',
          entityId: '00000000-0000-4000-8000-000000000008',
          operation: 'upsert',
          baseVersion: 0,
          payload: {
            orderId: '00000000-0000-4000-8000-000000000004',
            authorId: engineer.id,
            projectId,
            body: 'fixture',
          },
        },
      ],
    })
    expect(response.results[0]?.status).toBe('accepted')
    expect(store.pushed).toBe(1)
  })

  it('rejects a comment tombstone without mutation', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)
    const response = await service.push(engineer, {
      deviceId: '00000000-0000-4000-8000-000000000005',
      events: [
        {
          ...purchaseOrderEvent(),
          entityType: 'order_comment',
          operation: 'soft_delete',
          payload: {
            orderId: '00000000-0000-4000-8000-000000000004',
            authorId: engineer.id,
            projectId,
          },
        },
      ],
    })
    expect(response.results[0]).toMatchObject({ status: 'validation_error' })
    expect(store.pushed).toBe(0)
  })

  it('rejects an invalid country sync payload without mutation', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)
    const response = await service.push(
      { id: engineer.id, roles: ['administrator'] },
      {
        deviceId: '00000000-0000-4000-8000-000000000005',
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000009',
            entityType: 'country',
            entityId: '00000000-0000-4000-8000-000000000010',
            operation: 'upsert',
            baseVersion: 0,
            payload: { name: 'missing required fields' },
          },
        ],
      },
    )
    expect(response.results[0]).toMatchObject({ status: 'validation_error' })
    expect(store.pushed).toBe(0)
  })

  it('accepts the snake_case country payload emitted by the desktop outbox', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)
    const response = await service.push(
      { id: engineer.id, roles: ['administrator'] },
      {
        deviceId: '00000000-0000-4000-8000-000000000005',
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000009',
            entityType: 'country',
            entityId: '00000000-0000-4000-8000-000000000010',
            operation: 'upsert',
            baseVersion: 0,
            payload: {
              kind: 'country',
              business_code: 'SN',
              name: 'fixture country',
              time_zone: 'Africa/Dakar',
              is_active: true,
              version: 1,
            },
          },
        ],
      },
    )
    expect(response.results[0]).toMatchObject({ status: 'accepted' })
    expect(store.pushed).toBe(1)
  })

  it('rejects changing a used project country without mutation', async () => {
    const store = new FixtureStore()
    store.projectInUse = true
    store.project = { country_id: '00000000-0000-4000-8000-000000000011' }
    const service = new SyncService(store)
    const response = await service.push(
      { id: engineer.id, roles: ['administrator'] },
      {
        deviceId: '00000000-0000-4000-8000-000000000005',
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000009',
            entityType: 'project',
            entityId: '00000000-0000-4000-8000-000000000010',
            operation: 'upsert',
            baseVersion: 1,
            payload: {
              business_code: 'P',
              name: 'project',
              country_id: '00000000-0000-4000-8000-000000000012',
              site: 'site',
              department_name: 'department',
              default_currency: 'XOF',
              default_language_pair: 'zh_fr',
              is_active: true,
            },
          },
        ],
      },
    )
    expect(response.results[0]).toMatchObject({ status: 'validation_error' })
    expect(store.pushed).toBe(0)
  })
})
