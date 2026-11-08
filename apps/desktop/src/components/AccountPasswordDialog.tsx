import { Modal } from 'antd'
import { useState } from 'react'
import { useUiLocale } from '../lib/ui-locale'

type Invoke = <T>(command: string, args?: object) => Promise<T>

export function AccountPasswordDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const { locale } = useUiLocale()
  const t = (zh: string, en: string, fr: string) =>
    locale === 'zh' ? zh : locale === 'fr' ? fr : en
  const [current, setCurrent] = useState('')
  const [replacement, setReplacement] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<'change' | 'sign-in'>('change')
  const [errorCode, setErrorCode] = useState('')
  const clearPasswords = () => {
    setCurrent('')
    setReplacement('')
    setConfirmation('')
  }
  const close = () => {
    if (!busy) {
      clearPasswords()
      setErrorCode('')
      onClose()
    }
  }
  const valid =
    !!current &&
    replacement.length >= 12 &&
    current !== replacement &&
    replacement === confirmation
  const submit = async () => {
    if (busy || !valid) return
    setBusyAction('change')
    setBusy(true)
    setErrorCode('')
    try {
      const invoke = (
        window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } }
      ).__TAURI__?.core?.invoke
      if (!invoke) throw { code: 'desktop_required' }
      await invoke('change_account_password', { current, replacement })
      clearPasswords()
      onChanged()
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'unknown'
      setErrorCode(code)
      clearPasswords()
    } finally {
      setBusy(false)
    }
  }
  const errorMessage =
    errorCode === 'invalid_credentials'
      ? t(
          '当前密码不正确。请重新输入后重试。',
          'The current password is incorrect. Enter it again and retry.',
          'Le mot de passe actuel est incorrect. Saisissez-le à nouveau.',
        )
      : errorCode === 'account_locked'
        ? t(
            '账号已锁定，请稍后重试或联系管理员。',
            'Account locked. Retry later or contact an administrator.',
            'Compte verrouillé. Réessayez plus tard ou contactez un administrateur.',
          )
        : errorCode === 'reauthentication_required' ||
            errorCode === 'sync_account_boundary'
          ? t(
              '登录已失效，请重新在线登录。',
              'Session expired. Sign in online again.',
              'Session expirée. Reconnectez-vous en ligne.',
            )
          : errorCode === 'sync_transport_error'
            ? t(
                '无法确认云端改密结果。请检查网络；若新密码已生效，请用新密码重新登录。',
                'The cloud password-change result could not be confirmed. Check the network; if the new password took effect, sign in with it.',
                'Le changement serveur n’a pas pu être confirmé. Vérifiez le réseau ; si le nouveau mot de passe est actif, reconnectez-vous avec celui-ci.',
              )
            : errorCode === 'invalid_input'
              ? t(
                  '新密码至少12位，且必须与当前密码不同。',
                  'Use a new password of at least 12 characters, different from the current password.',
                  'Le nouveau mot de passe doit comporter au moins 12 caractères et être différent de l’actuel.',
                )
              : t(
                  '密码修改失败。请检查在线连接和本地安全存储后重试。',
                  'Password change failed. Check the online connection and local secure storage, then retry.',
                  'Échec du changement. Vérifiez la connexion et le stockage sécurisé local, puis réessayez.',
                )
  return (
    <Modal
      title={t('修改密码', 'Change password', 'Modifier le mot de passe')}
      open={open}
      footer={null}
      onCancel={close}
      closable={!busy}
      mask={{ closable: !busy }}
      keyboard={!busy}
      destroyOnHidden
    >
      <form
        className="password-change-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p>
          {t(
            '仅在线修改。修改成功后所有会话将失效，需要重新登录；账号角色与项目授权不会改变。',
            'Online only. A successful change ends all sessions and requires sign-in again; roles and project access remain unchanged.',
            'Modification en ligne uniquement. Un changement réussi ferme toutes les sessions et impose une reconnexion ; les rôles et accès aux projets restent inchangés.',
          )}
        </p>
        <fieldset disabled={busy}>
          <label>
            {t('当前密码', 'Current password', 'Mot de passe actuel')}
            <input
              autoFocus
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              maxLength={1024}
              required
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
              minLength={12}
              maxLength={1024}
              required
            />
          </label>
          <label>
            {t(
              '确认新密码',
              'Confirm new password',
              'Confirmer le nouveau mot de passe',
            )}
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              maxLength={1024}
              required
            />
          </label>
        </fieldset>
        {!!confirmation && confirmation !== replacement && (
          <p role="status">
            {t(
              '两次输入的新密码不一致。',
              'The new passwords do not match.',
              'Les nouveaux mots de passe ne correspondent pas.',
            )}
          </p>
        )}
        {busy && (
          <p role="status" aria-live="polite">
            {busyAction === 'change'
              ? t(
                  '正在修改密码，请稍候…',
                  'Changing password, please wait…',
                  'Modification du mot de passe en cours…',
                )
              : t(
                  '正在返回登录，请稍候…',
                  'Returning to sign-in, please wait…',
                  'Retour à la connexion en cours…',
                )}
          </p>
        )}
        {errorCode && !busy && <p role="alert">{errorMessage}</p>}
        <div className="password-change-actions">
          <button
            className="primary-button"
            type="submit"
            aria-busy={busy && busyAction === 'change'}
            disabled={busy || !valid}
          >
            {busy && busyAction === 'change'
              ? t(
                  '正在修改密码…',
                  'Changing password…',
                  'Modification en cours…',
                )
              : t(
                  '修改并重新登录',
                  'Change and sign in again',
                  'Modifier et se reconnecter',
                )}
          </button>
          <button type="button" disabled={busy} onClick={close}>
            {t('取消', 'Cancel', 'Annuler')}
          </button>
          {(errorCode === 'reauthentication_required' ||
            errorCode === 'sync_account_boundary' ||
            errorCode === 'sync_transport_error') && (
            <button
              type="button"
              aria-busy={busy && busyAction === 'sign-in'}
              disabled={busy}
              onClick={async () => {
                clearPasswords()
                setBusyAction('sign-in')
                setBusy(true)
                try {
                  const invoke = (
                    window as Window & {
                      __TAURI__?: { core?: { invoke?: Invoke } }
                    }
                  ).__TAURI__?.core?.invoke
                  if (!invoke) throw new Error('Desktop required')
                  await invoke('lock_session')
                  onChanged()
                } catch {
                  setErrorCode('lock_failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy && busyAction === 'sign-in'
                ? t(
                    '正在返回登录…',
                    'Returning to sign-in…',
                    'Retour à la connexion…',
                  )
                : t('返回登录', 'Return to sign-in', 'Retour à la connexion')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
