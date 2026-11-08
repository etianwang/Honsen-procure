import type { UiLocale } from './ui-locale'
const messages = {
  业主自购: ['Owner self-purchase', 'Achat par le propriétaire'],
  Honsen自购: ['Honsen purchasing', 'Achat par Honsen'],
  未知状态: ['Unknown status', 'Statut inconnu'],
  其他历史操作: ['Other recorded action', 'Autre action enregistrée'],
  '打印 / Imprimer · PDF': ['Print / PDF', 'Imprimer / PDF'],
  请购历史: ['Requisition history', 'Historique des demandes'],
  申请人: ['Applicant', 'Demandeur'],
  申请日期: ['Application date', 'Date de demande'],
  申请日期从: ['Application date from', 'Date de demande du'],
  申请日期至: ['Application date to', 'Date de demande au'],
  '结束日期不能早于开始日期。': [
    'End date must not precede start date.',
    'La date de fin doit suivre la date de début.',
  ],
  '导出当前筛选范围的全部授权记录，包含内部评论与审计；此文件用于内部核对。': [
    'Export all authorized records matching the applied filter, including internal comments and audit metadata; for internal review.',
    'Exporter les données autorisées du filtre appliqué, commentaires et audit inclus ; usage interne.',
  ],
  Excel导出语言: ['Excel export language', 'Langue de l’export Excel'],
  导出Excel: ['Export Excel', 'Exporter Excel'],
  '导出失败，未下载部分结果；请刷新列表后重试。': [
    'Export failed; no partial result downloaded. Refresh the list and retry.',
    'Échec de l’export ; aucun résultat partiel téléchargé. Actualisez puis réessayez.',
  ],
  '搜索单号、项目或工地': [
    'Search number, project or site',
    'Rechercher numéro, projet ou chantier',
  ],
  请购状态: ['Requisition status', 'Statut de la demande'],
  全部状态: ['All statuses', 'Tous les statuts'],
  草稿: ['Draft', 'Brouillon'],
  待确认: ['Pending confirmation', 'En attente de confirmation'],
  已驳回: ['Rejected', 'Rejeté'],
  已批准: ['Approved', 'Approuvé'],
  '已批准（新状态）': ['Approved', 'Approuvé'],
  已发单: ['Issued', 'Émis'],
  采购执行中: ['Purchasing in progress', 'Achats en cours'],
  收货中: ['Receiving', 'Réception en cours'],
  已完成: ['Completed', 'Terminé'],
  附条件完成: ['Completed with conditions', 'Terminé sous conditions'],
  已取消: ['Cancelled', 'Annulé'],
  仅当前项目: ['Current project only', 'Projet actuel uniquement'],
  筛选: ['Filter', 'Filtrer'],
  '历史加载失败。': [
    'History could not be loaded.',
    'Impossible de charger l’historique.',
  ],
  重试: ['Retry', 'Réessayer'],
  '暂无请购记录。': ['No requisitions.', 'Aucune demande.'],
  '查看详情：': ['View details: ', 'Voir le détail : '],
  加载更多: ['Load more', 'Charger plus'],
  '详情读取失败或无权查看。': [
    'Unable to read details or access denied.',
    'Lecture impossible ou accès refusé.',
  ],
  '撤回失败：当前状态或授权不允许撤回。': [
    'Withdrawal denied by the current status or authorization.',
    'Retrait refusé par le statut ou l’autorisation.',
  ],
  '正式下达失败：请检查审批状态、授权和冻结报价。': [
    'Issue failed; check approval, authorization and frozen pricing.',
    'Émission échouée ; vérifiez approbation, autorisation et prix figés.',
  ],
  '正在读取详情…': ['Loading details…', 'Chargement du détail…'],
  请购详情: ['Requisition details', 'Détail de la demande'],
  撤回历史申请: ['Withdraw requisition', 'Retirer la demande'],
  正式下达业主申请: [
    'Issue owner requisition',
    'Émettre la demande propriétaire',
  ],
  '正式签发 HPA': ['Issue formal HPA', 'Émettre le HPA'],
  复制为新草稿: ['Copy to new draft', 'Copier en nouveau brouillon'],
  '仅当前项目中已记录采购模式且包含材料的请购可复制。': [
    'Only current-project requisitions with a saved procurement mode and materials can be copied.',
    'Seules les demandes du projet actuel avec mode enregistré et matériaux peuvent être copiées.',
  ],
  历史模式未记录: [
    'Historical mode not recorded',
    'Mode historique non enregistré',
  ],
  '正式编号：': ['Formal number: ', 'Numéro officiel : '],
  '申请日期：': ['Order date: ', 'Date de demande : '],
  '交货地址：': ['Delivery address: ', 'Adresse de livraison : '],
  '预计到货：': ['Expected delivery: ', 'Livraison prévue : '],
  '备注：': ['Notes: ', 'Notes : '],
  请购明细: ['Requisition lines', 'Lignes de la demande'],
  '总额：': ['Total: ', 'Total : '],
  附件: ['Attachments', 'Pièces jointes'],
  无附件: ['No attachments', 'Aucune pièce jointe'],
  审计记录: ['Audit history', 'Historique d’audit'],
  无审计记录: ['No audit records', 'Aucun audit'],
  正式单据打印预览: ['Formal document preview', 'Aperçu du document officiel'],
  '正式单据预览 / Aperçu': [
    'Preview formal document',
    'Aperçu du document officiel',
  ],
  '无法预览：请检查授权、正式签发状态及冻结文档翻译。': [
    'Preview unavailable; check authorization, formal issue and frozen document translations.',
    'Aperçu indisponible ; vérifiez autorisation, émission et traductions documentaires figées.',
  ],
} as const
export const historyMessageKeys = Object.keys(
  messages,
) as (keyof typeof messages)[]
export type HistoryMessage = keyof typeof messages
export function historyText(locale: UiLocale, message: HistoryMessage): string {
  return locale === 'zh' ? message : messages[message][locale === 'en' ? 0 : 1]
}

