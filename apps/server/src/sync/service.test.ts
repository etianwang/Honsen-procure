import { randomUUID } from 'node:crypto'
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

class FixtureStore implements SyncStore {
  pushed = 0
  bound = true
  projectInUse = false
  order: Record<string, unknown> | null = {
    applicantId: engineer.id,
    projectId,
  }
  project: Record<string, unknown> | null = null

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
    return entityType === 'project' ? this.project : this.order
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

describe('SyncService', () => {
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

  it('validates organization outbox payloads and permits the master-data roles only', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)
    const departmentId = randomUUID()
    const events = [
      {
        eventId: randomUUID(),
        entityType: 'department',
        entityId: departmentId,
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          kind: 'department',
          business_code: 'fixture-proc',
          name: 'Procurement',
          is_active: true,
          version: 1,
        },
      },
      {
        eventId: randomUUID(),
        entityType: 'team',
        entityId: randomUUID(),
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          kind: 'team',
          department_id: departmentId,
          business_code: 'fixture-team',
          name: 'Field team',
          is_active: true,
          version: 1,
        },
      },
      {
        eventId: randomUUID(),
        entityType: 'unit',
        entityId: randomUUID(),
        operation: 'upsert',
        baseVersion: 0,
        payload: {
          kind: 'unit',
          business_code: 'fixture-ea',
          name: 'Each',
          is_active: true,
          version: 1,
        },
      },
    ]
    const request = { deviceId: randomUUID(), events }
    const denied = await service.push(engineer, request)
    expect(denied.results.map((result) => result.status)).toEqual([
      'validation_error',
      'validation_error',
      'validation_error',
    ])
    expect(store.pushed).toBe(0)
    const accepted = await service.push(
      { id: engineer.id, roles: ['super_administrator'] },
      request,
    )
    expect(accepted.results.map((result) => result.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
    ])
    expect(store.pushed).toBe(3)
    const invalid = await service.push(
      { id: engineer.id, roles: ['administrator'] },
      {
        deviceId: randomUUID(),
        events: [
          {
            ...events[0],
            eventId: randomUUID(),
            payload: { ...events[0]!.payload, name: '' },
          },
          {
            ...events[1],
            eventId: randomUUID(),
            payload: { ...events[1]!.payload, department_id: 'not-a-uuid' },
          },
          {
            ...events[2],
            eventId: randomUUID(),
            payload: { ...events[2]!.payload, business_code: 'bad code' },
          },
          { ...events[2], eventId: randomUUID(), operation: 'soft_delete' },
        ],
      },
    )
    expect(
      invalid.results.every((result) => result.status === 'validation_error'),
    ).toBe(true)
    expect(store.pushed).toBe(3)
  })

  it('validates tax and exchange-rate outbox records before persistence', async () => {
    const store = new FixtureStore()
    const service = new SyncService(store)
    const tax = {
      eventId: randomUUID(),
      entityType: 'tax_template',
      entityId: randomUUID(),
      operation: 'upsert',
      baseVersion: 0,
      payload: {
        business_code: 'FIXTURE-TAX',
        name: 'Fixture tax',
        country_id: null,
        rate_basis_points: 1800,
        effective_at: '2026-10-15',
        is_active: true,
        version: 1,
      },
    }
    const rate = {
      eventId: randomUUID(),
      entityType: 'exchange_rate',
      entityId: randomUUID(),
      operation: 'upsert',
      baseVersion: 0,
      payload: {
        from_currency: 'XOF',
        to_currency: 'EUR',
        rate_decimal: '0.00152449',
        effective_at: '2026-10-15',
        source: 'manual',
        reason: 'Fixture rate',
        version: 1,
      },
    }
    const request = { deviceId: randomUUID(), events: [tax, rate] }
    const denied = await service.push(engineer, request)
    expect(denied.results.map((result) => result.status)).toEqual([
      'validation_error',
      'validation_error',
    ])
    expect(store.pushed).toBe(0)
    const accepted = await service.push(
      { id: engineer.id, roles: ['super_administrator'] },
      request,
    )
    expect(accepted.results.map((result) => result.status)).toEqual([
      'accepted',
      'accepted',
    ])
    const camelCaseNullCountry = await service.push(
      { id: engineer.id, roles: ['administrator'] },
      {
        deviceId: randomUUID(),
        events: [
          {
            ...tax,
            eventId: randomUUID(),
            payload: {
              businessCode: 'FIXTURE-TAX-2',
              name: 'Fixture tax 2',
              countryId: null,
              rateBasisPoints: 0,
              effectiveAt: '2026-10-15',
              isActive: true,
              version: 1,
            },
          },
        ],
      },
    )
    expect(camelCaseNullCountry.results[0]?.status).toBe('accepted')
    const invalid = await service.push(
      { id: engineer.id, roles: ['administrator'] },
      {
        deviceId: randomUUID(),
        events: [
          {
            ...tax,
            eventId: randomUUID(),
            payload: { ...tax.payload, rate_basis_points: -1 },
          },
          {
            ...rate,
            eventId: randomUUID(),
            payload: { ...rate.payload, reason: null },
          },
          {
            ...rate,
            eventId: randomUUID(),
            payload: { ...rate.payload, rate_decimal: 'NaN' },
          },
          { ...tax, eventId: randomUUID(), operation: 'soft_delete' },
        ],
      },
    )
    expect(
      invalid.results.every((result) => result.status === 'validation_error'),
    ).toBe(true)
    expect(store.pushed).toBe(3)
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
