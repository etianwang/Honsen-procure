import { useUiLocale, type UiLocale } from '../lib/ui-locale'
import { authText, type AuthMessage } from '../lib/auth-messages'
import { useState } from 'react'
import { Alert, Button, Card, Dropdown, Input } from 'antd'
import { ChevronDown, Globe, LockKeyhole, UserRound } from 'lucide-react'

type Session = {
  user_id: string
  username: string
  roles: string[]
  password_change_recommended?: boolean
  requires_password_change: boolean
}

type LoginPageProps = {
  onLogin: (session: Session, mode: 'online' | 'offline') => void
  onPreview: () => void
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function invoke(): TauriInvoke | undefined {
  const tauriWindow = window as Window & {
    __TAURI__?: { core?: { invoke?: TauriInvoke } }
    __TAURI_INTERNALS__?: unknown
  }
  return tauriWindow.__TAURI_INTERNALS__
    ? tauriWindow.__TAURI__?.core?.invoke
    : undefined
}

function LoginLanguagePicker() {
  const { locale, setLocale } = useUiLocale()
  const languages: { key: UiLocale; label: string }[] = [
    { key: 'zh', label: '中文' },
    { key: 'en', label: 'English' },
    { key: 'fr', label: 'Français' },
  ]
  return (
    <div className="login-language-row">
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: languages,
          selectable: true,
          selectedKeys: [locale],
          onClick: ({ key }) => setLocale(key as UiLocale),
        }}
      >
        <Button
          className="login-language-picker"
          aria-label="界面语言 / UI language / Langue"
        >
          <Globe size={16} aria-hidden="true" />
          <span>
            {languages.find((language) => language.key === locale)?.label}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </Dropdown>
    </div>
  )
}

