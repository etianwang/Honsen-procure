import defaultAvatar from '../assets/default-avatar.svg'
import { useState } from 'react'
import { useUiLocale } from '../lib/ui-locale'

type Invoke = <T>(command: string, args?: object) => Promise<T>
const invoke = <T,>(command: string, args?: object) => {
  const call = (
    window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }
  ).__TAURI__?.core?.invoke
  return call
    ? call<T>(command, args)
    : Promise.reject(new Error('Desktop required'))
}
export function ManagedAccountForm({
  scope,
  onAccount,
}: {
  scope: { projectId: string; departmentId: string; teamId: string }
  onAccount: (id: string) => void
}) {
  const { locale } = useUiLocale()
  const t = (zh: string, en: string, fr: string) =>
    locale === 'zh' ? zh : locale === 'fr' ? fr : en
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [photo, setPhoto] = useState('builtin:default-avatar:v1')
  const [roles, setRoles] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [checked, setChecked] = useState<string | null>(null)
  const run = async (create: boolean) => {
    setBusy(true)
    setMessage('')
    try {
      if (!create) {
        const accounts = await invoke<{ id: string; username: string }[]>(
          'find_managed_accounts',
          { username },
        )
        if (accounts.length) {
          onAccount(accounts[0].id)
          setChecked(null)
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
              '账号不存在，可填写资料创建。',
              'Account absent; complete the form to create it.',
              'Compte absent ; complétez le formulaire.',
            ),
          )
        }
      } else {
        const result = await invoke<{ id: string }>('create_managed_account', {
          input: {
            username,
            temporaryPassword: password,
            roles,
            uiLocale: ({ zh: 'zh-CN', en: 'en-US', fr: 'fr-FR' } as const)[
              locale
            ],
            employeePhotoKey: photo,
            scope,
          },
        })
        onAccount(result.id)
        setChecked(null)
        setMessage(
          t(
            '已创建；首次登录必须改密。',
            'Created; first sign-in requires a password change.',
            'Créé ; changement du mot de passe requis à la première connexion.',
          ),
        )
      }
    } catch {
      setChecked(null)
      setMessage(
        t(
          '云端操作失败；请重新查询账号和授权。',
          'Cloud operation failed; check the account and permissions again.',
          'Échec serveur ; vérifiez le compte et les autorisations.',
        ),
      )
    } finally {
      setPassword('')
      setBusy(false)
    }
  }
  return (
    <fieldset disabled={busy}>
      <legend>
        {t('在线创建账号', 'Create account online', 'Créer un compte en ligne')}
      </legend>
      <p>
        {t(
          '特权角色仅超级管理员可授予。先在下方填写项目、部门和班组。可使用内置默认头像（不是员工照片）或受支持上传的照片引用。',
          'Privileged roles require a super administrator. Fill project, department and team below. Use the built-in default avatar (not an employee photo), or a supported uploaded photo reference.',
          'Les rôles privilégiés exigent un super administrateur. Renseignez le projet, le service et l’équipe ci-dessous. Utilisez l’avatar intégré (pas une photo d’employé), ou une photo téléversée prise en charge.',
        )}
      </p>
      <label>
        {t('用户名', 'Username', 'Nom utilisateur')}
        <input
          value={username}
          maxLength={100}
          onChange={(e) => {
            setUsername(e.target.value)
            setChecked(null)
          }}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        disabled={!username.trim()}
        onClick={() => void run(false)}
      >
        {t('检查账号是否存在', 'Check account existence', 'Vérifier le compte')}
      </button>
      <label>
        {t('临时密码', 'Temporary password', 'Mot de passe temporaire')}
        <input
          type="password"
          value={password}
          maxLength={1024}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {photo === 'builtin:default-avatar:v1' && (
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
      )}
      <label>
        {t(
          '员工照片引用',
          'Employee photo reference',
          'Référence photo employé',
        )}
        <input
          value={photo}
          maxLength={1024}
          onChange={(e) => setPhoto(e.target.value)}
        />
      </label>
      {(['administrator', 'purchaser', 'engineer', 'viewer'] as const).map(
        (role, i) => (
          <label key={role}>
            <input
              type="checkbox"
              checked={roles.includes(role)}
              onChange={(e) =>
                setRoles(
                  e.target.checked
                    ? [...roles, role]
                    : roles.filter((r) => r !== role),
                )
              }
            />
            {
              [
                t('管理员', 'Administrator', 'Administrateur'),
                t('采购员', 'Purchaser', 'Acheteur'),
                t('工程申请人', 'Engineer applicant', 'Demandeur ingénieur'),
                t('只读查看者', 'Viewer', 'Lecteur'),
              ][i]
            }
          </label>
        ),
      )}
      <button
        type="button"
        disabled={
          checked !== username ||
          !roles.length ||
          password.length < 8 ||
          !photo.trim() ||
          !Object.values(scope).every((v) =>
            /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v),
          )
        }
        onClick={() => void run(true)}
      >
        {t('创建账号', 'Create account', 'Créer le compte')}
      </button>
      <p role="status">{message}</p>
    </fieldset>
  )
}

export function RequiredPasswordChange({
  onChanged,
}: {
  onChanged: () => void
}) {
  const { locale } = useUiLocale()
  const t = (zh: string, en: string, fr: string) =>
    locale === 'zh' ? zh : locale === 'fr' ? fr : en
  const [current, setCurrent] = useState('')
  const [replacement, setReplacement] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        setError(false)
        void invoke('change_account_password', { current, replacement })
          .then(onChanged)
          .catch(() => setError(true))
          .finally(() => {
            setCurrent('')
            setReplacement('')
            setBusy(false)
          })
      }}
    >
      <h2>
        {t(
          '首次登录必须修改密码',
          'Change password before continuing',
          'Changez votre mot de passe pour continuer',
        )}
      </h2>
      <label>
        {t('当前密码', 'Current password', 'Mot de passe actuel')}
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          maxLength={1024}
        />
      </label>
      <label>
        {t(
          '新密码（至少12位）',
          'New password (at least 12 characters)',
          'Nouveau mot de passe (12 caractères minimum)',
        )}
        <input
          type="password"
          autoComplete="new-password"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          required
          minLength={12}
          maxLength={1024}
        />
      </label>
      <button
        disabled={
          busy || replacement.length < 12 || !current || current === replacement
        }
      >
        {t(
          '修改并重新登录',
          'Change and sign in again',
          'Modifier et se reconnecter',
        )}
      </button>
      {error && (
        <p role="alert">
          {t(
            '修改失败，请检查连接和当前密码后重试。',
            'Change failed; check the connection and current password.',
            'Échec ; vérifiez la connexion et le mot de passe actuel.',
          )}
        </p>
      )}
    </form>
  )
}
