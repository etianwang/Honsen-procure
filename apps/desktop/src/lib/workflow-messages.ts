import type { UiLocale } from './ui-locale'
const messages = {
  '正在读取评论…': ['Loading comments…', 'Chargement des commentaires…'],
  '正在读取审计…': ['Loading audit records…', 'Chargement des traces d’audit…'],
  '评论读取失败；已加载内容已保留。': [
    'Cannot load comments. Previously loaded content is retained.',
    'Impossible de charger les commentaires. Le contenu déjà chargé est conservé.',
  ],
  '审计读取失败；已加载内容已保留。': [
    'Cannot load audit records. Previously loaded content is retained.',
    'Impossible de charger les traces d’audit. Le contenu déjà chargé est conservé.',
  ],
  重新读取评论: ['Reload comments', 'Recharger les commentaires'],
  重新读取审计: ['Reload audit records', 'Recharger les traces d’audit'],
  暂无内部评论: ['No internal comments', 'Aucun commentaire interne'],
  暂无审计记录: ['No audit records', 'Aucune trace d’audit'],
  '印花税（手填）': ['Stamp duty (manual)', 'Droit de timbre (manuel)'],
  草稿: ['Draft', 'Brouillon'],
  已批准: ['Approved', 'Approuvée'],
  已正式签发: ['Formally issued', 'Émise officiellement'],
  执行中: ['Executing', 'En cours d’exécution'],
  收货中: ['Receiving', 'Réception en cours'],
  已完成: ['Completed', 'Terminée'],
  有条件完成: ['Completed with conditions', 'Terminée sous conditions'],
  已取消: ['Cancelled', 'Annulée'],
  审批与内部留言: [
    'Approval and internal comments',
    'Approbation et commentaires internes',
  ],
  '订单已确认，审批记录已写入审计。': [
    'Order confirmed; approval recorded in audit.',
    'Commande confirmée ; approbation enregistrée dans l’audit.',
  ],
  '确认失败：不能确认自己的订单或当前状态不允许确认。': [
    'Confirmation failed: self-approval or current state is not permitted.',
    'Confirmation impossible : auto-approbation ou état actuel non autorisé.',
  ],
  '驳回原因必填。': [
    'Rejection reason required.',
    'Motif de rejet obligatoire.',
  ],
  '订单已驳回，申请人可修改后重新提交。': [
    'Order rejected; applicant may revise and resubmit.',
    'Commande rejetée ; le demandeur peut modifier et soumettre à nouveau.',
  ],
  '驳回失败，请稍后重试。': [
    'Rejection failed; retry later.',
    'Rejet échoué ; réessayez plus tard.',
  ],
  '评论发送失败。': [
    'Comment could not be sent.',
    'Impossible d’envoyer le commentaire.',
  ],
  '当前状态：': ['Current status:', 'État actuel :'],
  审批状态: ['Approval status', 'État d’approbation'],
  待确认: ['Pending confirmation', 'En attente de confirmation'],
  已确认: ['Confirmed', 'Confirmée'],
  已驳回: ['Rejected', 'Rejetée'],
  未知状态: ['Unknown status', 'État inconnu'],
  确认订单: ['Confirm order', 'Confirmer la commande'],
  驳回原因: ['Rejection reason', 'Motif du rejet'],
  '填写驳回原因（必填）': [
    'Enter rejection reason (required)',
    'Saisir le motif du rejet (obligatoire)',
  ],
  驳回订单: ['Reject order', 'Rejeter la commande'],
  修改留痕: ['Revision history', 'Historique des modifications'],
  '修改原因：': ['Revision reason:', 'Motif de modification :'],
  字段差异: ['Field differences', 'Différences des champs'],
  内部报价明细: ['Internal pricing details', 'Détails internes des prix'],
  手工参考报价: ['Manual reference quote', 'Devis de référence manuel'],
  目录报价: ['Catalog quote', 'Devis du catalogue'],
  '手工例外：': ['Manual exception:', 'Exception manuelle :'],
  '报价修订原因：': ['Pricing revision reason:', 'Motif de révision du prix :'],
  '供应商：': ['Supplier:', 'Fournisseur :'],
  '原始价格：': ['Source price:', 'Prix initial :'],
  '汇率：': ['Exchange rate:', 'Taux de change :'],
  '换算参考价：': ['Converted reference:', 'Référence convertie :'],
  '加价：': ['Markup:', 'Majoration :'],
  '最终价格：': ['Final price:', 'Prix final :'],
  内部评论: ['Internal comments', 'Commentaires internes'],
  '留言（支持 @某人）': [
    'Comment (supports @mentions)',
    'Commentaire (mentions @ prises en charge)',
  ],
  发送评论: ['Send comment', 'Envoyer le commentaire'],
  材料: ['Material', 'Matériau'],
  '手工参考价（无供应商）': [
    'Manual reference (no supplier)',
    'Référence manuelle (sans fournisseur)',
  ],
  币种: ['Currency', 'Devise'],
  交付地址: ['Delivery address', 'Adresse de livraison'],
  期望到货日期: ['Expected delivery date', 'Date de livraison prévue'],
  备注: ['Notes', 'Notes'],
  税率: ['Tax rate', 'Taux de taxe'],
  订单总额: ['Order total', 'Total de commande'],
  采购明细: ['Order lines', 'Lignes de commande'],
  '（空）': ['(empty)', '(vide)'],
} as const
export type WorkflowMessage = keyof typeof messages
export function workflowText(locale: UiLocale, key: WorkflowMessage): string {
  return locale === 'zh' ? key : messages[key][locale === 'en' ? 0 : 1]
}
export function commentSentText(locale: UiLocale, count: number): string {
  return locale === 'zh'
    ? `评论已发送，已通知 ${count} 位被提及成员；发送后不可编辑或删除。`
    : locale === 'en'
      ? `Comment sent; ${count} mentioned members notified. Sent comments cannot be edited or deleted.`
      : `Commentaire envoyé ; ${count} membres mentionnés notifiés. Les commentaires envoyés ne peuvent être modifiés ni supprimés.`
}
