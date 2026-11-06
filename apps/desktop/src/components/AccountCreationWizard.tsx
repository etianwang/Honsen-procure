import { useState } from 'react'
import defaultAvatar from '../assets/default-avatar.svg'
import { useUiLocale } from '../lib/ui-locale'
import {
  accountScopeNames,
  emptyAccountScope,
  validAccountScope,
  type AccountScope,
  type AccountScopeOptions,
} from '../lib/account-scope'
import { AuthorizationScopePicker } from './AuthorizationScopePicker'

type Invoke = <T>(command: string, args?: object) => Promise<T>
function invoke<T>(command: string, args?: object) {
  const call = (
    window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }
  ).__TAURI__?.core?.invoke
  return call
    ? call<T>(command, args)
    : Promise.reject(new Error('Desktop required'))
}

export function ManagedAccountForm({
  options,
  canGrantPrivileged,
  onAccount,
  onExisting,
  onBusyChange,
}: {
  options: AccountScopeOptions
  canGrantPrivileged: boolean
  onAccount: (id: string, username: string) => void
  onExisting: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const { locale } = useUiLocale()
  const t = (zh: string, en: string, fr: string) =>
    locale === 'zh' ? zh : locale === 'fr' ? fr : en
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [accountLocale, setAccountLocale] = useState(locale)
  const [roles, setRoles] = useState<string[]>([])
  const [scope, setScope] = useState<AccountScope>(emptyAccountScope)
  const [checked, setChecked] = useState<string | null>(null)
  const [exists, setExists] = useState(false)
  const [created, setCreated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const labels = [
    t('基本信息', 'Basic information', 'Informations générales'),
    t('角色', 'Roles', 'Rôles'),
    t('授权范围', 'Scope', 'Périmètre'),
    t('确认', 'Confirm', 'Confirmer'),
  ]
  const roleLabels = [
    t('管理员', 'Administrator', 'Administrateur'),
    t('采购员', 'Purchaser', 'Acheteur'),
    t('工程申请人', 'Engineer applicant', 'Demandeur ingénieur'),
    t('只读查看者', 'Viewer', 'Lecteur'),
  ]
  const roleValues = ['administrator', 'purchaser', 'engineer', 'viewer']
  const reset = () => {
    setPassword('')
    setUsername('')
    setRoles([])
    setScope(emptyAccountScope)
    setChecked(null)
    setExists(false)
    setCreated(false)
    setMessage('')
    setStep(0)
  }
  const check = async () => {
    setBusy(true)
    onBusyChange(true)
    setMessage('')
    setExists(false)
    try {
      const accounts = await invoke<{ id: string; username: string }[]>(
        'find_managed_accounts',
        { username },
      )
      if (accounts.length) {
        setPassword('')
        setChecked(null)
        setExists(true)
        onAccount(accounts[0].id, accounts[0].username)
        setMessage(
          t(
            '账号已存在；不创建或重置密码。',
            'Account exists; no creation or password reset.',
            'Compte existant ; aucune création ni réinitialisation.',
          ),
        )
      } else {
        setChecked(username)
        setMessage(
          t(
            '账号可用，请继续选择角色。',
            'Username available. Continue to roles.',
            'Nom disponible. Poursuivez avec les rôles.',
          ),
        )
      }
    } catch {
      setPassword('')
      setChecked(null)
      setMessage(
        t(
          '无法查询账号。请检查在线连接和管理权限后重试。',
          'Cannot check the account. Check the online connection and management permissions, then retry.',
          'Vérification impossible. Vérifiez la connexion et les droits de gestion, puis réessayez.',
        ),
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  const create = async () => {
    if (
      checked !== username ||
      !validAccountScope(scope, options) ||
      !roles.length ||
      password.length < 8
    )
      return
    setBusy(true)
    onBusyChange(true)
    setMessage('')
    try {
      const result = await invoke<{ id: string; username: string }>(
        'create_managed_account',
        {
          input: {
            username,
            temporaryPassword: password,
            roles,
            uiLocale: ({ zh: 'zh-CN', en: 'en-US', fr: 'fr-FR' } as const)[
              accountLocale
            ],
            employeePhotoKey: 'builtin:default-avatar:v1',
            scope: {
              projectId: scope.projectId,
              departmentId: scope.departmentId,
              teamId: scope.teamId,
            },
          },
        },
      )
      onAccount(result.id, result.username || username)
      setCreated(true)
      setChecked(null)
      setMessage(
        t(
          '已创建；首次登录必须改密。',
          'Created; first sign-in requires a password change.',
          'Créé ; changement du mot de passe requis à la première connexion.',
        ),
      )
    } catch {
      setChecked(null)
      setStep(0)
      setMessage(
        t(
          '创建未确认。请先重新查询账号；已存在的账号不会重置密码。',
          'Creation not confirmed. Check the username again first; existing passwords are never reset.',
          'Création non confirmée. Vérifiez à nouveau le nom ; aucun mot de passe existant ne sera réinitialisé.',
        ),
      )
    } finally {
      setPassword('')
      setBusy(false)
      onBusyChange(false)
    }
  }
  const canNext =
    step === 0
      ? checked === username && password.length >= 8
      : step === 1
        ? roles.length > 0
        : validAccountScope(scope, options)
  return (
    <div className="account-wizard">
      <ol
        className="wizard-steps"
        aria-label={t(
          '创建账号步骤',
          'Account creation steps',
          'Étapes de création du compte',
        )}
      >
        {labels.map((label, index) => (
          <li key={index} aria-current={step === index ? 'step' : undefined}>
            <span>{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      <fieldset className="wizard-panel" disabled={busy || created}>
        <legend>{labels[step]}</legend>
        {step === 0 && (
          <>
            <label>
              {t('用户名', 'Username', 'Nom utilisateur')}
              <input
                value={username}
                maxLength={100}
                autoComplete="off"
                onChange={(e) => {
                  setUsername(e.target.value)
                  setChecked(null)
                  setExists(false)
                  setMessage('')
                }}
              />
            </label>
            <button
              type="button"
              disabled={!username.trim() || username.trim() !== username}
              onClick={() => void check()}
            >
              {t(
                '检查账号是否存在',
                'Check account existence',
                'Vérifier le compte',
              )}
            </button>
            <label>
              {t('临时密码', 'Temporary password', 'Mot de passe temporaire')}
              <input
                type="password"
                value={password}
                minLength={8}
                maxLength={1024}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <p>
              {t(
                '临时密码至少8位，首次登录必须改为至少12位的新密码。',
                'Use at least 8 characters. First sign-in requires a new password of at least 12 characters.',
                'Utilisez au moins 8 caractères. La première connexion exige un nouveau mot de passe de 12 caractères minimum.',
              )}
            </p>
            <label>
              {t('账号语言', 'Account language', 'Langue du compte')}
              <select
                value={accountLocale}
                onChange={(e) =>
                  setAccountLocale(e.target.value as typeof locale)
                }
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </label>
            <div className="account-avatar">
              <img
                src={defaultAvatar}
                width={64}
                height={64}
                alt={t(
                  '默认头像（非员工照片）',
                  'Default avatar (not an employee photo)',
                  'Avatar par défaut (pas une photo employé)',
                )}
              />
              <p>
                {t(
                  '使用内置默认头像（非员工照片）。',
                  'Uses the built-in default avatar (not an employee photo).',
                  'Utilise l’avatar intégré (pas une photo employé).',
                )}
              </p>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p>
              {t(
                '可组合角色；管理员和采购员仅超级管理员可授予。',
                'Roles can be combined. Only super administrators can grant administrator or purchaser roles.',
                'Les rôles sont cumulables. Seuls les super administrateurs peuvent attribuer les rôles administrateur ou acheteur.',
              )}
            </p>
            <div className="account-role-options">
              {roleValues.map((role, index) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    disabled={!canGrantPrivileged && index < 2}
                    onChange={(e) =>
                      setRoles(
                        e.target.checked
                          ? [...roles, role]
                          : roles.filter((r) => r !== role),
                      )
                    }
                  />
                  {roleLabels[index]}
                </label>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <AuthorizationScopePicker
            value={scope}
            onChange={setScope}
            options={options}
          />
        )}
        {step === 3 && (
          <>
            <p>
              {t(
                '请核对后创建。密码不会显示在摘要中。',
                'Review before creating. The password is never shown in this summary.',
                'Vérifiez avant de créer. Le mot de passe ne figure jamais dans ce récapitulatif.',
              )}
            </p>
            <dl className="wizard-summary">
              <dt>{t('用户名', 'Username', 'Nom utilisateur')}</dt>
              <dd>{username}</dd>
              <dt>{t('角色', 'Roles', 'Rôles')}</dt>
              <dd>
                {roleValues
                  .filter((role) => roles.includes(role))
                  .map((role) => roleLabels[roleValues.indexOf(role)])
                  .join(' · ')}
              </dd>
              {[
                t('国家', 'Country', 'Pays'),
                t('项目', 'Project', 'Projet'),
                t('部门', 'Department', 'Service'),
                t('班组', 'Team', 'Équipe'),
              ].map((label, index) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{accountScopeNames(scope, options.records)[index]}</dd>
                </div>
              ))}
              <dt>{t('账号语言', 'Account language', 'Langue du compte')}</dt>
              <dd>
                {{ zh: '中文', en: 'English', fr: 'Français' }[accountLocale]}
              </dd>
            </dl>
          </>
        )}
      </fieldset>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      {exists && (
        <button
          type="button"
          onClick={() => {
            setPassword('')
            onExisting()
          }}
        >
          {t(
            '管理已有账号',
            'Manage existing account',
            'Gérer le compte existant',
          )}
        </button>
      )}
      <div className="wizard-actions">
        {step > 0 && !created && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep(step - 1)
              setMessage('')
            }}
          >
            {t('上一步', 'Back', 'Précédent')}
          </button>
        )}
        {step < 3 && (
          <button
            type="button"
            className="primary-button"
            disabled={busy || !canNext}
            onClick={() => {
              setStep(step + 1)
              setMessage('')
            }}
          >
            {t('下一步', 'Next', 'Suivant')}
          </button>
        )}
        {step === 3 && !created && (
          <button
            type="button"
            className="primary-button"
            disabled={
              busy ||
              checked !== username ||
              !password ||
              !validAccountScope(scope, options)
            }
            onClick={() => void create()}
          >
            {t('创建账号', 'Create account', 'Créer le compte')}
          </button>
        )}
        <button type="button" disabled={busy} onClick={reset}>
          {created
            ? t('完成', 'Done', 'Terminer')
            : t('取消创建', 'Cancel creation', 'Annuler la création')}
        </button>
      </div>
    </div>
  )
}
