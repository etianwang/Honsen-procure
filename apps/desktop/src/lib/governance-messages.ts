import type { UiLocale } from './ui-locale'
const messages = {
  全局审批策略: ['Global approval policy', 'Politique globale d’approbation'],
  '默认禁止采购员或管理员确认自己的订单。': [
    'Purchasers and administrators cannot approve their own orders by default.',
    'Par défaut, acheteurs et administrateurs ne peuvent pas approuver leurs propres commandes.',
  ],
  允许自审: ['Allow self-approval', 'Autoriser l’auto-approbation'],
  '允许采购员/管理员自审': [
    'Allow purchaser/administrator self-approval',
    'Autoriser l’auto-approbation des acheteurs/administrateurs',
  ],
  修改原因: ['Change reason', 'Motif de modification'],
  策略修改原因: [
    'Policy change reason',
    'Motif de modification de la politique',
  ],
  保存策略: ['Save policy', 'Enregistrer la politique'],
  '无法读取审批策略。': [
    'Unable to read approval policy.',
    'Impossible de lire la politique d’approbation.',
  ],
  '策略修改原因必填。': [
    'A policy change reason is required.',
    'Un motif de modification est obligatoire.',
  ],
  '自审策略已更新，并已写入永久审计。': [
    'Self-approval policy updated and permanently audited.',
    'Politique mise à jour et inscrite dans l’audit permanent.',
  ],
  '策略更新失败：仅超级管理员可修改。': [
    'Policy update failed: only super administrators can change it.',
    'Échec : seuls les super-administrateurs peuvent modifier la politique.',
  ],
  同步冲突: ['Sync conflicts', 'Conflits de synchronisation'],
  付款记录: ['Payment record', 'Paiement'],
  采购订单: ['Purchase order', 'Commande d’achat'],
  材料: ['Material', 'Matériau'],
  供应商: ['Supplier', 'Fournisseur'],
  供应商报价: ['Supplier quotation', 'Offre fournisseur'],
  材料分类: ['Material category', 'Catégorie de matériau'],
  收货记录: ['Receipt record', 'Réception'],
  业务记录: ['Business record', 'Enregistrement métier'],
  云端更新: ['Server update', 'Mise à jour serveur'],
  云端删除: ['Server deletion', 'Suppression serveur'],
  云端操作: ['Server operation', 'Opération serveur'],
  '无法读取同步冲突。': [
    'Unable to read sync conflicts.',
    'Impossible de lire les conflits de synchronisation.',
  ],
  '请填写处理原因。': [
    'Enter a resolution reason.',
    'Saisissez un motif de résolution.',
  ],
  '冲突已解决，并保留审计记录。': [
    'Conflict resolved; audit retained.',
    'Conflit résolu ; audit conservé.',
  ],
  '该冲突属于其他账户或未归属旧事件，当前账户不能处理。': [
    'This conflict belongs to another account or an unassigned legacy event.',
    'Ce conflit appartient à un autre compte ou à un ancien événement non attribué.',
  ],
  '冲突处理失败，原记录已保留。': [
    'Resolution failed; original records retained.',
    'Échec de résolution ; enregistrements originaux conservés.',
  ],
  处理原因: ['Resolution reason', 'Motif de résolution'],
  云端版本: ['Server version', 'Version serveur'],
  比较本地与云端内容: [
    'Compare local and server content',
    'Comparer les contenus local et serveur',
  ],
  本地: ['Local', 'Local'],
  云端: ['Server', 'Serveur'],
  创建替代草稿: [
    'Create replacement draft',
    'Créer un brouillon de remplacement',
  ],
  保留本地: ['Keep local', 'Conserver la version locale'],
  采用云端: ['Use server', 'Utiliser la version serveur'],
  '没有待处理的同步冲突。': [
    'No unresolved sync conflicts.',
    'Aucun conflit de synchronisation à résoudre.',
  ],
} as const
export type GovernanceMessage = keyof typeof messages
export function governanceText(
  locale: UiLocale,
  key: GovernanceMessage,
): string {
  return locale === 'zh' ? key : messages[key][locale === 'en' ? 0 : 1]
}
