import { describe, it, expect } from 'vitest'
import { parseFormalIssue } from './formal-issue.js'
import { calculateOwnerPrintTotals } from './owner-print-totals.js'
const id = '10000000-0000-4000-8000-000000000001'
const zero = JSON.stringify({ kind: 'fixed_minor', minor: '0' })
function candidate() {
  const base: Record<string, unknown> = {
    procurementMode: 'owner_self_purchase',
    workflowStatus: 'approved',
    countryId: id,
    projectId: id,
    applicantId: id,
    parentOrderId: null,
    primaryCurrency: 'EUR',
    orderDate: '2026-11-05',
    taxRateBasisPoints: 0,
    orderDiscountJson: zero,
    orderFreightJson: zero,
    lines: [
      {
        id,
        currency: 'USD',
        quantity: '2.5',
        ownerQuoteSource: 'manual_reference',
        ownerCatalogPriceId: null,
        ownerManualReferenceReason: 'Synthetic reason',
        ownerManualReferenceActorId: id,
        ownerManualReferenceAt: 1,
        ownerSourceUnitPriceMinor: '2000',
        ownerLockedExchangeRateDecimal: '0.5',
        ownerMarkupJson: zero,
        ownerConvertedReferenceUnitMinor: '1000',
        ownerFinalUnitPriceMinor: '1000',
        lineDiscountJson: zero,
        lineFreightJson: zero,
        freightIncluded: false,
      },
    ],
  }
  base.ownerPrintTotalsJson = JSON.stringify(
    calculateOwnerPrintTotals(base, JSON.parse(zero), JSON.parse(zero)),
  )
  return {
    ...base,
    workflowStatus: 'formally_issued',
    documentType: 'OPA',
    formalDocumentNo: 'TEST-OPA-1',
    formalInstallationId: id,
    formalSequence: '1',
    formallyIssuedAt: 1,
    formalSnapshotJson: JSON.stringify(base),
  } as Record<string, unknown>
}
describe('versioned owner formal amounts trust boundary', () => {
  it('requires manual stamp to match the frozen snapshot and independently calculated totals', () => {
    const value = candidate()
    const snapshot = JSON.parse(String(value.formalSnapshotJson))
    snapshot.manualStampDutyMinor = '37'
    snapshot.ownerPrintTotalsJson = JSON.stringify(
      calculateOwnerPrintTotals(
        snapshot,
        JSON.parse(String(snapshot.orderDiscountJson)),
        JSON.parse(String(snapshot.orderFreightJson)),
      ),
    )
    value.manualStampDutyMinor = '37'
    value.ownerPrintTotalsJson = snapshot.ownerPrintTotalsJson
    value.formalSnapshotJson = JSON.stringify(snapshot)
    expect(parseFormalIssue(value)).not.toBe('invalid')
    expect(parseFormalIssue({ ...value, manualStampDutyMinor: '38' })).toBe(
      'invalid',
    )
    const stripped = { ...value }
    delete stripped.manualStampDutyMinor
    expect(parseFormalIssue(stripped)).toBe('invalid')
    expect(parseFormalIssue({ ...value, manualStampDutyMinor: '-1' })).toBe(
      'invalid',
    )
  })
  it('accepts valid frozen totals and retains legacy absent-field compatibility', () => {
    expect(parseFormalIssue(candidate())).not.toBe('invalid')
    const old = candidate()
    for (const key of [
      'ownerPrintTotalsJson',
      'orderDiscountJson',
      'orderFreightJson',
    ])
      delete old[key]
    const snapshot = JSON.parse(String(old.formalSnapshotJson))
    for (const key of [
      'ownerPrintTotalsJson',
      'orderDiscountJson',
      'orderFreightJson',
    ])
      delete snapshot[key]
    old.formalSnapshotJson = JSON.stringify(snapshot)
    expect(parseFormalIssue(old)).not.toBe('invalid')
  })
  for (const key of [
    'ownerPrintTotalsJson',
    'orderDiscountJson',
    'orderFreightJson',
  ])
    it('rejects stripped ' + key, () => {
      const data = candidate()
      delete data[key]
      expect(parseFormalIssue(data)).toBe('invalid')
    })
  it('rejects fabricated totals even if snapshot and payload agree', () => {
    const data = candidate()
    const totals = JSON.parse(String(data.ownerPrintTotalsJson))
    totals.totalMinor = '1'
    data.ownerPrintTotalsJson = JSON.stringify(totals)
    const snapshot = JSON.parse(String(data.formalSnapshotJson))
    snapshot.ownerPrintTotalsJson = data.ownerPrintTotalsJson
    data.formalSnapshotJson = JSON.stringify(snapshot)
    expect(parseFormalIssue(data)).toBe('invalid')
  })
})

it('rejects stripping all new payload fields while frozen snapshot retains them', () => {
  const data = candidate()
  for (const key of [
    'ownerPrintTotalsJson',
    'orderDiscountJson',
    'orderFreightJson',
  ])
    delete data[key]
  expect(parseFormalIssue(data)).toBe('invalid')
})
