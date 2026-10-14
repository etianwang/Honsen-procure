import { useEffect, useState } from 'react'
import { ConfigProvider } from 'antd'
import { calculateDraftTotals } from '@honsen/shared'
import {
  AppShell,
  type AppPage,
  type AuthorizationContextOption,
} from './components/AppShell'
import { AuthFixturePage } from './pages/AuthFixturePage'
import { CatalogFixturePage } from './pages/CatalogFixturePage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { MasterDataPage } from './pages/MasterDataPage'
import { MoneyPreviewPage } from './pages/MoneyPreviewPage'
import { MasterDataFixturePage } from './pages/MasterDataFixturePage'
import { OfflineAuthFixturePage } from './pages/OfflineAuthFixturePage'
import { WorkflowFixturePage } from './pages/WorkflowFixturePage'
import { SupplierAllocationFixturePage } from './pages/SupplierAllocationFixturePage'
import { SupplierChildTermsFixturePage } from './pages/SupplierChildTermsFixturePage'
import { RfqFixturePage } from './pages/RfqFixturePage'
import { ReceiptFixturePage } from './pages/ReceiptFixturePage'
import { SyncConflictFixturePage } from './pages/SyncConflictFixturePage'
import { ProcurementExecutionPage } from './pages/ProcurementExecutionPage'
import { AuthorizationManagementPage } from './pages/AuthorizationManagementPage'
import {
  RequisitionPage,
  type RequisitionContext,
} from './pages/RequisitionPage'
import { tauriRequisitionApi, type RequisitionApi } from './lib/requisition-api'
import { tauriCatalogApi } from './lib/catalog-api'
import { tauriProcurementExecutionApi } from './lib/procurement-execution-api'
import { tauriRfqApi } from './lib/rfq-api'
import { tauriSupplierOrderApi } from './lib/supplier-order-api'
import { tauriWorkflowApi, type WorkflowApi } from './lib/workflow-api'
import type { UserRole } from './lib/permissions'
import './App.css'

const previewRequisitionContext: RequisitionContext = {
  displayNo: 'FIXTURE-REQUISITION-0001',
  countryId: '00000000-0000-4000-8000-000000000101',
  projectId: '00000000-0000-4000-8000-000000000102',
  site: '测试工地',
  departmentId: '00000000-0000-4000-8000-000000000103',
  teamId: '00000000-0000-4000-8000-000000000104',
  applicantId: '00000000-0000-4000-8000-000000000105',
  currency: 'XOF',
  primaryCurrency: 'XOF',
  languagePair: 'zh_fr',
  urgency: 'normal',
  urgencyReason: null,
  orderDate: '2026-10-10',
  deliveryAddress: '测试收货地址',
  expectedDeliveryDate: null,
  notes: null,
}

const previewRequisitionApi: RequisitionApi = {
  async getRequisitionDetail() {
    throw new Error('预览环境没有历史记录')
  },
  async listRequisitionHistory() {
    return { records: [], nextCursor: null }
  },
  async saveRequisitionDraft(draft) {
    return calculateDraftTotals(draft)
  },
  async setProcurementMode() {},
  async saveOwnerPurchasePricing(input) {
    return input.lines.map((line) => ({
      orderItemId: line.orderItemId,
      convertedReferenceUnitMinor:
        line.quoteSource.kind === 'manual_reference'
          ? line.quoteSource.unitPriceMinor
          : '1250',
      markupMinor: '0',
      finalUnitPriceMinor:
        line.quoteSource.kind === 'manual_reference'
          ? line.quoteSource.unitPriceMinor
          : '1250',
    }))
  },
  async submitRequisitionDraft() {},
  async withdrawRequisition() {},
}

const previewCatalogApi = {
  async searchCatalog() {
    return [
      {
        id: '00000000-0000-4000-8000-000000000106',
        sku: 'FIXTURE-CABLE',
        nameZh: '测试电缆',
        nameFr: 'Câble de test',
        aliases: [],
        brand: null,
        model: 'FX-01',
        specification: '3 × 2.5 mm²',
        unit: '米',
        notes: null,
        version: 1,
        prices: [
          {
            priceId: '00000000-0000-4000-8000-000000000107',
            supplierId: '00000000-0000-4000-8000-000000000108',
            supplierName: 'fixture supplier',
            isPreferredSupplier: true,
            currency: 'XOF' as const,
            unitPriceMinor: '1250',
            unit: '米',
            effectiveAt: '2026-10-10',
          },
        ],
      },
    ]
  },
}

const previewWorkflowApi: WorkflowApi = {
  async confirmRequisition() {},
  async rejectRequisition() {},
  async addOrderComment(orderId, body) {
    return {
      id: crypto.randomUUID(),
      orderId,
      authorId: previewRequisitionContext.applicantId,
      body,
      createdAt: Date.now(),
      notificationCount: 0,
    }
  },
  async listOrderComments() {
    return []
  },
  async listOrderAudits() {
    return []
  },
  async getApprovalPolicy() {
    return { allowSelfApproval: false }
  },
  async setApprovalPolicy() {},
}

