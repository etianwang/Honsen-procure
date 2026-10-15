import { isDeepStrictEqual } from 'node:util'
import {
  adjustmentSchema,
  calculateOwnerLinePrice,
  currencySchema,
  uuidSchema,
} from '@honsen/shared'

export type FormalIssue = {
  documentType: 'OPA'
  documentNo: string
  installationId: string
  sequence: string
  snapshot: Record<string, unknown>
  countryId: string
  projectId: string
  orderDate: string
}

export function parseFormalIssue(
  payload: Record<string, unknown>,
): FormalIssue | 'invalid' | null {
  if (
    payload.formalDocumentNo == null &&
    payload.formalInstallationId == null &&
    payload.formalSequence == null &&
    payload.formalSnapshotJson == null
  )
    return payload.workflowStatus === 'formally_issued' ? 'invalid' : null

  const {
    documentType,
    formalDocumentNo,
    formalInstallationId,
    formalSequence,
    formalSnapshotJson,
    countryId,
    projectId,
    orderDate,
    primaryCurrency,
    lines,
  } = payload
  const parsedInstallationId = uuidSchema.safeParse(formalInstallationId)
  const parsedCountryId = uuidSchema.safeParse(countryId)
  const parsedProjectId = uuidSchema.safeParse(projectId)
  const parsedPrimaryCurrency = currencySchema.safeParse(primaryCurrency)
  if (
    documentType !== 'OPA' ||
    payload.procurementMode !== 'owner_self_purchase' ||
    ![
      'formally_issued',
      'receiving',
      'completed',
      'completed_with_conditions',
      'cancelled',
    ].includes(String(payload.workflowStatus)) ||
    typeof formalDocumentNo !== 'string' ||
    !parsedInstallationId.success ||
    typeof formalSequence !== 'string' ||
    !/^[1-9]\d*$/.test(formalSequence) ||
    BigInt(formalSequence) > 9223372036854775807n ||
    typeof formalSnapshotJson !== 'string' ||
    typeof payload.formallyIssuedAt !== 'number' ||
    !Number.isSafeInteger(payload.formallyIssuedAt) ||
    payload.formallyIssuedAt <= 0 ||
    !parsedCountryId.success ||
    !parsedProjectId.success ||
    typeof orderDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(orderDate) ||
    !parsedPrimaryCurrency.success ||
    !Array.isArray(lines) ||
    lines.length === 0
  )
    return 'invalid'

  let snapshot: unknown
  try {
    snapshot = JSON.parse(formalSnapshotJson)
  } catch {
    return 'invalid'
  }
  if (!isRecord(snapshot)) return 'invalid'
  if (
    snapshot.procurementMode !== 'owner_self_purchase' ||
    !['approved', 'confirmed'].includes(String(snapshot.workflowStatus)) ||
    snapshot.countryId !== countryId ||
    snapshot.projectId !== projectId ||
    snapshot.primaryCurrency !== primaryCurrency ||
    snapshot.orderDate !== orderDate ||
    !isDeepStrictEqual(snapshot.lines, lines)
  )
    return 'invalid'

  for (const line of lines) {
    if (!isRecord(line)) return 'invalid'
    const markup = parseMarkup(line.ownerMarkupJson)
    const parsedLineId = uuidSchema.safeParse(line.id)
    const parsedSourceCurrency = currencySchema.safeParse(line.currency)
    if (
      !parsedLineId.success ||
      !parsedSourceCurrency.success ||
      typeof line.ownerSourceUnitPriceMinor !== 'string' ||
      typeof line.ownerLockedExchangeRateDecimal !== 'string' ||
      !/[1-9]/.test(line.ownerLockedExchangeRateDecimal) ||
      !markup
    )
      return 'invalid'
    if (line.ownerQuoteSource === 'manual_reference') {
      if (
        line.ownerCatalogPriceId !== null ||
        typeof line.ownerManualReferenceReason !== 'string' ||
        !line.ownerManualReferenceReason.trim() ||
        !uuidSchema.safeParse(line.ownerManualReferenceActorId).success ||
        typeof line.ownerManualReferenceAt !== 'number'
      )
        return 'invalid'
    } else if (line.ownerQuoteSource === 'catalog_price') {
      if (
        !uuidSchema.safeParse(line.ownerCatalogPriceId).success ||
        line.ownerManualReferenceReason !== null
      )
        return 'invalid'
    } else return 'invalid'
    try {
      const price = calculateOwnerLinePrice({
        lineId: parsedLineId.data,
        sourceCurrency: parsedSourceCurrency.data,
        primaryCurrency: parsedPrimaryCurrency.data,
        lockedExchangeRateDecimal: line.ownerLockedExchangeRateDecimal,
        sourceUnitPriceMinor: line.ownerSourceUnitPriceMinor,
        markup,
      })
      if (
        price.convertedReferenceUnitMinor !==
          line.ownerConvertedReferenceUnitMinor ||
        price.finalUnitPriceMinor !== line.ownerFinalUnitPriceMinor
      )
        return 'invalid'
    } catch {
      return 'invalid'
    }
  }
  return {
    documentType,
    documentNo: formalDocumentNo,
    installationId: parsedInstallationId.data,
    sequence: formalSequence,
    snapshot,
    countryId: parsedCountryId.data,
    projectId: parsedProjectId.data,
    orderDate,
  }
}

export function formalShortCode(installationId: string): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let bits = BigInt(`0x${installationId.replaceAll('-', '')}`)
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code = alphabet[Number(bits & 31n)] + code
    bits >>= 5n
  }
  return code
}

function parseMarkup(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const result = adjustmentSchema.safeParse(JSON.parse(value))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
