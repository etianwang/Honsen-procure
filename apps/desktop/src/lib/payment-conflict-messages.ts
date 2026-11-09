export const paymentConflictMessages = {
  'zh-CN': {
    action: '确认云端付款并保留冲突原件',
    hint: '付款不可覆盖。核对原始记录后确认云端账本；需要改变付款事实时，请使用冲销和新付款。',
    pending: '处置待同步，尚未获得服务器确认。',
    confirmed: '服务器已确认付款对账处置。',
    unavailable: '暂时无法读取云端付款冲突；原始记录保留，稍后刷新重试。',
    refresh: '刷新付款处置状态',
    audit: '处置审计',
  },
  'fr-FR': {
    action: 'Confirmer le paiement serveur et conserver les originaux',
    hint: 'Un paiement est immuable. Vérifiez les originaux avant de confirmer le registre serveur. Pour corriger un paiement, utilisez une contrepassation et un nouveau paiement.',
    pending:
      'Traitement en attente de synchronisation et de confirmation serveur.',
    confirmed: 'Le serveur a confirmé le rapprochement du paiement.',
    unavailable:
      'Les conflits de paiement sont indisponibles. Les originaux sont conservés ; actualisez pour réessayer.',
    refresh: 'Actualiser le traitement des paiements',
    audit: 'Audit du traitement',
  },
  'en-US': {
    action: 'Confirm server payment and retain originals',
    hint: 'Payments are immutable. Verify the originals before confirming the server ledger. To change a payment, use a reversal and a new payment.',
    pending: 'Resolution pending synchronization and server confirmation.',
    confirmed: 'The server confirmed the payment reconciliation.',
    unavailable:
      'Payment conflicts are unavailable. Originals are retained; refresh to retry.',
    refresh: 'Refresh payment resolution status',
    audit: 'Resolution audit',
  },
} as const
