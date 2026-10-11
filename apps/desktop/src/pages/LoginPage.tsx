import { Alert, Button, Card, Input } from 'antd'
import { LockKeyhole, UserRound } from 'lucide-react'

type LoginPageProps = { onPreview: () => void }

export function LoginPage({ onPreview }: LoginPageProps) {
  return (
    <main className="login-page">
      <Card className="login-card">
        <div className="login-brand" aria-hidden="true">
          H
        </div>
        <h1>登录 HONSEN Procure</h1>
        <p>账号验证将在 T02/T03 接入。当前仅用于核验界面导航。</p>
        <Alert
          className="login-alert"
          type="info"
          showIcon
          title="开发预览：不接受真实账号、密码或验证码"
        />
        <label htmlFor="preview-account">账号</label>
        <Input
          id="preview-account"
          disabled
          prefix={<UserRound size={16} aria-hidden="true" />}
          placeholder="T02 接入账号验证"
        />
        <label htmlFor="preview-password">密码</label>
        <Input.Password
          id="preview-password"
          disabled
          prefix={<LockKeyhole size={16} aria-hidden="true" />}
          placeholder="T03 接入本地离线验证"
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
