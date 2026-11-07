import { ManagedAccountEditor } from '../components/ManagedAccountEditor'
import { useEffect, useState } from 'react'
import { ManagedAccountForm } from '../components/ManagedAccountForm'
import {
  accountScopeNames,
  emptyAccountScope,
  validAccountScope,
  type AccountScope,
  type AccountScopeOptions,
} from '../lib/account-scope'
import { AuthorizationScopePicker } from '../components/AuthorizationScopePicker'
import { useUiLocale } from '../lib/ui-locale'
import type { ReferenceMasterDataView } from '../lib/master-data-api'
import type { UserRole } from '../lib/permissions'

type Binding = {
  projectId: string
  departmentId: string
  teamId: string
  site: string
}
type Account = { id: string; username: string; displayName?: string | null }
type Invoke = <T>(command: string, args?: object) => Promise<T>
function invoke<T>(command: string, args?: object) {
  const call = (
    window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }
  ).__TAURI__?.core?.invoke
  return call
    ? call<T>(command, args)
    : Promise.reject(new Error('Desktop required'))
}

export function AuthorizationManagementPage({
  role = 'administrator',
}: {
  role?: UserRole
}) {
  const { locale } = useUiLocale()
  const t = (zh: string, en: string, fr: string) =>
    locale === 'zh' ? zh : locale === 'fr' ? fr : en
  const [mode, setMode] = useState<'create' | 'manage'>('create')
  const [account, setAccount] = useState<Account | null>(null)
  const [username, setUsername] = useState('')
  const [bindings, setBindings] = useState<Binding[]>([])
  const [scope, setScope] = useState<AccountScope>(emptyAccountScope)
  const [editing, setEditing] = useState<Binding | null>(null)
  const [busy, setBusy] = useState(false)
  const [wizardBusy, setWizardBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [rawOptions, setOptions] = useState<AccountScopeOptions>({
    records: [],
    allowed: [],
  })
  const [loadedRole, setLoadedRole] = useState<UserRole | null>(null)
  const options: AccountScopeOptions =
    loadedRole === role ? rawOptions : { records: [], allowed: [] }
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void invoke('pull_sync')
      .then(async () => {
        const [records, allowed] = await Promise.all([
          invoke<ReferenceMasterDataView[]>('list_reference_master_data'),
          role === 'super_administrator'
            ? Promise.resolve(null)
            : invoke<AccountScopeOptions['allowed']>(
                'list_authorization_contexts',
              ),
        ])
        if (active) {
          setLoadedRole(role)
          setScope(emptyAccountScope)
          setEditing(null)
          setOptions({
            records: records.filter((record) => record.is_active),
            allowed,
          })
          setLoading(false)
          setLoadFailed(false)
        }
      })
      .catch(() => {
        if (active) {
          setLoadedRole(role)
          setScope(emptyAccountScope)
          setEditing(null)
          setOptions({ records: [], allowed: [] })
          setLoading(false)
          setLoadFailed(true)
        }
      })
    return () => {
      active = false
    }
  }, [reload, role])
  const assignAccount = (id: string, name: string, displayName?: string) => {
    setAccount({ id, username: name, displayName })
    setUsername(name)
    setBindings([])
    setEditing(null)
    setScope(emptyAccountScope)
  }
  const search = async () => {
    setBusy(true)
    setMessage('')
    setBindings([])
    setAccount(null)
    setEditing(null)
    setScope(emptyAccountScope)
    try {
      const accounts = await invoke<Account[]>('find_managed_accounts', {
        username,
      })
      if (!accounts.length) {
        setMessage(
          t(
            '未找到该账号。请检查用户名，或切换到创建账号。',
            'Account not found. Check the username or switch to account creation.',
            'Compte introuvable. Vérifiez le nom ou passez à la création.',
          ),
        )
        return
      }
      const selected = accounts[0]
      const result = await invoke<Binding[]>('list_managed_authorizations', {
        accountId: selected.id,
      })
      setAccount(selected)
      setBindings(result)
      setMessage(
        t(
          '已读取云端授权范围。',
          'Cloud authorization scopes loaded.',
          'Périmètres serveur chargés.',
        ),
      )
    } catch {
      setMessage(
        t(
          '查询失败。请检查在线连接、登录状态与管理权限。',
          'Lookup failed. Check the connection, sign-in and management permissions.',
          'Échec de recherche. Vérifiez la connexion et les droits de gestion.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  const scopeFromBinding = (binding: Binding): AccountScope => {
    const project = options.records.find(
      (r) => r.kind === 'project' && r.id === binding.projectId,
    )
    return {
      countryId: project?.kind === 'project' ? project.country_id : '',
      projectId: binding.projectId,
      departmentId: binding.departmentId,
      teamId: binding.teamId,
    }
  }
  const change = async (binding: Binding, revoke: boolean) => {
    if (!account) return
    setBusy(true)
    setMessage('')
    try {
      if (editing && !revoke) {
        await invoke('replace_managed_authorization', {
          accountId: account.id,
          replacement: {
            oldScope: {
              projectId: editing.projectId,
              departmentId: editing.departmentId,
              teamId: editing.teamId,
            },
            newScope: {
              projectId: binding.projectId,
              departmentId: binding.departmentId,
              teamId: binding.teamId,
            },
          },
        })
      } else {
        await invoke('change_managed_authorization', {
          accountId: account.id,
          binding: {
            projectId: binding.projectId,
            departmentId: binding.departmentId,
            teamId: binding.teamId,
          },
          revoke,
        })
      }
      setBindings(
        await invoke<Binding[]>('list_managed_authorizations', {
          accountId: account.id,
        }),
      )
      setEditing(null)
      setScope(emptyAccountScope)
      setMessage(
        revoke
          ? t(
              '授权已撤销。',
              'Authorization revoked.',
              'Autorisation révoquée.',
            )
          : t(
              '授权已分配或更新。',
              'Authorization assigned or updated.',
              'Autorisation attribuée ou modifiée.',
            ),
      )
    } catch {
      setAccount(null)
      setBindings([])
      setEditing(null)
      setScope(emptyAccountScope)
      setMessage(
        t(
          '云端操作未确认；请重新查询账号确认最终状态。',
          'Cloud operation not confirmed. Search the account again to verify the final state.',
          'Opération non confirmée. Recherchez à nouveau le compte pour vérifier son état.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="auth-management"
      aria-labelledby="auth-management-title"
    >
      <header className="account-page-header">
        <h2 id="auth-management-title">
          {t(
            '账号与授权',
            'Accounts and authorization',
            'Comptes et autorisations',
          )}
        </h2>
        <p>
          {t(
            '在线管理账号及授权范围。所有变更均由云端验证。',
            'Manage accounts and scope online. The server verifies every change.',
            'Gérez les comptes et périmètres en ligne. Le serveur vérifie chaque modification.',
          )}
        </p>
      </header>
      <div
        className="account-mode-tabs"
        role="group"
        aria-label={t('账号操作', 'Account actions', 'Actions du compte')}
      >
        <button
          type="button"
          aria-pressed={mode === 'create'}
          disabled={busy || wizardBusy}
          onClick={() => {
            setMode('create')
            setMessage('')
          }}
        >
          {t('创建账号', 'Create account', 'Créer le compte')}
        </button>
        <button
          type="button"
          aria-pressed={mode === 'manage'}
          disabled={busy || wizardBusy}
          onClick={() => {
            setMode('manage')
            setMessage('')
          }}
        >
          {t(
            '管理已有账号',
            'Manage existing account',
            'Gérer le compte existant',
          )}
        </button>
      </div>
      <div className="scope-refresh">
        <button
          type="button"
          disabled={loading || busy || wizardBusy}
          onClick={() => {
            setLoading(true)
            setOptions({ records: [], allowed: [] })
            setScope(emptyAccountScope)
            setReload((value) => value + 1)
          }}
        >
          {t(
            '重新加载授权选项',
            'Reload scope options',
            'Recharger les périmètres',
          )}
        </button>
        {loading && (
          <p role="status">
            {t(
              '正在从云端刷新组织资料…',
              'Refreshing organization data from the server…',
              'Actualisation des données de l’organisation…',
            )}
          </p>
        )}
        {loadFailed && (
          <p role="alert">
            {t(
              '无法刷新组织资料。请检查连接与权限后重新加载；当前不能选择授权范围。',
              'Cannot refresh organization data. Check the connection and permissions, then reload; scope selection is unavailable.',
              'Actualisation impossible. Vérifiez la connexion et les droits, puis rechargez ; aucun périmètre ne peut être choisi.',
            )}
          </p>
        )}
      </div>
      <section className="account-management-panel">
        {mode === 'create' ? (
          <ManagedAccountForm
            key={`${reload}:${role}`}
            onBusyChange={setWizardBusy}
            options={options}
            canGrantPrivileged={role === 'super_administrator'}
            onAccount={assignAccount}
            onExisting={() => {
              setMode('manage')
              void search()
            }}
          />
        ) : (
          <>
            <form
              className="account-search"
              onSubmit={(e) => {
                e.preventDefault()
                void search()
              }}
            >
              <label>
                {t('查找用户名', 'Find username', 'Rechercher un utilisateur')}
                <input
                  value={username}
                  maxLength={100}
                  autoComplete="off"
                  disabled={busy}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    setAccount(null)
                    setBindings([])
                    setEditing(null)
                    setScope(emptyAccountScope)
                  }}
                />
              </label>
              <button
                disabled={
                  busy || !username.trim() || username.trim() !== username
                }
              >
                {t(
                  '查询账号授权',
                  'Find account authorization',
                  'Rechercher les autorisations',
                )}
              </button>
            </form>
            {account && (
              <>
                <ManagedAccountEditor
                  key={account.id}
                  accountId={account.id}
                  role={role}
                />
                <h3>{account.displayName || account.username}</h3>
                {account.displayName &&
                  account.displayName !== account.username && (
                    <p>
                      {t(
                        '登录账号',
                        'Login username',
                        'Identifiant de connexion',
                      )}{' '}
                      : {account.username}
                    </p>
                  )}
                <ul
                  className="account-binding-list"
                  aria-label={t(
                    '已授权范围',
                    'Authorized scopes',
                    'Périmètres autorisés',
                  )}
                >
                  {bindings.map((binding) => {
                    const names = accountScopeNames(
                      scopeFromBinding(binding),
                      options.records,
                    )
                    return (
                      <li
                        key={`${binding.projectId}:${binding.departmentId}:${binding.teamId}`}
                      >
                        <span>
                          {names.every(Boolean)
                            ? names.join(' · ')
                            : t(
                                '范围名称尚未加载，请重新加载组织资料。',
                                'Scope names unavailable. Reload organization data.',
                                'Noms indisponibles. Rechargez les données de l’organisation.',
                              )}
                        </span>
                        <button
                          type="button"
                          disabled={busy || loading || !names.every(Boolean)}
                          onClick={() => {
                            setEditing(binding)
                            setScope(scopeFromBinding(binding))
                          }}
                        >
                          {t('修改', 'Edit', 'Modifier')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void change(binding, true)}
                        >
                          {t('撤销', 'Revoke', 'Révoquer')}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <fieldset disabled={busy || loading || loadFailed}>
                  <legend>
                    {editing
                      ? t('修改授权范围', 'Edit scope', 'Modifier le périmètre')
                      : t(
                          '分配授权范围',
                          'Assign scope',
                          'Attribuer un périmètre',
                        )}
                  </legend>
                  <AuthorizationScopePicker
                    value={scope}
                    onChange={setScope}
                    options={options}
                  />
                  <div className="wizard-actions">
                    <button
                      type="button"
                      disabled={!validAccountScope(scope, options)}
                      onClick={() =>
                        void change(
                          {
                            projectId: scope.projectId,
                            departmentId: scope.departmentId,
                            teamId: scope.teamId,
                            site: '',
                          },
                          false,
                        )
                      }
                    >
                      {editing
                        ? t('保存修改', 'Save changes', 'Enregistrer')
                        : t(
                            '分配授权',
                            'Assign authorization',
                            'Attribuer l’autorisation',
                          )}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null)
                          setScope(emptyAccountScope)
                        }}
                      >
                        {t(
                          '取消修改',
                          'Cancel edit',
                          'Annuler la modification',
                        )}
                      </button>
                    )}
                  </div>
                </fieldset>
              </>
            )}
            {message && (
              <p role="status" aria-live="polite">
                {message}
              </p>
            )}
          </>
        )}
      </section>
    </section>
  )
}
