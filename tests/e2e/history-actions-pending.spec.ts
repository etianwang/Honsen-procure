import { expect, test, type Page } from '@playwright/test'

async function mountHistory(
  page: Page,
  locale: string,
  kind: 'withdraw' | 'owner' | 'hpa',
) {
  await page.goto('/')
  await page.evaluate(
    async ({ locale, kind }) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { RequisitionHistoryPanel } = await load(
        '/src/components/RequisitionHistoryPanel.tsx',
      )
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
      const statuses: Record<string, string> = {
        A: kind === 'withdraw' ? 'pending_confirmation' : 'approved',
        B: kind === 'withdraw' ? 'pending_confirmation' : 'approved',
      }
      const record = (id: string) => ({
        id,
        displayNo: `SYNTH-${id}`,
        projectName: 'Synthetic project',
        site: 'Synthetic site',
        workflowStatus: statuses[id],
        procurementMode:
          kind === 'owner' ? 'owner_self_purchase' : 'honsen_self_purchase',
        primaryCurrency: 'EUR',
        totalMinor: '100',
        updatedAt: 1,
      })
      const detail = (id: string) => ({
        ...record(id),
        projectId: 'project',
        applicantId: 'user',
        formalDocumentNo: null,
        orderDate: '2026-11-09',
        deliveryAddress: 'Synthetic site',
        expectedDeliveryDate: null,
        notes: null,
        lines: [],
        attachments: [],
        audits: [],
      })
      const frame = () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        )
      const host = window as Window & {
        __historyActions?: { kind: string; id: string }[]
        __historyDetailReads?: string[]
        __finishHistoryAction?: (fail: boolean) => Promise<void>
        __deferHistoryExport?: boolean
        __finishHistoryExport?: () => Promise<void>
        __historyExportReads?: number
        __unmountHistory?: () => void
        __rejectNextDetailRead?: boolean
      }
      host.__historyActions = []
      host.__historyDetailReads = []
      host.__historyExportReads = 0
      const mutate = (operation: string, id: string) => {
        host.__historyActions?.push({ kind: operation, id })
        return new Promise<void>((resolve, reject) => {
          host.__finishHistoryAction = async (fail) => {
            if (fail) reject(new Error('Synthetic action failure'))
            else {
              statuses[id] =
                operation === 'withdraw' ? 'draft' : 'formally_issued'
              resolve()
            }
            await frame()
          }
        })
      }
      const api = {
        listRequisitionHistory: async () => {
          if (host.__deferHistoryExport) {
            host.__historyExportReads = (host.__historyExportReads ?? 0) + 1
            return new Promise((resolve) => {
              host.__finishHistoryExport = async () => {
                resolve({ records: [record('A')], nextCursor: null })
                await frame()
              }
            })
          }
          return { records: [record('A'), record('B')], nextCursor: null }
        },
        getRequisitionDetail: async (id: string) => {
          host.__historyDetailReads?.push(id)
          if (host.__rejectNextDetailRead) {
            host.__rejectNextDetailRead = false
            throw new Error('Synthetic detail refresh failure')
          }
          return detail(id)
        },
        withdrawRequisition: (id: string) => mutate('withdraw', id),
        issueOwnerFormalOrder: (id: string) => mutate('owner', id),
        issueHonsenFormalOrder: (id: string) => mutate('hpa', id),
      }
      const createRoot = DOM.createRoot ?? DOM.default.createRoot
      const createElement = React.createElement ?? React.default.createElement
      const target = document.createElement('div')
      document.body.replaceChildren(target)
      const root = createRoot(target)
      host.__unmountHistory = () => root.unmount()
      root.render(
        createElement(RequisitionHistoryPanel, {
          api,
          projectId: 'project',
          applicantId: 'user',
          refreshKey: '1',
          canApprove: true,
          onCopy: () => undefined,
        }),
      )
    },
    { locale, kind },
  )
}

