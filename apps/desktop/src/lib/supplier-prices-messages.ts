import { useUiLocale } from './ui-locale'

const messages = {
  '供应商列表，可横向滚动': [
    'Supplier list; scroll horizontally',
    'Liste des fournisseurs ; défilement horizontal',
  ],
  '报价历史，可横向滚动': [
    'Quote history; scroll horizontally',
    'Historique des devis ; défilement horizontal',
  ],
  '材料报价，可横向滚动': [
    'Material quotes; scroll horizontally',
    'Devis du matériau ; défilement horizontal',
  ],
  供应商分页: ['Supplier pages', 'Pages des fournisseurs'],
  当前页: ['Page', 'Page'],
  项: ['items', 'éléments'],
  单价: ['Unit price', 'Prix unitaire'],
  供应商与价格: ['Suppliers and prices', 'Fournisseurs et prix'],
  '当前授权国家的供应商，以及本地保留的供应材料和报价记录。': [
    'Suppliers in the authorized country, with locally retained supplied materials and quote records.',
    'Fournisseurs du pays autorisé, matériaux fournis et devis conservés localement.',
  ],
  '请选择有效项目授权后查看供应商与价格。': [
    'Select a valid authorized project to view suppliers and prices.',
    'Sélectionnez un projet autorisé pour consulter les fournisseurs et les prix.',
  ],
  '搜索供应商名称、编码或联系人': [
    'Search supplier name, code or contact',
    'Rechercher un fournisseur, code ou contact',
  ],
  '请选择供应商查看联系资料和报价记录。': [
    'Select a supplier to view contact details and quote records.',
    'Sélectionnez un fournisseur pour consulter ses coordonnées et devis.',
  ],
  供应材料与报价记录: [
    'Supplied materials and quote records',
    'Matériaux fournis et devis',
  ],
  '包含本地已保留的有效及停用记录；不代表系统外的完整交易历史。': [
    'Includes active and inactive records retained locally; it is not a history of transactions outside this system.',
    'Comprend les enregistrements actifs et désactivés conservés localement ; ne représente pas les transactions hors système.',
  ],
  '暂无已保留的报价记录。': [
    'No retained quote records.',
    'Aucun devis conservé.',
  ],
  按材料比价: ['Compare material quotes', 'Comparer les devis par matériau'],
  '搜索材料名称、型号或规格': [
    'Search material name, model or specification',
    'Rechercher matériau, modèle ou spécification',
  ],
  选择材料: ['Select material', 'Sélectionner un matériau'],
  '请选择材料以分页查看该项目可见的有效报价。': [
    'Select a material to browse active quotes visible to this project.',
    'Sélectionnez un matériau pour parcourir les devis actifs visibles dans ce projet.',
  ],
  比价分页: ['Comparison pages', 'Pages de comparaison'],
  重试报价: ['Retry quotes', 'Réessayer les devis'],
  当前页暂无报价: ['No quotes on this page', 'Aucun devis sur cette page'],
  '同币种、同单位分组排序；不同币种或单位不作高低比较。': [
    'Sorted within the same currency and unit; different currencies or units are not ranked together.',
    'Tri par devise et unité identiques ; aucune comparaison de rang entre devises ou unités différentes.',
  ],
  '已达到材料搜索结果上限，请缩小搜索范围。': [
    'The material search limit was reached. Refine your search.',
    'Limite de recherche atteinte. Affinez votre recherche.',
  ],
  '正在读取供应商…': ['Loading suppliers…', 'Chargement des fournisseurs…'],
  '正在读取报价…': ['Loading quotes…', 'Chargement des devis…'],
  '无法读取供应商或材料，请检查本地授权后重试。': [
    'Cannot read suppliers or materials. Check local authorization and retry.',
    'Lecture impossible. Vérifiez les autorisations locales et réessayez.',
  ],
  '无法读取报价；未显示不完整结果，请重试。': [
    'Cannot read quotes. Incomplete results are not displayed; retry.',
    'Lecture des devis impossible. Les résultats incomplets ne sont pas affichés ; réessayez.',
  ],
  '供应商已保存到本地；等待同步确认。': [
    'Supplier saved locally; awaiting synchronization acknowledgement.',
    'Fournisseur enregistré localement ; synchronisation en attente.',
  ],
  '报价已保存到本地；等待同步确认。': [
    'Quote saved locally; awaiting synchronization acknowledgement.',
    'Devis enregistré localement ; synchronisation en attente.',
  ],
  '供应商保存失败；输入已保留，请检查权限或字段后重试。': [
    'Supplier save failed. Input retained; check permissions or fields and retry.',
    'Échec d’enregistrement. Saisie conservée ; vérifiez les droits ou champs et réessayez.',
  ],
  '报价保存失败；输入已保留，请检查授权、供应商状态和金额后重试。': [
    'Quote save failed. Input retained; check scope, supplier status and amount, then retry.',
    'Échec du devis. Saisie conservée ; vérifiez les droits, l’état du fournisseur et le montant.',
  ],
  材料状态: ['Material status', 'État du matériau'],
  报价状态: ['Quote status', 'État du devis'],
  '只读权限：可以查看资料，不能新增或修改供应商与报价。': [
    'Read-only access: view data without creating or changing suppliers or quotes.',
    'Accès en lecture seule : consultation sans création ni modification des fournisseurs ou devis.',
  ],
  重新加载: ['Reload', 'Recharger'],
  上一页: ['Previous page', 'Page précédente'],
  下一页: ['Next page', 'Page suivante'],
} as const
export function useSupplierPricesText() {
  const { locale } = useUiLocale()
  return (key: keyof typeof messages) =>
    locale === 'zh' ? key : messages[key][locale === 'en' ? 0 : 1]
}
