import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { formalShortCode, parseFormalIssue } from './formal-issue.js'

function hpaFixture() {
  const installationId = randomUUID()
  const snapshot = {
    countryId: randomUUID(),
    projectId: randomUUID(),
    applicantId: randomUUID(),
    procurementMode: 'honsen_self_purchase',
    workflowStatus: 'approved',
    confirmedBy: randomUUID(),
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
      },
    ],
  }
  return {
    ...snapshot,
    workflowStatus: 'executing',
    documentType: 'HPA',
    formalDocumentNo: `HPA-C-HPA-P-20261015-HPA-${formalShortCode(installationId)}-1`,
    formalInstallationId: installationId,
    formalSequence: '1',
    formallyIssuedAt: 1792022400,
    formalSnapshotJson: JSON.stringify(snapshot),
  }
}

describe('HPA formal snapshot', () => {
  it('accepts the approved Honsen snapshot without owner pricing and keeps it in receiving', () => {
    const payload = hpaFixture()
    expect(parseFormalIssue(payload)).toMatchObject({
      documentType: 'HPA',
      snapshot: JSON.parse(payload.formalSnapshotJson),
    })
    expect(
      parseFormalIssue({ ...payload, workflowStatus: 'receiving' }),
    ).toMatchObject({ documentType: 'HPA' })
  })

  it('rejects cross-mode, unapproved, changed-line and invalid-money HPA payloads', () => {
    const payload = hpaFixture()
    for (const invalid of [
      { ...payload, procurementMode: 'owner_self_purchase' },
      { ...payload, workflowStatus: 'formally_issued' },
      { ...payload, documentType: 'SPO' },
      {
        ...payload,
        lines: [payload.lines[0], payload.lines[0]],
        formalSnapshotJson: JSON.stringify({
          ...JSON.parse(payload.formalSnapshotJson),
          lines: [payload.lines[0], payload.lines[0]],
        }),
      },
      {
        ...payload,
        formalSnapshotJson: JSON.stringify({
          ...JSON.parse(payload.formalSnapshotJson),
          workflowStatus: 'draft',
        }),
      },
      { ...payload, lines: [{ ...payload.lines[0], unitPriceMinor: '1' }] },
      ...['1.2', '-1', '9223372036854775808'].map((minor) => {
        const lines = [{ ...payload.lines[0], unitPriceMinor: minor }]
        return {
          ...payload,
          lines,
          formalSnapshotJson: JSON.stringify({
            ...JSON.parse(payload.formalSnapshotJson),
            lines,
          }),
        }
      }),
    ])
      expect(parseFormalIssue(invalid)).toBe('invalid')
  })
})
