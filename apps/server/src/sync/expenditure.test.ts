import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SyncService } from './service.js'
import type { SyncStore } from './types.js'

const actor = {
  id: randomUUID(),
  installationId: randomUUID(),
  roles: ['purchaser'] as const,
}
const orderId = randomUUID()
const projectId = randomUUID()
const countryId = randomUUID()
const payload = () => ({
  id: randomUUID(),
  orderId,
  projectId,
  countryId,
  payeeName: 'Synthetic payee',
  currency: 'XOF',
  amountMinor: '100',
  paymentDate: '2026-10-24',
  paymentType: 'progress',
  paymentMethod: 'cash',
  paymentHandlerId: actor.id,
  createdBy: actor.id,
  status: 'recorded',
  createdAt: 1792800000,
})

function fixture() {
  const order = {
    projectId,
    countryId,
    departmentId: randomUUID(),
    teamId: randomUUID(),
    currency: 'XOF',
    procurementMode: 'honsen_self_purchase',
    workflowStatus: 'executing',
  }
  const store: SyncStore = {
    async pushEvent({ event }) {
      return { eventId: event.eventId, status: 'accepted', serverVersion: 1 }
    },
    async pullChanges() {
      return { changes: [], nextCursor: '0' }
    },
    async hasActiveProjectBinding() {
      return true
    },
    async isCompatibleProjectTax() {
      return true
    },
    async hasProjectBusinessUse() {
      return true
    },
    async getEntityPayload() {
      return order
    },
  }
  return { order, store, service: new SyncService(store) }
}
async function push(service: SyncService, data: Record<string, unknown>) {
  return (
    await service.push(actor, {
      deviceId: randomUUID(),
      events: [
        {
          eventId: randomUUID(),
          entityType: 'procurement_expenditure',
          entityId: data.id,
          operation: 'upsert',
          baseVersion: 0,
          payload: data,
        },
      ],
    })
  ).results[0]?.status
}
describe('payment sync validation', () => {
  it('accepts an actual payment with exact integer minor units', async () => {
    expect(await push(fixture().service, payload())).toBe('accepted')
  })
  it('retains independent actual handler while rejecting a forged record creator', async () => {
    const actualHandler = randomUUID()
    expect(
      await push(fixture().service, {
        ...payload(),
        paymentHandlerId: actualHandler,
      }),
    ).toBe('accepted')
    expect(
      await push(fixture().service, { ...payload(), createdBy: actualHandler }),
    ).toBe('validation_error')
  })
  it('checks the payment order department/team scope and denies revoked bindings', async () => {
    const { store, order, service } = fixture()
    let enabled = true
    store.hasActiveProjectBinding = async (
      account,
      project,
      department,
      team,
    ) =>
      enabled &&
      account === actor.id &&
      project === projectId &&
      department === order.departmentId &&
      team === order.teamId
    expect(await push(service, payload())).toBe('accepted')
    enabled = false
    expect(await push(service, payload())).toBe('validation_error')
    enabled = true
    store.getEntityPayload = async () => ({ ...order, departmentId: null })
    expect(await push(service, payload())).toBe('validation_error')
  })
  it.each([
    { currency: 'EUR' },
    { amountMinor: '9223372036854775808' },
    { paymentDate: '2026-02-30' },
    { orderId: 'not-a-uuid' },
    { status: 'reversed' },
    { createdAt: -1 },
    { correctsExpenditureId: randomUUID() },
  ])('rejects malformed or incompatible payment %j', async (change) => {
    expect(await push(fixture().service, { ...payload(), ...change })).toBe(
      'validation_error',
    )
  })
  it('rejects a revoked project binding', async () => {
    const { store, service } = fixture()
    store.hasActiveProjectBinding = async () => false
    expect(await push(service, payload())).toBe('validation_error')
  })
  it('rejects a payment against a draft order', async () => {
    const { order, service } = fixture()
    order.workflowStatus = 'draft'
    expect(await push(service, payload())).toBe('validation_error')
  })
})
