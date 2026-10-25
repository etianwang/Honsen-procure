import { useState } from 'react'
import { Alert, Button, Card, Input } from 'antd'
import { LockKeyhole, UserRound } from 'lucide-react'

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

export function LoginPage({ onLogin, onPreview }: LoginPageProps) {
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
          <div className="login-brand" aria-hidden="true">
            H
          </div>
          <h1>登录 HONSEN Procure</h1>
          <p>浏览器预览不连接本地凭据；桌面程序使用真实离线登录。</p>
          <Alert
            className="login-alert"
            type="info"
            showIcon
            title="开发预览：不接受账号、密码或验证码"
          />
          <Button
            className="preview-button"
            type="primary"
            block
            onClick={onPreview}
          >
            打开界面预览
          </Button>
        </Card>
      </main>
    )
  }

  return (
    <main className="login-page">
      <Card className="login-card">
        <div className="login-brand" aria-hidden="true">
          H
        </div>
        <h1>登录 HONSEN Procure</h1>
        <p>离线登录仅接受已缓存、启用且仍在 24 小时窗口内的账户。</p>
        {message && (
          <Alert
            className="login-alert"
            type="error"
            showIcon
            title={message}
          />
        )}
        <label htmlFor="account">账号</label>
        <Input
          id="account"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          prefix={<UserRound size={16} aria-hidden="true" />}
          autoComplete="username"
        />
        <label htmlFor="password">密码</label>
        <Input.Password
          id="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          prefix={<LockKeyhole size={16} aria-hidden="true" />}
          autoComplete="current-password"
        />
        <label htmlFor="captcha">
          本地验证码：{captcha?.question ?? '请先获取'}
        </label>
        <Input
          id="captcha"
          inputMode="numeric"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Button type="link" onClick={() => void refreshCaptcha()}>
          {captcha ? '换一个验证码' : '获取验证码'}
        </Button>
        {cloudCaptcha && (
          <>
            <label htmlFor="cloud-captcha">
              云端验证码：{cloudCaptcha.question}
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
          离线登录
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
          在线登录
        </Button>
      </Card>
    </main>
  )
}
