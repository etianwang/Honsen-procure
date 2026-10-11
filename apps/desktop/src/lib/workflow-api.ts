export type OrderCommentView = {
  id: string
  orderId: string
  authorId: string
  body: string
  createdAt: number
  notificationCount: number
}

export type OrderAuditView = {
  id: string
  orderId: string
  actorId: string
  action: string
  reason: string | null
  previousJson: string | null
  nextJson: string | null
  createdAt: number
}

export type ApprovalPolicyView = {
  allowSelfApproval: boolean
}

export type WorkflowApi = {
  confirmRequisition(orderId: string): Promise<void>
  rejectRequisition(orderId: string, reason: string): Promise<void>
  addOrderComment(orderId: string, body: string): Promise<OrderCommentView>
  listOrderComments(orderId: string): Promise<OrderCommentView[]>
  listOrderAudits(orderId: string): Promise<OrderAuditView[]>
  getApprovalPolicy(): Promise<ApprovalPolicyView>
  setApprovalPolicy(allowSelfApproval: boolean, reason: string): Promise<void>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function tauriInvoke(): TauriInvoke {
  const invoke = (
    window as Window & {
      __TAURI__?: { core?: { invoke?: TauriInvoke } }
    }
  ).__TAURI__?.core?.invoke
  if (!invoke) throw new Error('桌面主机不可用')
  return invoke
}

export const tauriWorkflowApi: WorkflowApi = {
  confirmRequisition: (orderId) =>
    tauriInvoke()<void>('confirm_requisition', { orderId }),
  rejectRequisition: (orderId, reason) =>
    tauriInvoke()<void>('reject_requisition', { orderId, reason }),
  addOrderComment: (orderId, body) =>
    tauriInvoke()<OrderCommentView>('add_order_comment', { orderId, body }),
  listOrderComments: (orderId) =>
    tauriInvoke()<OrderCommentView[]>('list_order_comments', { orderId }),
  listOrderAudits: (orderId) =>
    tauriInvoke()<OrderAuditView[]>('list_order_audits', { orderId }),
  getApprovalPolicy: () =>
    tauriInvoke()<ApprovalPolicyView>('get_approval_policy'),
  setApprovalPolicy: (allowSelfApproval, reason) =>
    tauriInvoke()<void>('set_approval_policy', { allowSelfApproval, reason }),
}
