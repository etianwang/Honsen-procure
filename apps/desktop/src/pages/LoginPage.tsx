import { useUiLocale, type UiLocale } from '../lib/ui-locale'
import { authText, type AuthMessage } from '../lib/auth-messages'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Dropdown, Input } from 'antd'
import { ChevronDown, Globe, LockKeyhole, UserRound } from 'lucide-react'

type Session = {
  user_id: string
  username: string
  display_name?: string | null
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
  const [mode, setMode] = useState<
    'connecting' | 'online' | 'offline' | 'unavailable' | 'blocked'
  >('connecting')
  const [challenge, setChallenge] = useState<{
    id: string
    question: string
  } | null>(null)
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState<AuthMessage | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const generation = useRef(0)
  const denied = useRef(false)
  const codeOf = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''
  const errorMessage = (code: string): AuthMessage => {
    switch (code) {
      case 'upgrade_required':
        return '服务版本已停用，请升级客户端；本地数据已保留'
      case 'account_name_collision':
        return '本地账号名称存在大小写冲突，请联系管理员处理；账号与历史数据已保留。'
      case 'credential_storage_error':
        return '无法安全保存登录凭据，请检查 Windows 凭据存储。'
      case 'local_storage_error':
        return '本地数据库不可用，请检查数据目录权限。'
      case 'account_locked':
        return '账号已锁定，请稍后重试或联系管理员。'
      case 'offline_window_expired':
        return '离线验证已过期，请重新连接云端登录。'
      case 'auth_retry_later':
        return '请求过于频繁，请稍后重新尝试。'
      case 'auth_protocol_error':
      case 'sync_transport_error':
        return '服务器响应异常，请重新连接；暂不提供离线切换。'
      default:
        return '账号、密码或验证码无效。'
    }
  }
  const requestCloud = useCallback(
    async (preserveMessage = false) => {
      if (!desktopInvoke) return
      const request = ++generation.current
      setMode('connecting')
      setChallenge(null)
      setAnswer('')
      if (!preserveMessage) setMessage('')
      try {
        const next = await desktopInvoke<{ id: string; question: string }>(
          'issue_cloud_captcha',
        )
        if (generation.current !== request) return
        setChallenge(next)
        setMode('online')
      } catch (error) {
        if (generation.current !== request) return
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : ''
        if (code === 'network_unavailable' && !denied.current) {
          setMode('unavailable')
        } else {
          denied.current = true
          setMode('blocked')
          if (!preserveMessage)
            setMessage(
              code === 'upgrade_required'
                ? '服务版本已停用，请升级客户端；本地数据已保留'
                : code === 'auth_retry_later'
                  ? '请求过于频繁，请稍后重新尝试。'
                  : '服务器响应异常，请重新连接；暂不提供离线切换。',
            )
        }
      }
    },
    [desktopInvoke],
  )
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void requestCloud()
    })
    return () => {
      cancelled = true
      generation.current++
    }
  }, [requestCloud])
  async function requestLocal(preserveMessage = false) {
    if (!desktopInvoke) return
    const request = ++generation.current
    setChallenge(null)
    setAnswer('')
    setMode('offline')
    if (!preserveMessage) setMessage('')
    try {
      const next = await desktopInvoke<{ id: string; question: string }>(
        'issue_local_captcha',
      )
      if (generation.current === request) setChallenge(next)
    } catch {
      if (generation.current === request) setMessage('无法生成本地验证码。')
    }
  }
  async function submit() {
    if (
      !desktopInvoke ||
      !challenge ||
      !['online', 'offline'].includes(mode) ||
      submitting
    )
      return
    const currentMode = mode as 'online' | 'offline'
    setSubmitting(true)
    setMessage('')
    try {
      const session = await desktopInvoke<Session>(
        currentMode === 'online' ? 'online_login' : 'offline_login',
        {
          request:
            currentMode === 'online'
              ? {
                  username,
                  password,
                  cloudCaptchaId: challenge.id,
                  cloudCaptchaAnswer: answer,
                }
              : {
                  username,
                  password,
                  captchaId: challenge.id,
                  captchaAnswer: Number(answer),
                },
        },
      )
      setPassword('')
      onLogin(session, currentMode)
    } catch (error) {
      const code = codeOf(error)
      if (currentMode === 'online') {
        if (code === 'network_unavailable' && !denied.current) {
          generation.current++
          setChallenge(null)
          setAnswer('')
          setMode('unavailable')
        } else {
          denied.current = true
          setMessage(errorMessage(code))
          if (
            code === 'upgrade_required' ||
            code === 'auth_protocol_error' ||
            code === 'sync_transport_error'
          ) {
            setChallenge(null)
            setMode('blocked')
          } else await requestCloud(true)
        }
      } else {
        setMessage(errorMessage(code))
        await requestLocal(true)
      }
    } finally {
      setSubmitting(false)
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
        {mode === 'connecting' && (
          <Alert
            className="login-alert"
            type="info"
            showIcon
            title={t('正在连接云端…')}
          />
        )}
        {message && (
          <Alert
            className="login-alert"
            type="error"
            showIcon
            title={t(message)}
          />
        )}
        {mode === 'unavailable' && (
          <Alert
            className="login-alert"
            type="warning"
            showIcon
            title={t('暂时无法连接服务器。是否使用离线登录？')}
          />
        )}
        {mode === 'offline' && (
          <p>{t('离线登录仅接受已缓存、启用且仍在 24 小时窗口内的账户。')}</p>
        )}
        <label htmlFor="account">{t('账号')}</label>
        <Input
          id="account"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          prefix={<UserRound size={16} aria-hidden="true" />}
          autoComplete="username"
          disabled={submitting}
        />
        <p className="login-account-hint">
          {t(
            '请使用用户名登录，英文字母 A–Z 不区分大小写；姓名不是登录账号。已有非英文用户名仍可使用。',
          )}
        </p>
        <label htmlFor="password">{t('密码')}</label>
        <Input.Password
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefix={<LockKeyhole size={16} aria-hidden="true" />}
          autoComplete="current-password"
          disabled={submitting}
        />
        {challenge && (
          <>
            <label htmlFor="captcha">
              {t(mode === 'offline' ? '本地验证码' : '云端验证码')}：
              {challenge.question}
            </label>
            <Input
              id="captcha"
              inputMode="numeric"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitting}
            />
            <Button
              type="link"
              disabled={submitting}
              onClick={() =>
                void (mode === 'offline' ? requestLocal() : requestCloud())
              }
            >
              {t('换一个验证码')}
            </Button>
          </>
        )}
        {(mode === 'online' || mode === 'offline') && (
          <Button
            className="preview-button"
            type="primary"
            block
            loading={submitting}
            disabled={
              !challenge ||
              !username.trim() ||
              !password ||
              !/^\d{1,4}$/.test(answer) ||
              (mode === 'offline' && Number(answer) > 255)
            }
            onClick={() => void submit()}
          >
            {t(mode === 'offline' ? '离线登录' : '在线登录')}
          </Button>
        )}
        {mode === 'unavailable' && (
          <Button
            type="primary"
            block
            disabled={submitting}
            onClick={() => void requestLocal()}
          >
            {t('使用离线登录')}
          </Button>
        )}
        {(mode === 'offline' ||
          mode === 'unavailable' ||
          mode === 'blocked') && (
          <Button
            block
            disabled={submitting}
            onClick={() => void requestCloud()}
          >
            {t('重新尝试联网')}
          </Button>
        )}
      </Card>
    </main>
  )
}
