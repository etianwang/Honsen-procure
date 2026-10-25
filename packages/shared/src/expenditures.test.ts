import { describe, it, expect } from 'vitest'
import { procurementExpenditureSchema } from './expenditures.js'
const id = '00000000-0000-4000-8000-000000000001'
const base = {
  id,
  orderId: id,
  projectId: id,
  countryId: id,
  payeeName: 'Synthetic',
  currency: 'XOF',
  amountMinor: '100',
  paymentDate: '2026-10-24',
  paymentType: 'other',
  paymentMethod: 'cash',
  paymentHandlerId: id,
  createdBy: id,
  createdAt: 1,
  status: 'recorded',
}
describe('payment metadata compatibility', () => {
  it('retains receipt, counterparty snapshot and voucher identities', () => {
    const payload = {
      ...base,
      receiptId: id,
      counterpartyType: 'market_casual',
      supplierId: null,
      counterpartySnapshot: {
        type: 'market_casual',
        supplierId: null,
        name: 'Archived name',
      },
      voucherAttachmentIds: [id],
    }
    expect(procurementExpenditureSchema.parse(payload)).toEqual(payload)
  })
  it('does not invent absent historical snapshots', () => {
    expect(procurementExpenditureSchema.parse(base)).not.toHaveProperty(
      'counterpartySnapshot',
    )
  })
  it.each([
    { counterpartyType: 'market_casual', supplierId: id },
    { voucherAttachmentIds: [id, id] },
    {
      counterpartyType: 'registered_supplier',
      supplierId: id,
      counterpartySnapshot: {
        type: 'market_casual',
        supplierId: null,
        name: 'bad',
      },
    },
  ])('rejects invalid metadata %j', (extra) => {
    expect(
      procurementExpenditureSchema.safeParse({ ...base, ...extra }).success,
    ).toBe(false)
  })
})
