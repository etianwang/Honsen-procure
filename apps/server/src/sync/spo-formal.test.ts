import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseFormalIssue } from './formal-issue.js'

function fixture() {
  const draft = {
    parentOrderId: randomUUID(),
    supplierId: randomUUID(),
    supplierSnapshotJson: JSON.stringify({ name: 'synthetic' }),
    supplierTermsCompletedAt: 1,
    procurementMode: null,
    workflowStatus: 'draft',
    countryId: randomUUID(),
    projectId: randomUUID(),
    applicantId: randomUUID(),
    currency: 'CNY',
    primaryCurrency: 'XOF',
    lockedExchangeRateDecimal: '76.5',
    orderDate: '2026-11-04',
    lines: [
      {
        id: randomUUID(),
        currency: 'CNY',
        quantity: '2',
        unit: 'pcs',
        unitPriceMinor: '1250',
        lineTotalMinor: '2500',
      },
    ],
  }
  return {
    ...draft,
    workflowStatus: 'sent',
    documentType: 'SPO',
    formalDocumentNo: 'C-P-20261104-SPO-00000001-1',
    formalInstallationId: randomUUID(),
    formalSequence: '1',
    formallyIssuedAt: 2,
    formalSnapshotJson: JSON.stringify(draft),
  }
}
describe('SPO frozen wire validation', () => {
  it('accepts child currency without owner repricing and rejects missing/changed supplier, terms or cross-mode shape', () => {
    const value = fixture()
    expect(parseFormalIssue(value)).toMatchObject({ documentType: 'SPO' })
    for (const changed of [
      { ...value, parentOrderId: null },
      { ...value, supplierId: randomUUID() },
      { ...value, supplierTermsCompletedAt: null },
      { ...value, procurementMode: 'owner_self_purchase' },
      { ...value, lines: [{ ...value.lines[0], currency: 'XOF' }] },
      { ...value, lines: [{ ...value.lines[0], ownerMarkupJson: '{}' }] },
    ])
      expect(parseFormalIssue(changed)).toBe('invalid')
  })
})
