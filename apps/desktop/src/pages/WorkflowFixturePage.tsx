import { OrderWorkflowPanel } from '../components/OrderWorkflowPanel'
import { ApprovalPolicyPanel } from '../components/ApprovalPolicyPanel'
import { tauriWorkflowApi, type WorkflowApi } from '../lib/workflow-api'

const fixtureOrderId = '00000000-0000-4000-8000-000000000301'

const fallbackApi: WorkflowApi = {
  async confirmRequisition() {},
  async rejectRequisition() {},
  async addOrderComment(orderId, body) {
    return {
      id: crypto.randomUUID(),
      orderId,
      authorId: '00000000-0000-4000-8000-000000000302',
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

export function WorkflowFixturePage() {
  const hasTauri = Boolean(
    (
      window as Window & {
        __TAURI__?: { core?: { invoke?: unknown } }
      }
    ).__TAURI__?.core?.invoke,
  )
  return (
    <main className="fixture-page">
      <OrderWorkflowPanel
        api={hasTauri ? tauriWorkflowApi : fallbackApi}
        orderId={fixtureOrderId}
        canApprove
      />
      <ApprovalPolicyPanel
        api={hasTauri ? tauriWorkflowApi : fallbackApi}
        canManage
      />
    </main>
  )
}
