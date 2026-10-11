import { Alert, Button, Card, Space, Typography } from 'antd'
import { useState } from 'react'

type FixtureState = 'signed-out' | 'active' | 'locked'

export function OfflineAuthFixturePage() {
  const [state, setState] = useState<FixtureState>('signed-out')
  const [result, setResult] = useState('')
  const isEngineer = true

  function rejectMaterialMutation() {
    if (isEngineer) setResult('可信边界拒绝：权限不足')
  }

  return (
    <main className="fixture-page">
      <Card>
        <Space orientation="vertical" size="large">
          <div>
            <Typography.Title level={1}>离线登录安全验证</Typography.Title>
            <Typography.Paragraph>
              此开发夹具模拟工程师的缓存登录、30
              分钟空闲锁定与重新验证。生产授权由 Rust 命令独立执行。
            </Typography.Paragraph>
          </div>
          {state === 'signed-out' && (
            <Button type="primary" onClick={() => setState('active')}>
              模拟工程师离线登录
            </Button>
          )}
          {state === 'active' && (
            <>
              <Alert title="缓存账户已登录：工程师" type="success" showIcon />
              <Space
                wrap
                onClickCapture={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest(
                      '[data-testid="material-edit-control"]',
                    )
                  ) {
                    rejectMaterialMutation()
                  }
                }}
              >
                <Button onClick={() => setState('locked')}>
                  模拟 30 分钟空闲
                </Button>
                <Button disabled data-testid="material-edit-control">
                  编辑材料（采购员/管理员）
                </Button>
              </Space>
            </>
          )}
          {state === 'locked' && (
            <>
              <Alert
                title="会话已锁定，需要重新输入密码"
                type="warning"
                showIcon
              />
              <Button type="primary" onClick={() => setState('active')}>
                重新验证
              </Button>
            </>
          )}
          {result && <Alert title={result} type="error" showIcon />}
        </Space>
      </Card>
    </main>
  )
}
