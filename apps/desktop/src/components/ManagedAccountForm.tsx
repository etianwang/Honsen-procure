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
export { ManagedAccountForm } from './AccountCreationWizard'

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
