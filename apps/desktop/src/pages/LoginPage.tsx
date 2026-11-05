import { useUiLocale, type UiLocale } from '../lib/ui-locale'
import { authText, type AuthMessage } from '../lib/auth-messages'
import { useState } from 'react'
import { Alert, Button, Card, Dropdown, Input } from 'antd'
import { ChevronDown, Globe, LockKeyhole, UserRound } from 'lucide-react'

type Session = {
  user_id: string
  username: string
  roles: string[]
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
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refreshCaptcha = async () => {
    if (!desktopInvoke) return
    try {
      setCaptcha(await desktopInvoke('issue_local_captcha'))
      setCloudCaptcha(null)
      setCloudAnswer('')
      void desktopInvoke<{ id: string; question: string }>(
        'issue_cloud_captcha',
      )
        .then(setCloudCaptcha)
        .catch(() => undefined)
      setAnswer('')
      setMessage('')
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
          {captcha ? t('换一个验证码') : t('获取验证码')}
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
                await refreshCaptcha()
                setMessage('账号、密码或验证码无效。')
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
              .catch(async () => {
                await refreshCaptcha()
                setMessage('在线登录失败，请检查连接并重新获取验证码。')
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
