import type { UiLocale } from './ui-locale'
const messages = {
  '请使用用户名登录，英文字母 A–Z 不区分大小写；姓名不是登录账号。已有非英文用户名仍可使用。':
    [
      'Sign in with the username; A–Z letter case is ignored. Display names are not login names. Existing non-English usernames remain supported.',
      'Connectez-vous avec le nom utilisateur ; la casse des lettres A–Z est ignorée. Le nom affiché n’est pas un identifiant. Les noms utilisateurs non anglais existants restent acceptés.',
    ],
  '本地账号名称存在大小写冲突，请联系管理员处理；账号与历史数据已保留。': [
    'Local account names differ only by letter case. Contact an administrator; accounts and history are retained.',
    'Des comptes locaux diffèrent uniquement par la casse. Contactez un administrateur ; les comptes et l’historique sont conservés.',
  ],
  '无法安全保存登录凭据，请检查 Windows 凭据存储。': [
    'Cannot securely save sign-in credentials. Check Windows credential storage.',
    'Impossible de stocker les identifiants en sécurité. Vérifiez le gestionnaire Windows.',
  ],
  '本地数据库不可用，请检查数据目录权限。': [
    'Local database unavailable. Check data-directory permissions.',
    'Base locale indisponible. Vérifiez les droits du dossier de données.',
  ],
  '账号已锁定，请稍后重试或联系管理员。': [
    'Account locked. Retry later or contact an administrator.',
    'Compte verrouillé. Réessayez plus tard ou contactez un administrateur.',
  ],
  '登录输入格式无效，请检查账号与验证码。': [
    'Invalid sign-in input. Check the account and CAPTCHA.',
    'Saisie invalide. Vérifiez le compte et le CAPTCHA.',
  ],
  '无法完成 HTTPS 登录，请检查网络或服务器响应。': [
    'HTTPS sign-in could not complete. Check the network or server response.',
    'Connexion HTTPS impossible. Vérifiez le réseau ou la réponse du serveur.',
  ],
  '无法获取云端验证码，请检查网络后重试。': [
    'Unable to get the cloud CAPTCHA. Check your network and retry.',
    'Impossible d’obtenir le CAPTCHA serveur. Vérifiez le réseau et réessayez.',
  ],
  重新获取云端验证码: ['Retry cloud CAPTCHA', 'Réessayer le CAPTCHA serveur'],
  '服务版本已停用，请升级客户端；本地数据已保留': [
    'API version retired; upgrade the client. Local data is retained.',
    'Version API retirée ; mettez le client à jour. Les données locales sont conservées.',
  ],
  '登录 HONSEN Procure': [
    'Sign in to HONSEN Procure',
    'Connexion à HONSEN Procure',
  ],
  '浏览器预览不连接本地凭据；桌面程序使用真实离线登录。': [
    'Browser preview does not access local credentials; use the desktop app to sign in offline.',
    'L’aperçu navigateur n’accède pas aux identifiants locaux ; utilisez l’application pour la connexion hors ligne.',
  ],
  '开发预览：不接受账号、密码或验证码': [
    'Development preview: no account, password or CAPTCHA accepted',
    'Aperçu de développement : aucun compte, mot de passe ou CAPTCHA accepté',
  ],
  打开界面预览: ['Open interface preview', 'Ouvrir l’aperçu'],
  '离线登录仅接受已缓存、启用且仍在 24 小时窗口内的账户。': [
    'Offline sign-in requires a cached enabled account verified within 24 hours.',
    'La connexion hors ligne exige un compte actif en cache vérifié depuis moins de 24 heures.',
  ],
  账号: ['Account', 'Compte'],
  密码: ['Password', 'Mot de passe'],
  本地验证码: ['Local CAPTCHA', 'CAPTCHA local'],
  云端验证码: ['Cloud CAPTCHA', 'CAPTCHA serveur'],
  请先获取: ['Request a CAPTCHA first', 'Demandez d’abord un CAPTCHA'],
  换一个验证码: ['Refresh CAPTCHA', 'Renouveler le CAPTCHA'],
  获取验证码: ['Get CAPTCHA', 'Obtenir un CAPTCHA'],
  离线登录: ['Sign in offline', 'Connexion hors ligne'],
  在线登录: ['Sign in online', 'Connexion en ligne'],
  '无法生成本地验证码。': [
    'Unable to generate local CAPTCHA.',
    'Impossible de générer le CAPTCHA local.',
  ],
  '账号、密码或验证码无效。': [
    'Invalid account, password or CAPTCHA.',
    'Compte, mot de passe ou CAPTCHA incorrect.',
  ],
  '在线登录失败，请检查连接并重新获取验证码。': [
    'Online sign-in failed; check the connection and request a new CAPTCHA.',
    'Échec de connexion ; vérifiez la connexion et renouvelez le CAPTCHA.',
  ],
  在线授权管理: [
    'Online authorization management',
    'Gestion des autorisations en ligne',
  ],
  '仅管理员在线操作；离线缓存不能分配或撤销权限。': [
    'Administrators must be online; cached offline access cannot grant or revoke permissions.',
    'Les administrateurs doivent être en ligne ; le cache hors ligne ne permet pas d’attribuer ou révoquer les droits.',
  ],
  '账户 UUID': ['Account UUID', 'UUID du compte'],
  查询云端授权: [
    'Load cloud authorizations',
    'Charger les autorisations serveur',
  ],
  已授权范围: ['Authorized scopes', 'Périmètres autorisés'],
  修改: ['Edit', 'Modifier'],
  撤销: ['Revoke', 'Révoquer'],
  修改授权范围: ['Edit authorization scope', 'Modifier le périmètre'],
  分配授权范围: ['Assign authorization scope', 'Attribuer un périmètre'],
  '项目 UUID': ['Project UUID', 'UUID du projet'],
  '部门 UUID': ['Department UUID', 'UUID du service'],
  '班组 UUID': ['Team UUID', 'UUID de l’équipe'],
  保存修改: ['Save changes', 'Enregistrer les modifications'],
  分配授权: ['Assign authorization', 'Attribuer l’autorisation'],
  取消修改: ['Cancel changes', 'Annuler les modifications'],
  '请输入有效的账户 UUID，并连接云端。': [
    'Enter a valid account UUID and connect to the cloud.',
    'Saisissez un UUID de compte valide et connectez-vous au serveur.',
  ],
  '已读取 {count} 个云端授权范围。': [
    'Loaded {count} cloud authorization scopes.',
    '{count} périmètres serveur chargés.',
  ],
  '查询失败。请检查在线连接、登录状态与管理权限。': [
    'Query failed; check connection, sign-in and administrator permissions.',
    'Échec de lecture ; vérifiez la connexion, la session et les droits administrateur.',
  ],
  '授权已撤销。': ['Authorization revoked.', 'Autorisation révoquée.'],
  '授权已分配或更新。': [
    'Authorization assigned or updated.',
    'Autorisation attribuée ou mise à jour.',
  ],
  '云端操作失败；请重新查询确认最终状态。': [
    'Cloud operation failed; reload to confirm the final state.',
    'Échec de l’opération ; rechargez pour confirmer l’état final.',
  ],
  '授权范围已原子修改。': [
    'Authorization scope changed atomically.',
    'Périmètre modifié de façon atomique.',
  ],
  '修改失败；原授权保持不变。请重新查询云端状态。': [
    'Change failed; original authorization retained. Reload cloud state.',
    'Échec ; autorisation initiale conservée. Rechargez l’état serveur.',
  ],
} as const
export type AuthMessage = keyof typeof messages
export function authText(locale: UiLocale, key: AuthMessage): string {
  return locale === 'zh' ? key : messages[key][locale === 'en' ? 0 : 1]
}
