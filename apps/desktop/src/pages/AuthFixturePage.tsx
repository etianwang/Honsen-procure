import { Alert, Button, Input } from 'antd'
import { useState } from 'react'

export function AuthFixturePage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [status, setStatus] = useState<'idle' | 'invalid' | 'success'>('idle')

  function submit() {
    setStatus(
      username === 'test-admin' &&
        password === 'fixture-password' &&
        captchaAnswer === '7'
        ? 'success'
        : 'invalid',
    )
  }

  return (
    <main className="money-preview-page">
      <section
        className="money-preview-card"
        aria-labelledby="auth-fixture-title"
      >
        <p className="eyebrow">T02 · 认证 DOM fixture</p>
        <h1 id="auth-fixture-title">账户登录验证</h1>
        <p>测试专用固定凭据，不连接真实服务，也不接受生产账号。</p>
        <label htmlFor="fixture-username">账号</label>
        <Input
          id="fixture-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label htmlFor="fixture-password">密码</label>
        <Input.Password
          id="fixture-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label htmlFor="fixture-captcha">验证码：3 + 4 = ?</label>
        <Input
          id="fixture-captcha"
          value={captchaAnswer}
          onChange={(event) => setCaptchaAnswer(event.target.value)}
        />
        <Button type="primary" onClick={submit}>
          验证登录
        </Button>
        {status === 'invalid' && (
          <Alert type="error" title="账号、密码或验证码无效" showIcon />
        )}
        {status === 'success' && (
          <Alert
            type="success"
            title="验证成功：首次登录需要修改密码"
            showIcon
          />
        )}
      </section>
    </main>
  )
}
