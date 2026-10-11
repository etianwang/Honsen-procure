import { useState } from 'react'
import { ConfigProvider } from 'antd'
import { calculateDraftTotals } from '@honsen/shared'
import { AppShell, type AppPage } from './components/AppShell'
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
import {
  RequisitionPage,
  type RequisitionContext,
} from './pages/RequisitionPage'
import { tauriRequisitionApi, type RequisitionApi } from './lib/requisition-api'
import { tauriCatalogApi } from './lib/catalog-api'
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
  async saveRequisitionDraft(draft) {
    return calculateDraftTotals(draft)
  },
  async submitRequisitionDraft() {},
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
  const isSyncConflictFixture =
    new URLSearchParams(window.location.search).get('test') === 'sync-conflict'
  const [page, setPage] = useState<AppPage>('home')
  const [isPreviewOpen, setPreviewOpen] = useState(false)

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
      ) : isPreviewOpen ? (
        <AppShell
          page={page}
          pageTitle={
            page === 'home'
              ? '工作台'
              : page === 'materials'
                ? '材料库总览'
                : page === 'requisition'
                  ? '采购申请单'
                  : '项目默认设置'
          }
          role="purchaser"
          onNavigate={setPage}
        >
          {page === 'home' ? (
            <HomePage
              onOpenMaterials={() => setPage('materials')}
              onNewRequisition={() => setPage('requisition')}
            />
          ) : page === 'materials' ? (
            <MaterialsPage
              role="purchaser"
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
          ) : page === 'requisition' ? (
            <RequisitionPage
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
              context={previewRequisitionContext}
            />
          ) : (
            <MasterDataPage role="purchaser" />
          )}
        </AppShell>
      ) : (
        <LoginPage onPreview={() => setPreviewOpen(true)} />
      )}
    </ConfigProvider>
  )
}

export default App
