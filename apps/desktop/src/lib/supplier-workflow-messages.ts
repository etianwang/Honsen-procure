import type { UiLocale } from './ui-locale'
const messages = {
  供应商子单条款: [
    'Supplier order terms',
    'Conditions de la commande fournisseur',
  ],
  '子单只使用一种币种；保存后的税、折扣、运费和金额会写入不可变审计。': [
    'Each child order uses one currency; saved taxes, discounts, freight and amounts are recorded in immutable audit.',
    'Chaque sous-commande utilise une devise ; taxes, remises, transport et montants enregistrés sont audités de manière immuable.',
  ],
  子单明细条款: ['Child line terms', 'Conditions des lignes'],
  '行折扣（最小货币单位）': [
    'Line discount (minor units)',
    'Remise de ligne (unités monétaires minimales)',
  ],
  '行运费（最小货币单位）': [
    'Line freight (minor units)',
    'Transport de ligne (unités monétaires minimales)',
  ],
  行折扣: ['Line discount', 'Remise de ligne'],
  行运费: ['Line freight', 'Transport de ligne'],
  单价已含运费: [
    'Freight included in unit price',
    'Transport inclus dans le prix unitaire',
  ],
  '税率（基点；18% = 1800）': [
    'Tax rate (basis points; 18% = 1800)',
    'Taux de taxe (points de base ; 18 % = 1800)',
  ],
  子单税率: ['Child tax rate', 'Taux de taxe de la sous-commande'],
  '单据折扣（最小货币单位）': [
    'Order discount (minor units)',
    'Remise de commande (unités monétaires minimales)',
  ],
  '单据运费（最小货币单位）': [
    'Order freight (minor units)',
    'Transport de commande (unités monétaires minimales)',
  ],
  子单单据折扣: ['Child order discount', 'Remise de sous-commande'],
  子单单据运费: ['Child order freight', 'Transport de sous-commande'],
  保存子单条款: ['Save child terms', 'Enregistrer les conditions'],
  发送供应商: ['Send to supplier', 'Envoyer au fournisseur'],
  '税率、折扣和运费必须为非负整数金额/基点。': [
    'Tax, discount and freight must be nonnegative integer minor units/basis points.',
    'Taxe, remise et transport doivent être des entiers positifs ou nuls en unités minimales/points de base.',
  ],
  '保存失败：请确认子单仍为草稿且所有金额有效。': [
    'Save failed: check the child is still a draft and all amounts are valid.',
    'Échec : vérifiez que la sous-commande est un brouillon et que les montants sont valides.',
  ],
  '请先保存税、折扣和运费条款。': [
    'Save tax, discount and freight terms first.',
    'Enregistrez d’abord les conditions de taxe, remise et transport.',
  ],
  '供应商子单已签发 SPO 并发送，可开始登记收货。': [
    'Supplier SPO issued and sent; receipts can now be recorded.',
    'SPO fournisseur émise et envoyée ; les réceptions peuvent être enregistrées.',
  ],
  '发送失败：请确认父单已批准、子单条款已保存且订单尚未签发；原条款已保留。': [
    'Send failed: check parent approval, saved terms and unissued status; original terms retained.',
    'Échec de l’envoi : vérifiez approbation, conditions enregistrées et absence d’émission ; conditions conservées.',
  ],
  '询价单（RFQ）': ['Request for quotation (RFQ)', 'Demande de prix (RFQ)'],
  '询价单只复制材料、规格、数量和单位，不包含采购价格。': [
    'RFQs copy materials, specifications, quantities and units only; no purchase prices.',
    'Les demandes de prix copient uniquement matériaux, spécifications, quantités et unités, sans prix d’achat.',
  ],
  '无法读取询价单，请重试。': [
    'Cannot read RFQs. Retry.',
    'Impossible de lire les demandes de prix. Réessayez.',
  ],
  '请选择供应商并填写询价单编号。': [
    'Select a supplier and enter an RFQ number.',
    'Sélectionnez un fournisseur et saisissez un numéro de demande.',
  ],
  '询价单已创建，但列表刷新失败，请重试。': [
    'RFQ created, but list refresh failed. Retry.',
    'Demande créée, mais actualisation échouée. Réessayez.',
  ],
  '创建失败：请确认内部请购单已确认且该币种有材料。': [
    'Creation failed: check internal approval and materials in this currency.',
    'Création échouée : vérifiez l’approbation interne et les matériaux dans cette devise.',
  ],
  '询价单状态更新失败；原状态已保留，请重试。': [
    'RFQ status update failed; original status retained. Retry.',
    'Modification de l’état échouée ; état initial conservé. Réessayez.',
  ],
  '询价单已发送。': ['RFQ sent.', 'Demande de prix envoyée.'],
  '询价单已关闭。': ['RFQ closed.', 'Demande de prix clôturée.'],
  '询价单状态已保存，但列表刷新失败，请重试。': [
    'RFQ status saved, but list refresh failed. Retry.',
    'État enregistré, mais actualisation échouée. Réessayez.',
  ],
  供应商: ['Supplier', 'Fournisseur'],
  'RFQ 供应商': ['RFQ supplier', 'Fournisseur RFQ'],
  选择供应商: ['Select supplier', 'Sélectionner un fournisseur'],
  询价币种: ['Quotation currency', 'Devise du devis'],
  'RFQ 币种': ['RFQ currency', 'Devise RFQ'],
  询价单编号: ['RFQ number', 'Numéro RFQ'],
  创建询价单: ['Create RFQ', 'Créer une demande de prix'],
  已有询价单: ['Existing RFQs', 'Demandes de prix existantes'],
  条材料: ['material lines', 'lignes de matériaux'],
  '状态：': ['Status:', 'État :'],
  草稿: ['Draft', 'Brouillon'],
  已发送: ['Sent', 'Envoyée'],
  已关闭: ['Closed', 'Clôturée'],
  发送询价单: ['Send RFQ', 'Envoyer la demande'],
  关闭询价单: ['Close RFQ', 'Clôturer la demande'],
  saved: [
    'Child terms saved; total including tax {total}.',
    'Conditions enregistrées ; total TTC {total}.',
  ],
  issued: [
    'Supplier order {number} issued and sent; receipts can now be recorded.',
    'Commande fournisseur {number} émise et envoyée ; réceptions disponibles.',
  ],
  created: [
    'RFQ {number} created with {count} unpriced lines.',
    'Demande {number} créée avec {count} lignes sans prix.',
  ],
} as const
export type SupplierMessage = keyof typeof messages
const zhDynamic = {
  saved: '子单条款已保存，含税总额 {total}。',
  issued: '供应商子单已签发 {number} 并发送，可开始登记收货。',
  created: '询价单 {number} 已创建，包含 {count} 条无价格明细。',
}
export type SupplierNotice = {
  key: SupplierMessage
  values?: Record<string, string | number>
}
export function supplierText(
  locale: UiLocale,
  key: SupplierMessage,
  values: Record<string, string | number> = {},
): string {
  let text: string =
    locale === 'zh'
      ? key in zhDynamic
        ? zhDynamic[key as keyof typeof zhDynamic]
        : key
      : messages[key][locale === 'en' ? 0 : 1]
  for (const [name, value] of Object.entries(values))
    text = text.replaceAll(`{${name}}`, String(value))
  return text
}
