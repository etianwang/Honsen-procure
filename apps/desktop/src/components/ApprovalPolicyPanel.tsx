import { Alert, Button, Card, Checkbox, Input } from 'antd'
import { useEffect, useState } from 'react'
import type { WorkflowApi } from '../lib/workflow-api'

type ApprovalPolicyPanelProps = {
  api: WorkflowApi
  canManage: boolean
}

export function ApprovalPolicyPanel({
  api,
  canManage,
}: ApprovalPolicyPanelProps) {
  const [allowSelfApproval, setAllowSelfApproval] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api
      .getApprovalPolicy()
      .then((policy) => setAllowSelfApproval(policy.allowSelfApproval))
      .catch(() => setMessage('无法读取审批策略。'))
  }, [api])

  async function save() {
    if (!reason.trim()) {
      setMessage('策略修改原因必填。')
      return
    }
    try {
      await api.setApprovalPolicy(allowSelfApproval, reason.trim())
      setMessage('自审策略已更新，并已写入永久审计。')
      setReason('')
    } catch {
      setMessage('策略更新失败：仅超级管理员可修改。')
    }
  }

  return (
    <Card className="card" title="全局审批策略">
      <p>默认禁止采购员或管理员确认自己的订单。</p>
      <Checkbox
        aria-label="允许自审"
        checked={allowSelfApproval}
        disabled={!canManage}
        onChange={(event) => setAllowSelfApproval(event.target.checked)}
      >
        允许采购员/管理员自审
      </Checkbox>
      {canManage ? (
        <div className="approval-policy-form">
          <label>
            修改原因
            <Input
              aria-label="策略修改原因"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button type="primary" onClick={() => void save()}>
            保存策略
          </Button>
        </div>
      ) : null}
      {message ? <Alert showIcon title={message} type="info" /> : null}
    </Card>
  )
}