function App() {
  // shortcut: test-only query route, remove when the app has an authenticated test fixture.
  const isMoneyPreview =
    new URLSearchParams(window.location.search).get('test') === 'money'
  const isAuthFixture =
    new URLSearchParams(window.location.search).get('test') === 'auth'
  const isOfflineAuthFixture =
    new URLSearchParams(window.location.search).get('test') === 'offline'
  const isMasterDataFixture =
    new URLSearchParams(window.location.search).get('test') === 'master-data'
  const isCatalogFixture =
    new URLSearchParams(window.location.search).get('test') === 'catalog'
  const isWorkflowFixture =
    new URLSearchParams(window.location.search).get('test') === 'workflow'
  const isSupplierAllocationFixture =
    new URLSearchParams(window.location.search).get('test') === 'allocation'
  const isSupplierTermsFixture =
    new URLSearchParams(window.location.search).get('test') === 'supplier-terms'
  const isRfqFixture =
    new URLSearchParams(window.location.search).get('test') === 'rfq'
  const isReceiptFixture =
    new URLSearchParams(window.location.search).get('test') === 'receipt'
  const syncConflictFixture = new URLSearchParams(window.location.search).get(
    'test',
  )
  const isSyncConflictFixture =
    syncConflictFixture === 'sync-conflict' ||
    syncConflictFixture === 'sync-attachment-conflict'
  const [page, setPage] = useState<AppPage>('home')
  const [isPreviewOpen, setPreviewOpen] = useState(false)
  const [session, setSession] = useState<{
    user_id: string
    username: string
    roles: string[]
    requires_password_change: boolean
  } | null>(null)
  const [authorizationContext, setAuthorizationContext] =
    useState<RequisitionContext | null>(null)
  const [authorizationContexts, setAuthorizationContexts] = useState<
    AuthorizationContextOption[]
  >([])
  const [contextError, setContextError] = useState('')
  useEffect(() => {
    if (!session) {
      setAuthorizationContext(null)
      return
    }
    const invoke = (
      window as Window & {
        __TAURI__?: { core?: { invoke?: <T>(command: string) => Promise<T> } }
      }
    ).__TAURI__?.core?.invoke
    if (!invoke) return
    void Promise.all([
      invoke<AuthorizationContextOption[]>('list_authorization_contexts'),
      invoke<
        Omit<
          RequisitionContext,
          | 'displayNo'
          | 'applicantId'
          | 'urgency'
          | 'urgencyReason'
          | 'orderDate'
          | 'deliveryAddress'
          | 'expectedDeliveryDate'
          | 'notes'
        >
      >('get_authorization_context'),
    ])
      .then(([contexts, context]) => {
        setAuthorizationContexts(contexts)
        setAuthorizationContext({
          ...context,
          displayNo: `REQ-${crypto.randomUUID()}`,
          applicantId: session.user_id,
          urgency: 'normal',
          urgencyReason: null,
          orderDate: new Date().toISOString().slice(0, 10),
          deliveryAddress: context.site,
          expectedDeliveryDate: null,
          notes: null,
        })
        setContextError('')
      })
      .catch(() => {
        setAuthorizationContexts([])
        setAuthorizationContext(null)
        setContextError('当前账户没有有效的离线授权范围，无法新建采购申请。')
      })
  }, [session])
  const selectAuthorizationContext = (value: string) => {
    const [projectId, departmentId, teamId] = value.split(':')
    const invoke = (
      window as Window & {
        __TAURI__?: {
          core?: { invoke?: <T>(command: string, args?: object) => Promise<T> }
        }
      }
    ).__TAURI__?.core?.invoke
    if (!invoke || !projectId || !departmentId || !teamId || !session) return
    void invoke<void>('select_authorization_context', {
      selection: { projectId, departmentId, teamId },
    })
      .then(() =>
        invoke<
          Omit<
            RequisitionContext,
            | 'displayNo'
            | 'applicantId'
            | 'urgency'
            | 'urgencyReason'
            | 'orderDate'
            | 'deliveryAddress'
            | 'expectedDeliveryDate'
            | 'notes'
          >
        >('get_authorization_context'),
      )
      .then((context) => {
        setAuthorizationContext({
          ...context,
          displayNo: `REQ-${crypto.randomUUID()}`,
          applicantId: session.user_id,
          urgency: 'normal',
          urgencyReason: null,
          orderDate: new Date().toISOString().slice(0, 10),
          deliveryAddress: context.site,
          expectedDeliveryDate: null,
          notes: null,
        })
        setContextError('')
      })
      .catch(() => setContextError('无法切换到所选授权范围。'))
  }
  const role: UserRole = session?.roles.includes('super_administrator')
    ? 'super_administrator'
    : session?.roles.includes('administrator')
      ? 'administrator'
      : session?.roles.includes('purchaser')
        ? 'purchaser'
        : session?.roles.includes('viewer')
          ? 'viewer'
          : 'engineer'
  const requisitionContext = session
    ? authorizationContext
    : previewRequisitionContext
  const canApprove =
    role === 'purchaser' ||
    role === 'administrator' ||
    role === 'super_administrator'

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#176045',
          borderRadius: 8,
          fontFamily:
            'Inter, Microsoft YaHei, Noto Sans SC, system-ui, sans-serif',
        },
      }}
    >
      {isSyncConflictFixture ? (
        <SyncConflictFixturePage />
      ) : isReceiptFixture ? (
        <ReceiptFixturePage />
      ) : isSupplierTermsFixture ? (
        <SupplierChildTermsFixturePage />
      ) : isRfqFixture ? (
        <RfqFixturePage />
      ) : isSupplierAllocationFixture ? (
        <SupplierAllocationFixturePage />
      ) : isWorkflowFixture ? (
        <WorkflowFixturePage />
      ) : isCatalogFixture ? (
        <CatalogFixturePage />
      ) : isMasterDataFixture ? (
        <MasterDataFixturePage />
      ) : isOfflineAuthFixture ? (
        <OfflineAuthFixturePage />
      ) : isAuthFixture ? (
        <AuthFixturePage />
      ) : isMoneyPreview ? (
        <MoneyPreviewPage />
      ) : isPreviewOpen || session ? (
        <AppShell
          page={page}
          pageTitle={
            page === 'home'
              ? '工作台'
              : page === 'materials'
                ? '材料库总览'
                : page === 'requisition'
                  ? '采购申请单'
                  : page === 'execution'
                    ? '采购执行'
                    : page === 'authorization'
                      ? '在线授权管理'
                      : '基础资料管理'
          }
          role={session ? role : 'purchaser'}
          onNavigate={setPage}
          authorizationContexts={session ? authorizationContexts : undefined}
          selectedAuthorizationContext={
            authorizationContext
              ? [
                  authorizationContext.projectId,
                  authorizationContext.departmentId,
                  authorizationContext.teamId,
                ].join(':')
              : undefined
          }
          onSelectAuthorizationContext={selectAuthorizationContext}
          onLock={
            session
              ? () => {
                  const invoke = (
                    window as Window & {
                      __TAURI__?: {
                        core?: { invoke?: (command: string) => Promise<void> }
                      }
                    }
                  ).__TAURI__?.core?.invoke
                  void invoke?.('lock_session').finally(() => setSession(null))
                }
              : undefined
          }
        >
          {page === 'home' ? (
            <HomePage
              onOpenMaterials={() => setPage('materials')}
              onNewRequisition={() => setPage('requisition')}
            />
          ) : page === 'materials' ? (
            <MaterialsPage
              role={session ? role : 'purchaser'}
              api={
                (
                  window as Window & {
                    __TAURI__?: { core?: { invoke?: unknown } }
                  }
                ).__TAURI__?.core?.invoke
                  ? undefined
                  : {
                      searchCatalog: async () => [],
                      saveMaterial: async () => {},
                      listSuppliers: async () => [],
                      saveSupplier: async () => {},
                      addMaterialPrice: async () => {},
                      saveMaterialImage: async () => {},
                      getMaterialSquareImage: async () => null,
                    }
              }
            />
          ) : page === 'requisition' && requisitionContext ? (
            <RequisitionPage
              key={`${requisitionContext.projectId}:${requisitionContext.departmentId}:${requisitionContext.teamId}`}
              api={
                (
                  window as Window & {
                    __TAURI__?: { core?: { invoke?: unknown } }
                  }
                ).__TAURI__?.core?.invoke
                  ? tauriRequisitionApi
                  : previewRequisitionApi
              }
              catalogApi={
                (
                  window as Window & {
                    __TAURI__?: { core?: { invoke?: unknown } }
                  }
                ).__TAURI__?.core?.invoke
                  ? tauriCatalogApi
                  : previewCatalogApi
              }
              context={requisitionContext}
              workflowApi={
                (
                  window as Window & {
                    __TAURI__?: { core?: { invoke?: unknown } }
                  }
                ).__TAURI__?.core?.invoke
                  ? tauriWorkflowApi
                  : previewWorkflowApi
              }
              canApprove={session ? canApprove : true}
            />
          ) : page === 'requisition' ? (
            <main className="empty-state" role="alert">
              {contextError || '正在加载授权范围…'}
            </main>
          ) : page === 'execution' ? (
            <ProcurementExecutionPage
              api={tauriProcurementExecutionApi}
              supplierApi={tauriCatalogApi}
              supplierOrderApi={tauriSupplierOrderApi}
              rfqApi={tauriRfqApi}
              receiverId={
                session?.user_id ?? previewRequisitionContext.applicantId
              }
            />
          ) : page === 'authorization' &&
            session &&
            (role === 'administrator' || role === 'super_administrator') ? (
            <AuthorizationManagementPage />
          ) : (
            <MasterDataPage role={session ? role : 'purchaser'} />
          )}
        </AppShell>
      ) : (
        <LoginPage
          onLogin={setSession}
          onPreview={() => setPreviewOpen(true)}
        />
      )}
    </ConfigProvider>
  )
}

export default App