export function LoginPage({ onLogin, onPreview }: LoginPageProps) {
  const { locale } = useUiLocale()
  const t = (key: AuthMessage) => authText(locale, key)
  const desktopInvoke = invoke()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState<{
    id: string
    question: string
  } | null>(null)
  const [cloudCaptcha, setCloudCaptcha] = useState<{
    id: string
    question: string
  } | null>(null)
  const [answer, setAnswer] = useState('')
  const [cloudAnswer, setCloudAnswer] = useState('')
  const [cloudCaptchaFailed, setCloudCaptchaFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [cloudMessage, setCloudMessage] = useState<AuthMessage | ''>('')
  const [submitting, setSubmitting] = useState(false)

  const refreshCaptcha = async (preserveMessage = false) => {
    if (!desktopInvoke) return
    if (!preserveMessage) setMessage('')
    try {
      setCaptcha(await desktopInvoke('issue_local_captcha'))
      setCloudCaptcha(null)
      setCloudCaptchaFailed(false)
      setCloudMessage('')
      setCloudAnswer('')
      await desktopInvoke<{ id: string; question: string }>(
        'issue_cloud_captcha',
      )
        .then(setCloudCaptcha)
        .catch((error: unknown) => {
          setCloudCaptchaFailed(true)
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'upgrade_required'
          )
            setCloudMessage('服务版本已停用，请升级客户端；本地数据已保留')
          else setCloudMessage('无法获取云端验证码，请检查网络后重试。')
        })
      setAnswer('')
    } catch {
      setMessage('无法生成本地验证码。')
    }
  }

  if (!desktopInvoke) {
    return (
      <main className="login-page">
        <Card className="login-card">
          <LoginLanguagePicker />
          <div className="login-brand" aria-hidden="true">
            H
          </div>
          <h1>{t('登录 HONSEN Procure')}</h1>
          <p>{t('浏览器预览不连接本地凭据；桌面程序使用真实离线登录。')}</p>
          <Alert
            className="login-alert"
            type="info"
            showIcon
            title={t('开发预览：不接受账号、密码或验证码')}
          />
          <Button
            className="preview-button"
            type="primary"
            block
            onClick={onPreview}
          >
            {t('打开界面预览')}
          </Button>
        </Card>
      </main>
    )
  }

  return (
    <main className="login-page">
      <Card className="login-card">
        <LoginLanguagePicker />
        <div className="login-brand" aria-hidden="true">
          H
        </div>
        <h1>{t('登录 HONSEN Procure')}</h1>
        <p>{t('离线登录仅接受已缓存、启用且仍在 24 小时窗口内的账户。')}</p>
        {message && (
          <Alert
            className="login-alert"
            type="error"
            showIcon
            title={t(message as AuthMessage)}
          />
        )}
        {cloudMessage && (
          <Alert
            className="login-alert"
            type="error"
            showIcon
            title={t(cloudMessage)}
          />
        )}
        <label htmlFor="account">{t('账号')}</label>
        <Input
          id="account"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          prefix={<UserRound size={16} aria-hidden="true" />}
          autoComplete="username"
        />
        <label htmlFor="password">{t('密码')}</label>
        <Input.Password
          id="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          prefix={<LockKeyhole size={16} aria-hidden="true" />}
          autoComplete="current-password"
        />
        <label htmlFor="captcha">
          {t('本地验证码')}：{captcha?.question ?? t('请先获取')}
        </label>
        <Input
          id="captcha"
          inputMode="numeric"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Button type="link" onClick={() => void refreshCaptcha()}>
          {cloudCaptchaFailed
            ? t('重新获取云端验证码')
            : captcha
              ? t('换一个验证码')
              : t('获取验证码')}
        </Button>
        {cloudCaptcha && (
          <>
            <label htmlFor="cloud-captcha">
              {t('云端验证码')}：{cloudCaptcha.question}
            </label>
            <Input
              id="cloud-captcha"
              inputMode="numeric"
              value={cloudAnswer}
              onChange={(event) => setCloudAnswer(event.target.value)}
            />
          </>
        )}
        <Button
          className="preview-button"
          type="primary"
          block
          loading={submitting}
          disabled={!captcha}
          onClick={() => {
            if (!captcha) return
            setSubmitting(true)
            setMessage('')
            void desktopInvoke<Session>('offline_login', {
              request: {
                username,
                password,
                captchaId: captcha.id,
                captchaAnswer: Number(answer),
              },
            })
              .then((authenticated) => onLogin(authenticated, 'offline'))
              .catch(async () => {
                setMessage('账号、密码或验证码无效。')
                await refreshCaptcha(true)
              })
              .finally(() => setSubmitting(false))
          }}
        >
          {t('离线登录')}
        </Button>
        <Button
          block
          loading={submitting}
          disabled={!captcha || !cloudCaptcha || !cloudAnswer}
          onClick={() => {
            if (!captcha || !cloudCaptcha) return
            setSubmitting(true)
            setMessage('')
            void desktopInvoke<Session>('online_login', {
              request: {
                username,
                password,
                localCaptchaId: captcha.id,
                localCaptchaAnswer: Number(answer),
                cloudCaptchaId: cloudCaptcha.id,
                cloudCaptchaAnswer: cloudAnswer,
              },
            })
              .then((authenticated) => onLogin(authenticated, 'online'))
              .catch(async (error: unknown) => {
                if (
                  typeof error === 'object' &&
                  error !== null &&
                  'code' in error &&
                  error.code === 'upgrade_required'
                ) {
                  setMessage('服务版本已停用，请升级客户端；本地数据已保留')
                  return
                }
                const code =
                  typeof error === 'object' && error !== null && 'code' in error
                    ? error.code
                    : undefined
                setMessage(
                  code === 'invalid_credentials'
                    ? '账号、密码或验证码无效。'
                    : code === 'credential_storage_error'
                      ? '无法安全保存登录凭据，请检查 Windows 凭据存储。'
                      : code === 'local_storage_error'
                        ? '本地数据库不可用，请检查数据目录权限。'
                        : code === 'account_locked'
                          ? '账号已锁定，请稍后重试或联系管理员。'
                          : code === 'invalid_input'
                            ? '登录输入格式无效，请检查账号与验证码。'
                            : code === 'sync_transport_error'
                              ? '无法完成 HTTPS 登录，请检查网络或服务器响应。'
                              : '在线登录失败，请检查连接并重新获取验证码。',
                )
                await refreshCaptcha(true)
              })
              .finally(() => setSubmitting(false))
          }}
        >
          {t('在线登录')}
        </Button>
      </Card>
    </main>
  )
}
