import { describe, expect, it } from 'vitest'
import { loadWorkbench } from './workbench'
import type { RequisitionHistoryPage } from './requisition-api'

describe('saved-order workbench', () => {
  it('reads every authorized page and separates currencies and closed orders', async () => {
    const first = {
      id: 'a',
      displayNo: 'A',
      projectName: 'project',
      site: 'site',
      procurementMode: 'honsen_self_purchase',
      workflowStatus: 'confirmed',
      primaryCurrency: 'XOF',
      totalMinor: '9007199254740993',
      updatedAt: 3,
    }
    const pages: RequisitionHistoryPage[] = [
      { records: [first], nextCursor: { id: 'a', updatedAt: 3 } },
      {
        records: [
          {
            ...first,
            id: 'b',
            workflowStatus: 'receiving',
            primaryCurrency: 'USD',
            totalMinor: '125',
          },
          { ...first, id: 'c', workflowStatus: 'completed', totalMinor: '7' },
          { ...first, id: 'd', workflowStatus: 'cancelled', totalMinor: '100' },
          {
            ...first,
            id: 'e',
            workflowStatus: 'pending_confirmation',
            totalMinor: '5',
          },
        ],
        nextCursor: null,
      },
    ]
    const requested: unknown[] = []
    const result = await loadWorkbench(
      {
        listRequisitionHistory: async (cursor, filter) => {
          requested.push([cursor, filter])
          return pages.shift()!
        },
      },
      'project-id',
    )
    expect(requested).toEqual([
      [undefined, { projectId: 'project-id' }],
      [{ id: 'a', updatedAt: 3 }, { projectId: 'project-id' }],
    ])
    expect(result.counts).toEqual({
      pending_confirmation: 1,
      purchasing: 1,
      receiving: 1,
    })
    expect(result.amounts).toEqual([
      { currency: 'USD', minor: '125' },
      { currency: 'XOF', minor: '9007199254741005' },
    ])
    expect(result.orders.map((order) => order.id)).toEqual(['a', 'b', 'e'])
  })

  it('fails the whole read on a later-page error instead of presenting partial totals', async () => {
    let requests = 0
    await expect(
      loadWorkbench({
        listRequisitionHistory: async () => {
          if (++requests === 2) throw new Error('session revoked')
          return { records: [], nextCursor: { id: 'a', updatedAt: 1 } }
        },
      }),
    ).rejects.toThrow('session revoked')
  })

  it('rejects a nonadvancing cursor rather than leaving loading running forever', async () => {
    await expect(
      loadWorkbench({
        listRequisitionHistory: async () => ({
          records: [],
          nextCursor: { id: 'a', updatedAt: 1 },
        }),
      }),
    ).rejects.toThrow('cursor')
  })
})
