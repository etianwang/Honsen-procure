export const rfqMessages = {
  zh: {
    unnumbered: '未正式编号',
    loading: '正在读取询价单…',
    saving: '正在更新询价单状态…',
    loadFailed: '无法读取询价单列表；已有记录已保留。',
    retry: '重新读取询价单',
    empty: '暂无询价单',
  },
  en: {
    unnumbered: 'Not formally numbered',
    loading: 'Loading RFQs…',
    saving: 'Updating RFQ status…',
    loadFailed: 'Cannot load RFQs. Previously loaded records are retained.',
    retry: 'Reload RFQs',
    empty: 'No RFQs',
  },
  fr: {
    unnumbered: 'Sans numéro officiel',
    loading: 'Chargement des demandes de prix…',
    saving: 'Mise à jour du statut de la demande…',
    loadFailed:
      'Impossible de charger les demandes. Les enregistrements déjà chargés sont conservés.',
    retry: 'Recharger les demandes',
    empty: 'Aucune demande de prix',
  },
} as const
