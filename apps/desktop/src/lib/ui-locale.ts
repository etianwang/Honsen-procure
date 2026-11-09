import { useSyncExternalStore } from 'react'

export type UiLocale = 'zh' | 'en' | 'fr'
const key = 'honsen.procure.ui-locale'
const listeners = new Set<() => void>()
function read(): UiLocale {
  try {
    const value = localStorage.getItem(key)
    return value === 'en' || value === 'fr' ? value : 'zh'
  } catch {
    return 'zh'
  }
}
let current: UiLocale = read()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function setUiLocale(value: UiLocale) {
  current = value
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Storage failure does not lose the active draft. */
  }
  listeners.forEach((listener) => listener())
}
export function useUiLocale() {
  const locale = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'zh' as UiLocale,
  )
  return { locale, setLocale: setUiLocale }
}

const messages = {
  '超级管理员不会自动获得项目范围；查看报价需要有效项目授权，维护另需管理员或采购员角色。':
    [
      'Super administrators do not automatically receive project scopes. Viewing quotes requires valid project access; maintenance additionally requires an administrator or purchaser role.',
      'Les super administrateurs ne reçoivent pas automatiquement de périmètre de projet. Consulter les devis exige un accès valide ; leur maintenance exige aussi un rôle administrateur ou acheteur.',
    ],
  '连接或同步失败，当前尚无可用的本地项目上下文；请重试同步，不代表服务器已拒绝项目授权。':
    [
      'Connection or sync failed and no usable local project context is available. Retry synchronization; this does not establish a server authorization refusal.',
      'Connexion ou synchronisation échouée et aucun contexte de projet local disponible. Réessayez ; cela ne prouve pas un refus d’autorisation serveur.',
    ],
  '已加载授权范围，但当前项目尚未就绪；请从顶部授权范围中选择项目。': [
    'Authorized scopes are loaded, but the current project is not ready. Select a scope in the header.',
    'Les périmètres autorisés sont chargés, mais le projet courant n’est pas prêt. Sélectionnez un périmètre dans l’en-tête.',
  ],
  '无法读取本地授权资料；请重试同步或重新登录，当前不能判定为缺少项目授权。': [
    'Local authorization data could not be read. Retry synchronization or sign in again; missing project authorization is not established.',
    'Impossible de lire les autorisations locales. Synchronisez ou reconnectez-vous ; l’absence de droits au projet n’est pas établie.',
  ],
  修改密码: ['Change password', 'Modifier le mot de passe'],
  '修改密码需要在线登录和可用连接。': [
    'Changing the password requires online sign-in and an available connection.',
    'La modification du mot de passe exige une connexion en ligne active.',
  ],
  '超级管理员负责账号、角色和授权治理；该角色本身不授予日常采购业务权限。': [
    'Super administrators govern accounts, roles and access; this role alone does not grant daily purchasing permissions.',
    'Les super administrateurs gèrent les comptes, rôles et autorisations ; ce rôle seul n’accorde aucun droit d’achat quotidien.',
  ],
  '当前没有可用的项目业务授权。请联系授权管理员分配项目、部门和班组；修改密码不会授予这些权限。':
    [
      'No project business scope is available. Ask an authorized administrator to assign a project, department and team; changing the password does not grant these permissions.',
      'Aucun périmètre métier disponible. Demandez à un administrateur habilité d’attribuer un projet, un service et une équipe ; changer le mot de passe n’accorde pas ces droits.',
    ],
  '初始密码仍在使用，建议修改密码；可继续使用系统': [
    'The initial password is still in use. A password change is recommended; you may continue.',
    'Le mot de passe initial est toujours utilisé. Il est recommandé de le modifier ; vous pouvez continuer.',
  ],
  '服务版本已停用，请升级客户端；本地数据已保留': [
    'API version retired; upgrade the client. Local data is retained.',
    'Version API retirée ; mettez le client à jour. Les données locales sont conservées.',
  ],
  '当前账户没有有效的离线授权范围，无法新建采购申请。': [
    'This account has no valid offline authorization scope; a requisition cannot be created.',
    'Ce compte ne dispose d’aucun périmètre hors ligne valide ; impossible de créer une demande.',
  ],
  '无法切换到所选授权范围。': [
    'Cannot switch to the selected authorization scope.',
    'Impossible de sélectionner ce périmètre d’autorisation.',
  ],
  '正在加载授权范围…': [
    'Loading authorization scope…',
    'Chargement du périmètre d’autorisation…',
  ],
  主导航: ['Main navigation', 'Navigation principale'],
  采购工作台: ['Purchasing workspace', 'Espace achats'],
  首页: ['Home', 'Accueil'],
  材料库: ['Materials', 'Matériaux'],
  采购申请单: ['Purchase requisitions', 'Demandes d’achat'],
  采购执行: ['Purchasing execution', 'Exécution des achats'],
  基础资料管理: ['Master data', 'Données de référence'],
  同步冲突: ['Sync conflicts', 'Conflits de synchronisation'],
  在线授权管理: ['Online authorization', 'Autorisations en ligne'],
  即将接入: ['Coming soon', 'À venir'],
  供应商与价格: ['Suppliers and prices', 'Fournisseurs et prix'],
  当前授权范围: ['Current authorization scope', 'Périmètre autorisé actuel'],
  同步状态: ['Sync status', 'État de synchronisation'],
  工程师: ['Engineer', 'Ingénieur'],
  采购员: ['Purchaser', 'Acheteur'],
  管理员: ['Administrator', 'Administrateur'],
  查看者: ['Viewer', 'Lecteur'],
  超级管理员: ['Super administrator', 'Super-administrateur'],
  锁定: ['Lock', 'Verrouiller'],
  工作台: ['Dashboard', 'Tableau de bord'],
  材料库总览: ['Materials overview', 'Vue des matériaux'],
  同步中: ['Synchronizing', 'Synchronisation en cours'],
  '上次同步成功；新操作可能待同步': [
    'Last sync succeeded; new changes may be pending',
    'Dernière synchronisation réussie ; nouvelles modifications éventuellement en attente',
  ],
  待同步: ['Pending sync', 'Synchronisation en attente'],
  未知: ['Unknown', 'Inconnu'],
  '连接失败，等待重试；本地数据待同步': [
    'Connection failed; retry pending; local data awaits sync',
    'Connexion échouée ; nouvelle tentative en attente ; données locales à synchroniser',
  ],
  '登录已失效，请重新在线登录': [
    'Session expired; sign in online again',
    'Session expirée ; reconnectez-vous en ligne',
  ],
  '多账号拉取已暂停，需先完成账号隔离恢复': [
    'Multi-account pull paused; account isolation recovery required',
    'Récupération multi-compte suspendue ; restauration de l’isolation des comptes requise',
  ],
  离线本地数据: ['Offline local data', 'Données locales hors ligne'],
  未解决冲突: ['Unresolved conflicts', 'Conflits non résolus'],
  '项报价失效，请撤回采购单并重新选价': [
    'quotes invalid; withdraw the requisition and select prices again',
    'devis invalides ; retirez la demande et sélectionnez de nouveau les prix',
  ],
  待归属旧事件: [
    'Unassigned legacy events',
    'Événements anciens non attribués',
  ],
  上次拉取成功: ['Last successful pull', 'Dernière réception réussie'],
} as const
export type ShellMessage = keyof typeof messages
export function shellText(locale: UiLocale, message: ShellMessage): string {
  return locale === 'zh' || !messages[message]
    ? message
    : messages[message][locale === 'en' ? 0 : 1]
}
