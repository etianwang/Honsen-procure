import type { UiLocale } from './ui-locale'
const messages = {
  草稿: ['Draft', 'Brouillon'],
  未知收货状态: ['Unknown receipt status', 'État de réception inconnu'],
  '当前订单状态不允许登记收货或有条件完成。': [
    'The current order status does not allow receipt or conditional completion.',
    'L’état de la commande ne permet ni la réception ni la clôture sous conditions.',
  ],
  收货登记: ['Receipt registration', 'Enregistrement des réceptions'],
  当前状态: ['Current status', 'État actuel'],
  收货状态: ['Receipt status', 'État de réception'],
  收货明细: ['Receipt lines', 'Lignes de réception'],
  订购: ['Ordered', 'Commandé'],
  累计实收: ['Received total', 'Total reçu'],
  待收: ['Outstanding', 'Restant'],
  实收数量: ['Received quantity', 'Quantité reçue'],
  超收原因: ['Over-receipt reason', 'Motif de réception excédentaire'],
  有条件完成原因: [
    'Conditional completion reason',
    'Motif de clôture sous conditions',
  ],
  登记收货: ['Record receipt', 'Enregistrer la réception'],
  按有条件完成关闭: ['Close with conditions', 'Clôturer sous conditions'],
  采购执行中: ['Purchasing in progress', 'Achats en cours'],
  收货中: ['Receiving', 'Réception en cours'],
  已发送供应商: ['Sent to supplier', 'Envoyé au fournisseur'],
  已完成: ['Completed', 'Terminé'],
  '已完成（有条件）': ['Completed with conditions', 'Terminé sous conditions'],
  '至少填写一条实收数量。': [
    'Enter at least one received quantity.',
    'Saisissez au moins une quantité reçue.',
  ],
  '收货已登记，共 {count} 条明细。': [
    'Receipt recorded: {count} lines.',
    'Réception enregistrée : {count} lignes.',
  ],
  '收货失败：超收必须填写原因，且订单必须处于可收货状态。': [
    'Receipt failed: excess quantities require a reason and the order must allow receiving.',
    'Échec : un excédent exige un motif et la commande doit autoriser la réception.',
  ],
  '有条件完成原因必填。': [
    'A conditional completion reason is required.',
    'Un motif de clôture sous conditions est obligatoire.',
  ],
  '订单已按有条件完成关闭，原因已写入审计。': [
    'Order closed with conditions; the reason is recorded in the audit.',
    'Commande clôturée sous conditions ; motif enregistré dans l’audit.',
  ],
  '关闭失败：订单必须处于可有条件关闭的状态。': [
    'Closing failed: the order must allow conditional completion.',
    'Échec : l’état de la commande doit permettre une clôture sous conditions.',
  ],
} as const
export type ReceiptMessage = keyof typeof messages
export function receiptText(locale: UiLocale, key: ReceiptMessage): string {
  return locale === 'zh' ? key : messages[key][locale === 'en' ? 0 : 1]
}
