import type { UiLocale } from './ui-locale'

const messages = {
  今日概览: ['Overview today', 'Vue du jour'],
  '当前授权范围内已保存的采购申请；统计按父单计算。': [
    'Saved requisitions in the authorized scope; statistics count parent orders.',
    'Demandes enregistrées dans le périmètre autorisé ; statistiques par commande mère.',
  ],
  新建采购申请: ['New requisition', 'Nouvelle demande'],
  刷新待办: ['Refresh work queue', 'Actualiser les tâches'],
  '无法读取已保存订单，请刷新重试或重新登录。': [
    'Unable to read saved orders. Refresh or sign in again.',
    'Impossible de lire les commandes enregistrées. Actualisez ou reconnectez-vous.',
  ],
  '正在读取已保存订单…': ['Loading saved orders…', 'Chargement des commandes…'],
  采购统计: ['Purchasing statistics', 'Statistiques des achats'],
  待审批: ['Awaiting approval', 'En attente d’approbation'],
  采购进行中: ['Purchasing in progress', 'Achats en cours'],
  待收货: ['Awaiting receipt', 'En attente de réception'],
  待处理订单: ['Work queue', 'Commandes à traiter'],
  打开请购历史: [
    'Open requisition history',
    'Ouvrir l’historique des demandes',
  ],
  单据编号: ['Document number', 'Numéro du document'],
  项目: ['Project', 'Projet'],
  工地: ['Site', 'Chantier'],
  状态: ['Status', 'État'],
  '当前授权范围内没有待处理订单。': [
    'No pending orders in the authorized scope.',
    'Aucune commande à traiter dans le périmètre autorisé.',
  ],
  '已保存申请金额（不含取消）': [
    'Saved requisition amounts (excluding cancelled orders)',
    'Montants des demandes enregistrées (hors commandes annulées)',
  ],
  '暂无已保存金额。': ['No saved amounts.', 'Aucun montant enregistré.'],
  打开采购执行与收货: [
    'Open purchasing and receiving',
    'Ouvrir les achats et réceptions',
  ],
  打开材料库: ['Open materials', 'Ouvrir les matériaux'],
  草稿: ['Draft', 'Brouillon'],
  已驳回: ['Rejected', 'Rejetée'],
  已批准: ['Approved', 'Approuvée'],
  采购执行中: ['Purchasing execution', 'Exécution des achats'],
  收货中: ['Receiving', 'Réception en cours'],
  未知状态: ['Unknown status', 'État inconnu'],
} as const
export type HomeMessage = keyof typeof messages
export function homeText(locale: UiLocale, key: HomeMessage): string {
  return locale === 'zh' ? key : messages[key][locale === 'en' ? 0 : 1]
}
export function homeMoney(
  minor: string,
  currency: string,
  locale: UiLocale,
): string {
  if (!/^\d+$/.test(minor) || !['XOF', 'CNY', 'USD', 'EUR'].includes(currency))
    throw new Error('Invalid saved amount')
  const digits = currency === 'XOF' ? 0 : 2
  const value = BigInt(minor)
  const scale = digits === 0 ? 1n : 100n
  const formatter = new Intl.NumberFormat(
    locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'fr-FR',
    {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    },
  )
  return formatter
    .formatToParts(value / scale)
    .map((part) =>
      part.type === 'fraction'
        ? String(value % scale).padStart(digits, '0')
        : part.value,
    )
    .join('')
}
