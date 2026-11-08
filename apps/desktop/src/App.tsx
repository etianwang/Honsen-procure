import { AccountPasswordDialog } from './components/AccountPasswordDialog'
import { RequiredPasswordChange } from './components/ManagedAccountForm'
import { shellText, useUiLocale, type ShellMessage } from './lib/ui-locale'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import frFR from 'antd/locale/fr_FR'
import { useEffect, useState } from 'react'
import {
  readSyncStatus,
  startSyncLifecycle,
  type SyncState,
} from './lib/sync-lifecycle'
import { ConfigProvider } from 'antd'
import { honsenTheme } from './styles/theme'
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
import { SyncConflictPanel } from './components/SyncConflictPanel'
import { CategoryRepairPanel } from './components/CategoryRepairPanel'
import { tauriCategoryRepairApi } from './lib/category-repair-api'
import { tauriSyncApi } from './lib/sync-api'
import { ProcurementExecutionPage } from './pages/ProcurementExecutionPage'
import { AuthorizationManagementPage } from './pages/AuthorizationManagementPage'
import {
  RequisitionPage,
  type RequisitionContext,
} from './pages/RequisitionPage'
import { tauriRequisitionApi, type RequisitionApi } from './lib/requisition-api'
import { tauriCatalogApi } from './lib/catalog-api'
import { SuppliersPricesPage } from './pages/SuppliersPricesPage'
import { tauriProcurementExecutionApi } from './lib/procurement-execution-api'
import { tauriRfqApi } from './lib/rfq-api'
import { tauriSupplierOrderApi } from './lib/supplier-order-api'
import { tauriWorkflowApi, type WorkflowApi } from './lib/workflow-api'
import type { UserRole } from './lib/permissions'
import { startProcurementSync, syncProcurement } from './lib/procurement-sync'
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
  async issueOwnerFormalOrder(orderId) {
    return {
      documentType: 'OPA',
      formalDocumentNo: `PREVIEW-OPA-${orderId}`,
      formalInstallationId: crypto.randomUUID(),
      formalSequence: 1,
    }
  },
  async submitRequisitionDraft() {},
  async issueHonsenFormalOrder() {
    throw new Error('正式签发需要桌面主机')
  },
  async withdrawRequisition() {},
}

