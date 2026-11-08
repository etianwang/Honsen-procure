import type { UiLocale } from './ui-locale'
const messages = {
  无法确定订单国家范围: [
    'Order country unavailable',
    'Pays de la commande indisponible',
  ],
  '无法确定订单国家范围；供应商选择暂不可用，其他执行记录仍可查看。': [
    'Order country is unavailable. Supplier selection is disabled; other execution records remain visible.',
    'Pays de la commande indisponible. La sélection du fournisseur est désactivée ; les autres données restent consultables.',
  ],
  采购执行: ['Purchasing execution', 'Exécution des achats'],
  '选择已批准的 Honsen 采购申请；市场直采无需 RFQ 或供应商子订单。': [
    'Select an approved Honsen requisition; market purchases require no RFQ or supplier order.',
    'Sélectionnez une demande Honsen approuvée ; les achats directs ne nécessitent ni consultation ni commande fournisseur.',
  ],
  '无法读取已确认采购申请，请重新登录后重试。': [
    'Unable to read approved requisitions. Sign in again and retry.',
    'Impossible de lire les demandes approuvées. Reconnectez-vous et réessayez.',
  ],
  '无法读取可用供应商。': [
    'Unable to read available suppliers.',
    'Impossible de lire les fournisseurs disponibles.',
  ],
  已确认采购申请: ['Approved requisitions', 'Demandes approuvées'],
  未正式编号: ['Not formally numbered', 'Sans numéro officiel'],
  '正在读取已确认采购申请…': [
    'Loading approved requisitions…',
    'Chargement des demandes approuvées…',
  ],
  重新读取采购申请: ['Reload requisitions', 'Recharger les demandes'],
  '正在读取可用供应商…': [
    'Loading available suppliers…',
    'Chargement des fournisseurs disponibles…',
  ],
  重新读取供应商: ['Reload suppliers', 'Recharger les fournisseurs'],
  没有可执行的已确认采购申请: [
    'No approved requisitions available for execution',
    'Aucune demande approuvée à exécuter',
  ],
  采购执行详情: [
    'Purchasing execution details',
    'Détails de l’exécution des achats',
  ],
  父单详情: ['Parent order details', 'Détails de la commande mère'],
  状态: ['Status', 'État'],
  主币种: ['Primary currency', 'Devise principale'],
  条材料: ['material lines', 'lignes de matériaux'],
  '市场直采已开始；可直接登记收货，无需 RFQ 或供应商子订单。': [
    'Market purchasing started; record receipts directly without an RFQ or supplier order.',
    'Achat direct commencé ; enregistrez les réceptions sans consultation ni commande fournisseur.',
  ],
  '无法开始市场直采，请检查模式、状态及授权。': [
    'Cannot start market purchasing. Check mode, status and authorization.',
    'Impossible de commencer l’achat direct. Vérifiez le mode, l’état et les autorisations.',
  ],
  开始市场直采: ['Start market purchasing', 'Commencer l’achat direct'],
  供应商子订单: ['Supplier child order', 'Sous-commande fournisseur'],
  draft: ['Draft', 'Brouillon'],
  pending_confirmation: ['Awaiting approval', 'En attente d’approbation'],
  approved: ['Approved', 'Approuvée'],
  confirmed: ['Approved', 'Approuvée'],
  executing: ['Purchasing in progress', 'Achats en cours'],
  receiving: ['Receiving', 'Réception en cours'],
  formally_issued: ['Formally issued', 'Émise officiellement'],
  completed: ['Completed', 'Terminée'],
  completed_with_conditions: [
    'Completed with conditions',
    'Terminée sous conditions',
  ],
  cancelled: ['Cancelled', 'Annulée'],
  rejected: ['Rejected', 'Rejetée'],
  sent: ['Sent', 'Envoyée'],
  unknown: ['Unknown status', 'État inconnu'],
} as const
export type ExecutionMessage = keyof typeof messages
const zhStatus: Record<string, string> = {
  draft: '草稿',
  pending_confirmation: '待审批',
  approved: '已批准',
  confirmed: '已批准',
  executing: '采购执行中',
  receiving: '收货中',
  formally_issued: '已正式签发',
  completed: '已完成',
  completed_with_conditions: '有条件完成',
  cancelled: '已取消',
  rejected: '已驳回',
  sent: '已发送',
  unknown: '未知状态',
}
export function executionText(locale: UiLocale, key: ExecutionMessage): string {
  return locale === 'zh'
    ? (zhStatus[key] ?? key)
    : messages[key][locale === 'en' ? 0 : 1]
}
export function executionStatus(locale: UiLocale, status: string): string {
  return executionText(
    locale,
    status in zhStatus ? (status as ExecutionMessage) : 'unknown',
  )
}
