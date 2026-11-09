import { useEffect, useRef, useState } from 'react'
import { useUiLocale } from '../lib/ui-locale'
import type { UserRole } from '../lib/permissions'

type Details = {
  id: string
  username: string
  displayName: string
  uiLocale: string
  roles: UserRole[]
  isEnabled: boolean
  requiresPasswordChange: boolean
  isLocked: boolean
  accountVersion: string
}
type Invoke = <T>(command: string, args?: object) => Promise<T>
function invoke<T>(command: string, args: object) {
  const call = (
    window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }
  ).__TAURI__?.core?.invoke
  return call
    ? call<T>(command, args)
    : Promise.reject(new Error('Desktop required'))
}

const feedback = {
  loadFailed: [
    '无法读取账号详情，请重新加载。',
    'Unable to load account details. Reload to retry.',
    'Impossible de charger le compte. Rechargez pour réessayer.',
  ],
  saved: [
    '已保存。角色或启用状态变更后，该账号需要重新登录。',
    'Saved. Role or enabled-state changes require this account to sign in again.',
    'Enregistré. Après modification des rôles ou de l’activation, ce compte doit se reconnecter.',
  ],
  conflict: [
    '账号已被其他操作修改，请重新加载后核对。',
    'This account changed elsewhere. Reload and review before saving.',
    'Ce compte a été modifié ailleurs. Rechargez et vérifiez avant d’enregistrer.',
  ],
  saveFailed: [
    '未能保存，请检查在线会话及管理权限；输入已保留。',
    'Unable to save. Check your online session and permissions. Your input is retained.',
    'Enregistrement impossible. Vérifiez la connexion et les droits. Votre saisie est conservée.',
  ],
} as const

export function ManagedAccountEditor({
  accountId,
  role,
}: {
  accountId: string
  role: UserRole
}) {
  const { locale } = useUiLocale()
  const t = (zh: string, en: string, fr: string) =>
    locale === 'zh' ? zh : locale === 'fr' ? fr : en
  const [details, setDetails] = useState<Details | null>(null)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('zh-CN')
  const [roles, setRoles] = useState<UserRole[]>([])
  const [message, setMessage] = useState<keyof typeof feedback | ''>('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [reload, setReload] = useState(0)
  const pending = useRef(false)
  useEffect(() => {
    let active = true
    setDetails(null)
    setLoading(true)
    setMessage('')
    setStale(false)
    void invoke<Details>('get_managed_account_details', { accountId })
      .then((value) => {
        if (!active) return
        setDetails(value)
        setName(value.displayName)
        setLanguage(value.uiLocale)
        setRoles(value.roles)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
      .catch(() => {
        if (active) setMessage('loadFailed')
      })
    return () => {
      active = false
    }
    // A language change must not discard edits or reload the account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, reload])
  const protectedAccount =
    details?.username.toLowerCase() === 'admin' ||
    details?.roles.includes('super_administrator')
  const roleOptions: { value: UserRole; label: string }[] = [
    {
      value: 'administrator',
      label: t('管理员', 'Administrator', 'Administrateur'),
    },
    { value: 'purchaser', label: t('采购员', 'Purchaser', 'Acheteur') },
    { value: 'engineer', label: t('施工申请人', 'Requester', 'Demandeur') },
    { value: 'viewer', label: t('只读查看者', 'Viewer', 'Consultation') },
  ]
  async function save(changes: object) {
    if (!details || stale || pending.current) return
    pending.current = true
    setBusy(true)
    setMessage('')
    try {
      const value = await invoke<Details>('update_managed_account', {
        accountId,
        input: { expectedAccountVersion: details.accountVersion, ...changes },
      })
      setDetails(value)
      setName(value.displayName)
      setLanguage(value.uiLocale)
      setRoles(value.roles)
      setMessage('saved')
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : ''
      if (code === 'account_conflict') {
        setStale(true)
        setMessage('conflict')
      } else setMessage('saveFailed')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <section
      aria-label={t('账号设置', 'Account settings', 'Paramètres du compte')}
      className="account-management-panel"
    >
      <h3>{t('账号设置', 'Account settings', 'Paramètres du compte')}</h3>
      <p role="status" aria-live="polite" aria-atomic="true">
        {loading
          ? t('正在加载账号…', 'Loading account…', 'Chargement du compte…')
          : busy
            ? t('正在保存账号…', 'Saving account…', 'Enregistrement du compte…')
            : message &&
              feedback[message][locale === 'zh' ? 0 : locale === 'fr' ? 2 : 1]}
      </p>
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => {
          setLoading(true)
          setReload((v) => v + 1)
        }}
      >
        {t('重新加载账号', 'Reload account', 'Recharger le compte')}
      </button>
      {details && (
        <fieldset disabled={busy || stale}>
          <legend>
            {details.username} ·{' '}
            {details.isEnabled
              ? t('已启用', 'Enabled', 'Activé')
              : t('已停用', 'Disabled', 'Désactivé')}
          </legend>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const changes: Record<string, unknown> = {}
              if (name.trim() !== details.displayName)
                changes.displayName = name.trim()
              if (language !== details.uiLocale) changes.uiLocale = language
              if (
                !protectedAccount &&
                [...roles].sort().join() !== [...details.roles].sort().join()
              )
                changes.roles = roles
              if (Object.keys(changes).length) void save(changes)
            }}
          >
            <label>
              {t('显示姓名', 'Display name', 'Nom affiché')}
              <input
                value={name}
                maxLength={100}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              {t('界面语言', 'Interface language', 'Langue de l’interface')}
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
                <option value="fr-FR">Français</option>
              </select>
            </label>
            {!protectedAccount && (
              <fieldset>
                <legend>{t('角色', 'Roles', 'Rôles')}</legend>
                {roleOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={roles.includes(option.value)}
                      disabled={
                        role !== 'super_administrator' &&
                        ['administrator', 'purchaser'].includes(option.value)
                      }
                      onChange={(event) =>
                        setRoles(
                          event.target.checked
                            ? [...roles, option.value]
                            : roles.filter((value) => value !== option.value),
                        )
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
            )}
            <button type="submit" disabled={!name.trim() || roles.length === 0}>
              {t(
                '保存账号设置',
                'Save account settings',
                'Enregistrer le compte',
              )}
            </button>
          </form>
          {protectedAccount ? (
            <p>
              {t(
                '受保护的管理员账号：不可停用或更改角色。',
                'Protected administrator: disabling and role changes are unavailable.',
                'Administrateur protégé : désactivation et modification des rôles interdites.',
              )}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void save({ isEnabled: !details.isEnabled })}
            >
              {details.isEnabled
                ? t('停用账号', 'Disable account', 'Désactiver le compte')
                : t('启用账号', 'Enable account', 'Activer le compte')}
            </button>
          )}
          {details.isLocked && (
            <button type="button" onClick={() => void save({ unlock: true })}>
              {t(
                '解除登录锁定',
                'Unlock sign-in',
                'Déverrouiller la connexion',
              )}
            </button>
          )}
        </fieldset>
      )}
    </section>
  )
}
