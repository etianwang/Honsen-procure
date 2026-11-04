import { randomUUID } from 'node:crypto'
import {
  parseFormalIssue,
  formalShortCode,
} from '../../apps/server/src/sync/formal-issue.ts'
// Mirrors the existing spo-formal-postgres fixture's issued model.
const actorId = randomUUID(),
  countryId = randomUUID(),
  projectId = randomUUID()
const installationId = randomUUID(),
  orderId = randomUUID()
const draft = {
  id: orderId,
  countryId,
  projectId,
  departmentId: randomUUID(),
  teamId: randomUUID(),
  applicantId: actorId,
  parentOrderId: randomUUID(),
  procurementMode: null,
  workflowStatus: 'draft',
  confirmedBy: null,
  confirmedAt: null,
  selfApproved: false,
  primaryCurrency: 'XOF',
  orderDate: '2026-11-04',
  supplierId: randomUUID(),
  supplierSnapshotJson: JSON.stringify({ name: 'Synthetic fournisseur 合成' }),
  supplierTermsCompletedAt: 1792022400,
  currency: 'XOF',
  lockedExchangeRateDecimal: '1',
  lines: [
    {
      id: randomUUID(),
      currency: 'XOF',
      quantity: '1',
      unit: 'pcs',
      unitPriceMinor: '250',
      lineTotalMinor: '250',
      priceSource: 'manual',
      nameZh: '合成材料',
      nameFr: 'Échantillon',
    },
  ],
}
const issued = {
  ...draft,
  workflowStatus: 'completed',
  documentType: 'SPO',
  formalDocumentNo: `RESTORE-COUNTRY-RESTORE-PROJECT-20261104-SPO-${formalShortCode(installationId)}-1`,
  formalInstallationId: installationId,
  formalSequence: '1',
  formallyIssuedAt: 1792022401,
  formalSnapshotJson: JSON.stringify(draft),
}
const parsed = parseFormalIssue(issued)
if (!parsed || parsed === 'invalid')
  throw new Error('Synthetic issued model rejected by production formal parser')
const literal = JSON.stringify(issued).replaceAll("'", "''")
process.stdout.write(
  `CREATE TEMP TABLE restore_payload(payload jsonb); INSERT INTO restore_payload VALUES ('${literal}'::jsonb);\n`,
)