const copy = {
  zh: {
    withdraw: '撤回历史申请',
    owner: '正式下达业主申请',
    hpa: '正式签发 HPA',
    detail: '请购详情',
    pendingWithdraw: '正在撤回申请',
    pendingIssue: '正在正式签发单据',
    other: '另一单据操作正在进行',
    export: '导出Excel',
    exportPending: '正在导出启动时的筛选结果',
  },
  en: {
    withdraw: 'Withdraw requisition',
    owner: 'Issue owner requisition',
    hpa: 'Issue formal HPA',
    detail: 'Requisition details',
    pendingWithdraw: 'Withdrawing the requisition',
    pendingIssue: 'Issuing the formal document',
    other: 'An action on another document',
    export: 'Export Excel',
    exportPending: 'Exporting the filter selected at start',
  },
  fr: {
    withdraw: 'Retirer la demande',
    owner: 'Émettre la demande propriétaire',
    hpa: 'Émettre le HPA',
    detail: 'Détail de la demande',
    pendingWithdraw: 'Retrait de la demande',
    pendingIssue: 'Émission du document officiel',
    other: 'Une opération sur un autre document',
    export: 'Exporter Excel',
    exportPending: 'Export du filtre sélectionné au démarrage',
  },
} as const

for (const locale of ['zh', 'en', 'fr'] as const) {
  test(`history saved action with failed refresh permits only read retry ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const kind =
      locale === 'zh' ? 'withdraw' : locale === 'en' ? 'owner' : 'hpa'
    await mountHistory(page, locale, kind)
    await page.getByRole('button', { name: 'SYNTH-A', exact: true }).click()
    const action = page.getByRole('button', {
      name: copy[locale][kind],
      exact: true,
    })
    await action.click()
    await page.evaluate(() => {
      ;(
        window as Window & { __rejectNextDetailRead: boolean }
      ).__rejectNextDetailRead = true
    })
    await page.evaluate(() =>
      (
        window as Window & {
          __finishHistoryAction: (fail: boolean) => Promise<void>
        }
      ).__finishHistoryAction(false),
    )
    const feedback = page.locator('#history-action-feedback')
    const warning =
      locale === 'zh'
        ? '操作已保存，但详情刷新失败'
        : locale === 'fr'
          ? 'L’opération est enregistrée'
          : 'The action was saved'
    const retryLabel =
      locale === 'zh'
        ? '重新读取详情'
        : locale === 'fr'
          ? 'Recharger le détail'
          : 'Reload details'
    await expect(feedback.getByRole('status')).toContainText(warning)
    await expect(
      page.getByRole('heading', { name: 'SYNTH-A', exact: true }),
    ).toBeVisible()
    await expect(action).toBeDisabled()
    await action.dispatchEvent('click')
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __historyActions: unknown[] }).__historyActions,
      ),
    ).toEqual([{ kind, id: 'A' }])
    await page.evaluate(() => {
      ;(
        window as Window & { __rejectNextDetailRead: boolean }
      ).__rejectNextDetailRead = true
    })
    await page.getByRole('button', { name: retryLabel, exact: true }).click()
    await expect(feedback.getByRole('status')).toContainText(warning)
    await expect(action).toBeDisabled()
    await page.getByRole('button', { name: retryLabel, exact: true }).click()
    await expect(
      page.getByRole('button', { name: retryLabel, exact: true }),
    ).toHaveCount(0)
    await expect(action).toHaveCount(0)
    await expect(feedback.getByRole('status')).toHaveCount(0)
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __historyActions: unknown[] }).__historyActions,
      ),
    ).toEqual([{ kind, id: 'A' }])
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __historyDetailReads: string[] })
            .__historyDetailReads,
      ),
    ).toEqual(['A', 'A', 'A', 'A'])
    expect(errors).toEqual([])
  })
  for (const kind of ['withdraw', 'owner', 'hpa'] as const) {
    for (const fail of [false, true]) {
      test(`history ${kind} locks writes and cannot replace a newer detail ${locale} failure=${fail}`, async ({
        page,
      }) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await mountHistory(page, locale, kind)
        const text = copy[locale]
        await page.getByRole('button', { name: 'SYNTH-A', exact: true }).click()
        const action = page.getByRole('button', {
          name: text[kind],
          exact: true,
        })
        await action.click()
        await expect(action).toBeDisabled()
        await expect(action).toHaveAttribute('aria-busy', 'true')
        await expect(page.locator('#history-action-feedback')).toContainText(
          kind === 'withdraw' ? text.pendingWithdraw : text.pendingIssue,
        )
        await action.dispatchEvent('click')
        expect(
          await page.evaluate(
            () =>
              (window as Window & { __historyActions: unknown[] })
                .__historyActions,
          ),
        ).toEqual([{ kind, id: 'A' }])
        await page.getByRole('button', { name: 'SYNTH-B', exact: true }).click()
        const region = page.getByRole('region', {
          name: text.detail,
          exact: true,
        })
        await expect(
          region.getByRole('heading', { name: 'SYNTH-B', exact: true }),
        ).toBeVisible()
        await expect(page.locator('#history-action-feedback')).toContainText(
          text.other,
        )
        await expect(
          page.getByRole('button', { name: text[kind], exact: true }),
        ).toBeDisabled()
        await page.evaluate(
          (fail) =>
            (
              window as Window & {
                __finishHistoryAction: (fail: boolean) => Promise<void>
              }
            ).__finishHistoryAction(fail),
          fail,
        )
        await expect(
          region.getByRole('heading', { name: 'SYNTH-B', exact: true }),
        ).toBeVisible()
        await expect(region.getByRole('alert')).toHaveCount(0)
        await expect(
          page.getByRole('button', { name: text[kind], exact: true }),
        ).toBeEnabled()
        expect(
          await page.evaluate(
            () =>
              (window as Window & { __historyDetailReads: string[] })
                .__historyDetailReads,
          ),
        ).toEqual(['A', 'B'])
        expect(errors).toEqual([])
      })
    }
  }
  test(`history withdrawal failure stays local and can retry ${locale}`, async ({
    page,
  }) => {
    await mountHistory(page, locale, 'withdraw')
    await page.getByRole('button', { name: 'SYNTH-A', exact: true }).click()
    const action = page.getByRole('button', {
      name: copy[locale].withdraw,
      exact: true,
    })
    await action.click()
    await page.evaluate(() =>
      (
        window as Window & {
          __finishHistoryAction: (fail: boolean) => Promise<void>
        }
      ).__finishHistoryAction(true),
    )
    await expect(
      page.locator('#history-action-feedback').getByRole('alert'),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'SYNTH-A', exact: true }),
    ).toBeVisible()
    await expect(action).toBeEnabled()
    await action.click()
    await page.evaluate(() =>
      (
        window as Window & {
          __finishHistoryAction: (fail: boolean) => Promise<void>
        }
      ).__finishHistoryAction(false),
    )
    await expect(
      page.locator('#history-action-feedback').getByRole('status'),
    ).toBeVisible()
    await expect(action).toHaveCount(0)
  })
  test(`history export prevents duplicate reads and stops after unmount ${locale}`, async ({
    page,
  }) => {
    const downloads: string[] = []
    const errors: string[] = []
    page.on('download', (download) =>
      downloads.push(download.suggestedFilename()),
    )
    page.on('pageerror', (error) => errors.push(error.message))
    await mountHistory(page, locale, 'withdraw')
    await expect(
      page.getByRole('button', { name: 'SYNTH-A', exact: true }),
    ).toBeVisible()
    await page.evaluate(() => {
      ;(
        window as Window & { __deferHistoryExport: boolean }
      ).__deferHistoryExport = true
    })
    const button = page.getByRole('button', {
      name: copy[locale].export,
      exact: true,
    })
    await button.click()
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('aria-busy', 'true')
    await expect(
      page.getByRole('status').filter({ hasText: copy[locale].exportPending }),
    ).toBeVisible()
    await button.dispatchEvent('click')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __historyExportReads: number })
              .__historyExportReads,
        ),
      )
      .toBe(1)
    await page.evaluate(() =>
      (window as Window & { __unmountHistory: () => void }).__unmountHistory(),
    )
    await page.evaluate(() =>
      (
        window as Window & { __finishHistoryExport: () => Promise<void> }
      ).__finishHistoryExport(),
    )
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __historyDetailReads: string[] })
            .__historyDetailReads,
      ),
    ).toEqual([])
    expect(downloads).toEqual([])
    expect(errors).toEqual([])
  })
}