const previewCatalogApi = {
  async listCatalogPrices() {
    return []
  },
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
  const { locale } = useUiLocale()
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
  const isSyncConflictFixture =
    new URLSearchParams(window.location.search).get('test') === 'sync-conflict'
  const [page, setPage] = useState<AppPage>('home')
  const [isPreviewOpen, setPreviewOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [session, setSession] = useState<{
    user_id: string
    username: string
    display_name?: string | null
    roles: string[]
    password_change_recommended?: boolean
    requires_password_change: boolean
    onlineAuthenticated: boolean
  } | null>(null)
  const [syncState, setSyncState] = useState<SyncState>({
    kind: 'offline-pending',
  })
  const [authorizationContext, setAuthorizationContext] =
    useState<RequisitionContext | null>(null)
  const [authorizationContexts, setAuthorizationContexts] = useState<
    AuthorizationContextOption[]
  >([])
  const [contextError, setContextError] = useState<ShellMessage | ''>('')
  const authorizationRefreshReady =
    session?.onlineAuthenticated &&
    (syncState.kind === 'pending' || syncState.kind === 'synced')
  useEffect(() => {
    if (!session?.onlineAuthenticated || session.requires_password_change)
      return
    const invoke = (
      window as Window & {
        __TAURI__?: { core?: { invoke?: <T>(command: string) => Promise<T> } }
      }
    ).__TAURI__?.core?.invoke
    if (!invoke) return
    return startSyncLifecycle(invoke, setSyncState, window)
  }, [
    session?.user_id,
    session?.onlineAuthenticated,
    session?.requires_password_change,
  ])
  useEffect(() => {
    if (!session || session.onlineAuthenticated) return
    const invoke = (
      window as Window & {
        __TAURI__?: {
          core?: { invoke?: (command: string) => Promise<unknown> }
        }
      }
    ).__TAURI__?.core?.invoke
    if (!invoke) return
    let active = true
    const refresh = async () => {
      try {
        const status = await readSyncStatus(invoke)
        if (active) setSyncState({ kind: 'offline-pending', ...status })
      } catch {
        if (active) setSyncState({ kind: 'offline-pending' })
      }
    }
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, 5_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [session])
  useEffect(() => {
    if (!session || session.requires_password_change) {
      setAuthorizationContext(null)
      return
    }
    let active = true
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
        if (!active) return
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
      .catch((error: unknown) => {
        if (!active) return
        setAuthorizationContexts([])
        setAuthorizationContext(null)
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined
        setContextError(
          code === 'forbidden'
            ? '当前账户没有有效的离线授权范围，无法新建采购申请。'
            : '无法读取本地授权资料；请重试同步或重新登录，当前不能判定为缺少项目授权。',
        )
      })
    return () => {
      active = false
    }
  }, [session, authorizationRefreshReady])
  useEffect(() => {
    if (session?.onlineAuthenticated && !session.requires_password_change)
      return startProcurementSync(syncProcurement)
  }, [
    session?.user_id,
    session?.onlineAuthenticated,
    session?.requires_password_change,
  ])
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
  const canApprove = !!session?.roles.some(
    (role) => role === 'purchaser' || role === 'administrator',
  )
  const businessRole: UserRole = session?.roles.includes('administrator')
    ? 'administrator'
    : session?.roles.includes('purchaser')
      ? 'purchaser'
      : role
  const catalogContextNotice: ShellMessage =
    role === 'super_administrator' &&
    session?.roles.every((assigned) => assigned === 'super_administrator')
      ? '超级管理员不会自动获得项目范围；查看报价需要有效项目授权，维护另需管理员或采购员角色。'
      : syncState.kind === 'retrying' || syncState.kind === 'auth-required'
        ? '连接或同步失败，当前尚无可用的本地项目上下文；请重试同步，不代表服务器已拒绝项目授权。'
        : authorizationContexts.length
          ? '已加载授权范围，但当前项目尚未就绪；请从顶部授权范围中选择项目。'
          : contextError ===
              '无法读取本地授权资料；请重试同步或重新登录，当前不能判定为缺少项目授权。'
            ? contextError
            : '当前没有可用的项目业务授权。请联系授权管理员分配项目、部门和班组；修改密码不会授予这些权限。'

  return (
    <ConfigProvider
      locale={locale === 'zh' ? zhCN : locale === 'en' ? enUS : frFR}
      theme={honsenTheme}
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
      ) : session?.requires_password_change ? (
        <RequiredPasswordChange onChanged={() => setSession(null)} />
      ) : isPreviewOpen || session ? (
        <AppShell
          page={page}
          pageTitle={
            page === 'home'
              ? '工作台'
              : page === 'materials'
                ? '材料库总览'
                : page === 'suppliers'
                  ? '供应商与价格'
                  : page === 'requisition'
                    ? '采购申请单'
                    : page === 'execution'
                      ? '采购执行'
                      : page === 'conflicts'
                        ? '同步冲突'
                        : page === 'authorization'
                          ? '在线授权管理'
                          : '基础资料管理'
          }
          role={session ? role : 'purchaser'}
          username={session?.username}
          displayName={session?.display_name}
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
          passwordChangeRecommended={session?.password_change_recommended}
          passwordChangeAvailable={
            !!session?.onlineAuthenticated &&
            ![
              'retrying',
              'auth-required',
              'account-boundary',
              'upgrade-required',
            ].includes(syncState.kind)
          }
          onChangePassword={
            session ? () => setPasswordDialogOpen(true) : undefined
          }
          syncState={syncState}
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
                  void invoke?.('lock_session').finally(() => {
                    setAuthorizationContexts([])
                    setAuthorizationContext(null)
                    setSession(null)
                    setPasswordDialogOpen(false)
                  })
                }
              : undefined
          }
        >
          {session && page === 'home' && role === 'super_administrator' && (
            <p className="account-role-notice" role="status">
              {shellText(
                locale,
                '超级管理员负责账号、角色和授权治理；该角色本身不授予日常采购业务权限。',
              )}
            </p>
          )}
          {session &&
            page === 'home' &&
            contextError &&
            !authorizationContext && (
              <p className="account-scope-notice" role="status">
                {shellText(
                  locale,
                  '当前没有可用的项目业务授权。请联系授权管理员分配项目、部门和班组；修改密码不会授予这些权限。',
                )}
              </p>
            )}
          {page === 'home' ? (
            <HomePage
              key={`${session?.user_id ?? 'preview'}:${authorizationContext?.projectId ?? ''}`}
              api={
                (
                  window as Window & {
                    __TAURI__?: { core?: { invoke?: unknown } }
                  }
                ).__TAURI__?.core?.invoke
                  ? tauriRequisitionApi
                  : previewRequisitionApi
              }
              projectId={authorizationContext?.projectId}
              onOpenMaterials={() => setPage('materials')}
              onNewRequisition={() => setPage('requisition')}
              onOpenExecution={() => setPage('execution')}
            />
          ) : page === 'materials' ? (
            <MaterialsPage
              key={requisitionContext?.projectId}
              role={session ? businessRole : 'purchaser'}
              contextNotice={shellText(locale, catalogContextNotice)}
              countryId={requisitionContext?.countryId}
              projectId={requisitionContext?.projectId}
              api={
                (
                  window as Window & {
                    __TAURI__?: { core?: { invoke?: unknown } }
                  }
                ).__TAURI__?.core?.invoke
                  ? undefined
                  : {
                      searchCatalog: async () => [],
                      listCatalogPrices: async () => [],
                      saveMaterial: async () => {},
                      listSuppliers: async () => [],
                      saveSupplier: async () => {},
                      addMaterialPrice: async () => {},
                      saveMaterialImage: async () => {},
                      getMaterialSquareImage: async () => null,
                    }
              }
            />
          ) : page === 'suppliers' ? (
            <SuppliersPricesPage
              role={session ? businessRole : 'purchaser'}
              countryId={requisitionContext?.countryId}
              projectId={requisitionContext?.projectId}
              contextNotice={shellText(locale, catalogContextNotice)}
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
              <p>{shellText(locale, contextError || '正在加载授权范围…')}</p>
              {contextError && (
                <p>
                  {shellText(
                    locale,
                    '当前没有可用的项目业务授权。请联系授权管理员分配项目、部门和班组；修改密码不会授予这些权限。',
                  )}
                </p>
              )}
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
          ) : page === 'conflicts' &&
            session &&
            (role === 'administrator' || role === 'super_administrator') ? (
            <>
              <SyncConflictPanel api={tauriSyncApi} />
              <CategoryRepairPanel api={tauriCategoryRepairApi} />
            </>
          ) : page === 'authorization' &&
            session &&
            (role === 'administrator' || role === 'super_administrator') ? (
            <AuthorizationManagementPage role={role} />
          ) : (
            <MasterDataPage role={session ? role : 'purchaser'} />
          )}
        </AppShell>
      ) : (
        <LoginPage
          onLogin={(authenticated, mode) => {
            setAuthorizationContexts([])
            setAuthorizationContext(null)
            setSyncState({
              kind: mode === 'online' ? 'syncing' : 'offline-pending',
            })
            setSession({
              ...authenticated,
              onlineAuthenticated: mode === 'online',
            })
          }}
          onPreview={() => setPreviewOpen(true)}
        />
      )}
      {session && (
        <AccountPasswordDialog
          open={passwordDialogOpen}
          onClose={() => setPasswordDialogOpen(false)}
          onChanged={() => {
            setPasswordDialogOpen(false)
            setAuthorizationContexts([])
            setAuthorizationContext(null)
            setSession(null)
            setPreviewOpen(false)
          }}
        />
      )}
    </ConfigProvider>
  )
}

export default App