const auditLabels: Record<string, readonly [string, string, string]> = {
  formally_issued: [
    '正式单据已签发',
    'Formal document issued',
    'Document officiel émis',
  ],
  submitted: ['采购申请已提交', 'Requisition submitted', 'Demande soumise'],
  confirmed: ['审批已确认', 'Approval recorded', 'Approbation enregistrée'],
  self_confirmed: [
    '自行审批已确认',
    'Self-approval recorded',
    'Auto-approbation enregistrée',
  ],
  draft_saved: ['草稿已保存', 'Draft saved', 'Brouillon enregistré'],
  supplier_terms_saved: [
    '供应商条款已保存',
    'Supplier terms saved',
    'Conditions fournisseur enregistrées',
  ],
  supplier_terms_completed: [
    '供应商条款已完成',
    'Supplier terms completed',
    'Conditions fournisseur finalisées',
  ],
  owner_pricing_saved: [
    '业主报价已保存',
    'Owner pricing saved',
    'Prix propriétaire enregistrés',
  ],
  procurement_mode_set: [
    '采购模式已选择',
    'Procurement mode selected',
    'Mode d’achat sélectionné',
  ],
  created_from_parent: [
    '已从父单创建',
    'Created from parent order',
    'Créé depuis la commande parente',
  ],
  supplier_children_created: [
    '供应商子单已创建',
    'Supplier orders created',
    'Commandes fournisseur créées',
  ],
  rfq_created: ['询价单已创建', 'RFQ created', 'Demande de prix créée'],
  rfq_sent: ['询价单已发送', 'RFQ sent', 'Demande de prix envoyée'],
  rfq_closed: ['询价单已关闭', 'RFQ closed', 'Demande de prix clôturée'],
  supplier_order_sent: [
    '供应商订单已发送',
    'Supplier order sent',
    'Commande fournisseur envoyée',
  ],
  receipt_recorded: ['收货已登记', 'Receipt recorded', 'Réception enregistrée'],
  payment_recorded: ['付款已登记', 'Payment recorded', 'Paiement enregistré'],
  closed_with_conditions: [
    '订单已附条件关闭',
    'Order closed with conditions',
    'Commande clôturée sous conditions',
  ],
  confirmed_revised: [
    '已批准申请已修订',
    'Approved requisition revised',
    'Demande approuvée révisée',
  ],
  withdrawn: ['采购申请已撤回', 'Requisition withdrawn', 'Demande retirée'],
  rejected: ['采购申请已驳回', 'Requisition rejected', 'Demande rejetée'],
  market_execution_started: [
    '市场采购已开始',
    'Market purchasing started',
    'Achat sur marché commencé',
  ],
  sync_conflict_draft_replaced: [
    '同步冲突草稿已替换',
    'Conflict draft replaced',
    'Brouillon en conflit remplacé',
  ],
  payment_sync_payload_migrated: [
    '付款同步记录已迁移',
    'Payment sync record migrated',
    'Enregistrement de synchronisation du paiement migré',
  ],
}
export function historyAuditText(locale: UiLocale, action: string): string {
  const labels = auditLabels[action]
  return labels
    ? labels[locale === 'zh' ? 0 : locale === 'en' ? 1 : 2]
    : historyText(locale, '其他历史操作')
}
