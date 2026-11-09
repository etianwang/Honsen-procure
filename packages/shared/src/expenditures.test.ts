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

describe('optional settlement classification', () => {
  const bank = {
    kind: 'BANK_TRANSFER',
    recipientType: 'company',
    bankChannel: 'SWIFT',
    bankName: 'TEST bank',
    accountReference: 'TEST123',
    swiftBic: 'TESTCIAB',
    transactionReference: 'TEST-TX',
  }
  const mobile = {
    kind: 'MOBILE_PAYMENT',
    recipientType: 'individual',
    transactionReference: 'TEST-TX',
    channelId: id,
    channelCode: 'TEST',
    countryCode: 'CI',
    channelNameSnapshot: 'TEST channel',
    recipientReference: 'TEST recipient',
  }
  it.each([
    { method: 'cash', details: { kind: 'CASH' } },
    { method: 'bank_transfer', details: bank },
    {
      method: 'other',
      details: {
        kind: 'REMITTANCE',
        recipientType: 'individual',
        providerCode: 'WESTERN_UNION',
        providerName: 'Western Union',
        reference: '1234567890',
        transactionReference: 'TEST-TX',
      },
    },
    { method: 'mobile_payment', details: mobile },
    { method: 'other', details: { kind: 'OTHER', description: 'TEST' } },
  ])('retains validated $method details', ({ method, details }) => {
    expect(
      procurementExpenditureSchema.parse({
        ...base,
        paymentMethod: method,
        settlementDetails: details,
      }).settlementDetails,
    ).toEqual(details)
  })
  it('keeps absent historical classification absent', () =>
    expect(procurementExpenditureSchema.parse(base)).not.toHaveProperty(
      'settlementDetails',
    ))
  it.each([
    { ...bank, swiftBic: undefined },
    { ...bank, bankChannel: 'IBAN', iban: undefined },
    { ...bank, bankChannel: 'OTHER', accountReference: undefined },
    { ...bank, transactionReference: '' },
    { ...mobile, channelId: 'invented' },
    { ...mobile, countryCode: 'ci' },
    { ...mobile, pin: 'secret' },
    {
      kind: 'REMITTANCE',
      recipientType: 'individual',
      providerCode: 'WESTERN_UNION',
      providerName: 'WU',
      reference: '123',
      transactionReference: 'TEST',
    },
  ])('rejects incomplete or unsafe details %#', (settlementDetails) =>
    expect(
      procurementExpenditureSchema.safeParse({
        ...base,
        paymentMethod:
          settlementDetails.kind === 'MOBILE_PAYMENT'
            ? 'mobile_payment'
            : settlementDetails.kind === 'REMITTANCE'
              ? 'other'
              : 'bank_transfer',
        settlementDetails,
      }).success,
    ).toBe(false),
  )
  it('rejects inconsistent legacy method', () =>
    expect(
      procurementExpenditureSchema.safeParse({
        ...base,
        settlementDetails: bank,
      }).success,
    ).toBe(false))
})
