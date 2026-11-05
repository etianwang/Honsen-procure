import type { UiLocale } from './ui-locale'
const messages = {
  '印花税（手填，单据币种最小单位）': [
    'Stamp duty (manual, document currency minor units)',
    'Droit de timbre (manuel, unités minimales de la devise du document)',
  ],
  报价来源: ['Quote source', 'Source du devis'],
  目录报价: ['Catalog quote', 'Devis du catalogue'],
  '手工参考价（需原因）': [
    'Manual reference (reason required)',
    'Référence manuelle (motif obligatoire)',
  ],
  选择报价: ['Select quote', 'Sélectionner un devis'],
  请选择报价: ['Choose a quote', 'Choisissez un devis'],
  '手工参考单价（最小货币单位）': [
    'Manual reference unit price (minor units)',
    'Prix unitaire de référence manuel (unités minimales)',
  ],
  手工参考原因: ['Manual reference reason', 'Motif de référence manuelle'],
  锁定汇率: ['Locked exchange rate', 'Taux de change figé'],
  加价方式: ['Markup method', 'Méthode de majoration'],
  '百分比（基点）': [
    'Percentage (basis points)',
    'Pourcentage (points de base)',
  ],
  固定每单位金额: ['Fixed amount per unit', 'Montant fixe par unité'],
  '加价（基点）': ['Markup (basis points)', 'Majoration (points de base)'],
  加价: ['Markup', 'Majoration'],
  '换算参考单价（只读）': [
    'Converted reference unit price (read-only)',
    'Prix de référence converti (lecture seule)',
  ],
  '最终单价（只读）': [
    'Final unit price (read-only)',
    'Prix unitaire final (lecture seule)',
  ],
  '手工参考价会被审计，且不会写回材料目录。': [
    'Manual reference pricing is audited and never written to the catalog.',
    'Le prix de référence manuel est audité et n’est jamais écrit dans le catalogue.',
  ],
  '来源：': ['Source:', 'Source :'],
  '自动保存失败；请检查授权、材料和订单内容后手动保存。': [
    'Autosave failed; check authorization, materials and order contents, then save manually.',
    'Échec de sauvegarde automatique ; vérifiez droits, matériaux et contenu, puis enregistrez manuellement.',
  ],
  '无法读取供应商报价。': [
    'Unable to read supplier quotes.',
    'Impossible de lire les devis fournisseurs.',
  ],
  '复制会替换当前编辑区；请先保存当前草稿。是否继续？': [
    'Copying replaces the current editor. Save your draft first. Continue?',
    'La copie remplace l’éditeur actuel. Enregistrez le brouillon. Continuer ?',
  ],
  '已复制材料和数量到未保存的新草稿；请重新选择现行材料、报价、税率及其他费用后保存。':
    [
      'Materials and quantities copied to a new unsaved draft; select current materials, quotes, tax and charges before saving.',
      'Matériaux et quantités copiés dans un nouveau brouillon non enregistré ; sélectionnez matériaux, devis, taxes et frais actuels avant sauvegarde.',
    ],
  草稿已自动保存到本机: [
    'Draft saved locally',
    'Brouillon enregistré localement',
  ],
  '所选报价已失效或不可用，请重新选择；原草稿已保留。': [
    'Selected quote invalid or unavailable; select again. Original draft retained.',
    'Devis sélectionné invalide ou indisponible ; sélectionnez à nouveau. Brouillon initial conservé.',
  ],
  '保存失败，请检查订单内容；原草稿已保留。': [
    'Save failed; check order contents. Original draft retained.',
    'Échec de sauvegarde ; vérifiez le contenu. Brouillon initial conservé.',
  ],
  '请完成材料、数量和金额后再提交。': [
    'Complete materials, quantities and amounts before submitting.',
    'Renseignez matériaux, quantités et montants avant soumission.',
  ],
  '采购申请已提交，状态：待确认': [
    'Requisition submitted; awaiting confirmation',
    'Demande soumise ; en attente de confirmation',
  ],
  '提交失败，请检查订单内容。': [
    'Submission failed; check order contents.',
    'Soumission échouée ; vérifiez le contenu.',
  ],
  '申请已撤回为草稿，审计记录已保留。': [
    'Requisition withdrawn to draft; audit retained.',
    'Demande retirée en brouillon ; audit conservé.',
  ],
  '撤回失败：仅申请人可撤回待确认且授权有效的请购。': [
    'Withdrawal failed: only the authorized applicant may withdraw a pending requisition.',
    'Retrait impossible : seul le demandeur autorisé peut retirer une demande en attente.',
  ],
  新建采购申请: ['New requisition', 'Nouvelle demande d’achat'],
  '草稿仅保存在本机，联网后再同步。': [
    'Drafts are local; synchronize after reconnecting.',
    'Brouillons conservés localement ; synchronisez après reconnexion.',
  ],
  待确认: ['Pending confirmation', 'En attente de confirmation'],
  草稿: ['Draft', 'Brouillon'],
  材料明细: ['Material lines', 'Lignes de matériaux'],
  采购模式: ['Procurement mode', 'Mode d’achat'],
  业主自行采购: ['Owner self-purchase', 'Achat direct du maître d’ouvrage'],
  弘盛自行采购: ['Honsen self-purchase', 'Achat Honsen'],
  '税率（基点）': ['Tax rate (basis points)', 'Taux de taxe (points de base)'],
  '价格修订原因（已有定价时必填）': [
    'Pricing revision reason (required for existing prices)',
    'Motif de révision du prix (obligatoire pour les prix existants)',
  ],
  价格修订原因: ['Pricing revision reason', 'Motif de révision du prix'],
  '基础草稿已保存，报价定价未完成': [
    'Base draft saved; quotation pricing incomplete',
    'Brouillon de base enregistré ; tarification incomplète',
  ],
  '请检查报价、汇率和修订原因后再次保存；系统已阻止提交审批。': [
    'Check quote, exchange rate and revision reason, then save again; approval submission blocked.',
    'Vérifiez devis, taux et motif, puis enregistrez ; soumission à approbation bloquée.',
  ],
  删除: ['Delete', 'Supprimer'],
  材料: ['Material', 'Matériau'],
  选择材料: ['Select material', 'Sélectionner un matériau'],
  '历史材料：': ['Historical material:', 'Matériau historique :'],
  '；请重新选择现行材料。': [
    '; select a current material again.',
    ' ; sélectionnez un matériau actuel.',
  ],
  币种: ['Currency', 'Devise'],
  行币种: ['Line currency', 'Devise de ligne'],
  '选择供应商报价（当前来源：': [
    'Select supplier quote (current source:',
    'Sélectionner un devis fournisseur (source actuelle :',
  ],
  手工价格: ['Manual price', 'Prix manuel'],
  选择供应商报价: [
    'Select supplier quote',
    'Sélectionner un devis fournisseur',
  ],
  加载更多报价: ['Load more quotes', 'Charger davantage de devis'],
  数量: ['Quantity', 'Quantité'],
  单位: ['Unit', 'Unité'],
  '单价（最小货币单位）': [
    'Unit price (minor units)',
    'Prix unitaire (unités minimales)',
  ],
  '行折扣（最小货币单位）': [
    'Line discount (minor units)',
    'Remise de ligne (unités minimales)',
  ],
  '行运费（最小货币单位）': [
    'Line freight (minor units)',
    'Transport de ligne (unités minimales)',
  ],
  新增材料行: ['Add material line', 'Ajouter une ligne'],
  保存草稿: ['Save draft', 'Enregistrer le brouillon'],
  提交确认: ['Submit for confirmation', 'Soumettre à confirmation'],
  '申请已驳回，可修改报价并重新提交。': [
    'Requisition rejected; revise prices and resubmit.',
    'Demande rejetée ; modifiez les prix puis soumettez à nouveau.',
  ],
  撤回申请: ['Withdraw requisition', 'Retirer la demande'],
  金额汇总: ['Amount summary', 'Récapitulatif des montants'],
  订单总金额: ['Order total', 'Total de commande'],
  待供应商拆单后汇总主币种: [
    'Primary total available after supplier allocation',
    'Total principal disponible après répartition fournisseurs',
  ],
  待填写: ['Incomplete', 'À compléter'],
  小计: ['Subtotal', 'Sous-total'],
  折扣: ['Discount', 'Remise'],
  运费: ['Freight', 'Transport'],
  税额: ['Tax', 'Taxe'],
  '源币种小计：': [
    'Source-currency subtotals:',
    'Sous-totaux en devises sources :',
  ],
} as const
export type RequisitionMessage = keyof typeof messages
export function requisitionText(
  locale: UiLocale,
  key: RequisitionMessage,
): string {
  return locale === 'zh' ? key : messages[key][locale === 'en' ? 0 : 1]
}
