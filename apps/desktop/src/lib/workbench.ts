import type {
  RequisitionApi,
  RequisitionHistoryCursor,
  RequisitionHistoryPage,
} from './requisition-api'

export async function loadWorkbench(
  api: Pick<RequisitionApi, 'listRequisitionHistory'>,
  projectId?: string,
) {
  const saved = new Map<string, RequisitionHistoryPage['records'][number]>()
  const cursors = new Set<string>()
  let cursor: RequisitionHistoryCursor | undefined
  do {
    const page = await api.listRequisitionHistory(cursor, { projectId })
    for (const record of page.records) saved.set(record.id, record)
    cursor = page.nextCursor ?? undefined
    if (cursor) {
      const key = `${cursor.updatedAt}:${cursor.id}`
      if (cursors.has(key)) throw new Error('History cursor did not advance')
      cursors.add(key)
    }
  } while (cursor)
  const records = [...saved.values()]
  const orders = records.filter(
    (record) =>
      !['completed', 'completed_with_conditions', 'cancelled'].includes(
        record.workflowStatus,
      ),
  )
  const amounts = new Map<string, bigint>()
  for (const record of records) {
    if (record.workflowStatus === 'cancelled') continue
    if (!/^\d+$/.test(record.totalMinor))
      throw new Error('Invalid saved amount')
    amounts.set(
      record.primaryCurrency,
      (amounts.get(record.primaryCurrency) ?? 0n) + BigInt(record.totalMinor),
    )
  }
  return {
    orders,
    counts: {
      pending_confirmation: orders.filter(
        (record) => record.workflowStatus === 'pending_confirmation',
      ).length,
      purchasing: orders.filter((record) =>
        ['approved', 'confirmed', 'executing'].includes(record.workflowStatus),
      ).length,
      receiving: orders.filter((record) =>
        ['formally_issued', 'receiving'].includes(record.workflowStatus),
      ).length,
    },
    amounts: [...amounts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, minor]) => ({ currency, minor: minor.toString() })),
  }
}
